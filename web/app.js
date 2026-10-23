// =====================================================================
// SPO Outsource: tampilan dan interaksi.
// =====================================================================
(function () {
  const S = window.SPO;
  const CFG = window.SPO_CONFIG || {};
  const $app = document.getElementById("app");
  const NAME_KEY = "spo_outsource_user_name";

  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const lsGet = (k) => { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* abaikan */ } };
  const num = (v) => { const n = parseFloat(String(v).replace(",", ".")); return isFinite(n) ? n : 0; };

  const st = {
    store: null, data: null, idx: null, user: "", session: null,
    view: "orders", orderId: null, draft: null,
    filter: { q: "", status: "ACTIVE" },
    recap: { tab: "events", from: "", to: "", supplier: "", type: "", q: "", showVoid: false, onlyOpen: true },
    act: null, confirm: null, voiding: null, itemEdit: null, flash: null, error: null, busy: false,
  };

  // ------------------------------------------------------------------
  // DATA
  // ------------------------------------------------------------------
  function buildIndex(d) {
    const sizes = d.sizes.slice().sort((a, b) => a.sort - b.sort || a.code.localeCompare(b.code));
    const sizeSort = {}; sizes.forEach((s) => (sizeSort[s.code] = s.sort));
    const linesBy = {}, eventsBy = {};
    for (const l of d.lines) (linesBy[l.order_id] = linesBy[l.order_id] || []).push(l);
    for (const k in linesBy) linesBy[k].sort((a, b) => a.line_no - b.line_no);
    for (const e of d.events) (eventsBy[e.order_id] = eventsBy[e.order_id] || []).push(e);
    const orders = {};
    for (const o of d.orders) {
      const lines = linesBy[o.id] || [], events = eventsBy[o.id] || [];
      const bal = S.computeBalances(lines, events);
      const t = { ordered: 0, received: 0, pass: 0, awaiting: 0, repair: 0, damagedOpen: 0, outstanding: 0, discount: 0 };
      for (const b of Object.values(bal)) {
        t.ordered += b.qty_ordered; t.received += b.received; t.pass += b.qc_pass; t.awaiting += b.awaiting_qc;
        t.repair += b.in_repair; t.damagedOpen += b.damaged_open; t.outstanding += b.outstanding; t.discount += b.discount_amount;
      }
      t.value = lines.reduce((s, l) => s + S.lineAmount(l), 0);
      if (o.status === "DRAFT") t.ordered = lines.reduce((s, l) => s + S.lineQty(l), 0);
      orders[o.id] = { o, lines, events, bal, t };
    }
    return { sizes, sizeSort, orders, items: d.items.slice().sort((a, b) => a.sku.localeCompare(b.sku)) };
  }

  async function reload() {
    st.data = await st.store.loadAll();
    st.idx = buildIndex(st.data);
  }

  async function run(fn, okMsg) {
    if (st.busy) return;
    st.busy = true; st.error = null; render();
    try {
      const r = await fn();
      await reload();
      if (okMsg) st.flash = typeof okMsg === "function" ? okMsg(r) : okMsg;
      return r;
    } catch (e) {
      st.error = e.message || String(e);
      try { await reload(); } catch (_) { /* tetap tampilkan error awal */ }
    } finally {
      st.busy = false; render();
    }
  }

  function go(view, orderId) {
    st.view = view; st.orderId = orderId || null; st.act = null; st.confirm = null; st.voiding = null;
    st.error = null; st.flash = null;
    if (view === "edit") st.draft = makeDraft(orderId);
    render(); window.scrollTo(0, 0);
  }

  // ------------------------------------------------------------------
  // KOMPONEN KECIL
  // ------------------------------------------------------------------
  const pill = (text, tone) => `<span class="pill pill-${tone}">${esc(text)}</span>`;
  const statusPill = (s) => pill((S.STATUS[s] || {}).label || s, (S.STATUS[s] || {}).tone || "muted");
  const typePill = (t) => pill((S.EVENT_TYPES[t] || {}).label || t, (S.EVENT_TYPES[t] || {}).tone || "muted");
  const isOverdue = (o) => o.status === "OPEN" && o.due_date && o.due_date < S.today();

  function messages() {
    let h = "";
    if (st.error) h += `<div class="msg msg-bad" role="alert"><strong>Tidak tersimpan.</strong> ${esc(st.error)}</div>`;
    if (st.flash) h += `<div class="msg msg-good" role="status">${esc(st.flash)}</div>`;
    return h;
  }

  function sizesFor(lines, includeActive) {
    const set = new Set();
    if (includeActive) st.idx.sizes.filter((s) => s.active).forEach((s) => set.add(s.code));
    lines.forEach((l) => Object.keys(l.sizes || {}).forEach((k) => (Number(l.sizes[k]) > 0 || includeActive) && set.add(k)));
    return [...set].sort((a, b) => (st.idx.sizeSort[a] ?? 99) - (st.idx.sizeSort[b] ?? 99));
  }

  // ------------------------------------------------------------------
  // LAYOUT
  // ------------------------------------------------------------------
  function shell(inner) {
    const nav = [["orders", "Orders"], ["recap", "Rekap receiving"], ["items", "Items"], ["settings", "Settings"]];
    const active = st.view === "edit" || st.view === "detail" ? "orders" : st.view;
    return `
      <header class="topbar">
        <div class="topbar-in">
          <div class="brand"><span class="brand-mark" aria-hidden="true">SPO</span><span>${esc(CFG.APP_NAME || "SPO Outsource")}</span>
            ${st.store.mode === "demo" ? `<span class="pill pill-warn" title="Data hanya tersimpan di browser ini">Mode demo</span>` : ""}</div>
          <nav class="nav">${nav.map(([k, l]) => `<button class="nav-btn${active === k ? " is-active" : ""}" data-action="nav" data-view="${k}">${l}</button>`).join("")}</nav>
          <div class="who">
            <span class="who-name" title="Nama ini dicatat di setiap transaksi">${esc(st.user)}</span>
            ${st.store.mode === "demo" ? `<button class="link" data-action="change-name">Ganti nama</button>` : `<button class="link" data-action="sign-out">Keluar</button>`}
          </div>
        </div>
      </header>
      <main class="page">${st.busy ? `<div class="busy" aria-live="polite">Menyimpan…</div>` : ""}${messages()}${inner}</main>`;
  }

  // ------------------------------------------------------------------
  // ORDERS
  // ------------------------------------------------------------------
  function ordersView() {
    const all = Object.values(st.idx.orders).sort((a, b) =>
      (b.o.spo_number || "~").localeCompare(a.o.spo_number || "~") || String(b.o.created_at).localeCompare(String(a.o.created_at)));
    const q = st.filter.q.trim().toLowerCase();
    const list = all.filter(({ o, lines }) => {
      if (st.filter.status === "ACTIVE" && o.status === "COMPLETED") return false;
      if (!["ALL", "ACTIVE"].includes(st.filter.status) && o.status !== st.filter.status) return false;
      if (!q) return true;
      return [o.spo_number, o.supplier, o.supplier_ref, ...lines.map((l) => l.sku + " " + l.description)].join(" ").toLowerCase().includes(q);
    });
    const open = all.filter((x) => x.o.status === "OPEN");
    const sum = (k) => open.reduce((s, x) => s + x.t[k], 0);
    const kpis = [
      ["Order open", open.length, ""],
      ["Lewat due date", open.filter((x) => isOverdue(x.o)).length, open.some((x) => isOverdue(x.o)) ? "bad" : ""],
      ["Menunggu QC", S.qty(sum("awaiting")), sum("awaiting") > 0 ? "warn" : ""],
      ["Di repair", S.qty(sum("repair")), sum("repair") > 0 ? "warn" : ""],
      ["Damaged belum diganti", S.qty(sum("damagedOpen")), sum("damagedOpen") > 0 ? "bad" : ""],
    ];
    const seg = [["ACTIVE", "Belum selesai"], ["DRAFT", "Draft"], ["OPEN", "Open"], ["COMPLETED", "Completed"], ["ALL", "Semua"]];
    return `
      <section class="head-row">
        <div><h1>Supplier purchase outsource</h1><p class="sub">Order ke vendor outsource dengan qty per ukuran, sampai lulus QC.</p></div>
        <button class="btn btn-primary" data-action="new-order">Buat SPO baru</button>
      </section>
      <section class="kpis">${kpis.map(([l, v, tone]) => `<div class="kpi${tone ? " kpi-" + tone : ""}"><div class="kpi-v">${v}</div><div class="kpi-l">${l}</div></div>`).join("")}</section>
      <section class="toolbar">
        <input id="f-q" class="input" type="search" placeholder="Cari SPO, supplier, SKU…" value="${esc(st.filter.q)}" data-bind="filter.q">
        <div class="seg" role="tablist">${seg.map(([k, l]) => `<button class="seg-btn${st.filter.status === k ? " is-active" : ""}" data-action="filter-status" data-v="${k}">${l}</button>`).join("")}</div>
      </section>
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>SPO</th><th>Status</th><th>Supplier</th><th>Item</th><th>Tgl SPO</th><th>Due</th><th class="num">Order</th><th class="num">Pass</th><th>Progres</th><th class="num">Nilai</th></tr></thead>
        <tbody>${list.length ? list.map(({ o, lines, t }) => {
          const pct = t.ordered ? Math.min(100, Math.round((t.ordered - t.outstanding) / t.ordered * 100)) : 0;
          const flags = [];
          if (t.awaiting > 0) flags.push(pill("QC " + S.qty(t.awaiting), "warn"));
          if (t.repair > 0) flags.push(pill("Repair " + S.qty(t.repair), "warn"));
          if (t.damagedOpen > 0) flags.push(pill("Damaged " + S.qty(t.damagedOpen), "bad"));
          return `<tr class="row-link" data-action="open-order" data-id="${o.id}" tabindex="0">
            <td class="mono strong nowrap">${o.spo_number ? esc(o.spo_number) : `<span class="muted">Draft</span>`}</td>
            <td>${statusPill(o.status)}</td>
            <td>${esc(o.supplier) || `<span class="muted">Belum diisi</span>`}</td>
            <td class="items-cell">${lines.map((l) => `<span class="mono">${esc(l.sku)}</span>`).join(", ") || `<span class="muted">Belum ada</span>`}<div class="flags">${flags.join("")}</div></td>
            <td class="nowrap">${S.fmtDate(o.spo_date)}</td>
            <td class="nowrap${isOverdue(o) ? " overdue" : ""}">${S.fmtDate(o.due_date)}</td>
            <td class="num">${S.qty(t.ordered)}</td>
            <td class="num">${o.status === "DRAFT" ? "" : S.qty(t.pass)}</td>
            <td>${o.status === "DRAFT" ? "" : `<div class="bar" title="${pct}% selesai"><span style="width:${pct}%"></span></div>`}</td>
            <td class="num nowrap">${S.money(t.value - t.discount)}</td></tr>`;
        }).join("") : `<tr><td colspan="10" class="empty">Tidak ada order di filter ini.</td></tr>`}</tbody>
      </table></div>`;
  }

  // ------------------------------------------------------------------
  // EDITOR DRAFT
  // ------------------------------------------------------------------
  function makeDraft(orderId) {
    const x = orderId && st.idx.orders[orderId];
    const defLoc = (st.data.locations.find((l) => l.active) || {}).name || "";
    if (!x) return { id: null, spo_date: S.today(), due_date: "", supplier: "", receiving_location: defLoc, supplier_ref: "", note: "",
                     lines: [blankLine()] };
    const o = x.o;
    return { id: o.id, spo_number: o.spo_number, spo_date: o.spo_date || "", due_date: o.due_date || "", supplier: o.supplier || "",
      receiving_location: o.receiving_location || "", supplier_ref: o.supplier_ref || "", note: o.note || "",
      lines: x.lines.map((l) => ({ sku: l.sku, description: l.description || "", supplier_sku: l.supplier_sku || "", unit: l.unit || "Each",
        unit_price: l.unit_price, discount_pct: l.discount_pct, sizes: { ...l.sizes } })) };
  }
  function blankLine() { return { sku: "", description: "", supplier_sku: "", unit: "Each", unit_price: "", discount_pct: "", sizes: {} }; }

  function editorView() {
    const d = st.draft;
    const sizes = sizesFor(d.lines, true);
    const suppliers = [...new Set(st.data.orders.map((o) => o.supplier).filter(Boolean))].sort();
    const locs = st.data.locations.filter((l) => l.active || l.name === d.receiving_location);
    const items = st.idx.items.filter((i) => i.active || d.lines.some((l) => l.sku === i.sku));
    const field = (id, label, inner, hint) => `<label class="field" for="${id}"><span class="field-l">${label}</span>${inner}${hint ? `<span class="field-h">${hint}</span>` : ""}</label>`;
    return `
      <section class="head-row">
        <div><button class="link back" data-action="nav" data-view="orders">← Semua order</button>
          <h1>${d.id ? (d.spo_number ? "Edit " + esc(d.spo_number) : "Edit draft") : "SPO baru"}</h1>
          <p class="sub">Nomor SPO diberikan saat Submit. Setelah Submit, order terkunci dan siap di-receive.</p></div>
      </section>
      <section class="card">
        <h2 class="card-t">Header</h2>
        <div class="grid-form">
          ${field("d-spo_date", "Tanggal SPO", `<input id="d-spo_date" class="input" type="date" value="${esc(d.spo_date)}" data-bind="draft.spo_date">`)}
          ${field("d-due_date", "Due date", `<input id="d-due_date" class="input" type="date" value="${esc(d.due_date)}" data-bind="draft.due_date">`)}
          ${field("d-supplier", "Supplier <b class=req>*</b>", `<input id="d-supplier" class="input" list="dl-sup" value="${esc(d.supplier)}" data-bind="draft.supplier" autocomplete="off"><datalist id="dl-sup">${suppliers.map((s) => `<option value="${esc(s)}">`).join("")}</datalist>`)}
          ${field("d-loc", "Lokasi receiving", `<select id="d-loc" class="input" data-bind="draft.receiving_location"><option value="">Pilih…</option>${locs.map((l) => `<option${l.name === d.receiving_location ? " selected" : ""}>${esc(l.name)}</option>`).join("")}</select>`)}
          ${field("d-ref", "Ref supplier", `<input id="d-ref" class="input" value="${esc(d.supplier_ref)}" data-bind="draft.supplier_ref">`, "No. quotation atau invoice vendor")}
          ${field("d-note", "Catatan SPO", `<input id="d-note" class="input" value="${esc(d.note)}" data-bind="draft.note">`)}
        </div>
      </section>
      <section class="card">
        <div class="card-head"><h2 class="card-t">Item dan qty per ukuran</h2>
          ${items.length ? "" : `<span class="pill pill-bad">Belum ada item. Tambahkan dulu di menu Items.</span>`}</div>
        <div class="table-wrap"><table class="tbl tbl-edit">
          <thead><tr><th>#</th><th class="w-sku">SKU general</th><th>Deskripsi</th><th>SKU supplier</th><th>Unit</th><th class="num">Harga</th><th class="num">Disc %</th>
            ${sizes.map((s) => `<th class="num size-h">${esc(s)}</th>`).join("")}<th class="num">Qty</th><th class="num">Jumlah</th><th></th></tr></thead>
          <tbody>${d.lines.map((l, i) => `<tr>
            <td class="muted">${i + 1}</td>
            <td><select id="l${i}-sku" class="input" data-line="${i}" data-f="sku"><option value="">Pilih SKU…</option>${items.map((it) => `<option value="${esc(it.sku)}"${it.sku === l.sku ? " selected" : ""}>${esc(it.sku)}</option>`).join("")}</select></td>
            <td><input id="l${i}-desc" class="input w-desc" value="${esc(l.description)}" data-line="${i}" data-f="description"></td>
            <td><input id="l${i}-ssku" class="input w-s" value="${esc(l.supplier_sku)}" data-line="${i}" data-f="supplier_sku"></td>
            <td><input id="l${i}-unit" class="input w-xs" value="${esc(l.unit)}" data-line="${i}" data-f="unit"></td>
            <td><input id="l${i}-price" class="input num w-m" inputmode="decimal" value="${esc(l.unit_price)}" data-line="${i}" data-f="unit_price"></td>
            <td><input id="l${i}-disc" class="input num w-xs" inputmode="decimal" value="${esc(l.discount_pct)}" data-line="${i}" data-f="discount_pct"></td>
            ${sizes.map((s) => `<td><input id="l${i}-s-${esc(s)}" class="input num w-q" inputmode="decimal" aria-label="Qty ${esc(s)}" value="${esc(l.sizes[s] || "")}" data-line="${i}" data-size="${esc(s)}"></td>`).join("")}
            <td class="num strong" id="l${i}-qty">${S.qty(S.lineQty(l))}</td>
            <td class="num nowrap" id="l${i}-amt">${S.money(S.lineAmount(l))}</td>
            <td><button class="icon-btn" data-action="remove-line" data-i="${i}" aria-label="Hapus baris ${i + 1}" title="Hapus baris">×</button></td></tr>`).join("")}
          </tbody>
          <tfoot><tr><td colspan="${7 + sizes.length}"><button class="btn btn-ghost" data-action="add-line">+ Tambah item</button></td>
            <td class="num strong" id="d-qty">${S.qty(d.lines.reduce((s, l) => s + S.lineQty(l), 0))}</td>
            <td class="num strong nowrap" id="d-amt">${S.money(d.lines.reduce((s, l) => s + S.lineAmount(l), 0))}</td><td></td></tr></tfoot>
        </table></div>
        <p class="hint">Harga dalam IDR. Jumlah = qty × harga × (1 − diskon). Ukuran tanpa qty tidak disimpan.</p>
      </section>
      <section class="actions">
        <button class="btn btn-primary" data-action="submit-draft">Simpan & Submit</button>
        <button class="btn" data-action="save-draft">Simpan draft</button>
        <span class="spacer"></span>
        ${d.id && !d.spo_number ? (st.confirm === "delete-draft"
          ? `<span class="confirm">Hapus draft ini? <button class="btn btn-danger" data-action="delete-draft">Ya, hapus</button><button class="btn btn-ghost" data-action="cancel-confirm">Batal</button></span>`
          : `<button class="btn btn-ghost danger-text" data-action="ask" data-key="delete-draft">Hapus draft</button>`) : ""}
      </section>`;
  }

  function draftPayload() {
    const d = st.draft;
    return { id: d.id, spo_date: d.spo_date, due_date: d.due_date, supplier: d.supplier, receiving_location: d.receiving_location,
      supplier_ref: d.supplier_ref, note: d.note,
      lines: d.lines.filter((l) => l.sku || S.lineQty(l) > 0).map((l) => {
        if (!l.sku) throw new Error("Ada baris dengan qty tapi tanpa SKU");
        const sizes = {}; for (const [k, v] of Object.entries(l.sizes)) if (num(v) > 0) sizes[k] = num(v);
        return { sku: l.sku, description: l.description, supplier_sku: l.supplier_sku, unit: l.unit || "Each",
          unit_price: num(l.unit_price), discount_pct: num(l.discount_pct), sizes };
      }) };
  }

  function validateDraftNumbers() {
    for (const [i, l] of st.draft.lines.entries()) {
      if (num(l.discount_pct) < 0 || num(l.discount_pct) > 100) throw new Error(`Baris ${i + 1}: diskon harus 0 sampai 100%`);
      if (num(l.unit_price) < 0) throw new Error(`Baris ${i + 1}: harga tidak boleh negatif`);
      for (const [k, v] of Object.entries(l.sizes)) if (num(v) < 0) throw new Error(`Baris ${i + 1} size ${k}: qty tidak boleh negatif`);
    }
  }

  function updateDraftTotals() {
    const d = st.draft;
    d.lines.forEach((l, i) => {
      const q = document.getElementById(`l${i}-qty`), a = document.getElementById(`l${i}-amt`);
      if (q) q.textContent = S.qty(S.lineQty(l));
      if (a) a.textContent = S.money(S.lineAmount(l));
    });
    const tq = document.getElementById("d-qty"), ta = document.getElementById("d-amt");
    if (tq) tq.textContent = S.qty(d.lines.reduce((s, l) => s + S.lineQty(l), 0));
    if (ta) ta.textContent = S.money(d.lines.reduce((s, l) => s + S.lineAmount(l), 0));
  }

  // ------------------------------------------------------------------
  // DETAIL ORDER (OPEN / COMPLETED)
  // ------------------------------------------------------------------
  const ACTS = {
    RECEIVE:         { label: "Receiving", help: "Barang datang dari vendor. Masuk ke antrian QC.", avail: (b) => b.can_receive, availLabel: "bisa diterima" },
    QC:              { label: "QC", help: "Hasil QC dari barang yang menunggu QC. Reject masuk repair, Damaged tidak bisa diterima lagi.", avail: (b) => b.awaiting_qc, availLabel: "menunggu QC" },
    REPAIR_RETURN:   { label: "Kembali dari repair", help: "Barang reject yang sudah diperbaiki dan kembali. Masuk lagi ke antrian QC.", avail: (b) => b.in_repair, availLabel: "di repair" },
    DAMAGE_DISCOUNT: { label: "Diskon damaged", help: "Pakai ini kalau barang damaged tidak diganti vendor tapi diganti potongan harga. Qty ini dianggap selesai.", avail: (b) => Math.min(b.damaged_open, b.can_receive), availLabel: "damaged belum diganti" },
  };
  const QC_ROWS = [["QC_PASS", "Pass"], ["QC_REJECT", "Reject"], ["QC_DAMAGED", "Damaged"]];

  function detailView() {
    const x = st.idx.orders[st.orderId];
    if (!x) return `<p>Order tidak ditemukan.</p>`;
    const { o, lines, events, bal, t } = x;
    const activeEvents = events.filter((e) => !e.voided_at).length;
    const info = [["Tanggal SPO", S.fmtDate(o.spo_date)], ["Due date", `<span class="${isOverdue(o) ? "overdue" : ""}">${S.fmtDate(o.due_date) || "—"}</span>`],
      ["Supplier", esc(o.supplier)], ["Lokasi receiving", esc(o.receiving_location || "—")], ["Ref supplier", esc(o.supplier_ref || "—")],
      ["Dibuat", esc(o.created_by || "") + (o.submitted_by ? ", submit oleh " + esc(o.submitted_by) : "")]];
    return `
      <section class="head-row">
        <div><button class="link back" data-action="nav" data-view="orders">← Semua order</button>
          <h1><span class="mono">${esc(o.spo_number)}</span> ${statusPill(o.status)}</h1>
          ${o.note ? `<p class="sub">${esc(o.note)}</p>` : ""}</div>
        <div class="head-actions">${activeEvents === 0 ? (st.confirm === "reopen"
          ? `<span class="confirm">Kembalikan ke draft untuk diedit? <button class="btn" data-action="reopen">Ya</button><button class="btn btn-ghost" data-action="cancel-confirm">Batal</button></span>`
          : `<button class="btn btn-ghost" data-action="ask" data-key="reopen">Edit order</button>`) : ""}</div>
      </section>
      <section class="info">${info.map(([k, v]) => `<div><div class="info-k">${k}</div><div class="info-v">${v}</div></div>`).join("")}</section>
      <section class="kpis kpis-sm">
        ${[["Order", t.ordered], ["Received", t.received], ["Menunggu QC", t.awaiting, "warn"], ["Pass (final)", t.pass, "good"], ["Di repair", t.repair, "warn"], ["Damaged belum diganti", t.damagedOpen, "bad"], ["Outstanding", t.outstanding]]
          .map(([l, v, tone]) => `<div class="kpi${tone && v > 0 ? " kpi-" + tone : ""}"><div class="kpi-v">${S.qty(v)}</div><div class="kpi-l">${l}</div></div>`).join("")}
        <div class="kpi"><div class="kpi-v kpi-money">${S.money(t.value - t.discount)}</div><div class="kpi-l">Nilai${t.discount ? " (setelah potongan " + S.money(t.discount) + ")" : ""}</div></div>
      </section>
      ${o.status === "OPEN" ? actionPanel(x) : `<div class="msg msg-good">Semua qty sudah lulus QC atau diselesaikan dengan diskon. Order selesai.</div>`}
      <section class="card"><h2 class="card-t">Saldo per ukuran</h2>${lines.map((l) => balanceTable(l, bal)).join("")}</section>
      <section class="card"><h2 class="card-t">Riwayat</h2>${historyTable(events, lines)}</section>`;
  }

  function balanceTable(l, bal) {
    const sizes = Object.keys(l.sizes).sort((a, b) => (st.idx.sizeSort[a] ?? 99) - (st.idx.sizeSort[b] ?? 99));
    const rows = [["qty_ordered", "Order", ""], ["received", "Received", ""], ["awaiting_qc", "Menunggu QC", "warn"], ["qc_pass", "Pass (final)", "good"],
      ["in_repair", "Di repair", "warn"], ["qc_damaged", "Damaged", "bad"], ["damage_discounted", "Diganti diskon", ""], ["outstanding", "Outstanding", "strong"]];
    return `<div class="line-block">
      <div class="line-title"><span class="mono strong">${esc(l.spo_line_id || "")}</span> <span class="mono">${esc(l.sku)}</span> <span class="muted">${esc(l.description || "")}</span>
        <span class="muted nowrap">· ${S.money(l.unit_price)}${l.discount_pct ? " −" + S.qty(l.discount_pct) + "%" : ""}</span></div>
      <div class="table-wrap"><table class="tbl tbl-bal"><thead><tr><th></th>${sizes.map((s) => `<th class="num">${esc(s)}</th>`).join("")}<th class="num">Total</th></tr></thead>
      <tbody>${rows.map(([k, label, tone]) => {
        const vals = sizes.map((s) => (bal[l.id + "|" + s] || {})[k] || 0);
        const tot = vals.reduce((a, b) => a + b, 0);
        return `<tr class="${tone === "strong" ? "strong" : ""}"><th scope="row">${label}</th>${vals.map((v) => `<td class="num${v && tone && tone !== "strong" ? " tone-" + tone : ""}">${v ? S.qty(v) : `<span class="zero">0</span>`}</td>`).join("")}<td class="num strong">${S.qty(tot)}</td></tr>`;
      }).join("")}</tbody></table></div></div>`;
  }

  function actionPanel(x) {
    const a = st.act;
    const tabs = Object.entries(ACTS).map(([k, v]) => `<button class="seg-btn${a && a.type === k ? " is-active" : ""}" data-action="act-type" data-v="${k}">${v.label}</button>`).join("");
    if (!a) return `<section class="card act"><div class="card-head"><h2 class="card-t">Catat kejadian</h2><div class="seg">${tabs}</div></div>
      <p class="hint">Pilih jenis kejadian di atas untuk mengisi qty per ukuran.</p></section>`;
    const def = ACTS[a.type];
    const sizes = sizesFor(x.lines, false);
    let body = "";
    for (const l of x.lines) {
      const avail = (s) => { const b = x.bal[l.id + "|" + s]; return b ? def.avail(b) : null; };
      const anyAvail = sizes.some((s) => (avail(s) || 0) > 0);
      const head = `<tr class="grp"><th colspan="${sizes.length + 2}"><span class="mono strong">${esc(l.sku)}</span> <span class="muted">${esc(l.description || "")}</span></th></tr>`;
      const availRow = `<tr class="avail"><th scope="row">${def.availLabel}</th>${sizes.map((s) => { const v = avail(s); return `<td class="num">${v == null ? "" : S.qty(v)}</td>`; }).join("")}<td></td></tr>`;
      const inputRow = (evType, label) => `<tr><th scope="row">${label}</th>${sizes.map((s) => {
        const v = avail(s); const key = `${l.id}|${s}|${evType}`;
        if (v == null) return `<td></td>`;
        return `<td class="num"><input id="a-${esc(key)}" class="input num w-q" inputmode="decimal" aria-label="${label} ${esc(s)}" value="${esc(a.vals[key] || "")}" data-act="${esc(key)}"${v <= 0 ? " disabled" : ""}></td>`;
      }).join("")}<td class="num strong" id="sum-${l.id}-${evType}"></td></tr>`;
      if (!anyAvail) { body += head + `<tr><td colspan="${sizes.length + 2}" class="muted small">Tidak ada qty yang bisa dicatat untuk item ini.</td></tr>`; continue; }
      body += head + availRow;
      if (a.type === "QC") QC_ROWS.forEach(([t, lbl]) => (body += inputRow(t, lbl)));
      else body += inputRow(a.type, "Qty");
      if (a.type === "DAMAGE_DISCOUNT") {
        body += `<tr><th scope="row">Potongan (Rp)</th><td colspan="${sizes.length}"><input id="amt-${l.id}" class="input num w-m" inputmode="decimal" value="${esc(a.amounts[l.id] ?? "")}" data-amt="${l.id}" placeholder="${esc(String(Math.round(S.netUnitPrice(l))))} per pcs">
          <span class="field-h">Kosongkan untuk memakai harga bersih × qty</span></td><td></td></tr>`;
      }
    }
    return `<section class="card act">
      <div class="card-head"><h2 class="card-t">Catat kejadian</h2><div class="seg">${tabs}</div></div>
      <p class="hint">${def.help}</p>
      <div class="table-wrap"><table class="tbl tbl-act"><thead><tr><th></th>${sizes.map((s) => `<th class="num">${esc(s)}</th>`).join("")}<th class="num">Total</th></tr></thead><tbody>${body}</tbody></table></div>
      <div class="act-foot">
        <label class="field" for="a-date"><span class="field-l">Tanggal</span><input id="a-date" class="input" type="date" value="${esc(a.date)}" data-bind="act.date"></label>
        <label class="field grow" for="a-note"><span class="field-l">Catatan</span><input id="a-note" class="input" value="${esc(a.note)}" data-bind="act.note" placeholder="${a.type === "QC" ? "Misalnya alasan reject" : "Misalnya no. surat jalan"}"></label>
        <div class="field"><span class="field-l">Dicatat oleh</span><span class="who-chip">${esc(st.user)}</span></div>
        <button class="btn btn-primary" data-action="post-act">Simpan ${esc(def.label)}</button>
        <button class="btn btn-ghost" data-action="act-cancel">Tutup</button>
      </div></section>`;
  }

  function updateActSums() {
    const a = st.act; if (!a) return;
    const sums = {};
    for (const [k, v] of Object.entries(a.vals)) { const [line, , t] = k.split("|"); sums[line + "-" + t] = (sums[line + "-" + t] || 0) + num(v); }
    document.querySelectorAll("[id^='sum-']").forEach((el) => { const v = sums[el.id.slice(4)] || 0; el.textContent = v ? S.qty(v) : ""; });
  }

  function buildActEvents(x) {
    const a = st.act; const evs = [];
    for (const [k, v] of Object.entries(a.vals)) {
      const q = num(v); if (!q) continue;
      if (q < 0) throw new Error("Qty tidak boleh negatif");
      const [line_id, size_code, t] = k.split("|");
      evs.push({ line_id, size_code, event_type: t, qty: q, amount: 0 });
    }
    if (a.type === "DAMAGE_DISCOUNT") {
      for (const l of x.lines) {
        const mine = evs.filter((e) => e.line_id === l.id); if (!mine.length) continue;
        const totalQ = mine.reduce((s, e) => s + e.qty, 0);
        const raw = a.amounts[l.id];
        const total = raw === undefined || String(raw).trim() === "" ? S.r2(totalQ * S.netUnitPrice(l)) : num(raw);
        if (total < 0) throw new Error("Potongan tidak boleh negatif");
        let left = total;
        mine.forEach((e, i) => { e.amount = i === mine.length - 1 ? S.r2(left) : S.r2(total * e.qty / totalQ); left -= e.amount; });
      }
    }
    // cek di browser dulu supaya pesan error muncul sebelum mengirim
    const test = S.computeBalances(x.lines, x.events.concat(evs.map((e) => ({ ...e }))));
    const err = S.checkBalances(test, x.lines);
    if (err) throw new Error(err);
    if (!evs.length) throw new Error("Belum ada qty yang diisi");
    return evs;
  }

  function historyTable(events, lines) {
    if (!events.length) return `<p class="hint">Belum ada kejadian.</p>`;
    const lineBy = {}; lines.forEach((l) => (lineBy[l.id] = l));
    const list = events.slice().sort((a, b) => String(b.event_date).localeCompare(String(a.event_date)) || String(b.created_at).localeCompare(String(a.created_at)));
    return `<div class="table-wrap"><table class="tbl tbl-hist"><thead><tr><th>Tanggal</th><th>Kejadian</th><th>SKU</th><th>Size</th><th class="num">Qty</th><th class="num">Potongan</th><th>Oleh</th><th>Catatan</th><th></th></tr></thead>
      <tbody>${list.map((e) => {
        const v = !!e.voided_at;
        const row = `<tr class="${v ? "voided" : ""}"><td class="nowrap">${S.fmtDate(e.event_date)}</td><td>${typePill(e.event_type)}</td>
          <td class="mono">${esc((lineBy[e.line_id] || {}).sku || "")}</td><td class="mono">${esc(e.size_code)}</td><td class="num">${S.qty(e.qty)}</td>
          <td class="num nowrap">${e.amount ? S.money(e.amount) : ""}</td><td>${esc(e.recorded_by)}</td>
          <td class="note-cell">${esc(e.note || "")}${v ? `<div class="small bad-text">Dibatalkan ${esc(e.voided_by || "")}: ${esc(e.void_reason || "")}</div>` : ""}</td>
          <td>${v ? "" : `<button class="link small" data-action="void-start" data-id="${e.id}">Batalkan</button>`}</td></tr>`;
        const form = st.voiding === e.id ? `<tr class="void-row"><td colspan="9"><div class="void-form">
          <label class="field grow" for="void-reason"><span class="field-l">Alasan pembatalan</span><input id="void-reason" class="input" data-bind="voidReason" value="${esc(st.voidReason || "")}" placeholder="Misalnya salah ketik qty"></label>
          <button class="btn btn-danger" data-action="void-confirm" data-id="${e.id}">Batalkan kejadian ini</button><button class="btn btn-ghost" data-action="void-cancel">Tutup</button></div></td></tr>` : "";
        return row + form;
      }).join("")}</tbody></table></div>`;
  }

  // ------------------------------------------------------------------
  // REKAP RECEIVING
  // ------------------------------------------------------------------
  function recapRows() {
    const r = st.recap, q = r.q.trim().toLowerCase();
    if (r.tab === "events") {
      const rows = [];
      for (const { o, lines, events } of Object.values(st.idx.orders)) {
        if (r.supplier && o.supplier !== r.supplier) continue;
        const lineBy = {}; lines.forEach((l) => (lineBy[l.id] = l));
        for (const e of events) {
          if (!r.showVoid && e.voided_at) continue;
          if (r.type && e.event_type !== r.type) continue;
          if (r.from && e.event_date < r.from) continue;
          if (r.to && e.event_date > r.to) continue;
          const l = lineBy[e.line_id] || {};
          const row = { date: e.event_date, spo: o.spo_number, spo_line: l.spo_line_id, supplier: o.supplier, sku: l.sku, description: l.description,
            size: e.size_code, type: e.event_type, qty: e.qty, amount: e.amount || 0, by: e.recorded_by, note: e.note || "",
            voided: e.voided_at ? "YA" : "", sort: (st.idx.sizeSort[e.size_code] ?? 99) };
          if (q && ![row.spo, row.sku, row.description, row.note, row.by].join(" ").toLowerCase().includes(q)) continue;
          rows.push(row);
        }
      }
      return rows.sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(a.spo).localeCompare(String(b.spo)) || a.sort - b.sort);
    }
    const rows = [];
    for (const { o, lines, bal } of Object.values(st.idx.orders)) {
      if (o.status === "DRAFT") continue;
      if (r.onlyOpen && o.status !== "OPEN") continue;
      if (r.supplier && o.supplier !== r.supplier) continue;
      for (const l of lines) {
        if (q && ![o.spo_number, l.sku, l.description].join(" ").toLowerCase().includes(q)) continue;
        for (const s of Object.keys(l.sizes)) {
          const b = bal[l.id + "|" + s]; if (!b) continue;
          rows.push({ spo: o.spo_number, spo_line: l.spo_line_id, supplier: o.supplier, due: o.due_date, sku: l.sku, description: l.description, size: s,
            ordered: b.qty_ordered, received: b.received, awaiting: b.awaiting_qc, pass: b.qc_pass, repair: b.in_repair,
            damaged: b.qc_damaged, discounted: b.damage_discounted, outstanding: b.outstanding, sort: st.idx.sizeSort[s] ?? 99 });
        }
      }
    }
    return rows.sort((a, b) => String(a.spo).localeCompare(String(b.spo)) || String(a.spo_line).localeCompare(String(b.spo_line)) || a.sort - b.sort);
  }

  const RECAP_COLS = {
    events: [["date", "Tanggal"], ["spo", "SPO"], ["spo_line", "SPO Line"], ["supplier", "Supplier"], ["sku", "SKU"], ["description", "Deskripsi"], ["size", "Size"],
      ["type", "Kejadian"], ["qty", "Qty"], ["amount", "Potongan"], ["by", "Oleh"], ["note", "Catatan"], ["voided", "Dibatalkan"]],
    balance: [["spo", "SPO"], ["spo_line", "SPO Line"], ["supplier", "Supplier"], ["due", "Due"], ["sku", "SKU"], ["description", "Deskripsi"], ["size", "Size"],
      ["ordered", "Order"], ["received", "Received"], ["awaiting", "Menunggu QC"], ["pass", "Pass"], ["repair", "Di repair"], ["damaged", "Damaged"],
      ["discounted", "Diganti diskon"], ["outstanding", "Outstanding"]],
  };
  const NUM_COLS = new Set(["qty", "amount", "ordered", "received", "awaiting", "pass", "repair", "damaged", "discounted", "outstanding"]);

  function recapView() {
    const r = st.recap;
    const rows = recapRows();
    const cols = RECAP_COLS[r.tab];
    const suppliers = [...new Set(st.data.orders.map((o) => o.supplier).filter(Boolean))].sort();
    const totals = {};
    cols.forEach(([k]) => { if (NUM_COLS.has(k)) totals[k] = rows.reduce((s, x) => s + (x.voided ? 0 : Number(x[k]) || 0), 0); });
    const cell = (k, v, row) => {
      if (k === "type") return typePill(v);
      if (k === "date" || k === "due") return `<span class="nowrap">${S.fmtDate(v)}</span>`;
      if (k === "amount") return v ? S.money(v) : "";
      if (NUM_COLS.has(k)) return v ? S.qty(v) : `<span class="zero">0</span>`;
      if (["spo", "spo_line", "sku", "size"].includes(k)) return `<span class="mono">${esc(v)}</span>`;
      return esc(v);
    };
    return `
      <section class="head-row"><div><h1>Rekap receiving</h1><p class="sub">Semua kejadian receiving, QC, repair, dan diskon. Bisa diekspor ke CSV untuk dicocokkan dengan PO.</p></div></section>
      <section class="toolbar wrap">
        <div class="seg">${[["events", "Riwayat kejadian"], ["balance", "Saldo per size"]].map(([k, l]) => `<button class="seg-btn${r.tab === k ? " is-active" : ""}" data-action="recap-tab" data-v="${k}">${l}</button>`).join("")}</div>
        <input id="r-q" class="input" type="search" placeholder="Cari SPO, SKU…" value="${esc(r.q)}" data-bind="recap.q">
        <select id="r-sup" class="input" data-bind="recap.supplier"><option value="">Semua supplier</option>${suppliers.map((s) => `<option${s === r.supplier ? " selected" : ""}>${esc(s)}</option>`).join("")}</select>
        ${r.tab === "events" ? `
          <label class="inline" for="r-from">Dari <input id="r-from" class="input" type="date" value="${esc(r.from)}" data-bind="recap.from"></label>
          <label class="inline" for="r-to">Sampai <input id="r-to" class="input" type="date" value="${esc(r.to)}" data-bind="recap.to"></label>
          <select id="r-type" class="input" data-bind="recap.type"><option value="">Semua kejadian</option>${Object.entries(S.EVENT_TYPES).map(([k, v]) => `<option value="${k}"${k === r.type ? " selected" : ""}>${v.label}</option>`).join("")}</select>
          <label class="inline check" for="r-void"><input id="r-void" type="checkbox" data-bind="recap.showVoid"${r.showVoid ? " checked" : ""}> Tampilkan yang dibatalkan</label>`
        : `<label class="inline check" for="r-open"><input id="r-open" type="checkbox" data-bind="recap.onlyOpen"${r.onlyOpen ? " checked" : ""}> Hanya order open</label>`}
        <span class="spacer"></span>
        <button class="btn" data-action="csv-download">Download CSV</button>
        <button class="btn btn-ghost" data-action="csv-copy">Salin CSV</button>
      </section>
      <p class="hint">${rows.length} baris</p>
      <div class="table-wrap"><table class="tbl tbl-recap"><thead><tr>${cols.map(([k, l]) => `<th class="${NUM_COLS.has(k) ? "num" : ""}">${l}</th>`).join("")}</tr></thead>
        <tbody>${rows.length ? rows.map((x) => `<tr class="${x.voided ? "voided" : ""}">${cols.map(([k]) => `<td class="${NUM_COLS.has(k) ? "num" : ""}">${cell(k, x[k], x)}</td>`).join("")}</tr>`).join("")
          : `<tr><td colspan="${cols.length}" class="empty">Tidak ada data di filter ini.</td></tr>`}</tbody>
        ${rows.length ? `<tfoot><tr>${cols.map(([k], i) => `<td class="${NUM_COLS.has(k) ? "num strong" : ""}">${i === 0 ? "Total" : NUM_COLS.has(k) && (r.tab === "balance" || k === "amount" || r.type) ? (k === "amount" ? S.money(totals[k]) : S.qty(totals[k])) : ""}</td>`).join("")}</tr></tfoot>` : ""}
      </table></div>
      <textarea id="csv-fallback" class="csv-fallback" hidden readonly aria-label="CSV"></textarea>`;
  }

  function toCsv() {
    const cols = RECAP_COLS[st.recap.tab];
    const q = (v) => { const s = String(v == null ? "" : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    return [cols.map(([, l]) => q(l)).join(",")].concat(recapRows().map((r) => cols.map(([k]) => q(r[k])).join(","))).join("\n");
  }

  // ------------------------------------------------------------------
  // ITEMS
  // ------------------------------------------------------------------
  function itemsView() {
    const e = st.itemEdit || { sku: "", description: "", unit: "Each", active: true };
    return `
      <section class="head-row"><div><h1>Items</h1><p class="sub">Daftar SKU general untuk outsource. Satu SKU dipakai untuk semua ukuran.</p></div></section>
      <section class="card">
        <h2 class="card-t">${e.original_sku ? "Edit " + esc(e.original_sku) : "Tambah item"}</h2>
        <div class="grid-form">
          <label class="field" for="i-sku"><span class="field-l">SKU <b class=req>*</b></span><input id="i-sku" class="input mono" value="${esc(e.sku)}" data-bind="itemEdit.sku"${e.original_sku ? " readonly" : ""}></label>
          <label class="field" for="i-desc"><span class="field-l">Deskripsi <b class=req>*</b></span><input id="i-desc" class="input" value="${esc(e.description)}" data-bind="itemEdit.description"></label>
          <label class="field" for="i-unit"><span class="field-l">Unit</span><input id="i-unit" class="input" value="${esc(e.unit)}" data-bind="itemEdit.unit"></label>
          <label class="field check" for="i-active"><input id="i-active" type="checkbox" data-bind="itemEdit.active"${e.active !== false ? " checked" : ""}> Aktif (muncul di pilihan order)</label>
        </div>
        <div class="actions"><button class="btn btn-primary" data-action="save-item">${e.original_sku ? "Simpan perubahan" : "Tambah item"}</button>
          ${e.original_sku ? `<button class="btn btn-ghost" data-action="item-cancel">Batal</button>` : ""}</div>
      </section>
      <div class="table-wrap"><table class="tbl"><thead><tr><th>SKU</th><th>Deskripsi</th><th>Unit</th><th>Status</th><th></th></tr></thead>
        <tbody>${st.idx.items.length ? st.idx.items.map((i) => `<tr><td class="mono strong">${esc(i.sku)}</td><td>${esc(i.description)}</td><td>${esc(i.unit)}</td>
          <td>${i.active ? pill("Aktif", "good") : pill("Nonaktif", "muted")}</td><td><button class="link" data-action="item-edit" data-sku="${esc(i.sku)}">Edit</button></td></tr>`).join("")
          : `<tr><td colspan="5" class="empty">Belum ada item. Tambahkan SKU general pertama di atas.</td></tr>`}</tbody></table></div>`;
  }

  // ------------------------------------------------------------------
  // SETTINGS
  // ------------------------------------------------------------------
  function settingsView() {
    return `
      <section class="head-row"><div><h1>Settings</h1><p class="sub">Daftar ukuran dan lokasi receiving.</p></div></section>
      <div class="two-col">
        <section class="card">
          <h2 class="card-t">Ukuran</h2>
          <table class="tbl"><thead><tr><th>Kode</th><th class="num">Urutan</th><th>Aktif</th></tr></thead><tbody>
            ${st.idx.sizes.map((s) => `<tr><td class="mono strong">${esc(s.code)}</td>
              <td class="num"><input id="sz-${esc(s.code)}" class="input num w-q" inputmode="numeric" value="${s.sort}" data-size-sort="${esc(s.code)}"></td>
              <td><input type="checkbox" id="sza-${esc(s.code)}" aria-label="Aktif ${esc(s.code)}" data-size-active="${esc(s.code)}"${s.active ? " checked" : ""}></td></tr>`).join("")}
          </tbody></table>
          <div class="inline-add"><input id="new-size" class="input mono w-s" placeholder="Kode baru" data-bind="newSize"><button class="btn" data-action="add-size">Tambah ukuran</button></div>
          <p class="hint">Ukuran nonaktif tidak muncul di order baru, tapi tetap tampil di order lama.</p>
        </section>
        <section class="card">
          <h2 class="card-t">Lokasi receiving</h2>
          <table class="tbl"><thead><tr><th>Lokasi</th><th>Aktif</th></tr></thead><tbody>
            ${st.data.locations.slice().sort((a, b) => a.name.localeCompare(b.name)).map((l, i) => `<tr><td>${esc(l.name)}</td>
              <td><input type="checkbox" id="loc-${i}" aria-label="Aktif ${esc(l.name)}" data-loc-active="${esc(l.name)}"${l.active ? " checked" : ""}></td></tr>`).join("")}
          </tbody></table>
          <div class="inline-add"><input id="new-loc" class="input" placeholder="Nama lokasi" data-bind="newLoc"><button class="btn" data-action="add-loc">Tambah lokasi</button></div>
        </section>
      </div>
      ${st.store.mode === "demo" ? `<section class="card">
        <h2 class="card-t">Data demo</h2>
        <p class="hint">Mode demo menyimpan data di browser ini saja. Data contoh bisa dikembalikan ke awal kapan saja.</p>
        <div class="actions">${st.confirm === "reset" ? `<span class="confirm">Semua data demo di browser ini akan dihapus. <button class="btn btn-danger" data-action="reset-demo">Ya, reset</button><button class="btn btn-ghost" data-action="cancel-confirm">Batal</button></span>`
          : `<button class="btn btn-ghost danger-text" data-action="ask" data-key="reset">Reset data demo</button>`}</div></section>` : ""}`;
  }

  // ------------------------------------------------------------------
  // LOGIN & NAMA
  // ------------------------------------------------------------------
  function nameGate() {
    return `<div class="gate"><form class="gate-card" data-form="name">
      <div class="brand"><span class="brand-mark" aria-hidden="true">SPO</span><span>${esc(CFG.APP_NAME || "SPO Outsource")}</span></div>
      <h1>Siapa yang mencatat?</h1><p class="sub">Nama ini disimpan di setiap order, receiving, dan QC yang kamu catat.</p>
      <label class="field" for="g-name"><span class="field-l">Nama</span><input id="g-name" class="input" autocomplete="name" required></label>
      <button class="btn btn-primary" type="submit">Mulai</button>
      <p class="hint">Ini mode demo: data hanya tersimpan di browser ini.</p></form></div>`;
  }
  function loginGate() {
    return `<div class="gate"><form class="gate-card" data-form="login">
      <div class="brand"><span class="brand-mark" aria-hidden="true">SPO</span><span>${esc(CFG.APP_NAME || "SPO Outsource")}</span></div>
      <h1>Masuk</h1>${messages()}
      <label class="field" for="g-email"><span class="field-l">Email</span><input id="g-email" class="input" type="email" autocomplete="username" required></label>
      <label class="field" for="g-pass"><span class="field-l">Password</span><input id="g-pass" class="input" type="password" autocomplete="current-password" required></label>
      <button class="btn btn-primary" type="submit">${st.busy ? "Memeriksa…" : "Masuk"}</button></form></div>`;
  }

  // ------------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------------
  function render() {
    const focus = document.activeElement && document.activeElement.id;
    const sel = focus && document.activeElement.selectionStart;
    if (!st.store) { $app.innerHTML = `<div class="gate"><p>Memuat…</p></div>`; return; }
    if (st.store.mode === "supabase" && !st.session) { $app.innerHTML = loginGate(); return; }
    if (!st.user) { $app.innerHTML = nameGate(); return; }
    if (!st.idx) { $app.innerHTML = `<div class="gate"><p>Memuat data…</p></div>`; return; }
    const views = { orders: ordersView, edit: editorView, detail: detailView, recap: recapView, items: itemsView, settings: settingsView };
    $app.innerHTML = shell((views[st.view] || ordersView)());
    if (st.view === "detail") updateActSums();
    if (focus) {
      const el = document.getElementById(focus);
      if (el) { el.focus(); try { if (sel != null && el.setSelectionRange) el.setSelectionRange(sel, sel); } catch (e) { /* input tanggal */ } }
    }
  }

  // ------------------------------------------------------------------
  // EVENT
  // ------------------------------------------------------------------
  function setPath(path, value) {
    const parts = path.split("."); let o = st;
    for (let i = 0; i < parts.length - 1; i++) { o[parts[i]] = o[parts[i]] || {}; o = o[parts[i]]; }
    o[parts[parts.length - 1]] = value;
  }

  $app.addEventListener("input", (ev) => {
    const t = ev.target;
    if (t.dataset.bind) {
      setPath(t.dataset.bind, t.type === "checkbox" ? t.checked : t.value);
      if (/^(filter|recap)\./.test(t.dataset.bind) && t.type !== "date") render();
      return;
    }
    if (t.dataset.line != null && st.draft) {
      const l = st.draft.lines[+t.dataset.line];
      if (t.dataset.size) l.sizes[t.dataset.size] = t.value;
      else if (t.dataset.f !== "sku") l[t.dataset.f] = t.value;
      updateDraftTotals(); return;
    }
    if (t.dataset.act && st.act) { st.act.vals[t.dataset.act] = t.value; updateActSums(); return; }
    if (t.dataset.amt && st.act) { st.act.amounts[t.dataset.amt] = t.value; }
  });

  $app.addEventListener("change", (ev) => {
    const t = ev.target;
    if (t.dataset.bind) {
      setPath(t.dataset.bind, t.type === "checkbox" ? t.checked : t.value);
      if (/^(filter|recap)\./.test(t.dataset.bind)) render();
      return;
    }
    if (t.dataset.line != null && t.dataset.f === "sku" && st.draft) {
      const l = st.draft.lines[+t.dataset.line];
      l.sku = t.value;
      const it = st.idx.items.find((i) => i.sku === t.value);
      if (it) { l.description = it.description; l.unit = it.unit || "Each"; }
      render(); return;
    }
    if (t.dataset.sizeSort) { const s = st.idx.sizes.find((x) => x.code === t.dataset.sizeSort); run(() => st.store.saveSize({ ...s, sort: num(t.value) }), "Urutan ukuran disimpan"); return; }
    if (t.dataset.sizeActive) { const s = st.idx.sizes.find((x) => x.code === t.dataset.sizeActive); run(() => st.store.saveSize({ ...s, active: t.checked }), "Ukuran disimpan"); return; }
    if (t.dataset.locActive) { run(() => st.store.saveLocation({ name: t.dataset.locActive, active: t.checked }), "Lokasi disimpan"); }
  });

  $app.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const f = ev.target.dataset.form;
    if (f === "name") {
      const v = document.getElementById("g-name").value.trim();
      if (v) { st.user = v; lsSet(NAME_KEY, v); render(); }
    }
    if (f === "login") {
      st.busy = true; st.error = null; render();
      try {
        await st.store.signIn(document.getElementById("g-email").value.trim(), document.getElementById("g-pass").value);
        st.session = await st.store.session(); st.user = st.store.userName(st.session);
        await reload();
      } catch (e) { st.error = e.message; }
      st.busy = false; render();
    }
  });

  $app.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && ev.target.matches("tr.row-link")) ev.target.click();
  });

  $app.addEventListener("click", async (ev) => {
    const b = ev.target.closest("[data-action]");
    if (!b) return;
    const a = b.dataset.action;
    const x = st.orderId && st.idx.orders[st.orderId];
    switch (a) {
      case "nav": go(b.dataset.view); break;
      case "new-order": go("edit", null); break;
      case "open-order": { const o = st.idx.orders[b.dataset.id].o; go(o.status === "DRAFT" ? "edit" : "detail", o.id); break; }
      case "filter-status": st.filter.status = b.dataset.v; render(); break;
      case "change-name": st.user = ""; lsSet(NAME_KEY, ""); render(); break;
      case "sign-out": await st.store.signOut(); st.session = null; st.user = ""; render(); break;
      case "ask": st.confirm = b.dataset.key; render(); break;
      case "cancel-confirm": st.confirm = null; render(); break;

      case "add-line": st.draft.lines.push(blankLine()); render(); break;
      case "remove-line": st.draft.lines.splice(+b.dataset.i, 1); if (!st.draft.lines.length) st.draft.lines.push(blankLine()); render(); break;
      case "save-draft": case "submit-draft": {
        const submit = a === "submit-draft";
        let payload;
        try { validateDraftNumbers(); payload = draftPayload(); } catch (e) { st.error = e.message; st.flash = null; render(); break; }
        const id = await run(async () => {
          const newId = await st.store.saveDraft(payload, st.user);
          st.draft.id = newId;
          if (submit) { const n = await st.store.submit(newId, st.user); return { id: newId, n }; }
          return { id: newId };
        }, (r) => (r.n ? `${r.n} di-submit. Order siap di-receive.` : "Draft disimpan."));
        if (id && id.n) { st.view = "detail"; st.orderId = id.id; st.draft = null; render(); }
        else if (id) { st.orderId = id.id; st.draft = makeDraft(id.id); render(); }
        break;
      }
      case "delete-draft": {
        const ok = await run(() => st.store.deleteDraft(st.draft.id).then(() => true), "Draft dihapus.");
        if (ok) { st.view = "orders"; st.draft = null; st.confirm = null; render(); }
        break;
      }
      case "reopen": {
        const ok = await run(() => st.store.reopen(st.orderId, st.user).then(() => true), "Order kembali ke draft.");
        if (ok) { st.view = "edit"; st.draft = makeDraft(st.orderId); st.confirm = null; render(); }
        break;
      }

      case "act-type": st.act = { type: b.dataset.v, date: S.today(), note: "", vals: {}, amounts: {} }; st.error = null; st.flash = null; render(); break;
      case "act-cancel": st.act = null; render(); break;
      case "post-act": {
        let evs;
        try { evs = buildActEvents(x); } catch (e) { st.error = e.message; st.flash = null; render(); break; }
        const label = ACTS[st.act.type].label;
        const ok = await run(() => st.store.postEvents(st.orderId, evs, st.act.date, st.act.note, st.user).then(() => true),
          `${label} tersimpan (${evs.length} baris).`);
        if (ok) { st.act = null; render(); }
        break;
      }
      case "void-start": st.voiding = b.dataset.id; st.voidReason = ""; render(); break;
      case "void-cancel": st.voiding = null; render(); break;
      case "void-confirm": {
        const ok = await run(() => st.store.voidEvent(b.dataset.id, st.voidReason || "", st.user).then(() => true), "Kejadian dibatalkan.");
        if (ok) { st.voiding = null; render(); }
        break;
      }

      case "recap-tab": st.recap.tab = b.dataset.v; render(); break;
      case "csv-download": {
        const name = `spo-${st.recap.tab === "events" ? "rekap-receiving" : "saldo-per-size"}-${S.today()}.csv`;
        const url = URL.createObjectURL(new Blob(["﻿" + toCsv()], { type: "text/csv;charset=utf-8" }));
        const link = document.createElement("a"); link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        st.flash = "CSV dibuat. Kalau tidak terunduh (misalnya di pratinjau), pakai Salin CSV."; render();
        break;
      }
      case "csv-copy": {
        const csv = toCsv();
        try { await navigator.clipboard.writeText(csv); st.flash = "CSV disalin. Tempel di Excel."; render(); }
        catch (e) { render(); const ta = document.getElementById("csv-fallback"); ta.hidden = false; ta.value = csv; ta.focus(); ta.select(); st.flash = null; }
        break;
      }

      case "item-edit": { const i = st.idx.items.find((x) => x.sku === b.dataset.sku); st.itemEdit = { ...i, original_sku: i.sku }; render(); window.scrollTo(0, 0); break; }
      case "item-cancel": st.itemEdit = null; render(); break;
      case "save-item": {
        const e = st.itemEdit || { sku: "", description: "", unit: "Each", active: true };
        const ok = await run(() => st.store.saveItem(e).then(() => true), `Item ${String(e.sku).toUpperCase()} disimpan.`);
        if (ok) { st.itemEdit = null; render(); }
        break;
      }
      case "add-size": { const ok = await run(() => st.store.saveSize({ code: st.newSize, sort: st.idx.sizes.length + 1, active: true }).then(() => true), "Ukuran ditambahkan."); if (ok) { st.newSize = ""; render(); } break; }
      case "add-loc": { const ok = await run(() => st.store.saveLocation({ name: st.newLoc, active: true }).then(() => true), "Lokasi ditambahkan."); if (ok) { st.newLoc = ""; render(); } break; }
      case "reset-demo": await run(() => st.store.resetDemo(), "Data demo dikembalikan ke awal."); st.confirm = null; go("orders"); break;
    }
  });

  // ------------------------------------------------------------------
  // START
  // ------------------------------------------------------------------
  async function start() {
    render();
    try {
      if (CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY) {
        st.store = new window.SupabaseStore(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
        st.session = await st.store.session();
        if (st.session) { st.user = st.store.userName(st.session); await reload(); }
        st.store.sb.auth.onAuthStateChange((_e, session) => { if (!session) { st.session = null; st.user = ""; render(); } });
      } else {
        st.store = new window.LocalStore();
        st.user = lsGet(NAME_KEY);
        await reload();
      }
    } catch (e) {
      $app.innerHTML = `<div class="gate"><div class="msg msg-bad">Gagal memuat: ${esc(e.message)}</div></div>`; return;
    }
    render();
  }
  start();
})();
