-- =====================================================================
-- Cin Cin SPO Outsource (Supplier Purchase khusus outsource dengan sizing)
-- Jalankan sekali di Supabase: Dashboard > SQL Editor > New query > paste > Run
-- Aman dijalankan ulang di database kosong. Jangan jalankan ulang di database
-- yang sudah berisi data (tabel akan bentrok).
-- =====================================================================

-- gen_random_uuid() bawaan Postgres 13+, tidak perlu extension

-- ---------------------------------------------------------------------
-- MASTER DATA
-- ---------------------------------------------------------------------
create table settings_sizes (
  code    text primary key,
  sort    int  not null,
  active  boolean not null default true
);

create table settings_locations (
  name    text primary key,
  active  boolean not null default true
);

create table items (
  sku          text primary key,
  description  text not null,
  unit         text not null default 'Each',
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  created_by   text
);

insert into settings_sizes (code, sort) values
  ('XXS',1),('XS',2),('S',3),('SM',4),('M',5),('ML',6),('L',7),('XL',8),('XXL',9),('OS',10);  -- sama dengan kode ukuran Jira

insert into settings_locations (name) values ('Inspection'),('Cin Cin Studio');

-- ---------------------------------------------------------------------
-- ORDER (SPO)
-- ---------------------------------------------------------------------
create sequence spo_number_seq start 1;

create table spo_orders (
  id                  uuid primary key default gen_random_uuid(),
  spo_number          text unique,                         -- diisi saat Submit: SPO-0001
  status              text not null default 'DRAFT'
                      check (status in ('DRAFT','OPEN','COMPLETED')),
  spo_date            date not null default current_date,
  due_date            date,
  supplier            text not null default '',
  receiving_location  text,
  supplier_ref        text,                                -- no. invoice / quotation supplier
  note                text,
  created_by          text,
  created_at          timestamptz not null default now(),
  updated_by          text,
  updated_at          timestamptz not null default now(),
  submitted_by        text,
  submitted_at        timestamptz
);

create table spo_lines (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references spo_orders(id) on delete cascade,
  line_no       int  not null,
  spo_line_id   text,                                      -- SPO-0001001, diisi saat Submit
  sku           text not null references items(sku),
  description   text,
  supplier_sku  text,
  unit          text not null default 'Each',
  unit_price    numeric(16,2) not null default 0 check (unit_price >= 0),
  discount_pct  numeric(5,2)  not null default 0 check (discount_pct between 0 and 100),
  unique (order_id, line_no)
);

create table spo_line_sizes (
  line_id      uuid not null references spo_lines(id) on delete cascade,
  size_code    text not null references settings_sizes(code),
  qty_ordered  numeric(12,2) not null check (qty_ordered > 0),
  primary key (line_id, size_code)
);

-- Ledger: setiap kejadian receiving/QC/repair/diskon = 1 baris. Tidak pernah dihapus,
-- hanya dibatalkan (voided) supaya jejak audit tetap lengkap.
create table spo_events (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references spo_orders(id) on delete cascade,
  line_id       uuid not null references spo_lines(id) on delete cascade,
  size_code     text not null references settings_sizes(code),
  event_type    text not null check (event_type in
                ('RECEIVE','QC_PASS','QC_REJECT','QC_DAMAGED','REPAIR_RETURN','DAMAGE_DISCOUNT')),
  qty           numeric(12,2) not null check (qty > 0),
  amount        numeric(16,2) not null default 0,          -- nilai potongan untuk DAMAGE_DISCOUNT
  event_date    date not null default current_date,
  batch_id      uuid,                                      -- event yang disimpan bersamaan
  note          text,
  recorded_by   text not null,
  created_at    timestamptz not null default now(),
  voided_at     timestamptz,
  voided_by     text,
  void_reason   text,
  replaces_id   uuid references spo_events(id)               -- diisi kalau event ini hasil "Ubah" dari event lain
);
create index spo_events_order_idx on spo_events(order_id);
create index spo_events_line_size_idx on spo_events(line_id, size_code);
create index spo_events_date_idx on spo_events(event_date);

