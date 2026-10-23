\set ON_ERROR_STOP 0
set role authenticated;
insert into items (sku, description) values ('O-KNIT-SODA','Outsource Knit Soda');
select spo_save_draft('{"supplier":"Vendor Knit A","due_date":"2026-11-10","lines":[{"sku":"O-KNIT-SODA","unit_price":"150000","discount_pct":"10","sizes":{"S":"10","M":"5","XL":"0"}}]}'::jsonb,'Bagus') as id \gset
select spo_submit(:'id','Bagus');
select spo_line_id from spo_lines where order_id=:'id';
select id as line from spo_lines where order_id=:'id' \gset
-- receive 10 SS
select spo_post_events(:'id', jsonb_build_array(jsonb_build_object('line_id',:'line','size_code','S','event_type','RECEIVE','qty',10)), '2026-11-01','batch 1','Rista');
-- over receive SS should fail
select spo_post_events(:'id', jsonb_build_array(jsonb_build_object('line_id',:'line','size_code','S','event_type','RECEIVE','qty',1)), null,null,'Rista');
-- QC: 7 pass, 2 reject, 1 damaged
select spo_post_events(:'id', jsonb_build_array(
 jsonb_build_object('line_id',:'line','size_code','S','event_type','QC_PASS','qty',7),
 jsonb_build_object('line_id',:'line','size_code','S','event_type','QC_REJECT','qty',2),
 jsonb_build_object('line_id',:'line','size_code','S','event_type','QC_DAMAGED','qty',1)), null,null,'Lina');
select size_code, qty_ordered, received, qc_pass, awaiting_qc, in_repair, outstanding, can_receive, damaged_open from spo_balances where order_id=:'id' order by size_sort;
-- repair return 2, pass 2
select spo_post_events(:'id', jsonb_build_array(jsonb_build_object('line_id',:'line','size_code','S','event_type','REPAIR_RETURN','qty',2)), null,null,'Lina');
select spo_post_events(:'id', jsonb_build_array(jsonb_build_object('line_id',:'line','size_code','S','event_type','QC_PASS','qty',2)), null,null,'Lina');
-- damaged settled by discount 1 with amount
select spo_post_events(:'id', jsonb_build_array(jsonb_build_object('line_id',:'line','size_code','S','event_type','DAMAGE_DISCOUNT','qty',1,'amount',135000)), null,'potongan','Bagus');
-- MM receive 5 pass 5 -> completed
select spo_post_events(:'id', jsonb_build_array(jsonb_build_object('line_id',:'line','size_code','M','event_type','RECEIVE','qty',5)), null,null,'Rista');
select spo_post_events(:'id', jsonb_build_array(jsonb_build_object('line_id',:'line','size_code','M','event_type','QC_PASS','qty',5)), null,null,'Rista');
select status, spo_number from spo_orders where id=:'id';
-- void a MM receive should fail (already QC'd)
select id as ev from spo_events where size_code='M' and event_type='RECEIVE' \gset
select spo_void_event(:'ev','salah','Bagus');
-- void MM pass then OPEN
select id as ev2 from spo_events where size_code='M' and event_type='QC_PASS' \gset
select spo_void_event(:'ev2','salah input','Bagus');
select status from spo_orders where id=:'id';
-- reopen should fail
select spo_reopen(:'id','Bagus');
-- edit: SS receive 10 -> 8 harus ditolak (sudah di-QC)
select id as ev3 from spo_events where size_code='S' and event_type='RECEIVE' and voided_at is null \gset
select spo_edit_event(:'ev3','{"qty":8}'::jsonb,null,'Bagus');
-- edit: SS QC_DAMAGED 1 -> QC_REJECT harus ditolak (damaged sudah diganti diskon)
select id as ev4 from spo_events where size_code='S' and event_type='QC_DAMAGED' and voided_at is null \gset
select spo_edit_event(:'ev4','{"event_type":"QC_REJECT"}'::jsonb,'salah pilih','Lina');
-- edit: RECEIVE jadi QC_PASS harus ditolak (beda jenis)
select spo_edit_event(:'ev3','{"event_type":"QC_PASS"}'::jsonb,null,'Bagus');
-- edit: MM receive 5 -> 4 berhasil (MM pass sudah dibatalkan di atas, jadi menunggu QC 5)
select id as ev5 from spo_events where size_code='M' and event_type='RECEIVE' and voided_at is null \gset
select spo_edit_event(:'ev5','{"qty":4,"note":"koreksi"}'::jsonb,'salah hitung','Rista');
select event_type, size_code, qty, note, voided_at is not null as voided, void_reason, replaces_id is not null as is_fix
  from spo_events where size_code='M' and event_type='RECEIVE' order by created_at;
select size_code, received, awaiting_qc, can_receive from spo_balances where order_id=:'id' order by size_sort;
-- direct delete of event blocked by RLS (0 rows)
delete from spo_events;
select count(*) from spo_events;
-- second order number
select spo_save_draft('{"supplier":"X","lines":[{"sku":"O-KNIT-SODA","sizes":{"XXS":"1"}}]}'::jsonb,'Bagus') as id2 \gset
select spo_submit(:'id2','Bagus');
select spo_save_draft('{"supplier":"","lines":[]}'::jsonb,'Bagus') as id3 \gset
select spo_submit(:'id3','Bagus');
select spo_delete_draft(:'id3');
reset role;
set role anon; select count(*) from spo_orders;
