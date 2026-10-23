// =====================================================================
// MODE PRODUKSI: data di Supabase (Postgres). Semua aturan qty dijaga oleh
// fungsi SQL (spo_post_events, spo_void_event, dst) di supabase/schema.sql.
// =====================================================================
(function () {
  class SupabaseStore {
    constructor(url, key) {
      this.mode = "supabase";
      this.sb = window.supabase.createClient(url, key);
    }

    // ---------- login ----------
    async session() { const { data } = await this.sb.auth.getSession(); return data.session; }
    async signIn(email, password) {
      const { error } = await this.sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message === "Invalid login credentials" ? "Email atau password salah" : error.message);
    }
    async signOut() { await this.sb.auth.signOut(); }
    userName(session) {
      const u = session && session.user;
      if (!u) return "";
      return (u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name)) || u.email;
    }

    // ---------- baca ----------
    async _all(table, order) {
      const page = 1000; let from = 0; const rows = [];
      for (;;) {
        let q = this.sb.from(table).select("*").range(from, from + page - 1);
        if (order) q = q.order(order);
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        rows.push(...data);
        if (data.length < page) return rows;
        from += page;
      }
    }

    async loadAll() {
      const [sizes, locations, items, orders, lines, lineSizes, events, styles, bom, tickets, po_priority, adjustments, settings, uploads] = await Promise.all([
        this._all("settings_sizes", "sort"), this._all("settings_locations", "name"),
        this._all("items", "sku"), this._all("spo_orders", "created_at"),
        this._all("spo_lines", "line_no"), this._all("spo_line_sizes"), this._all("spo_events", "created_at"),
        this._all("styles", "sku"), this._all("style_components"), this._all("jira_tickets", "key"),
        this._all("po_priority"), this._all("stock_adjustments", "created_at"), this._all("app_settings"), this._all("jira_uploads", "at"),
      ]);
      for (const b of bom) b.qty_per = Number(b.qty_per);
      for (const t of tickets) t.qty = Number(t.qty);
      for (const a of adjustments) a.qty = Number(a.qty);
      const app_settings = {}; for (const s of settings) app_settings[s.key] = s.value;
      const byLine = {};
      for (const r of lineSizes) (byLine[r.line_id] = byLine[r.line_id] || {})[r.size_code] = Number(r.qty_ordered);
      for (const l of lines) {
        l.sizes = byLine[l.id] || {};
        l.unit_price = Number(l.unit_price); l.discount_pct = Number(l.discount_pct);
      }
      for (const e of events) { e.qty = Number(e.qty); e.amount = Number(e.amount); }
      return { sizes, locations, items, orders, lines, events, styles, bom, tickets, po_priority, adjustments, app_settings, uploads };
    }

    // ---------- component, style, pemetaan ----------
    async _importRows(table, rows, keyCol, build, label) {
      const errs = [], out = {};
      for (const r of rows) { const o = build(r); if (!o) errs.push(`baris ${r._row || "?"}: ${label}`); else out[o[keyCol]] = o; }
      if (errs.length) throw new Error("Import dibatalkan. " + errs.slice(0, 5).join("; ") + (errs.length > 5 ? `; dan ${errs.length - 5} lainnya` : ""));
      const list = Object.values(out);
      // ambil semua key lama (bukan filter .in, karena ribuan SKU membuat URL terlalu panjang)
      const have = new Set((await this._all(table)).map((r) => r[keyCol]));
      const { error } = await this.sb.from(table).upsert(list);
      if (error) throw new Error(error.message);
      const updated = list.filter((o) => have.has(o[keyCol])).length;
      return { added: list.length - updated, updated };
    }
    importComponents(rows) {
      return this._importRows("items", rows, "sku", (r) => {
        const sku = String(r.sku || "").trim().toUpperCase(), d = String(r.description || "").trim();
        return sku && d ? { sku, description: d, unit: String(r.unit || "").trim() || "Each", active: true } : null;
      }, "SKU dan Nama wajib diisi");
    }
    importStyles(rows) {
      return this._importRows("styles", rows, "sku", (r) => {
        const sku = String(r.sku || "").trim().toUpperCase(), n = String(r.name || "").trim();
        return sku && n ? { sku, name: n, range: String(r.range || "").trim() || null, active: true } : null;
      }, "SKU style dan Nama wajib diisi");
    }
    importBom(rows) { return this._rpc("spo_import_bom", { p_rows: rows }); }
    saveBom(styleSku, componentSku, qtyPer) { return this.importBom([{ style_sku: styleSku, component_sku: componentSku, qty_per: String(qtyPer), _row: 1 }]); }
    async deleteBom(styleSku, componentSku) {
      const { error } = await this.sb.from("style_components").delete().match({ style_sku: styleSku, component_sku: componentSku });
      if (error) throw new Error(error.message);
    }

    // ---------- Jira ----------
    uploadJira(tickets, filename, by) { return this._rpc("spo_upload_jira", { p_rows: tickets, p_filename: filename, p_by: by }); }
    async setPoPriorities(list) {
      const { error: e1 } = await this.sb.from("po_priority").delete().neq("po_number", "");
      if (e1) throw new Error(e1.message);
      if (list.length) { const { error } = await this.sb.from("po_priority").insert(list); if (error) throw new Error(error.message); }
    }
    async saveAppSettings(v) {
      const { error } = await this.sb.from("app_settings").upsert(Object.entries(v).map(([key, value]) => ({ key, value })));
      if (error) throw new Error(error.message);
    }

    // ---------- adjustment stok ----------
    async saveAdjustment(a, by) {
      const qty = Number(a.qty) || 0;
      if (!a.sku) throw new Error("Pilih component dulu.");
      if (!a.size_code) throw new Error("Pilih ukuran dulu.");
      if (!qty) throw new Error("Isi jumlah. Pakai angka minus untuk mengurangi stok, misalnya -2.");
      if (!String(a.reason || "").trim()) throw new Error("Alasan adjustment wajib diisi.");
      const { error } = await this.sb.from("stock_adjustments").insert({ sku: a.sku, size_code: a.size_code, qty, reason: a.reason.trim(), created_by: by });
      if (error) throw new Error(error.message);
    }
    async voidAdjustment(id, by) {
      const { error } = await this.sb.from("stock_adjustments").update({ voided_at: new Date().toISOString(), voided_by: by }).eq("id", id).is("voided_at", null);
      if (error) throw new Error(error.message);
    }

    // ---------- master data ----------
    async saveItem(item) {
      const sku = String(item.sku || "").trim().toUpperCase();
      if (!sku) throw new Error("SKU wajib diisi");
      if (!String(item.description || "").trim()) throw new Error("Deskripsi wajib diisi");
      if (item.original_sku && item.original_sku !== sku) throw new Error("SKU yang sudah ada tidak bisa diganti");
      if (!item.original_sku) {
        const { data } = await this.sb.from("items").select("sku").eq("sku", sku);
        if (data && data.length) throw new Error("SKU " + sku + " sudah ada");
      }
      const { error } = await this.sb.from("items").upsert({
        sku, description: item.description.trim(), unit: item.unit || "Each", active: item.active !== false,
      });
      if (error) throw new Error(error.message);
    }
    async saveSize(size) {
      const code = String(size.code || "").trim().toUpperCase();
      if (!code) throw new Error("Kode ukuran wajib diisi");
      const { error } = await this.sb.from("settings_sizes").upsert({ code, sort: Number(size.sort) || 99, active: size.active !== false });
      if (error) throw new Error(error.message);
    }
    async saveLocation(loc) {
      const name = String(loc.name || "").trim();
      if (!name) throw new Error("Nama lokasi wajib diisi");
      const { error } = await this.sb.from("settings_locations").upsert({ name, active: loc.active !== false });
      if (error) throw new Error(error.message);
    }

    // ---------- order ----------
    async _rpc(fn, args) {
      const { data, error } = await this.sb.rpc(fn, args);
      if (error) throw new Error(error.message);
      return data;
    }
    saveDraft(order, by)  { return this._rpc("spo_save_draft", { p_order: order, p_by: by }); }
    submit(id, by)        { return this._rpc("spo_submit", { p_order_id: id, p_by: by }); }
    reopen(id, by)        { return this._rpc("spo_reopen", { p_order_id: id, p_by: by }); }
    deleteDraft(id)       { return this._rpc("spo_delete_draft", { p_order_id: id }); }
    postEvents(orderId, events, date, note, by) {
      return this._rpc("spo_post_events", { p_order_id: orderId, p_events: events, p_event_date: date || null, p_note: note || null, p_by: by });
    }
    voidEvent(id, reason, by) { return this._rpc("spo_void_event", { p_event_id: id, p_reason: reason, p_by: by }); }
    editEvent(id, changes, reason, by) { return this._rpc("spo_edit_event", { p_event_id: id, p_changes: changes, p_reason: reason || null, p_by: by }); }
  }

  window.SupabaseStore = SupabaseStore;
})();