-- ---------------------------------------------------------------------
-- SALDO PER LINE PER SIZE
--   awaiting_qc  = received + repair_returned - pass - reject - damaged
--   in_repair    = reject - repair_returned
--   outstanding  = ordered - pass - damage_discounted   (masih ditunggu dari vendor)
--   can_receive  = outstanding - awaiting_qc - in_repair (boleh diterima lagi)
--   damaged_open = damaged - damage_discounted          (damaged yang menunggu ganti)
-- ---------------------------------------------------------------------
create view spo_balances with (security_invoker = true) as
with agg as (
  select
    l.order_id, l.id as line_id, l.line_no, l.sku, ls.size_code, sz.sort as size_sort,
    ls.qty_ordered,
    coalesce(sum(e.qty) filter (where e.event_type = 'RECEIVE'), 0)         as received,
    coalesce(sum(e.qty) filter (where e.event_type = 'QC_PASS'), 0)         as qc_pass,
    coalesce(sum(e.qty) filter (where e.event_type = 'QC_REJECT'), 0)       as qc_reject,
    coalesce(sum(e.qty) filter (where e.event_type = 'QC_DAMAGED'), 0)      as qc_damaged,
    coalesce(sum(e.qty) filter (where e.event_type = 'REPAIR_RETURN'), 0)   as repair_returned,
    coalesce(sum(e.qty) filter (where e.event_type = 'DAMAGE_DISCOUNT'), 0) as damage_discounted,
    coalesce(sum(e.amount) filter (where e.event_type = 'DAMAGE_DISCOUNT'), 0) as discount_amount
  from spo_line_sizes ls
  join spo_lines l       on l.id = ls.line_id
  join settings_sizes sz on sz.code = ls.size_code
  left join spo_events e on e.line_id = ls.line_id and e.size_code = ls.size_code
                        and e.voided_at is null
  group by l.order_id, l.id, l.line_no, l.sku, ls.size_code, sz.sort, ls.qty_ordered
)
select agg.*,
  received + repair_returned - qc_pass - qc_reject - qc_damaged            as awaiting_qc,
  qc_reject - repair_returned                                              as in_repair,
  qty_ordered - qc_pass - damage_discounted                                as outstanding,
  (qty_ordered - qc_pass - damage_discounted)
    - (received + repair_returned - qc_pass - qc_reject - qc_damaged)
    - (qc_reject - repair_returned)                                        as can_receive,
  qc_damaged - damage_discounted                                           as damaged_open
from agg;

-- ---------------------------------------------------------------------
-- FUNGSI BANTU
-- ---------------------------------------------------------------------

-- Cek semua saldo order tidak negatif. Kalau ada yang negatif, transaksi dibatalkan.
create or replace function spo_check_balances(p_order_id uuid)
returns void language plpgsql as $$
declare r record;
begin
  select b.*, l.sku as line_sku into r
  from spo_balances b join spo_lines l on l.id = b.line_id
  where b.order_id = p_order_id
    and (b.awaiting_qc < 0 or b.in_repair < 0 or b.can_receive < 0 or b.damaged_open < 0)
  order by b.line_no, b.size_sort
  limit 1;
  if found then
    raise exception 'Line % (%) size %: %', r.line_no, r.line_sku, r.size_code,
      case
        when r.awaiting_qc  < 0 then 'qty melebihi barang yang menunggu QC, kelebihan ' || (-r.awaiting_qc)
        when r.in_repair    < 0 then 'qty melebihi barang yang sedang di repair, kelebihan ' || (-r.in_repair)
        when r.damaged_open < 0 then 'qty melebihi barang damaged yang belum diganti, kelebihan ' || (-r.damaged_open)
        else 'qty melebihi sisa order yang masih bisa diterima, kelebihan ' || (-r.can_receive)
      end
      using errcode = 'P0001';
  end if;
end $$;

-- Status otomatis: COMPLETED kalau semua size sudah selesai (outstanding 0, tidak ada
-- yang menunggu QC atau di repair). Kalau ada event dibatalkan, bisa kembali ke OPEN.
create or replace function spo_refresh_status(p_order_id uuid)
returns text language plpgsql as $$
declare v_done boolean; v_status text;
begin
  select bool_and(outstanding = 0 and awaiting_qc = 0 and in_repair = 0)
    into v_done from spo_balances where order_id = p_order_id;
  v_status := case when coalesce(v_done,false) then 'COMPLETED' else 'OPEN' end;
  update spo_orders set status = v_status, updated_at = now()
   where id = p_order_id and status in ('OPEN','COMPLETED') and status <> v_status;
  return v_status;
