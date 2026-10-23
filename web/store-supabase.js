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
      const [sizes, locations, items, orders, lines, lineSizes, events] = await Promise.all([
        this._all("settings_sizes", "sort"), this._all("settings_locations", "name"),
        this._all("items", "sku"), this._all("spo_orders", "created_at"),
        this._all("spo_lines", "line_no"), this._all("spo_line_sizes"), this._all("spo_events", "created_at"),
      ]);
      const byLine = {};
      for (const r of lineSizes) (byLine[r.line_id] = byLine[r.line_id] || {})[r.size_code] = Number(r.qty_ordered);
      for (const l of lines) {
        l.sizes = byLine[l.id] || {};
        l.unit_price = Number(l.unit_price); l.discount_pct = Number(l.discount_pct);
      }
      for (const e of events) { e.qty = Number(e.qty); e.amount = Number(e.amount); }
      return { sizes, locations, items, orders, lines, events };
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
  }

  window.SupabaseStore = SupabaseStore;
})();
