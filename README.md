# Material Warehouse

**Call Order Field Rantau → MIM**

Website untuk **Warehouse & Distribution – Field Rantau (Zona 1)** untuk:

1. **Mencari material**: pakai KIMAP atau deskripsi. Penulisan yang berbeda tetap ketemu. Contoh: `flange 3" 150`, `flg 3in 150lb`, `FLANGE CL.150 3 IN`.
2. **Cek stok SAP Zona 1 sekaligus**: Rantau (W101), Lirik (W803/W104), Jambi (W802), Pangkalan Susu (W102), dan plant lain.
3. **Melihat harga & kontrak (OA/RO)** dari ME3N. Klik nomor OA untuk melihat **semua material** di kontrak itu yang bisa ikut ditarik.
4. **Melihat pemakaian Rantau** dari MB51: total tahun lalu, YTD, rata-rata per bulan, dan grafik 24 bulan.
5. **Memilih RO atau BAU** per material dengan centang, lalu **export ke Excel** sesuai template *Call Order – Field Rantau – To MIM*.

> 🔒 **Data SAP sudah ada di website, tapi terkunci password.** File `data/sap-data.js` berisi data stok, kontrak & pemakaian yang dikompres lalu **dienkripsi AES-256-GCM** (kunci dari password, PBKDF2 250.000 iterasi). Repo & website boleh publik: tanpa password, isi file tidak bisa dibaca. File Excel mentah (`*.xlsx`) tidak pernah di-commit (diblokir `.gitignore`).

## Membuka website

1. Buka website → muncul layar **Data SAP Material Warehouse**.
2. Masukkan **password data** → klik **Buka Data**. Centang "Ingat password" agar tidak ditanya lagi di browser itu.
3. Data langsung siap dipakai. Tombol **Lewati** tersedia bila ingin memakai file Excel sendiri.

## Update data SAP (tanpa coding)

1. Menu **Data & Upload** → tarik file Excel SAP terbaru (ZMB52/MB52, ME3N, MB51). Data di browser Anda langsung ter-update.
2. Di kartu **Data bawaan website**, isi password → klik **Buat file data bawaan** → file `sap-data.js` ter-download.
3. Buka GitHub repo → folder **`data`** → **Add file › Upload files** → tarik `sap-data.js` → **Commit changes**.
4. ±1–2 menit kemudian website ter-update untuk semua pengguna (mereka hanya perlu refresh; jika password diganti, mereka akan diminta password baru).

Alternatif via terminal: `SAP_PASSWORD="..." node tools/build-data.js file1.xlsx file2.xlsx ...`

---

## Preview di komputer sendiri (tanpa hosting)

1. Di GitHub: tombol hijau **Code › Download ZIP** → ekstrak.
2. **Klik dua kali `index.html`** → website terbuka di Chrome/Edge, lengkap dengan data bawaan (masukkan password).

## Format file Excel yang bisa di-upload

1. Buka menu **Data & Upload**, lalu tarik file export SAP ke kotak upload (boleh sekaligus):
   - `ZMB52` / `MB52`: stok. Bisa file Rantau saja (W101), file All Field, atau keduanya.
   - `ME3N`: kontrak/OA.
   - `MB51`: pemakaian. File yang berisi pivot juga bisa, sheet data mentahnya dicari otomatis.
2. Data tetap tersimpan walaupun browser ditutup. Upload ulang kapan saja untuk memperbarui.

Jenis file dikenali **otomatis dari nama kolom**. Tanggal data dibaca dari nama file, misalnya `10.14_ZMB52.xlsx` = 14 Oktober. Jika satu plant ada di dua file MB52, yang dipakai adalah **data dengan tanggal terbaru**.

## Alur kerja Call Order

| Langkah | Menu | Yang dilakukan |
|---|---|---|
| 1 | **Cari Material** | Ketik kata kunci, lihat stok semua field, harga, kontrak, dan pemakaian. Klik baris untuk detail. |
| 2 | **Cari Material** | Centang **RO** (tarik lewat kontrak) atau **BAU** (Bantuan Antar Unit). Boleh dua-duanya. |
| 3 | **Kontrak (OA/RO)** | Buka satu OA, filter "Pernah dipakai Rantau" / "Stok Rantau habis", lalu centang banyak item sekaligus dan isi Qty. |
| 4 | **Call Order** | Isi Qty Call RO (ada tombol *saran*), Stok Aktual, OA, dan Note. Untuk BAU, isi qty per Field sumber. |
| 5 | **Call Order** | Klik **Export Excel (Template MIM)**. |