end $$;

-- ---------------------------------------------------------------------
-- RPC YANG DIPANGGIL WEBSITE
-- ---------------------------------------------------------------------

-- Simpan draft (buat baru atau update). p_order:
-- {id?, spo_date, due_date, supplier, receiving_location, supplier_ref, note,
--  lines:[{sku, description, supplier_sku, unit, unit_price, discount_pct, sizes:{"XXS":2,...}}]}
create or replace function spo_save_draft(p_order jsonb, p_by text)
returns uuid language plpgsql as $$
declare
  v_id uuid := nullif(p_order->>'id','')::uuid;
  v_status text;
  v_line jsonb; v_line_id uuid; v_no int := 0; v_size record;
begin
  if coalesce(trim(p_by),'') = '' then raise exception 'Nama pencatat wajib diisi'; end if;

  if v_id is null then
    insert into spo_orders (created_by, updated_by) values (p_by, p_by) returning id into v_id;
  else
    select status into v_status from spo_orders where id = v_id for update;
    if not found then raise exception 'Order tidak ditemukan'; end if;
    if v_status <> 'DRAFT' then raise exception 'Order sudah di-submit, tidak bisa diedit'; end if;
  end if;

  update spo_orders set
    spo_date           = coalesce(nullif(p_order->>'spo_date','')::date, current_date),
    due_date           = nullif(p_order->>'due_date','')::date,
    supplier           = coalesce(trim(p_order->>'supplier'),''),
    receiving_location = nullif(p_order->>'receiving_location',''),
    supplier_ref       = nullif(p_order->>'supplier_ref',''),
    note               = nullif(p_order->>'note',''),
    updated_by = p_by, updated_at = now()
  where id = v_id;

  delete from spo_lines where order_id = v_id;

  for v_line in select * from jsonb_array_elements(coalesce(p_order->'lines','[]'::jsonb)) loop
    v_no := v_no + 1;
    insert into spo_lines (order_id, line_no, sku, description, supplier_sku, unit, unit_price, discount_pct)
    values (v_id, v_no, v_line->>'sku', nullif(v_line->>'description',''), nullif(v_line->>'supplier_sku',''),
            coalesce(nullif(v_line->>'unit',''),'Each'),
            coalesce(nullif(v_line->>'unit_price','')::numeric,0),
            coalesce(nullif(v_line->>'discount_pct','')::numeric,0))
    returning id into v_line_id;

    for v_size in select key, value from jsonb_each_text(coalesce(v_line->'sizes','{}'::jsonb)) loop
      if coalesce(nullif(v_size.value,'')::numeric,0) > 0 then
        insert into spo_line_sizes (line_id, size_code, qty_ordered)
        values (v_line_id, v_size.key, v_size.value::numeric);
      end if;
    end loop;
  end loop;

  return v_id;
end $$;

-- Submit: kunci order, beri nomor SPO-0001 dan SPO line id SPO-0001001.
create or replace function spo_submit(p_order_id uuid, p_by text)
returns text language plpgsql as $$
declare v_o spo_orders; v_bad int; v_num text;
begin
  select * into v_o from spo_orders where id = p_order_id for update;
  if not found then raise exception 'Order tidak ditemukan'; end if;
  if v_o.status <> 'DRAFT' then raise exception 'Order sudah di-submit'; end if;
  if trim(v_o.supplier) = '' then raise exception 'Supplier wajib diisi'; end if;
  if not exists (select 1 from spo_lines where order_id = p_order_id) then
    raise exception 'Order belum punya item';
  end if;
  select count(*) into v_bad from spo_lines l
   where l.order_id = p_order_id
     and not exists (select 1 from spo_line_sizes s where s.line_id = l.id);
  if v_bad > 0 then raise exception 'Ada % item tanpa qty ukuran', v_bad; end if;

  v_num := coalesce(v_o.spo_number, 'SPO-' || lpad(nextval('spo_number_seq')::text, 4, '0'));
  update spo_orders set spo_number = v_num, status = 'OPEN',
         submitted_by = p_by, submitted_at = now(), updated_by = p_by, updated_at = now()
   where id = p_order_id;
  update spo_lines set spo_line_id = v_num || lpad(line_no::text, 3, '0')
   where order_id = p_order_id;
  return v_num;
