// =====================================================================
// MODE DEMO: data disimpan di localStorage browser ini saja.
// Aturannya meniru fungsi SQL di supabase/schema.sql supaya perilakunya sama.
// =====================================================================
(function () {
  const KEY = "spo_outsource_demo_v2";
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const nowIso = () => new Date().toISOString();

  function seed() {
    const t = SPO.today();
    const addDays = (n) => { const d = new Date(t + "T00:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
    const o1 = uid(), o2 = uid(), o3 = uid(), l1 = uid(), l2 = uid(), l3 = uid(), l4 = uid();
    const s = {
      seq: 3,
      sizes: ["XXS", "XS", "S", "SM", "M", "ML", "L", "XL", "XXL", "OS"].map((code, i) => ({ code, sort: i + 1, active: true })),
      locations: [{ name: "Inspection", active: true }, { name: "Cin Cin Studio", active: true }],
      items: [
        { sku: "O00100001", description: "Contoh: Knit Panel Soda", unit: "Each", active: true },
        { sku: "O00100002", description: "Contoh: Crochet Trim", unit: "Each", active: true },
        { sku: "O00100003", description: "Contoh: Beading Star", unit: "Each", active: true },
      ],
      orders: [
        { id: o1, spo_number: "SPO-0001", status: "OPEN", spo_date: addDays(-20), due_date: addDays(-2),
          supplier: "Contoh Vendor Knit", receiving_location: "Inspection", supplier_ref: "INV-0921",
          note: "Data contoh untuk mencoba alur", created_by: "Demo", created_at: nowIso(), updated_by: "Demo",
          updated_at: nowIso(), submitted_by: "Demo", submitted_at: nowIso() },
        { id: o2, spo_number: "SPO-0002", status: "OPEN", spo_date: addDays(-6), due_date: addDays(14),
          supplier: "Contoh Vendor Crochet", receiving_location: "Inspection", supplier_ref: "",
          note: "", created_by: "Demo", created_at: nowIso(), updated_by: "Demo", updated_at: nowIso(),
          submitted_by: "Demo", submitted_at: nowIso() },
        { id: o3, spo_number: null, status: "DRAFT", spo_date: t, due_date: addDays(21),
          supplier: "Contoh Vendor Beads", receiving_location: "Cin Cin Studio", supplier_ref: "",
          note: "Draft contoh, belum di-submit", created_by: "Demo", created_at: nowIso(), updated_by: "Demo",
          updated_at: nowIso() },
      ],
      lines: [
        { id: l1, order_id: o1, line_no: 1, spo_line_id: "SPO-0001001", sku: "O00100001",
          description: "Contoh: Knit Panel Soda", supplier_sku: "KS-01", unit: "Each",
          unit_price: 185000, discount_pct: 5, sizes: { XS: 10, S: 20, M: 20, L: 10 } },
        { id: l2, order_id: o1, line_no: 2, spo_line_id: "SPO-0001002", sku: "O00100002",
          description: "Contoh: Crochet Trim", supplier_sku: "", unit: "Each",
          unit_price: 240000, discount_pct: 0, sizes: { S: 8, M: 8 } },
        { id: l3, order_id: o2, line_no: 1, spo_line_id: "SPO-0002001", sku: "O00100002",
          description: "Contoh: Crochet Trim", supplier_sku: "CT-7", unit: "Each",
          unit_price: 240000, discount_pct: 0, sizes: { XXS: 4, XS: 8, S: 12, M: 12, L: 8, XL: 4, XXL: 2 } },
        { id: l4, order_id: o3, line_no: 1, spo_line_id: null, sku: "O00100003",
          description: "Contoh: Beading Star", supplier_sku: "", unit: "Each",
          unit_price: 320000, discount_pct: 0, sizes: { M: 15 } },
      ],
      events: [],
    };
    const ev = (order_id, line_id, size_code, event_type, qty, d, by, note, amount) =>
      s.events.push({ id: uid(), order_id, line_id, size_code, event_type, qty, amount: amount || 0,
        event_date: addDays(d), batch_id: null, note: note || "", recorded_by: by, created_at: nowIso(),
        voided_at: null, voided_by: null, void_reason: null });
    ev(o1, l1, "XS", "RECEIVE", 10, -8, "Contoh Rista", "Kiriman 1");
    ev(o1, l1, "S", "RECEIVE", 20, -8, "Contoh Rista", "Kiriman 1");
    ev(o1, l1, "M", "RECEIVE", 12, -8, "Contoh Rista", "Kiriman 1");
    ev(o1, l1, "XS", "QC_PASS", 10, -7, "Contoh Lina");
    ev(o1, l1, "S", "QC_PASS", 16, -7, "Contoh Lina");
    ev(o1, l1, "S", "QC_REJECT", 3, -7, "Contoh Lina", "Jahitan lepas");
    ev(o1, l1, "S", "QC_DAMAGED", 1, -7, "Contoh Lina", "Bolong");
    ev(o1, l1, "M", "QC_PASS", 12, -7, "Contoh Lina");
    ev(o1, l1, "S", "REPAIR_RETURN", 3, -3, "Contoh Rista");
    ev(o1, l2, "S", "RECEIVE", 8, -5, "Contoh Rista");
    ev(o1, l2, "S", "QC_PASS", 8, -4, "Contoh Lina");

    // fulfillment: style, pemetaan component, tiket Jira contoh
    s.styles = [
      { sku: "S9001", name: "Contoh: Soda Knit Dress - Black", range: "Soda", active: true },
      { sku: "S9002", name: "Contoh: Crochet Top - Ivory", range: "Crochet", active: true },
      { sku: "S9003", name: "Contoh: Star Mini Dress - Gold", range: "Star", active: true },
      { sku: "S9004", name: "Contoh: Linen Pants - Sand", range: "Linen", active: true },
    ];
    s.bom = [
      { style_sku: "S9001", component_sku: "O00100001", qty_per: 1 },
      { style_sku: "S9002", component_sku: "O00100002", qty_per: 1 },
      { style_sku: "S9002", component_sku: "O00100003", qty_per: 2 },
      { style_sku: "S9003", component_sku: "O00100003", qty_per: 2 },
    ];
    let k = 90000;
    const tk = (po, d, sku, name, size, qty, status, cust, seenOpen) => s.tickets.push({ key: "CC-" + (k++), ticket_number: "", po_number: po,
      customer_name: cust, customer_type: "Wholesale", created_date: addDays(d), deadline: addDays(d + 30), sku, item_name: name,
      range: "", qty, size, status, seen_open: seenOpen !== false, first_seen_at: nowIso(), updated_at: nowIso() });
    s.tickets = [];
    tk("PO-DEMO-01", -10, "S9001", "Contoh: Soda Knit Dress - Black", "S", 5, "1.1. Preparation", "Contoh Boutique A");
    tk("PO-DEMO-01", -10, "S9001", "Contoh: Soda Knit Dress - Black", "M", 4, "1.2. Fabric Incompleted", "Contoh Boutique A");
    tk("PO-DEMO-01", -10, "S9001", "Contoh: Soda Knit Dress - Black", "M", 2, "3.0. Sewing In Progress", "Contoh Boutique A");
    tk("PO-DEMO-02", -8, "S9002", "Contoh: Crochet Top - Ivory", "S", 2, "1.1. Preparation", "Contoh Wholesale B");
    tk("PO-DEMO-02", -8, "S9001", "Contoh: Soda Knit Dress - Black", "S", 8, "2.0. Cutting In Progress", "Contoh Wholesale B");
    tk("PO-DEMO-02", -8, "S9004", "Contoh: Linen Pants - Sand", "L", 3, "1.1. Preparation", "Contoh Wholesale B");
    tk("PO-DEMO-03", -5, "S9001", "Contoh: Soda Knit Dress - Black", "S", 5, "1.0. Ticket Created", "Contoh Preorder C");
    tk("PO-DEMO-03", -5, "S9001", "Contoh: Soda Knit Dress - Black", "XS", 3, "1.0. Ticket Created", "Contoh Preorder C");
    tk("PO-DEMO-03", -5, "S9003", "Contoh: Star Mini Dress - Gold", "M", 1, "1.0. Ticket Created", "Contoh Preorder C");
    s.po_priority = []; s.adjustments = []; s.uploads = []; s.app_settings = { consume_from: 3 };
    return s;
  }

  class LocalStore {
    constructor() { this.mode = "demo"; this.state = this._read() || seed(); this._write(); }
    _read() { try { const v = localStorage.getItem(KEY); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
    _write() { try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch (e) { /* demo tetap jalan di memori */ } }
    _commit(next) { this.state = next; this._write(); }

    async resetDemo() { this._commit(seed()); }
    // Kosong total untuk mencoba data asli: hanya ukuran, lokasi, dan pengaturan yang tersisa.
    async clearAll() {
      const s = seed();
      this._commit({ seq: 0, sizes: s.sizes, locations: s.locations, items: [], orders: [], lines: [], events: [],
        styles: [], bom: [], tickets: [], po_priority: [], adjustments: [], uploads: [], app_settings: s.app_settings });
    }
    async loadAll() { return clone(this.state); }

    async saveItem(item) {
      const s = clone(this.state);
      const sku = String(item.sku || "").trim().toUpperCase();
      if (!sku) throw new Error("SKU wajib diisi");
      if (!String(item.description || "").trim()) throw new Error("Deskripsi wajib diisi");
      const i = s.items.findIndex((x) => x.sku === (item.original_sku || sku));
      const row = { sku, description: item.description.trim(), unit: item.unit || "Each", active: item.active !== false };
      if (i >= 0) {
        if (item.original_sku && item.original_sku !== sku) throw new Error("SKU yang sudah ada tidak bisa diganti");
        s.items[i] = row;
      } else {
        if (s.items.some((x) => x.sku === sku)) throw new Error("SKU " + sku + " sudah ada");
        s.items.push(row);
      }
      this._commit(s);
    }
    async saveSize(size) {
      const s = clone(this.state);
      const code = String(size.code || "").trim().toUpperCase();
      if (!code) throw new Error("Kode ukuran wajib diisi");
      const i = s.sizes.findIndex((x) => x.code === code);
      const row = { code, sort: Number(size.sort) || 99, active: size.active !== false };
      if (i >= 0) s.sizes[i] = row; else s.sizes.push(row);
      this._commit(s);
    }
    async saveLocation(loc) {
      const s = clone(this.state);
      const name = String(loc.name || "").trim();
      if (!name) throw new Error("Nama lokasi wajib diisi");
      const i = s.locations.findIndex((x) => x.name === name);
      const row = { name, active: loc.active !== false };
      if (i >= 0) s.locations[i] = row; else s.locations.push(row);
      this._commit(s);
    }

    async saveDraft(o, by) {
      if (!String(by || "").trim()) throw new Error("Nama pencatat wajib diisi");
      const s = clone(this.state);
      let order = o.id ? s.orders.find((x) => x.id === o.id) : null;
      if (o.id && !order) throw new Error("Order tidak ditemukan");
      if (order && order.status !== "DRAFT") throw new Error("Order sudah di-submit, tidak bisa diedit");
      if (!order) {
        order = { id: uid(), spo_number: null, status: "DRAFT", created_by: by, created_at: nowIso() };
        s.orders.push(order);
      }
      Object.assign(order, {
        spo_date: o.spo_date || SPO.today(), due_date: o.due_date || null,
        supplier: String(o.supplier || "").trim(), receiving_location: o.receiving_location || null,
        supplier_ref: o.supplier_ref || "", note: o.note || "", updated_by: by, updated_at: nowIso(),
      });
      for (const l of o.lines || []) {
        if (!s.items.some((it) => it.sku === l.sku)) throw new Error("SKU " + (l.sku || "(kosong)") + " tidak ada di daftar item");
        if (Number(l.discount_pct) < 0 || Number(l.discount_pct) > 100) throw new Error("Diskon harus 0 sampai 100%");
        if (Number(l.unit_price) < 0) throw new Error("Harga tidak boleh negatif");
      }
      s.lines = s.lines.filter((l) => l.order_id !== order.id);
      (o.lines || []).forEach((l, i) => {
        const sizes = {};
        for (const [k, v] of Object.entries(l.sizes || {})) if (Number(v) > 0) sizes[k] = Number(v);
        s.lines.push({ id: uid(), order_id: order.id, line_no: i + 1, spo_line_id: null, sku: l.sku,
          description: l.description || "", supplier_sku: l.supplier_sku || "", unit: l.unit || "Each",
          unit_price: Number(l.unit_price) || 0, discount_pct: Number(l.discount_pct) || 0, sizes });
      });
      this._commit(s);
      return order.id;
    }

    async submit(id, by) {
      const s = clone(this.state);
      const o = s.orders.find((x) => x.id === id);
      if (!o) throw new Error("Order tidak ditemukan");
      if (o.status !== "DRAFT") throw new Error("Order sudah di-submit");
      if (!o.supplier) throw new Error("Supplier wajib diisi");
      const lines = s.lines.filter((l) => l.order_id === id);
      if (!lines.length) throw new Error("Order belum punya item");
      const bad = lines.filter((l) => SPO.lineQty(l) <= 0).length;
      if (bad) throw new Error("Ada " + bad + " item tanpa qty ukuran");
      if (!o.spo_number) { s.seq += 1; o.spo_number = "SPO-" + String(s.seq).padStart(4, "0"); }
      Object.assign(o, { status: "OPEN", submitted_by: by, submitted_at: nowIso(), updated_by: by, updated_at: nowIso() });
      lines.forEach((l) => (l.spo_line_id = o.spo_number + String(l.line_no).padStart(3, "0")));
      this._commit(s);
      return o.spo_number;
    }

    async reopen(id, by) {
      const s = clone(this.state);
      const o = s.orders.find((x) => x.id === id);
      if (!o) throw new Error("Order tidak ditemukan");
      if (o.status === "DRAFT") return;
      if (s.events.some((e) => e.order_id === id && !e.voided_at))
        throw new Error("Order sudah punya receiving/QC. Batalkan dulu semua event sebelum mengedit order.");
      Object.assign(o, { status: "DRAFT", updated_by: by, updated_at: nowIso() });
      this._commit(s);
    }

    async deleteDraft(id) {
      const s = clone(this.state);
      const o = s.orders.find((x) => x.id === id);
      if (!o) return;
      if (o.status !== "DRAFT") throw new Error("Hanya draft yang bisa dihapus");
      if (o.spo_number) throw new Error("Draft ini sudah punya nomor " + o.spo_number + ", tidak bisa dihapus");
      s.orders = s.orders.filter((x) => x.id !== id);
      s.lines = s.lines.filter((l) => l.order_id !== id);
      this._commit(s);
    }

    _refresh(s, orderId) {
      const o = s.orders.find((x) => x.id === orderId);
      const lines = s.lines.filter((l) => l.order_id === orderId);
      const bal = SPO.computeBalances(lines, s.events.filter((e) => e.order_id === orderId));
      const err = SPO.checkBalances(bal, lines);
      if (err) throw new Error(err);
      if (o.status !== "DRAFT") o.status = SPO.isDone(bal) ? "COMPLETED" : "OPEN";
      o.updated_at = nowIso();
      return o.status;
    }

    async postEvents(orderId, events, eventDate, note, by) {
      if (!String(by || "").trim()) throw new Error("Nama pencatat wajib diisi");
      const s = clone(this.state);
      const o = s.orders.find((x) => x.id === orderId);
      if (!o) throw new Error("Order tidak ditemukan");
      if (o.status !== "OPEN") throw new Error("Order berstatus " + o.status + ", tidak bisa dicatat");
      const batch = uid();
      let n = 0;
      for (const e of events) {
        if (!(Number(e.qty) > 0)) continue;
        const l = s.lines.find((x) => x.id === e.line_id && x.order_id === orderId);
        if (!l || !(Number(l.sizes[e.size_code]) > 0)) throw new Error("Size " + e.size_code + " tidak ada di order ini");
        s.events.push({ id: uid(), order_id: orderId, line_id: e.line_id, size_code: e.size_code,
          event_type: e.event_type, qty: SPO.r2(e.qty), amount: SPO.r2(e.amount || 0),
          event_date: eventDate || SPO.today(), batch_id: batch, note: note || "", recorded_by: by,
          created_at: nowIso(), voided_at: null, voided_by: null, void_reason: null });
        n++;
      }
      if (!n) throw new Error("Tidak ada qty yang diisi");
      const st = this._refresh(s, orderId);
      this._commit(s);
      return st;
    }

    async voidEvent(eventId, reason, by) {
      if (!String(reason || "").trim()) throw new Error("Alasan pembatalan wajib diisi");
      const s = clone(this.state);
      const e = s.events.find((x) => x.id === eventId && !x.voided_at);
      if (!e) throw new Error("Event tidak ditemukan atau sudah dibatalkan");
      Object.assign(e, { voided_at: nowIso(), voided_by: by, void_reason: reason });
      let st;
      try { st = this._refresh(s, e.order_id); }
      catch (err) { throw new Error("Tidak bisa dibatalkan karena qty ini sudah dipakai kejadian berikutnya (" + err.message + "). Batalkan kejadian yang lebih baru dulu."); }
      this._commit(s);
      return st;
    }

    // ---------- component, style, pemetaan ----------
    // rows: [{sku, description, unit}]. Semua atau tidak sama sekali.
    async importComponents(rows) {
      const s = clone(this.state); let added = 0, updated = 0; const errs = [];
      for (const r of rows) {
        const sku = String(r.sku || "").trim().toUpperCase(), desc = String(r.description || "").trim();
        if (!sku || !desc) { errs.push(`baris ${r._row || "?"}: SKU dan Nama wajib diisi`); continue; }
        const i = s.items.findIndex((x) => x.sku === sku);
        const row = { sku, description: desc, unit: String(r.unit || "").trim() || (i >= 0 ? s.items[i].unit : "Each"), active: true };
        if (i >= 0) { s.items[i] = row; updated++; } else { s.items.push(row); added++; }
      }
      if (errs.length) throw new Error("Import dibatalkan. " + errs.slice(0, 5).join("; ") + (errs.length > 5 ? `; dan ${errs.length - 5} lainnya` : ""));
      this._commit(s); return { added, updated };
    }
    async importStyles(rows) {
      const s = clone(this.state); let added = 0, updated = 0; const errs = [];
      for (const r of rows) {
        const sku = String(r.sku || "").trim().toUpperCase(), name = String(r.name || "").trim();
        if (!sku || !name) { errs.push(`baris ${r._row || "?"}: SKU style dan Nama wajib diisi`); continue; }
        const i = s.styles.findIndex((x) => x.sku === sku);
        const row = { sku, name, range: String(r.range || "").trim() || (i >= 0 ? s.styles[i].range : ""), active: true };
        if (i >= 0) { s.styles[i] = row; updated++; } else { s.styles.push(row); added++; }
      }
      if (errs.length) throw new Error("Import dibatalkan. " + errs.slice(0, 5).join("; ") + (errs.length > 5 ? `; dan ${errs.length - 5} lainnya` : ""));
      this._commit(s); return { added, updated };
    }
    async importBom(rows) {
      const s = clone(this.state); let added = 0, updated = 0; const errs = [];
      for (const r of rows) {
        const st = String(r.style_sku || "").trim().toUpperCase(), co = String(r.component_sku || "").trim().toUpperCase();
        const q = r.qty_per === undefined || String(r.qty_per).trim() === "" ? 1 : Number(String(r.qty_per).replace(",", "."));
        const where = `baris ${r._row || "?"}`;
        if (!s.styles.some((x) => x.sku === st)) { errs.push(`${where}: style ${st || "(kosong)"} belum ada`); continue; }
        if (!s.items.some((x) => x.sku === co)) { errs.push(`${where}: component ${co || "(kosong)"} belum ada`); continue; }
        if (!(q > 0)) { errs.push(`${where}: Qty per pcs harus lebih dari 0`); continue; }
        const i = s.bom.findIndex((b) => b.style_sku === st && b.component_sku === co);
        if (i >= 0) { s.bom[i].qty_per = SPO.r2(q); updated++; } else { s.bom.push({ style_sku: st, component_sku: co, qty_per: SPO.r2(q) }); added++; }
      }
      if (errs.length) throw new Error("Import dibatalkan. " + errs.slice(0, 5).join("; ") + (errs.length > 5 ? `; dan ${errs.length - 5} lainnya` : ""));
      this._commit(s); return { added, updated };
    }
    async saveBom(styleSku, componentSku, qtyPer) { return this.importBom([{ style_sku: styleSku, component_sku: componentSku, qty_per: qtyPer, _row: 1 }]); }
    async deleteBom(styleSku, componentSku) {
      const s = clone(this.state);
      s.bom = s.bom.filter((b) => !(b.style_sku === styleSku && b.component_sku === componentSku));
      this._commit(s);
    }

    // ---------- Jira ----------
    // Tiket di-upsert per Key. seen_open = pernah terlihat masih menunggu component.
    // Style yang belum ada dibuat otomatis dari SKU + Item Name.
    async uploadJira(tickets, filename, by) {
      const s = clone(this.state);
      const consumeFrom = Number(s.app_settings.consume_from) || 3;
      const byKey = {}; s.tickets.forEach((t, i) => (byKey[t.key] = i));
      let added = 0, updated = 0, newStyles = 0;
      for (const t of tickets) {
        const open = FUL.isOpen(t.status, consumeFrom);
        const i = byKey[t.key];
        if (i == null) { s.tickets.push({ ...t, seen_open: open, first_seen_at: nowIso(), updated_at: nowIso() }); added++; }
        else { const old = s.tickets[i]; s.tickets[i] = { ...old, ...t, seen_open: old.seen_open || open, updated_at: nowIso() }; updated++; }
        if (!s.styles.some((x) => x.sku === t.sku)) { s.styles.push({ sku: t.sku, name: t.item_name || t.sku, range: t.range || "", active: true }); newStyles++; }
      }
      s.uploads.push({ id: uid(), filename, rows: tickets.length, added, updated, uploaded_by: by, at: nowIso() });
      this._commit(s); return { added, updated, newStyles };
    }
    // list: [{po_number, priority}] menggantikan semua prioritas; [] = kembali ke FIFO murni
    async setPoPriorities(list) { const s = clone(this.state); s.po_priority = list.map((p) => ({ po_number: p.po_number, priority: p.priority })); this._commit(s); }
    async saveAppSettings(v) { const s = clone(this.state); s.app_settings = { ...s.app_settings, ...v }; this._commit(s); }

    // ---------- adjustment stok ----------
    async saveAdjustment(a, by) {
      const sku = String(a.sku || "").trim().toUpperCase(), size = String(a.size_code || "").trim().toUpperCase(), qty = SPO.r2(a.qty);
      if (!this.state.items.some((x) => x.sku === sku)) throw new Error("Pilih component dulu.");
      if (!size) throw new Error("Pilih ukuran dulu.");
      if (!qty) throw new Error("Isi jumlah. Pakai angka minus untuk mengurangi stok, misalnya -2.");
      if (!String(a.reason || "").trim()) throw new Error("Alasan adjustment wajib diisi.");
      const s = clone(this.state);
      s.adjustments.push({ id: uid(), sku, size_code: size, qty, reason: a.reason.trim(), created_by: by, created_at: nowIso(), voided_at: null, voided_by: null });
      this._commit(s);
    }
    async voidAdjustment(id, by) {
      const s = clone(this.state); const a = s.adjustments.find((x) => x.id === id && !x.voided_at);
      if (!a) throw new Error("Adjustment tidak ditemukan atau sudah dibatalkan");
      Object.assign(a, { voided_at: nowIso(), voided_by: by }); this._commit(s);
    }

    // Sama dengan spo_edit_event: event lama ditandai "Diubah", event baru menggantikannya.
    async editEvent(eventId, changes, reason, by) {
      if (!String(by || "").trim()) throw new Error("Nama pencatat wajib diisi");
      const s = clone(this.state);
      const e = s.events.find((x) => x.id === eventId && !x.voided_at);
      if (!e) throw new Error("Kejadian tidak ditemukan atau sudah dibatalkan");
      const type = changes.event_type || e.event_type, size = changes.size_code || e.size_code;
      const qty = changes.qty === undefined || changes.qty === "" ? e.qty : SPO.r2(changes.qty);
      if (!(qty > 0)) throw new Error("Qty harus lebih dari 0. Kalau mau menghapus, pakai Batalkan.");
      if (type !== e.event_type && !(type.startsWith("QC_") && e.event_type.startsWith("QC_")))
        throw new Error("Jenis kejadian hanya bisa diganti sesama hasil QC (Pass, Reject, Damaged)");
      const l = s.lines.find((x) => x.id === e.line_id);
      if (!l || !(Number(l.sizes[size]) > 0)) throw new Error("Ukuran " + size + " tidak ada di item ini");
      const why = String(reason || "").trim();
      Object.assign(e, { voided_at: nowIso(), voided_by: by, void_reason: "Diubah" + (why ? ": " + why : "") });
      s.events.push({ id: uid(), order_id: e.order_id, line_id: e.line_id, size_code: size, event_type: type, qty,
        amount: type === "DAMAGE_DISCOUNT" ? SPO.r2(changes.amount === undefined || changes.amount === "" ? e.amount : changes.amount) : 0,
        event_date: changes.event_date || e.event_date, batch_id: e.batch_id,
        note: "note" in changes ? changes.note || "" : e.note, recorded_by: by, created_at: nowIso(),
        voided_at: null, voided_by: null, void_reason: null, replaces_id: e.id });
      let st;
      try { st = this._refresh(s, e.order_id); }
      catch (err) { throw new Error("Tidak bisa diubah: " + err.message.replace(/\.$/, "") + ". Kemungkinan qty ini sudah dipakai kejadian berikutnya (misalnya sudah di-QC). Ubah kejadian yang lebih baru dulu."); }
      this._commit(s);
      return st;
    }
  }

  window.LocalStore = LocalStore;
})();