**Isi file Excel:**
- Sheet `Call <Bulan>`: format sama dengan template MIM: No, Material, Material Description, Uom, Data SAP dd.mm, Stock Aktual, History (tahun lalu), Call RO, Net Price, Total Harga (rumus), OA, Note, KIMAP (Ref OA). Material dikelompokkan A, B, C… per kontrak.
- Sheet `BAU <Bulan>`: daftar BAU yang dikelompokkan per Field sumber, lengkap dengan stok field asal, qty, dan harga rata-rata.

**Rumus yang dipakai:**
- *Pemakaian* = jumlah transaksi Goods Issue MB51 (mvt 201/202, 221/222, 261/262, 291/292, 949/950, 963/964), reversal ikut dihitung.
- *Saran qty* = rata-rata pemakaian per bulan (12 bulan terakhir) × cover bulan (default 3) − stok Rantau. Cover bulan bisa diubah di Pengaturan.
- *Kontrak aktif* = Validity Period End ≥ hari ini. Kalau ada beberapa OA, yang dipilih otomatis adalah OA aktif dengan harga termurah. Pilihan ini bisa diganti.

Kode plant setiap Field, Field "home", dan tahun kolom History bisa diubah di menu **Pengaturan**.

---

## Online-kan gratis dengan GitHub Pages

Website ini **statis** (HTML + CSS + JavaScript saja, tanpa server/database), jadi bisa di-hosting gratis:

1. Buka repo ini di GitHub, lalu masuk ke **Settings → Pages**.
2. Di bagian *Build and deployment*, pilih **Source: Deploy from a branch**.
3. Pilih branch **`main`** dan folder **`/ (root)`**, lalu **Save**.
4. Tunggu 1–2 menit. Website akan aktif di **https://stackgeefer.github.io/Warehouse-SCM/**

> GitHub Pages gratis hanya untuk **repo publik** (kecuali akun berbayar). Data SAP di repo ini terenkripsi, jadi tetap aman walau publik — **jangan pernah commit file Excel mentah** dan jangan tulis password di repo.

## Nanti kalau sudah beli Hosting / Domain

- **Hosting biasa (cPanel/shared hosting)**: upload seluruh isi folder ini (`index.html`, `css/`, `js/`, `vendor/`) ke `public_html` lewat File Manager atau FTP. Tidak perlu PHP atau database.
- **Domain sendiri + GitHub Pages**: di *Settings → Pages → Custom domain*, isi domain Anda. Lalu di panel domain, buat record `CNAME` yang mengarah ke `<username>.github.io`.
- Bisa juga memakai Netlify / Cloudflare Pages / Vercel (gratis): cukup hubungkan ke repo GitHub ini.

## Menjalankan dengan server lokal (opsional)

Membuka `index.html` langsung sudah cukup. Jika ingin proses upload file besar (MB51) berjalan di background tanpa layar membeku sesaat:

```bash
python -m http.server 8000
# buka http://localhost:8000
```

## Struktur folder

```
index.html          Halaman utama
css/style.css       Tampilan
js/parser.js        Membaca Excel SAP & deteksi otomatis MB52/ME3N/MB51
js/search.js        Logika pencarian (ukuran, rating, sinonim FLG=FLANGE, dst.)
js/model.js         Menggabungkan stok + kontrak + pemakaian
js/app.js           Halaman & interaksi
js/export.js        Export Excel sesuai template MIM
js/store.js         Penyimpanan lokal browser
js/worker.js        Membaca file di background
js/bundle.js        Enkripsi/dekripsi data bawaan
data/sap-data.js    Data SAP bawaan (TERENKRIPSI)
tools/build-data.js Membuat data/sap-data.js lewat Node (opsional)
vendor/             Library SheetJS & ExcelJS (offline, tanpa CDN)
```
