// =====================================================================
// Fulfillment PO: baca file (CSV/Excel), kenali kolom Jira, hitung stok
// component dan alokasi FIFO ke tiket Jira. Logika murni, tanpa tampilan.
// =====================================================================
(function () {
  const S = window.SPO;
  const r2 = S.r2;

  // ---------- baca file ----------
  // CSV dengan tanda kutip, koma atau titik koma (Excel Indonesia), BOM, CRLF.
  function parseCsv(text) {
    text = String(text || "").replace(/^﻿/, "");
    const firstLine = text.split(/\r?\n/, 1)[0] || "";
    const delim = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ";" : ",";
    const rows = []; let row = [], cell = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === delim) { row.push(cell); cell = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cell); rows.push(row); row = []; cell = "";
      } else cell += c;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((v) => String(v).trim() !== ""));
  }

  let xlsxLoading = null;
  function loadXlsx() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (!xlsxLoading) xlsxLoading = new Promise((ok, fail) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
      s.onload = () => ok(window.XLSX);
      s.onerror = () => { xlsxLoading = null; fail(new Error("Pembaca Excel gagal dimuat. Cek internet, atau simpan file sebagai CSV.")); };
      document.head.appendChild(s);
    });
    return xlsxLoading;
  }

  // Hasil: array baris, baris pertama = judul kolom.
  async function readFile(file) {
    const name = (file.name || "").toLowerCase();
    if (/\.(xlsx|xls)$/.test(name)) {
      const X = await loadXlsx();
      const wb = X.read(await file.arrayBuffer(), { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      return X.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" })
        .map((r) => r.map((v) => String(v == null ? "" : v)))
        .filter((r) => r.some((v) => v.trim() !== ""));
    }
    return parseCsv(await file.text());
  }

  // Cocokkan judul kolom tanpa peduli huruf besar/kecil, spasi, atau tanda baca.
  const norm = (h) => String(h || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  function mapColumns(header, spec) {
    const idx = {}, missing = [];
    const hs = header.map(norm);
    for (const [key, names, required] of spec) {
      const i = hs.findIndex((h) => names.some((n) => norm(n) === h));
      if (i >= 0) idx[key] = i; else if (required) missing.push(names[0]);
    }
    return { idx, missing };
  }
  function tableRows(table, spec, what) {
    if (!table.length) throw new Error("File kosong.");
    const { idx, missing } = mapColumns(table[0], spec);
    if (missing.length) throw new Error(`File ${what} tidak punya kolom: ${missing.join(", ")}. Kolom yang terbaca: ${table[0].join(", ")}.`);
    return table.slice(1).map((r, i) => {
      const o = { _row: i + 2 };
      for (const [key] of spec) o[key] = idx[key] == null ? "" : String(r[idx[key]] ?? "").trim();
      return o;
    });
  }

  // ---------- template import ----------
  const SPEC = {
    component: [["sku", ["SKU component", "SKU", "Component SKU"], true], ["description", ["Nama", "Name", "Description", "Deskripsi"], true], ["unit", ["Unit"], false]],
    style: [["sku", ["SKU style", "SKU", "Style SKU"], true], ["name", ["Nama style", "Nama", "Item Name", "Name"], true], ["range", ["Range"], false]],
    bom: [["style_sku", ["SKU style", "Style SKU", "Style"], true], ["component_sku", ["SKU component", "Component SKU", "Component"], true], ["qty_per", ["Qty per pcs", "Qty", "Quantity"], false]],
    jira: [["key", ["Key", "Issue key"], true], ["po_number", ["PO Number", "PO"], true], ["sku", ["SKU"], true], ["size", ["Size", "Ukuran"], true],
      ["status", ["Status"], true], ["qty", ["Quantity", "Qty"], false], ["created", ["Ticket Create Date", "Created"], false],
      ["deadline", ["Deadline", "Due date"], false], ["customer_name", ["Customer Name"], false], ["customer_type", ["Customer Type"], false],
      ["item_name", ["Item Name"], false], ["range", ["Range"], false], ["ticket_number", ["Ticket Number"], false]],
  };
  const TEMPLATES = {
    component: "SKU component,Nama,Unit\nO00123123,Beading Star,Each\n",
    style: "SKU style,Nama style,Range\nS123412323,Empress Maxi Dress - Black,Empress\n",
    bom: "SKU style,SKU component,Qty per pcs\nS123412323,O00123123,2\n",
  };

  // ---------- Jira ----------
  const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
    mei: 5, agu: 8, agt: 8, okt: 10, des: 12 };
  // "22-Oct-26", "22/Oct/2026 10:19", "2026-10-22", "22/10/2026" -> "2026-10-22"
  function parseDate(v) {
    const s = String(v || "").trim(); if (!s) return null;
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    m = s.match(/^(\d{1,2})[-/ ]([A-Za-z]{3})[A-Za-z]*[-/ ](\d{2,4})/);
    if (m && MON[m[2].toLowerCase()]) {
      const y = m[3].length === 2 ? "20" + m[3] : m[3];
      return `${y}-${String(MON[m[2].toLowerCase()]).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    }
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return null;
  }
  const normPo = (v) => String(v || "").trim().replace(/\s+/g, " ").toUpperCase();

  // Baca file Jira jadi tiket bersih + daftar baris yang dilewati beserta alasannya.
  function parseJira(table) {
    const rows = tableRows(table, SPEC.jira, "Jira");
    const tickets = [], skipped = [], seen = new Set();
    for (const r of rows) {
      const why = [];
      const sku = r.sku.toUpperCase();
      if (!r.key) why.push("Key kosong");
      if (!sku || /^0+$/.test(sku)) why.push(`SKU tidak valid ("${r.sku}")`);
      if (!r.size) why.push("Size kosong");
      if (!r.po_number) why.push("PO Number kosong");
      const qty = r.qty === "" ? 1 : Number(String(r.qty).replace(",", "."));
      if (!(qty > 0)) why.push(`Quantity tidak valid ("${r.qty}")`);
      if (r.key && seen.has(r.key)) why.push("Key dobel di file ini");
      if (why.length) { skipped.push({ row: r._row, key: r.key, sku: r.sku, item_name: r.item_name, why: why.join(", ") }); continue; }
      seen.add(r.key);
      tickets.push({ key: r.key, ticket_number: r.ticket_number, po_number: normPo(r.po_number), customer_name: r.customer_name,
        customer_type: r.customer_type, created_date: parseDate(r.created), deadline: parseDate(r.deadline), sku,
        item_name: r.item_name, range: r.range, qty, size: r.size.toUpperCase(), status: r.status });
    }
    return { tickets, skipped };
  }

  // Status "3.0. Sewing In Progress" -> 3.0. Status 9.x (Rejected, Cancelled) diabaikan.
  function statusRank(status) { const m = String(status || "").match(/^\s*(\d+(?:\.\d+)?)/); return m ? Number(m[1]) : null; }
  const isIgnored = (status) => { const r = statusRank(status); return r != null && r >= 9; };
  // Tiket masih menunggu component (belum sampai status pemakaian).
  function isOpen(status, consumeFrom) { const r = statusRank(status); return r != null && r < consumeFrom && !isIgnored(status); }

  // ---------- hitung stok dan alokasi ----------
  // data: hasil loadAll; orderBal: {orderId: {bal}} dari buildIndex app.js
  function compute(data, orders) {
    const consumeFrom = Number((data.app_settings || {}).consume_from) || 3;
    const bom = {}; // style -> [{component_sku, qty_per}]
    for (const b of data.bom || []) (bom[b.style_sku] = bom[b.style_sku] || []).push(b);
    const key = (sku, size) => sku + "|" + size;
    const stock = {}; // per component|size
    const row = (sku, size) => (stock[key(sku, size)] = stock[key(sku, size)] ||
      { sku, size, qc_pass: 0, adjust: 0, consumed: 0, on_hand: 0, incoming: 0, allocated: 0, demand: 0, short: 0 });

    for (const x of Object.values(orders)) {
      if (x.o.status === "DRAFT") continue;
      const skuOf = {}; x.lines.forEach((l) => (skuOf[l.id] = l.sku));
      for (const b of Object.values(x.bal)) {
        const s = row(skuOf[b.line_id], b.size_code);
        s.qc_pass += b.qc_pass;
        if (x.o.status === "OPEN") s.incoming += Math.max(0, b.outstanding);
      }
    }
    for (const a of data.adjustments || []) if (!a.voided_at) row(a.sku, a.size_code).adjust += Number(a.qty) || 0;

    const needsOf = (t) => (bom[t.sku] || []).map((b) => ({ sku: b.component_sku, size: t.size, need: r2(t.qty * b.qty_per) }));
    for (const t of data.tickets || []) {
      if (t.seen_open && !isIgnored(t.status) && !isOpen(t.status, consumeFrom))
        for (const n of needsOf(t)) row(n.sku, n.size).consumed += n.need;
    }
    for (const s of Object.values(stock)) s.on_hand = r2(s.qc_pass + s.adjust - s.consumed);

    // urutan: prioritas PO (kalau diatur), lalu tanggal tiket dibuat, lalu Key
    const prio = {}; (data.po_priority || []).forEach((p) => (prio[p.po_number] = Number(p.priority)));
    const open = (data.tickets || []).filter((t) => isOpen(t.status, consumeFrom) && bom[t.sku]);
    const pr = (t) => (prio[t.po_number] ?? Infinity);
    open.sort((a, b) => pr(a) - pr(b) || String(a.created_date || "9").localeCompare(String(b.created_date || "9")) ||
      a.key.localeCompare(b.key, undefined, { numeric: true }));

    const avail = {}; for (const [k, s] of Object.entries(stock)) avail[k] = Math.max(0, s.on_hand);
    const result = {};
    for (const t of open) {
      const needs = needsOf(t);
      needs.forEach((n) => (row(n.sku, n.size).demand += n.need));
      const short = needs.map((n) => ({ ...n, have: avail[key(n.sku, n.size)] || 0 })).filter((n) => n.have < n.need - 1e-9);
      if (!short.length) {
        needs.forEach((n) => { avail[key(n.sku, n.size)] = r2((avail[key(n.sku, n.size)] || 0) - n.need); row(n.sku, n.size).allocated += n.need; });
        result[t.key] = { ok: true, needs, short: [] };
      } else result[t.key] = { ok: false, needs, short: short.map((n) => ({ sku: n.sku, size: n.size, need: n.need, have: n.have })) };
    }
    for (const s of Object.values(stock)) {
      s.free = r2(Math.max(0, s.on_hand) - s.allocated);
      s.short = r2(Math.max(0, s.demand - Math.max(0, s.on_hand)));
      s.to_order = r2(Math.max(0, s.short - s.incoming));
    }

    // ringkasan per PO
    const pos = {};
    for (const t of open) {
      const p = (pos[t.po_number] = pos[t.po_number] || { po_number: t.po_number, tickets: 0, pcs: 0, ok_tickets: 0, ok_pcs: 0,
        first_date: t.created_date, deadline: t.deadline, customers: new Set(), types: new Set(), priority: prio[t.po_number] ?? null, order: 0 });
      p.tickets++; p.pcs += t.qty; if (result[t.key].ok) { p.ok_tickets++; p.ok_pcs += t.qty; }
      if (t.created_date && (!p.first_date || t.created_date < p.first_date)) p.first_date = t.created_date;
      if (t.deadline && (!p.deadline || t.deadline < p.deadline)) p.deadline = t.deadline;
      if (t.customer_name) p.customers.add(t.customer_name);
      if (t.customer_type) p.types.add(t.customer_type);
    }
    const poList = Object.values(pos);
    // urutan tampil PO = urutan tiket pertamanya di antrian
    const firstIdx = {}; open.forEach((t, i) => { if (firstIdx[t.po_number] == null) firstIdx[t.po_number] = i; });
    poList.sort((a, b) => firstIdx[a.po_number] - firstIdx[b.po_number]);
    poList.forEach((p, i) => { p.order = i + 1; p.state = p.ok_tickets === p.tickets ? "FULL" : p.ok_tickets ? "PARTIAL" : "BACKORDER"; });

    return { consumeFrom, bom, stock, open, result, poList };
  }

  window.FUL = { parseCsv, readFile, tableRows, SPEC, TEMPLATES, parseJira, parseDate, normPo, statusRank, isIgnored, isOpen, compute };
})();