end $$;

-- Kembalikan order ke DRAFT untuk diedit. Hanya boleh kalau belum ada event aktif.
create or replace function spo_reopen(p_order_id uuid, p_by text)
returns void language plpgsql as $$
declare v_status text;
begin
  select status into v_status from spo_orders where id = p_order_id for update;
  if v_status is null then raise exception 'Order tidak ditemukan'; end if;
  if v_status = 'DRAFT' then return; end if;
  if exists (select 1 from spo_events where order_id = p_order_id and voided_at is null) then
    raise exception 'Order sudah punya receiving/QC. Batalkan dulu semua event sebelum mengedit order.';
  end if;
  update spo_orders set status = 'DRAFT', updated_by = p_by, updated_at = now() where id = p_order_id;
end $$;

-- Hapus draft. Draft yang pernah punya nomor SPO tidak boleh dihapus (supaya nomor tidak hilang).
create or replace function spo_delete_draft(p_order_id uuid)
returns void language plpgsql as $$
declare v_o spo_orders;
begin
  select * into v_o from spo_orders where id = p_order_id for update;
  if not found then return; end if;
  if v_o.status <> 'DRAFT' then raise exception 'Hanya draft yang bisa dihapus'; end if;
  if v_o.spo_number is not null then
    raise exception 'Draft ini sudah punya nomor %, tidak bisa dihapus', v_o.spo_number;
  end if;
  delete from spo_orders where id = p_order_id;
end $$;

-- Catat beberapa event sekaligus (receiving / QC / repair return / diskon damaged).
-- p_events: [{line_id, size_code, event_type, qty, amount?}]
create or replace function spo_post_events(
  p_order_id uuid, p_events jsonb, p_event_date date, p_note text, p_by text)
returns text language plpgsql as $$
declare v_status text; v_batch uuid := gen_random_uuid(); v_e jsonb; v_cnt int := 0;
begin
  if coalesce(trim(p_by),'') = '' then raise exception 'Nama pencatat wajib diisi'; end if;
  select status into v_status from spo_orders where id = p_order_id for update;
  if v_status is null then raise exception 'Order tidak ditemukan'; end if;
  if v_status <> 'OPEN' then raise exception 'Order berstatus %, tidak bisa dicatat', v_status; end if;

  for v_e in select * from jsonb_array_elements(coalesce(p_events,'[]'::jsonb)) loop
    if coalesce((v_e->>'qty')::numeric,0) = 0 then continue; end if;
    if not exists (select 1 from spo_line_sizes s join spo_lines l on l.id = s.line_id
                    where l.order_id = p_order_id and s.line_id = (v_e->>'line_id')::uuid
                      and s.size_code = v_e->>'size_code') then
      raise exception 'Size % tidak ada di order ini', v_e->>'size_code';
    end if;
    insert into spo_events (order_id, line_id, size_code, event_type, qty, amount,
                            event_date, batch_id, note, recorded_by)
    values (p_order_id, (v_e->>'line_id')::uuid, v_e->>'size_code', v_e->>'event_type',
            (v_e->>'qty')::numeric, coalesce(nullif(v_e->>'amount','')::numeric,0),
            coalesce(p_event_date, current_date), v_batch, nullif(p_note,''), p_by);
    v_cnt := v_cnt + 1;
  end loop;

  if v_cnt = 0 then raise exception 'Tidak ada qty yang diisi'; end if;
  perform spo_check_balances(p_order_id);
  return spo_refresh_status(p_order_id);
end $$;

-- Batalkan event (salah input). Ditolak kalau membuat saldo negatif,
-- misalnya membatalkan receiving yang sudah di-QC.
create or replace function spo_void_event(p_event_id uuid, p_reason text, p_by text)
returns text language plpgsql as $$
declare v_order uuid;
begin
  if coalesce(trim(p_reason),'') = '' then raise exception 'Alasan pembatalan wajib diisi'; end if;
  select order_id into v_order from spo_events where id = p_event_id and voided_at is null;
  if v_order is null then raise exception 'Event tidak ditemukan atau sudah dibatalkan'; end if;
  perform 1 from spo_orders where id = v_order for update;
  update spo_events set voided_at = now(), voided_by = p_by, void_reason = p_reason where id = p_event_id;
  begin
    perform spo_check_balances(v_order);
  exception when sqlstate 'P0001' then
    raise exception 'Tidak bisa dibatalkan karena qty ini sudah dipakai kejadian berikutnya (%). Batalkan kejadian yang lebih baru dulu.', sqlerrm;
  end;
  return spo_refresh_status(v_order);
