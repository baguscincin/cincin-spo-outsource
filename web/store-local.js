// =====================================================================
// MODE DEMO: data disimpan di localStorage browser ini saja.
// Aturannya meniru fungsi SQL di supabase/schema.sql supaya perilakunya sama.
// =====================================================================
(function () {
  const KEY = "spo_outsource_demo_v1";
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const nowIso = () => new Date().toISOString();

  function seed() {
    const t = SPO.today();
    const addDays = (n) => { const d = new Date(t + "T00:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
    const o1 = uid(), o2 = uid(), o3 = uid(), l1 = uid(), l2 = uid(), l3 = uid(), l4 = uid();
    const s = {
      seq: 3,
      sizes: ["XXS", "XS", "SS", "MM", "LL", "XL", "XXL"].map((code, i) => ({ code, sort: i + 1, active: true })),
      locations: [{ name: "Inspection", active: true }, { name: "Cin Cin Studio", active: true }],
      items: [
        { sku: "CONTOH-KNIT-SODA", description: "Contoh: Outsource Knit Soda", unit: "Each", active: true },
        { sku: "CONTOH-CROCHET-TOP", description: "Contoh: Outsource Crochet Top", unit: "Each", active: true },
        { sku: "CONTOH-BEADED-BAG", description: "Contoh: Outsource Beaded Bag", unit: "Each", active: true },
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
        { id: l1, order_id: o1, line_no: 1, spo_line_id: "SPO-0001001", sku: "CONTOH-KNIT-SODA",
          description: "Contoh: Outsource Knit Soda", supplier_sku: "KS-01", unit: "Each",
          unit_price: 185000, discount_pct: 5, sizes: { XS: 10, SS: 20, MM: 20, LL: 10 } },
        { id: l2, order_id: o1, line_no: 2, spo_line_id: "SPO-0001002", sku: "CONTOH-CROCHET-TOP",
          description: "Contoh: Outsource Crochet Top", supplier_sku: "", unit: "Each",
          unit_price: 240000, discount_pct: 0, sizes: { SS: 8, MM: 8 } },
        { id: l3, order_id: o2, line_no: 1, spo_line_id: "SPO-0002001", sku: "CONTOH-CROCHET-TOP",
          description: "Contoh: Outsource Crochet Top", supplier_sku: "CT-7", unit: "Each",
          unit_price: 240000, discount_pct: 0, sizes: { XXS: 4, XS: 8, SS: 12, MM: 12, LL: 8, XL: 4, XXL: 2 } },
        { id: l4, order_id: o3, line_no: 1, spo_line_id: null, sku: "CONTOH-BEADED-BAG",
          description: "Contoh: Outsource Beaded Bag", supplier_sku: "", unit: "Each",
          unit_price: 320000, discount_pct: 0, sizes: { MM: 15 } },
      ],
      events: [],
    };
    const ev = (order_id, line_id, size_code, event_type, qty, d, by, note, amount) =>
      s.events.push({ id: uid(), order_id, line_id, size_code, event_type, qty, amount: amount || 0,
        event_date: addDays(d), batch_id: null, note: note || "", recorded_by: by, created_at: nowIso(),
        voided_at: null, voided_by: null, void_reason: null });
    ev(o1, l1, "XS", "RECEIVE", 10, -8, "Contoh Rista", "Kiriman 1");
    ev(o1, l1, "SS", "RECEIVE", 20, -8, "Contoh Rista", "Kiriman 1");
    ev(o1, l1, "MM", "RECEIVE", 12, -8, "Contoh Rista", "Kiriman 1");
    ev(o1, l1, "XS", "QC_PASS", 10, -7, "Contoh Lina");
    ev(o1, l1, "SS", "QC_PASS", 16, -7, "Contoh Lina");
    ev(o1, l1, "SS", "QC_REJECT", 3, -7, "Contoh Lina", "Jahitan lepas");
    ev(o1, l1, "SS", "QC_DAMAGED", 1, -7, "Contoh Lina", "Bolong");
    ev(o1, l1, "MM", "QC_PASS", 12, -7, "Contoh Lina");
    ev(o1, l1, "SS", "REPAIR_RETURN", 3, -3, "Contoh Rista");
    ev(o1, l2, "SS", "RECEIVE", 8, -5, "Contoh Rista");
    ev(o1, l2, "SS", "QC_PASS", 8, -4, "Contoh Lina");
    return s;
  }

  class LocalStore {
    constructor() { this.mode = "demo"; this.state = this._read() || seed(); this._write(); }
    _read() { try { const v = localStorage.getItem(KEY); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
    _write() { try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch (e) { /* demo tetap jalan di memori */ } }
    _commit(next) { this.state = next; this._write(); }

    async resetDemo() { this._commit(seed()); }
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
