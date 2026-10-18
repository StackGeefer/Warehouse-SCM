# Material Warehouse

**Call Order Field Rantau → MIM** · Warehouse & Distribution Zona 1

Website untuk mencari material, mengecek stok SAP Zona 1 & field lain, melihat harga & kontrak (OA/RO), memilih **RO** atau **BAU**, export **Call Order** sesuai template MIM, menyimpan **Riwayat Order**, dan membuka **TKO & Referensi Warehouse** (PDF).

🌐 Website: **https://stackgeefer.github.io/Warehouse-SCM/**

---

## Login

Website dibuka lewat halaman **Login** (username + password).

| Peran | Bisa apa |
|---|---|
| **Owner** | Semua fitur + upload/update data SAP, kelola pengguna, ganti password, koneksi GitHub |
| **Viewer** | Cari material, lihat stok/kontrak, buat & export Call Order |

Owner menambah/menghapus pengguna dan mengganti password di menu **Pengaturan**.

> 🔒 Data SAP di repo ini **terenkripsi (AES-256)** dan kuncinya hanya terbuka setelah login yang benar. Repo boleh publik — tanpa login, file di folder `data/` tidak bisa dibaca. File Excel mentah tidak pernah di-commit (`.gitignore`). Gunakan password yang kuat.

## Update data SAP (Owner)

1. Login sebagai Owner → menu **Data SAP**.
2. Tarik file Excel SAP ke kotak upload (boleh sekaligus). Tanggal dibaca dari nama file, contoh `10.15_ZMB52.xlsx` = 15 Oktober.
   - **ZMB52 All Field** → stok semua plant langsung diganti yang terbaru.
   - **ME3N** → daftar kontrak diganti yang terbaru.
   - **MB51** → cukup tarik **periode terbaru** (mis. 01.09 – 15.10). Data dalam periode itu diganti, data sebelumnya (2017 dst.) tetap, jadi riwayat pemakaian tersambung otomatis.
3. Data langsung dipublikasikan ke website (perlu koneksi GitHub sekali saja, lihat di bawah). Pengguna lain melihat data baru ±1–2 menit kemudian.

**Aturan versi** — tiap jenis data (stok, kontrak, pemakaian) disimpan **maksimal 3 versi**:

```
upload 15.10  →  [15.10]
upload 16.10  →  [16.10 aktif, 15.10]
upload 17.10  →  [17.10 aktif, 16.10, 15.10]
upload 18.10  →  [18.10 aktif, 17.10, 16.10]   ← 15.10 dihapus otomatis
```

Upload ulang dengan tanggal yang sama menggantikan versi tanggal itu.

## Koneksi GitHub (sekali saja, oleh Owner)

Agar upload di website langsung tersimpan untuk semua pengguna, website perlu token GitHub:

1. Buka https://github.com/settings/personal-access-tokens/new
2. **Repository access** → *Only select repositories* → `Warehouse-SCM`
3. **Permissions → Contents** → *Read and write* → **Generate token**
4. Di website: **Pengaturan → Koneksi GitHub** → tempel token → **Simpan & Tes**

Token hanya tersimpan di browser Owner dan hanya punya akses ke repo ini.

## Fitur

- **Cari Material** — KIMAP atau deskripsi; `flange 3" 150` = `FLG 3IN 150LB` = `CL.150 3 IN`. Kolom utama: Rantau (W101), Lirik (W803), Jambi (W802), Pangkalan Susu (W102). Field lain (Zona 4, 7, 9, 10, 11, 13, 14) dicek lewat tombol **Cek field lain** — tombol berwarna oranye bila stok Zona 1 kosong.
- **Label aging** (Pedoman Pergudangan A-006 bab 2.7, dari riwayat MB51 Rantau): **Fast Moving** (dipakai ≥2 kali/12 bulan pada bulan berbeda), **Slow Moving** (maks. 1 kali/tahun), **Surplus** (2–5 tahun tanpa pemakaian), **Dead Stock** (>5 tahun). Bisa difilter di Cari Material.
- **Kontrak (OA/RO)** — klik nomor OA → semua material di kontrak itu, centang banyak item sekaligus.
- **Call Order** — centang RO/BAU per material, saran qty (rata-rata pemakaian × 3 bulan − stok), export Excel: sheet `Call <Bulan>` (format template MIM) + sheet `BAU <Bulan>`.
- **Riwayat Order** — setiap export otomatis tercatat (nomor order, tanggal, pembuat, item RO/BAU, nilai). Status: Dikirim ke MIM → Diproses MIM → Selesai / Dibatalkan. Bisa download Excel lagi atau salin kembali ke Call Order. Riwayat juga tampil di detail tiap material.
- **TKO & Referensi** — Owner upload PDF (TKO, TKI, TKPA, Pedoman, SOP, Form); semua pengguna bisa preview langsung (juga di HP) atau download. PDF disimpan terenkripsi.

### Daftar Field & Plant (default, bisa diubah di Pengaturan)

| Zona | Field (Plant) |
|---|---|
| Zona 1 | **Rantau (W101, home)**, **Lirik (W803)**, **Jambi (W802)**, **Pangkalan Susu (W102)** |
| Zona 4 | Ramba (W811), Prabumulih (W105), Pendopo (W106), Limau (W801), Adera (W809) |
| Zona 7 | Tambun (W204), Subang (W201), Jatibarang (W202) |
| Zona 9 | Sanggata (W302), Tanjung (W804), Sanga-sanga (W807), Tarakan Maratua (W808) |
| Zona 10 | Bunyu (W301) |
| Zona 11 | Cepu (W203), Sukowati (W402), Poleng (W812) |
| Zona 13 | Donggi Matindok (W401) |
| Zona 14 | Papua (W303) |

## Aktifkan / preview website

- **Online (GitHub Pages)**: repo → **Settings → Pages** → *Deploy from a branch* → `main` / `(root)` → Save.
- **Preview lokal**: **Code → Download ZIP** → ekstrak → klik dua kali `index.html` → login.
- **Hosting sendiri nanti**: upload seluruh isi folder ke `public_html` (tanpa PHP/database). Upload data dari website tetap tersimpan ke repo GitHub ini.

## Struktur folder

```
index.html            Halaman utama
css/style.css         Tampilan
js/app.js             Halaman, login, upload & publikasi
js/vault.js           Enkripsi, pengguna, aturan versi
js/parser.js          Membaca Excel SAP (deteksi otomatis MB52/ME3N/MB51)
js/search.js          Logika pencarian
js/model.js           Menggabungkan stok + kontrak + pemakaian
js/export.js          Export Excel template MIM
data/users.js         Daftar pengguna (hash + kunci terenkripsi, tanpa password)
data/manifest.js      Daftar versi data
data/<jenis>-<tgl>-*.js  Data SAP terenkripsi (maks. 3 versi per jenis)
data/orders.js        Riwayat order (terenkripsi)
data/docs.js          Daftar dokumen TKO (terenkripsi)
data/docs/*.js        File PDF (terenkripsi)
tools/init-data.js    (opsional) membuat ulang data awal via Node
vendor/               SheetJS, ExcelJS, PDF.js
```
