\set ON_ERROR_STOP 0
set role authenticated;
insert into items (sku, description) values ('O-KNIT-SODA','Outsource Knit Soda');
select spo_save_draft('{"supplier":"Vendor Knit A","due_date":"2026-11-10","lines":[{"sku":"O-KNIT-SODA","unit_price":"150000","discount_pct":"10","sizes":{"SS":"10","MM":"5","XL":"0"}}]}'::jsonb,'Bagus') as id \gset
select spo_submit(:'id','Bagus');
select spo_line_id from spo_lines where order_id=:'id';
select id as line from spo_lines where order_id=:'id' \gset
-- receive 10 SS
select spo_post_events(:'id', jsonb_build_array(jsonb_build_object('line_id',:'line','size_code','SS','event_type','RECEIVE','qty',10)), '2026-11-01','batch 1','Rista');
-- over receive SS should fail
select spo_post_events(:'id', jsonb_build_array(jsonb_build_object('line_id',:'line','size_code','SS','event_type','RECEIVE','qty',1)), null,null,'Rista');
-- QC: 7 pass, 2 reject, 1 damaged
select spo_post_events(:'id', jsonb_build_array(
 jsonb_build_object('line_id',:'line','size_code','SS','event_type','QC_PASS','qty',7),
 jsonb_build_object('line_id',:'line','size_code','SS','event_type','QC_REJECT','qty',2),
 jsonb_build_object('line_id',:'line','size_code','SS','event_type','QC_DAMAGED','qty',1)), null,null,'Lina');
select size_code, qty_ordered, received, qc_pass, awaiting_qc, in_repair, outstanding, can_receive, damaged_open from spo_balances where order_id=:'id' order by size_sort;
-- repair return 2, pass 2
select spo_post_events(:'id', jsonb_build_array(jsonb_build_object('line_id',:'line','size_code','SS','event_type','REPAIR_RETURN','qty',2)), null,null,'Lina');
select spo_post_events(:'id', jsonb_build_array(jsonb_build_object('line_id',:'line','size_code','SS','event_type','QC_PASS','qty',2)), null,null,'Lina');
-- damaged settled by discount 1 with amount
select spo_post_events(:'id', jsonb_build_array(jsonb_build_object('line_id',:'line','size_code','SS','event_type','DAMAGE_DISCOUNT','qty',1,'amount',135000)), null,'potongan','Bagus');
-- MM receive 5 pass 5 -> completed
select spo_post_events(:'id', jsonb_build_array(jsonb_build_object('line_id',:'line','size_code','MM','event_type','RECEIVE','qty',5)), null,null,'Rista');
select spo_post_events(:'id', jsonb_build_array(jsonb_build_object('line_id',:'line','size_code','MM','event_type','QC_PASS','qty',5)), null,null,'Rista');
select status, spo_number from spo_orders where id=:'id';
-- void a MM receive should fail (already QC'd)
select id as ev from spo_events where size_code='MM' and event_type='RECEIVE' \gset
select spo_void_event(:'ev','salah','Bagus');
-- void MM pass then OPEN
select id as ev2 from spo_events where size_code='MM' and event_type='QC_PASS' \gset
select spo_void_event(:'ev2','salah input','Bagus');
select status from spo_orders where id=:'id';
-- reopen should fail
select spo_reopen(:'id','Bagus');
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
