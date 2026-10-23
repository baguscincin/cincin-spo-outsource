// =====================================================================
// Logika bersama: saldo per line per size, aturan validasi, format angka.
// Rumus di sini SAMA dengan view spo_balances di supabase/schema.sql.
// =====================================================================
(function () {
  const EVENT_TYPES = {
    RECEIVE:         { label: "Received",        short: "RCV",  tone: "info" },
    QC_PASS:         { label: "QC Pass",         short: "PASS", tone: "good" },
    QC_REJECT:       { label: "QC Reject",       short: "REJ",  tone: "warn" },
    QC_DAMAGED:      { label: "Damaged",         short: "DMG",  tone: "bad" },
    REPAIR_RETURN:   { label: "Kembali dari repair", short: "RPR", tone: "info" },
    DAMAGE_DISCOUNT: { label: "Diskon damaged",  short: "DISC", tone: "muted" },
  };

  const STATUS = {
    DRAFT:     { label: "Draft",     tone: "muted" },
    OPEN:      { label: "Open",      tone: "info" },
    COMPLETED: { label: "Completed", tone: "good" },
  };

  const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

  // lines: [{id, sizes:{code:qty}}], events: [{line_id,size_code,event_type,qty,amount,voided_at}]
  function computeBalances(lines, events) {
    const out = {};
    for (const l of lines) {
      for (const [size, qty] of Object.entries(l.sizes || {})) {
        if (!(Number(qty) > 0)) continue;
        out[l.id + "|" + size] = {
          line_id: l.id, size_code: size, qty_ordered: Number(qty),
          received: 0, qc_pass: 0, qc_reject: 0, qc_damaged: 0,
          repair_returned: 0, damage_discounted: 0, discount_amount: 0,
        };
      }
    }
    for (const e of events) {
      if (e.voided_at) continue;
      const b = out[e.line_id + "|" + e.size_code];
      if (!b) continue;
      const q = Number(e.qty) || 0;
      switch (e.event_type) {
        case "RECEIVE": b.received += q; break;
        case "QC_PASS": b.qc_pass += q; break;
        case "QC_REJECT": b.qc_reject += q; break;
        case "QC_DAMAGED": b.qc_damaged += q; break;
        case "REPAIR_RETURN": b.repair_returned += q; break;
        case "DAMAGE_DISCOUNT": b.damage_discounted += q; b.discount_amount += Number(e.amount) || 0; break;
      }
    }
    for (const b of Object.values(out)) derive(b);
    return out;
  }

  function derive(b) {
    b.awaiting_qc  = r2(b.received + b.repair_returned - b.qc_pass - b.qc_reject - b.qc_damaged);
    b.in_repair    = r2(b.qc_reject - b.repair_returned);
    b.outstanding  = r2(b.qty_ordered - b.qc_pass - b.damage_discounted);
    b.can_receive  = r2(b.outstanding - b.awaiting_qc - b.in_repair);
    b.damaged_open = r2(b.qc_damaged - b.damage_discounted);
    return b;
  }

  // Kembalikan pesan error pertama kalau ada saldo negatif, atau null kalau aman.
  function checkBalances(balances, lines) {
    const lineNo = {};
    lines.forEach((l, i) => (lineNo[l.id] = { no: l.line_no || i + 1, sku: l.sku }));
    const rules = [
      ["awaiting_qc", "qty melebihi barang yang menunggu QC"],
      ["in_repair", "qty melebihi barang yang sedang di repair"],
      ["damaged_open", "qty melebihi barang damaged yang belum diganti"],
      ["can_receive", "qty melebihi sisa order yang masih bisa diterima"],
    ];
    for (const b of Object.values(balances)) {
      for (const [k, why] of rules) {
        if (b[k] < 0) {
          const l = lineNo[b.line_id] || {};
          return `Line ${l.no} (${l.sku}) size ${b.size_code}: ${why}, kelebihan ${-b[k]}.`;
        }
      }
    }
    return null;
  }

  function isDone(balances) {
    const list = Object.values(balances);
    return list.length > 0 && list.every((b) => b.outstanding === 0 && b.awaiting_qc === 0 && b.in_repair === 0);
  }

  function lineQty(line) {
    return Object.values(line.sizes || {}).reduce((s, q) => s + (Number(q) || 0), 0);
  }
  function netUnitPrice(line) {
    return (Number(line.unit_price) || 0) * (1 - (Number(line.discount_pct) || 0) / 100);
  }
  function lineAmount(line) {
    return r2(lineQty(line) * netUnitPrice(line));
  }

  const nf = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });
  const money = (n) => "Rp " + new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0));
  const qty = (n) => nf.format(Number(n) || 0);

  function fmtDate(d) {
    if (!d) return "";
    const dt = new Date(String(d).length <= 10 ? d + "T00:00:00" : d);
    if (isNaN(dt)) return String(d);
    return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
  }
  function today() {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  window.SPO = { EVENT_TYPES, STATUS, computeBalances, derive, checkBalances, isDone,
                 lineQty, netUnitPrice, lineAmount, money, qty, fmtDate, today, r2 };
})();
