# Cin Cin SPO Outsource

Website supplier purchase (SPO) khusus barang outsource non kain yang dipesan per ukuran.
Terpisah total dari SP Creator Excel dan dari website inventory butik.

## Alur

1. **Buat SPO**: satu SKU general per baris, qty dipecah per ukuran (XXS, XS, SS, MM, LL, XL, XXL).
2. **Submit**: order terkunci dan dapat nomor `SPO-0001`, line `SPO-0001001`.
   Tombol **Cetak SPO** mencetak 2 lembar A4 (Arsip Internal dan Untuk Supplier). Kop surat diatur di `COMPANY` pada `web/config.js`.
3. **Receiving**: barang datang dari vendor, masuk antrian QC. Bisa bertahap.
4. **QC**: hasilnya Pass (receive final), Reject (masuk repair), atau Damaged (tidak bisa diterima lagi).
5. **Kembali dari repair**: barang reject yang sudah diperbaiki masuk antrian QC lagi.
6. **Damaged**: tetap ditunggu gantinya dari vendor, atau diselesaikan dengan **Diskon damaged** (potongan harga).
7. Order otomatis **Completed** kalau semua qty sudah Pass atau diselesaikan dengan diskon.

## Fulfillment PO dari Jira

1. **Component**: import barang outsource (SKU component, Nama, Unit) dari CSV/Excel.
2. **Style**: import SKU produk jadi, atau otomatis terbentuk saat upload Jira. Petakan component per style
   beserta qty per 1 pcs (contoh Beading Star × 2). Ukuran component selalu sama dengan ukuran style.
3. **Fulfillment PO**: upload export tiket Jira (kolom wajib Key, PO Number, SKU, Size, Status; Quantity opsional).
   Tiket di bawah status 3.0 (bisa diubah di Settings) dianggap menunggu component dan dialokasikan FIFO
   dari stok yang sudah lulus QC. Satu tiket hanya terpenuhi kalau semua component-nya cukup.
   Prioritas per PO bisa dinaikkan atau diturunkan. Status 9.x diabaikan.
4. Stok component = lulus QC + adjustment − terpakai (tiket yang maju ke status pemakaian setelah pernah menunggu).

Kode ukuran mengikuti Jira: XXS, XS, S, SM, M, ML, L, XL, XXL, OS.

Salah input? Klik **Ubah** di Riwayat untuk koreksi qty, ukuran, tanggal, catatan, atau hasil QC.
Data lama tetap tersimpan sebagai "Diubah" dan data baru diberi tanda "Koreksi".
Kalau kejadiannya sama sekali tidak terjadi, pakai **Batalkan** (wajib isi alasan). Data tidak pernah dihapus.

### Rumus saldo per line per size

| Saldo | Rumus |
|---|---|
| Menunggu QC | received + kembali dari repair − pass − reject − damaged |
| Di repair | reject − kembali dari repair |
| Outstanding | order − pass − diganti diskon |
| Bisa diterima | outstanding − menunggu QC − di repair |
| Damaged belum diganti | damaged − diganti diskon |

Semua saldo tidak boleh negatif. Aturan ini dijaga di database (fungsi SQL) dan juga dicek di browser.

## Struktur folder

```
supabase/schema.sql   database: tabel, fungsi validasi, keamanan
web/                  website (HTML, CSS, JS biasa, tanpa build)
  config.js           SATU-SATUNYA file yang perlu diubah (URL dan key Supabase)
  app.js              tampilan
  shared.js           rumus saldo
  fulfil.js           baca CSV/Excel dan Jira, hitung stok component dan alokasi FIFO
  store-local.js      mode demo (data di browser)
  store-supabase.js   mode produksi (data di Supabase)
tests/                tes SQL dan tes UI (Playwright)
netlify.toml          setting deploy Netlify
```

## Mode demo

Buka `web/index.html` lewat server lokal (misalnya `python3 -m http.server` di folder `web`).
Kalau `SUPABASE_URL` di `config.js` kosong, website jalan dalam mode demo dan data hanya tersimpan di browser itu.

## Setup produksi (sekali saja)

### 1. Repo GitHub baru
1. Buat repo baru di GitHub, misalnya `cincin-spo-outsource` (private).
2. Upload isi folder ini ke repo tersebut.

### 2. Supabase (database)
1. Buat project baru di supabase.com (project terpisah dari website butik). Region: Singapore.
2. **SQL Editor > New query**, paste isi `supabase/schema.sql`, klik **Run**.
3. **Authentication > Sign In / Providers > Email**: matikan **Allow new users to sign up**.
   Ini penting. Kalau tidak dimatikan, siapa pun bisa mendaftar dan membuka data.
4. **Authentication > Users > Add user**: buat akun untuk tiap orang (email + password, centang Auto Confirm).
5. Supaya nama yang tercatat bukan email, jalankan di SQL Editor untuk tiap orang:
   ```sql
   update auth.users
   set raw_user_meta_data = coalesce(raw_user_meta_data, '{}') || '{"full_name":"Rista"}'
   where email = 'rista@cincin.com';
   ```
6. **Project Settings > API**: salin **Project URL** dan **anon public key**.

### 3. Isi config
Buka `web/config.js`, isi `SUPABASE_URL` dan `SUPABASE_ANON_KEY`, commit ke GitHub.
Anon key memang aman untuk ditaruh di website. Datanya dilindungi login dan aturan keamanan di database.

### 4. Netlify (hosting)
1. Netlify > **Add new site > Import an existing project** > pilih repo GitHub tadi.
2. Build command: kosong. Publish directory: `web` (sudah diatur di `netlify.toml`).
3. Deploy. Setiap commit ke GitHub otomatis ter-deploy ulang.

## Tes

```
# SQL (butuh Postgres lokal, sudah ada role anon dan authenticated)
psql -d spo -f supabase/schema.sql
psql -d spo -f tests/test_flow.sql
psql -d spo -f tests/test_fulfil.sql   # di database baru, setelah schema.sql

# UI (mode demo). Sekali saja: pip install playwright && python -m playwright install chromium
cd web && python3 -m http.server 8765 &
python3 tests/ui_test.py folder-screenshot
python3 tests/ui_fulfil_test.py folder-screenshot export-jira.csv
```

## Belum dibuat (tahap berikutnya)

- Kolom header tambahan (FX, terms, email, alamat, VAT) belum dipakai.