end $$;

-- Ubah event (koreksi salah input) dalam satu langkah: event lama ditandai batal
-- dengan alasan "Diubah", lalu event baru dibuat dengan replaces_id = event lama.
-- p_changes: {size_code?, event_type?, qty?, amount?, event_date?, note?}
-- Jenis event hanya boleh berganti sesama hasil QC (Pass / Reject / Damaged).
create or replace function spo_edit_event(p_event_id uuid, p_changes jsonb, p_reason text, p_by text)
returns text language plpgsql as $$
declare v_e spo_events; v_type text; v_size text; v_qty numeric; v_new uuid;
begin
  if coalesce(trim(p_by),'') = '' then raise exception 'Nama pencatat wajib diisi'; end if;
  select * into v_e from spo_events where id = p_event_id and voided_at is null;
  if not found then raise exception 'Kejadian tidak ditemukan atau sudah dibatalkan'; end if;
  perform 1 from spo_orders where id = v_e.order_id for update;

  v_type := coalesce(nullif(p_changes->>'event_type',''), v_e.event_type);
  v_size := coalesce(nullif(p_changes->>'size_code',''), v_e.size_code);
  v_qty  := coalesce(nullif(p_changes->>'qty','')::numeric, v_e.qty);
  if v_qty <= 0 then raise exception 'Qty harus lebih dari 0. Kalau mau menghapus, pakai Batalkan.'; end if;
  if v_type <> v_e.event_type and not (v_type like 'QC\_%' and v_e.event_type like 'QC\_%') then
    raise exception 'Jenis kejadian hanya bisa diganti sesama hasil QC (Pass, Reject, Damaged)';
  end if;
  if not exists (select 1 from spo_line_sizes where line_id = v_e.line_id and size_code = v_size) then
    raise exception 'Ukuran % tidak ada di item ini', v_size;
  end if;

  update spo_events set voided_at = now(), voided_by = p_by,
         void_reason = 'Diubah' || coalesce(': ' || nullif(trim(p_reason),''), '')
   where id = p_event_id;
  insert into spo_events (order_id, line_id, size_code, event_type, qty, amount, event_date,
                          batch_id, note, recorded_by, replaces_id)
  values (v_e.order_id, v_e.line_id, v_size, v_type, v_qty,
          case when v_type = 'DAMAGE_DISCOUNT' then coalesce(nullif(p_changes->>'amount','')::numeric, v_e.amount) else 0 end,
          coalesce(nullif(p_changes->>'event_date','')::date, v_e.event_date), v_e.batch_id,
          case when p_changes ? 'note' then nullif(p_changes->>'note','') else v_e.note end,
          p_by, p_event_id)
  returning id into v_new;

  begin
    perform spo_check_balances(v_e.order_id);
  exception when sqlstate 'P0001' then
    raise exception 'Tidak bisa diubah: %. Kemungkinan qty ini sudah dipakai kejadian berikutnya (misalnya sudah di-QC). Ubah kejadian yang lebih baru dulu.', sqlerrm;
  end;
  return spo_refresh_status(v_e.order_id);
end $$;

-- ---------------------------------------------------------------------
-- FULFILLMENT PO: style, pemetaan component, tiket Jira, prioritas, adjustment
-- Component = tabel items (barang outsource yang dipesan lewat SPO).
-- Alokasi FIFO dihitung di browser (web/fulfil.js) dari data di bawah ini.
-- ---------------------------------------------------------------------
create table styles (
  sku     text primary key,
  name    text not null,
  range   text,
  active  boolean not null default true
);

-- 1 pcs style memakai qty_per pcs component dengan ukuran yang sama
create table style_components (
  style_sku      text not null references styles(sku) on delete cascade,
  component_sku  text not null references items(sku),
  qty_per        numeric(12,2) not null default 1 check (qty_per > 0),
  primary key (style_sku, component_sku)
);

