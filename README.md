# Material Warehouse & Heavy Transport

**Call Order Field Rantau → MIM** · Warehouse & Distribution Zona 1

Website untuk mencari material, mengecek stok SAP Zona 1 & field lain, melihat harga & kontrak (OA/RO), memilih **RO** atau **BAU**, export **Call Order** sesuai template MIM, menyimpan **Riwayat Order**, dan membuka **TKO & Referensi Warehouse** (PDF).

🌐 Website: **https://stackgeefer.github.io/Warehouse-SCM/**

---

## Login

Website dibuka lewat halaman **Login** (username + password).

| Peran | Bisa apa |
|---|---|
| **Owner Utama** | Semua fitur + kelola pengguna, koneksi GitHub (satu-satunya yang mengisi token) |
| **Co-Owner** | Upload/update data SAP, pilih versi data, kelola order/dokumen/foto/sinonim — publikasi memakai token Owner Utama yang tersimpan terenkripsi (Co-Owner tidak pernah melihat token) |
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

**Akses Co-Owner:** setelah token tersimpan, Owner Utama isi password sendiri sekali di kartu *Akses Co-Owner* → **Bagikan ke Co-Owner**. Token dikunci dengan kunci admin yang hanya terbuka untuk Owner/Co-Owner (`data/admin.js`). Untuk menjadikan seseorang Co-Owner: **Pengaturan → Pengguna** → pilih *Co-Owner* + isi password orang itu → **Simpan**, lalu dia login ulang.

**Pilih versi data:** di **Data SAP**, tiap versi (maks. 3) punya tombol **Gunakan versi ini**. Dipakai bila file terbaru ternyata salah; berlaku untuk semua pengguna. Upload berikutnya otomatis menjadi versi yang dipakai.

**Stok 0:** baris ZMB52 dengan stok 0 di plant selain Rantau (W101) diabaikan agar daftar material tidak membengkak bila export SAP tidak memakai "No zero stock lines".

## Fitur

