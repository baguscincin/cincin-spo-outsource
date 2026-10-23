# Cin Cin SPO Outsource

Website supplier purchase (SPO) khusus barang outsource non kain yang dipesan per ukuran.
Terpisah total dari SP Creator Excel dan dari website inventory butik.

## Alur

1. **Buat SPO**: satu SKU general per baris, qty dipecah per ukuran (XXS, XS, SS, MM, LL, XL, XXL).
2. **Submit**: order terkunci dan dapat nomor `SPO-0001`, line `SPO-0001001`.
3. **Receiving**: barang datang dari vendor, masuk antrian QC. Bisa bertahap.
4. **QC**: hasilnya Pass (receive final), Reject (masuk repair), atau Damaged (tidak bisa diterima lagi).
5. **Kembali dari repair**: barang reject yang sudah diperbaiki masuk antrian QC lagi.
6. **Damaged**: tetap ditunggu gantinya dari vendor, atau diselesaikan dengan **Diskon damaged** (potongan harga).
7. Order otomatis **Completed** kalau semua qty sudah Pass atau diselesaikan dengan diskon.

Salah input? Batalkan kejadiannya di Riwayat (wajib isi alasan). Data tidak pernah dihapus, hanya ditandai dibatalkan.

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

# UI (mode demo)
cd web && python3 -m http.server 8765 &
python3 tests/ui_test.py
```

## Belum dibuat (tahap berikutnya)

- Pencocokan dengan PO (kurang/lebih per SKU dan size) dan alert order. Formatnya menyusul.
  Datanya sudah siap: setiap kejadian tersimpan per SKU, size, tanggal, dan SPO line.
- Kolom header tambahan (FX, terms, email, alamat, VAT) belum dipakai.