create table app_settings (
  key    text primary key,
  value  jsonb not null
);
insert into app_settings values ('consume_from', '3');   -- status Jira mulai memakai component

create table jira_tickets (
  key            text primary key,          -- CC-86618
  ticket_number  text,
  po_number      text not null,
  customer_name  text,
  customer_type  text,
  created_date   date,
  deadline       date,
  sku            text not null,
  item_name      text,
  range          text,
  qty            numeric(12,2) not null check (qty > 0),
  size           text not null,
  status         text not null,
  seen_open      boolean not null default false,  -- pernah terlihat masih menunggu component
  first_seen_at  timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index jira_tickets_po_idx on jira_tickets(po_number);

create table jira_uploads (
  id        uuid primary key default gen_random_uuid(),
  filename  text,
  rows      int not null,
  added     int not null,
  updated   int not null,
  uploaded_by text,
  at        timestamptz not null default now()
);

-- prioritas manual per PO (angka kecil = didahulukan). Kosong = FIFO murni.
create table po_priority (
  po_number  text primary key,
  priority   int not null
);

create table stock_adjustments (
  id          uuid primary key default gen_random_uuid(),
  sku         text not null references items(sku),
  size_code   text not null references settings_sizes(code),
  qty         numeric(12,2) not null check (qty <> 0),   -- minus = mengurangi stok
  reason      text not null check (trim(reason) <> ''),
  created_by  text not null,
  created_at  timestamptz not null default now(),
  voided_at   timestamptz,
  voided_by   text
);

-- Status "3.0. Sewing In Progress" -> 3.0. Masih menunggu component kalau < consume_from dan bukan 9.x.
create or replace function jira_is_open(p_status text, p_consume_from numeric)
returns boolean language sql immutable as $$
  select coalesce((substring(p_status from '^\s*(\d+(?:\.\d+)?)'))::numeric < least(p_consume_from, 9), false)
$$;

-- Upload export Jira. p_rows: [{key, ticket_number, po_number, customer_name, customer_type, created_date,
-- deadline, sku, item_name, range, qty, size, status}]. Upsert per key; style baru dibuat otomatis.
create or replace function spo_upload_jira(p_rows jsonb, p_filename text, p_by text)
returns jsonb language plpgsql as $$
declare v_from numeric; v_added int; v_total int; v_styles int;
begin
  if coalesce(trim(p_by),'') = '' then raise exception 'Nama pencatat wajib diisi'; end if;
  select (value #>> '{}')::numeric into v_from from app_settings where key = 'consume_from';
  v_from := coalesce(v_from, 3);

  create temp table _in on commit drop as
  select * from jsonb_to_recordset(p_rows) as r(key text, ticket_number text, po_number text, customer_name text,
    customer_type text, created_date date, deadline date, sku text, item_name text, range text, qty numeric, size text, status text);
  select count(*) into v_total from _in;
  select count(*) into v_added from _in where key not in (select key from jira_tickets);

  insert into styles (sku, name, range)
  select distinct on (sku) sku, coalesce(nullif(item_name,''), sku), nullif(range,'') from _in
  where sku not in (select sku from styles) order by sku;
  get diagnostics v_styles = row_count;

  insert into jira_tickets as t (key, ticket_number, po_number, customer_name, customer_type, created_date, deadline,
                                 sku, item_name, range, qty, size, status, seen_open)
  select key, ticket_number, po_number, customer_name, customer_type, created_date, deadline,
         sku, item_name, range, qty, size, status, jira_is_open(status, v_from) from _in
  on conflict (key) do update set
    ticket_number = excluded.ticket_number, po_number = excluded.po_number, customer_name = excluded.customer_name,
    customer_type = excluded.customer_type, created_date = excluded.created_date, deadline = excluded.deadline,
    sku = excluded.sku, item_name = excluded.item_name, range = excluded.range, qty = excluded.qty,
    size = excluded.size, status = excluded.status, seen_open = t.seen_open or excluded.seen_open, updated_at = now();

  insert into jira_uploads (filename, rows, added, updated, uploaded_by) values (p_filename, v_total, v_added, v_total - v_added, p_by);
  return jsonb_build_object('added', v_added, 'updated', v_total - v_added, 'newStyles', v_styles);
end $$;

-- Import pemetaan, semua atau tidak sama sekali. p_rows: [{style_sku, component_sku, qty_per, _row}]
create or replace function spo_import_bom(p_rows jsonb)
returns jsonb language plpgsql as $$
declare r jsonb; v_st text; v_co text; v_q numeric; v_err text[] := '{}'; v_added int := 0; v_upd int := 0;
begin
  for r in select * from jsonb_array_elements(p_rows) loop
    v_st := upper(trim(r->>'style_sku')); v_co := upper(trim(r->>'component_sku'));
    v_q := coalesce(nullif(trim(r->>'qty_per'),'')::numeric, 1);
    if not exists (select 1 from styles where sku = v_st) then
      v_err := v_err || format('baris %s: style %s belum ada', r->>'_row', coalesce(nullif(v_st,''),'(kosong)'));
    elsif not exists (select 1 from items where sku = v_co) then
      v_err := v_err || format('baris %s: component %s belum ada', r->>'_row', coalesce(nullif(v_co,''),'(kosong)'));
    elsif v_q <= 0 then
      v_err := v_err || format('baris %s: Qty per pcs harus lebih dari 0', r->>'_row');
    else
      if exists (select 1 from style_components where style_sku = v_st and component_sku = v_co) then v_upd := v_upd + 1;
      else v_added := v_added + 1; end if;
      insert into style_components values (v_st, v_co, v_q)
      on conflict (style_sku, component_sku) do update set qty_per = excluded.qty_per;
    end if;
  end loop;
  if array_length(v_err, 1) > 0 then
    raise exception 'Import dibatalkan. %', array_to_string(v_err[1:5], '; ') ||
      case when array_length(v_err, 1) > 5 then format('; dan %s lainnya', array_length(v_err, 1) - 5) else '' end;
  end if;
  return jsonb_build_object('added', v_added, 'updated', v_upd);
end $$;

-- ---------------------------------------------------------------------
-- KEAMANAN (Supabase): hanya user yang login yang bisa membaca/menulis.
-- Semua user login punya akses penuh (sesuai keputusan: semua orang bisa semua).
-- ---------------------------------------------------------------------
alter table settings_sizes     enable row level security;
alter table settings_locations enable row level security;
alter table items              enable row level security;
alter table spo_orders         enable row level security;
alter table spo_lines          enable row level security;
alter table spo_line_sizes     enable row level security;
alter table spo_events         enable row level security;
alter table styles             enable row level security;
alter table style_components   enable row level security;
alter table app_settings       enable row level security;
alter table jira_tickets       enable row level security;
alter table jira_uploads       enable row level security;
alter table po_priority        enable row level security;
alter table stock_adjustments  enable row level security;

create policy auth_all on settings_sizes     for all to authenticated using (true) with check (true);
create policy auth_all on settings_locations for all to authenticated using (true) with check (true);
create policy auth_all on items              for all to authenticated using (true) with check (true);
create policy auth_all on spo_orders         for all to authenticated using (true) with check (true);
create policy auth_all on spo_lines          for all to authenticated using (true) with check (true);
create policy auth_all on spo_line_sizes     for all to authenticated using (true) with check (true);
create policy auth_all on styles             for all to authenticated using (true) with check (true);
create policy auth_all on style_components   for all to authenticated using (true) with check (true);
create policy auth_all on app_settings       for all to authenticated using (true) with check (true);
create policy auth_all on jira_tickets       for all to authenticated using (true) with check (true);
create policy auth_all on jira_uploads       for all to authenticated using (true) with check (true);
create policy auth_all on po_priority        for all to authenticated using (true) with check (true);
create policy auth_all on stock_adjustments  for all to authenticated using (true) with check (true);
-- Event tidak boleh diubah/dihapus langsung, hanya lewat fungsi (insert + void).
create policy auth_read on spo_events for select to authenticated using (true);
create policy auth_ins  on spo_events for insert to authenticated with check (true);
create policy auth_void on spo_events for update to authenticated using (true) with check (true);

revoke all on all tables    in schema public from anon;
revoke all on all functions in schema public from anon, public;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on sequence spo_number_seq to authenticated;
grant select on spo_balances to authenticated;
grant execute on all functions in schema public to authenticated;