- **Cari Material** — KIMAP atau deskripsi; `flange 3" 150` = `FLG 3IN 150LB` = `CL.150 3 IN`. Kolom utama: Rantau (W101), Lirik (W803), Jambi (W802), Pangkalan Susu (W102). Field lain (Zona 4, 7, 9, 10, 11, 13, 14) dicek lewat tombol **Cek field lain** — tombol berwarna oranye bila stok Zona 1 kosong.
- **Sinonim pencarian** — mencari `KCL` juga menemukan *POTASSIUM CHLORIDE*, `majun` juga *COTTON WASTE / WIPING RAG / RAG*, `soda api` → *CAUSTIC SODA*, `baut` → *BOLT*, dst. Sumbernya: ±100 kelompok bawaan (Indonesia ↔ Inggris ↔ rumus kimia), sinonim yang dipelajari otomatis dari deskripsi SAP (mis. "POTASSIUM CHLORIDE,KCL"), dan sinonim tambahan yang diisi Owner di **Pengaturan → Sinonim pencarian**. Ejaan huruf ganda disamakan (POTASIUM = POTASSIUM).
- **Singkatan SAP & salah ketik** — `packer` juga menemukan *PCKR*, `tubing` ↔ *TBG*, `bearing` ↔ *BRG*, `assy` ↔ *ASSEMBLY/ASM*, `hanger` ↔ *HGR*, `x-over` ↔ *CROSS OVER*, dll. (±150 singkatan, disusun dari pola singkatan di ±17 ribu deskripsi SAP). Kata yang tidak ada di data ditebak sebagai singkatan (`pkr` → PACKER) atau salah ketik (`pakcer` → PACKER) dan ditampilkan di "Dibaca sebagai". Bisa 2 padanan sekaligus: `majun putih` → *COTTON WASTE, WHITE*.
- **Peringkat hasil** — material yang nama barangnya (kata sebelum koma pertama, gaya SAP "VALVE,BALL") sesuai kata kunci tampil paling atas; baru kemudian yang hanya menyebut kata itu di keterangan (mis. REDRESS KIT untuk packer).
- **Label aging** (Pedoman Pengelolaan Logistik SHU A7-009/PHE52000/2023-S9, dari riwayat MB51 Rantau): **Fast Moving** (dipakai ≥1 kali dalam 1 tahun), **Moderate Moving** (maks. 1 kali dalam 2 tahun), **Slow Moving** (maks. 1 kali dalam 5 tahun), **Dead Stock** (>5 tahun tanpa pemakaian). Bisa difilter di Cari Material.
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
js/search.js          Logika pencarian + sinonim
js/synonyms.js        Kamus sinonim bawaan
js/model.js           Menggabungkan stok + kontrak + pemakaian
js/export.js          Export Excel template MIM
data/users.js         Daftar pengguna (hash + kunci terenkripsi, tanpa password)
data/manifest.js      Daftar versi data
data/<jenis>-<tgl>-*.js  Data SAP terenkripsi (maks. 3 versi per jenis)
data/orders.js        Riwayat order (terenkripsi)
data/docs.js          Daftar dokumen TKO (terenkripsi)
data/docs/*.js        File PDF (terenkripsi)
data/synonyms.js      Sinonim tambahan dari Owner
tools/init-data.js    (opsional) membuat ulang data awal via Node
vendor/               SheetJS, ExcelJS, PDF.js
```


## Pass Keluar Barang (material keluar)

1. **Cari Material** → centang **OUT** (di bawah RO & BAU).
2. **Call Order** → bagian **Material Keluar**: isi Dari, Dikirim ke, Referensi, Tanggal, Kendaraan (No. Polisi), Driver, Pemohon, Penerima + **Jumlah** tiap material → **Ajukan Pass Keluar (Approval)**. Tombol *Preview PDF* untuk cek sebelum diajukan.
3. Menu **Pass Keluar** → Owner / Co-Owner klik **Approve**: nomor pass otomatis (`RTU-<urut>/EP0651/WH/<tahun>`, bisa diubah), **nama & tanda tangan penyetuju otomatis menjadi Pengirim**, PDF langsung ter-download. Bisa juga **Tolak** atau **Batalkan**.
4. PDF: A5 landscape, format sama dengan Pass Keluar Barang sistem (11 baris per halaman, lebih dari itu otomatis halaman berikutnya).

- **Material Non Stock** (tidak ada di data SAP): di halaman **Pass Keluar → Tambah material manual**, ketik KIMAP (opsional), deskripsi, UOM (& jumlah) → masuk ke Call Order bagian Material Keluar, lalu alur & PDF sama.
- Nama & tanda tangan diatur sendiri oleh tiap Owner / Co-Owner di **Pengaturan → Tanda tangan Pass Keluar** (latar polos otomatis dibuat transparan). Disimpan terenkripsi di `data/signs.js`.
- Data pass: `data/pass.js` (terenkripsi). Akun **Warehouse** perlu diatur password-nya oleh Owner Utama (Pengaturan → Pengguna) agar bisa mengajukan.

## Peran Receiving & History hapus

- **Receiving**: seperti Warehouse + **edit & hapus** Register dan Penerimaan Barang. **Warehouse** hanya membuat register & mengajukan (tanpa edit/hapus). Owner/Co-Owner tetap bisa semua.
- Setiap data yang **dihapus** (Register, Penerimaan Barang, Pass Keluar, Reservasi Armada, Riwayat Order, Dokumen TKO, Foto login, Pengguna) dicatat di `data/audit.js` (terenkripsi): siapa, kapan, data apa. Lihat di **Pengaturan → History hapus data**. Data yang diedit ditandai "Last edit: nama · waktu" di tabelnya.
- Pengaturan dibuat ringkas: setiap bagian bisa dibuka-tutup (status diingat di browser).

## Register Receiving (sebelum BASTB & LHPB)

- **Penerimaan Barang** dimulai dengan **memilih Register Receiving** (atau membuat register baru). Setelah dipilih, form BASTB/LHPB terbuka dan PO, delivery date, tanggal tiba, GR, vendor, deskripsi & tipe (STOCK = Persediaan, DIRECT CHARGE = Non Persediaan) terisi otomatis.
- Format kolom mengikuti Excel REGISTER_RECEIVING (Detail-2026, kolom A–Y). Nomor register: No. urut per tahun + Register `26 R`. Lead Time GR (103→105) & Keterlambatan dihitung otomatis.
- **Riwayat Penerimaan**: atas = tabel Register (tahun 2009–sekarang, filter bulan, cari), bawah = BASTB & LHPB.
- Download Excel Register **per bulan / per tahun / seluruh tahun** dengan format asli (`assets/terima/register-template.xlsx`); Rekap BASTB & LHPB juga per bulan / tahun / seluruh tahun.
- Data: `data/register/<tahun>.js` + `data/register/index.js` (terenkripsi). Data lama diimpor dari REGISTER_RECEIVING.xls (file Excel mentah tidak disimpan di repo).

## Penerimaan Barang (barang masuk — TKO B7-084 Lampiran 3–7)

- **Penerimaan Barang** (Section 1): satu form — default **BASTB + LHPB**; **SPB** otomatis bila ada item *Ditolak*; **Form Denda + Stamp** hanya bila bagian F **"Material terlambat"** dicentang (jumlah hari otomatis dari tanggal, bisa diisi manual).
  Nomor BASTB/LHPB (`0043/BASTB/10/2026`) terisi otomatis saat mengisi form & bisa diedit; nomor yang dihapus tidak dipakai ulang, nomor manual (mis. 0001) melanjutkan urutan berikutnya (0002). Akun Warehouse bisa mengisi, mengajukan, mengedit pengajuan, preview & download.
  Isi Nomor Kontrak/OA → vendor, ID vendor & harga terisi dari data ME3N; isi KIMAP → deskripsi & satuan dari data stok. Kontak vendor (NPWP, email, telp) diingat untuk pengisian berikutnya.
  Hari terlambat = Tgl Penerimaan − Tgl Jatuh Tempo (default Delivery Date); denda = Jumlah Harga PO/RO × min(hari × tarif, maksimum).
- **Riwayat Penerimaan** (Section 2): filter bulan/status/terlambat, Approve/Tolak (Owner & Co-Owner), Edit/Batalkan selama menunggu approval, Hapus (khusus Owner Utama).
- Saat approve (Owner Utama atau Co-Owner, siapa pun duluan): tanda tangan penyetuju tertempel di slot miliknya. Penandatangan lain yang tercantum bisa **Tanda tangani** setelahnya.
- Export: pilih dokumen → **PDF** (A4, format Lampiran) atau **Excel** (template BASTB/LHPB/Denda + sheet SPB & Stamp).
- Profil penandatangan (nama lengkap, No. ID, jabatan, fungsi, tanda tangan): **Pengaturan → Tanda tangan & profil penyetuju**.
- Data: `data/terima.js` (terenkripsi). Aset: `assets/terima/` (logo PHE, stamp Lampiran 7, template Excel kosong).

## Angkutan Berat (Heavy Transport)

Menu **Reservasi Armada** dan **Riwayat Armada** — khusus angkutan berat (Crane, Picker/TMC, Tronton, Trailer, Vacuum Truck), di luar KRP. Tanpa approval: reservasi langsung berstatus **Terjadwal**.

- **Reservasi Armada**: tanggal pemakaian, jenis & unit armada, driver, helper (keduanya ada pilihan **Other — ketik sendiri**), fungsi (WO, WS, PE, RAM, HSSE, SCM, Finance, LR), nama user, estimasi tonase, **radius angkut / boom (m)**, barang, lokasi muat, tujuan → **Simpan Reservasi**. Unit yang sudah dipakai di tanggal yang sama ditandai.
- **Riwayat Armada**: filter per bulan/armada/status (Terjadwal, Selesai, Dibatalkan), tandai Selesai, edit, utilisasi per unit, dan **Export Excel** per bulan (sheet Reservasi + Utilisasi).
- Data disimpan terenkripsi per bulan (`data/fleet/YYYY-MM.js`), **maks. 6 bulan**: data bulan ke-7 masuk → bulan paling lama terhapus otomatis. Export tiap bulan sebagai arsip (website mengingatkan bulan yang belum di-export).
- Master armada/driver/helper (`data/fleet/master.js`, terenkripsi; tanpa KTP/SIM/no. HP) diubah di **Pengaturan → Master Angkutan Berat**.

| Peran | Akses |
|---|---|
| Warehouse | Material, kontrak, Call Order, riwayat order, TKO, Pass Keluar + **Reservasi Armada** (tanpa Riwayat Armada) |
| Angkutan | Hanya Reservasi & Riwayat Armada — isi, edit, tandai selesai/batal, export & master armada |
| Owner Utama / Co-Owner | Semua menu |

## Saran qty Call RO

Di bawah kolom **Call RO** selalu tampil saran: `pemakaian/bulan × (cover + lead time) − stok`, dengan pemakaian/bulan = 60% rata-rata 3 bulan terakhir + 40% rata-rata 12 bulan (MB51 Rantau). Bila **Stok Aktual** diisi, saran memakai stok aktual. Ditampilkan juga stok cukup ±berapa bulan dan **order terakhir** (dari Riwayat Order). Arahkan kursor ke saran untuk rincian perhitungan; klik saran untuk mengisi Call RO. Cover & lead time diatur di **Pengaturan**.

