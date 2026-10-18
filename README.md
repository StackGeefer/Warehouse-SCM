# Material Warehouse

**Call Order Field Rantau → MIM** · Warehouse & Distribution Zona 1

Website untuk mencari material, mengecek stok SAP Zona 1, melihat harga & kontrak (OA/RO), memilih **RO** atau **BAU**, lalu export **Call Order** sesuai template MIM.

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
2. Tarik file Excel SAP ke kotak upload (ZMB52/MB52, ME3N, MB51 — boleh sekaligus). Tanggal dibaca dari nama file, contoh `10.15_ZMB52.xlsx` = 15 Oktober.
3. Data langsung dipublikasikan ke website (perlu koneksi GitHub sekali saja, lihat di bawah). Pengguna lain melihat data baru ±1–2 menit kemudian.

**Aturan versi** — tiap jenis data (stok, kontrak, pemakaian) disimpan **maksimal 2 versi**:

```
upload 15.10  →  [15.10]
upload 16.10  →  [16.10 aktif, 15.10 cadangan]
upload 17.10  →  [17.10 aktif, 16.10 cadangan]   ← 15.10 dihapus otomatis
```

Upload ulang dengan tanggal yang sama menggantikan versi tanggal itu. File stok Rantau saja (W101) boleh di-upload terpisah — plant lain tetap memakai data terakhirnya.

## Koneksi GitHub (sekali saja, oleh Owner)

Agar upload di website langsung tersimpan untuk semua pengguna, website perlu token GitHub:

1. Buka https://github.com/settings/personal-access-tokens/new
2. **Repository access** → *Only select repositories* → `Warehouse-SCM`
3. **Permissions → Contents** → *Read and write* → **Generate token**
4. Di website: **Pengaturan → Koneksi GitHub** → tempel token → **Simpan & Tes**

Token hanya tersimpan di browser Owner dan hanya punya akses ke repo ini.

## Fitur

- **Cari Material** — KIMAP atau deskripsi; `flange 3" 150` = `FLG 3IN 150LB` = `CL.150 3 IN`. Stok Rantau (W101), Lirik (W803/W104), Jambi (W802), Pangsu (W102) & plant lain, harga, kontrak, pemakaian 2025/2026.
- **Kontrak (OA/RO)** — klik nomor OA → semua material di kontrak itu, centang banyak item sekaligus.
- **Call Order** — centang RO/BAU per material, saran qty (rata-rata pemakaian × 3 bulan − stok), export Excel: sheet `Call <Bulan>` (format template MIM) + sheet `BAU <Bulan>`.

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
data/<jenis>-<tgl>-*.js  Data SAP terenkripsi
tools/init-data.js    (opsional) membuat ulang data awal via Node
vendor/               SheetJS & ExcelJS
```
