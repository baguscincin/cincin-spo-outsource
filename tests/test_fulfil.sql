\set ON_ERROR_STOP 0
-- Jalankan setelah schema.sql di database kosong: psql -d spo -f tests/test_fulfil.sql
set role authenticated;
insert into items (sku, description) values ('O00123123','Beading Star'),('O00123124','Crochet Lace');

-- upload pertama: CC-1 masih menunggu, CC-2 sudah sewing (tiket lama, tidak mengurangi stok), CC-3 cancelled
select spo_upload_jira('[
 {"key":"CC-1","po_number":"PO-00804","sku":"S1983","item_name":"Empress Maxi Dress - Larimar Blue","size":"M","qty":2,"status":"1.1. Preparation","created_date":"2026-10-22"},
 {"key":"CC-2","po_number":"PO-00804","sku":"S1983","item_name":"Empress Maxi Dress - Larimar Blue","size":"L","qty":1,"status":"3.0. Sewing In Progress","created_date":"2026-10-22"},
 {"key":"CC-3","po_number":"PO-00805","sku":"S2000","item_name":"Bambi","size":"S","qty":1,"status":"9.9. Cancelled","created_date":"2026-10-21"}
]'::jsonb, 'jira1.csv', 'Bagus');
select key, status, seen_open from jira_tickets order by key;
select sku, name from styles order by sku;

-- upload kedua: CC-1 maju ke sewing -> seen_open tetap true (jadi mengurangi stok), CC-2 tetap false
select spo_upload_jira('[
 {"key":"CC-1","po_number":"PO-00804","sku":"S1983","item_name":"Empress Maxi Dress - Larimar Blue","size":"M","qty":2,"status":"3.0. Sewing In Progress","created_date":"2026-10-22"},
 {"key":"CC-2","po_number":"PO-00804","sku":"S1983","item_name":"Empress Maxi Dress - Larimar Blue","size":"L","qty":1,"status":"8.0. Finished Good In Warehouse","created_date":"2026-10-22"}
]'::jsonb, 'jira2.csv', 'Bagus');
select key, status, seen_open from jira_tickets order by key;
select filename, rows, added, updated, uploaded_by from jira_uploads order by at;

-- import pemetaan: semua atau tidak sama sekali
select spo_import_bom('[{"style_sku":"S1983","component_sku":"O00123123","qty_per":"2","_row":2},{"style_sku":"S9999","component_sku":"O00123123","_row":3},{"style_sku":"S1983","component_sku":"OXXX","_row":4}]'::jsonb);
select count(*) as bom_after_failed_import from style_components;
select spo_import_bom('[{"style_sku":"S1983","component_sku":"O00123123","qty_per":"2","_row":2},{"style_sku":"S2000","component_sku":"O00123124","qty_per":"","_row":3}]'::jsonb);
select spo_import_bom('[{"style_sku":"S1983","component_sku":"O00123123","qty_per":"3","_row":2}]'::jsonb);
select * from style_components order by 1,2;

-- adjustment: qty 0 dan alasan kosong ditolak
insert into stock_adjustments (sku, size_code, qty, reason, created_by) values ('O00123123','M',0,'x','Bagus');
insert into stock_adjustments (sku, size_code, qty, reason, created_by) values ('O00123123','M',5,' ','Bagus');
insert into stock_adjustments (sku, size_code, qty, reason, created_by) values ('O00123123','M',5,'stok opname','Bagus');
select sku, size_code, qty from stock_adjustments;

select jira_is_open('1.3. Outsource', 3), jira_is_open('3.0. Sewing', 3), jira_is_open('9.0. Rejected', 10), jira_is_open('tanpa angka', 3);
reset role;
set role anon; select count(*) from jira_tickets;
