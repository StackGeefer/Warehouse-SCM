/*
 * Penerimaan Barang (Barang Masuk) — TKO B7-084/PHE52000/2025-S9 Lampiran 3–7.
 *
 * Satu form mengisi sekaligus 4 dokumen:
 *   BASTB (Lampiran 3), SPB (Lampiran 4, bila ada barang ditolak), LHPB (Lampiran 5),
 *   Form Perhitungan Denda Keterlambatan (Lampiran 6) + Stamp Keterlambatan (Lampiran 7).
 * Alur sama seperti Pass Keluar: isi → Ajukan → Owner / Co-Owner approve (nomor dokumen & tanda tangan
 * penyetuju otomatis) → export PDF atau Excel. Penandatangan lain yang tercantum bisa ikut menandatangani.
 *
 * Data: data/terima.js (terenkripsi): { seq, list, vendors } — tulis selalu baca versi terbaru dulu.
 */
(function (root) {
  'use strict';
  var ST = { pending: 'Menunggu Approval', ok: 'Disetujui', no: 'Ditolak', cancel: 'Dibatalkan' };
  var ST_CLS = { 'Menunggu Approval': 'warn', 'Disetujui': 'ok', 'Ditolak': 'bad', 'Dibatalkan': '' };
  var FIRST_SEQ = 42; // contoh terakhir: 0041/BASTB/10/2026
  var TPL_ROWS = 10; // baris material di template Excel; lebih dari itu baris ditambah otomatis saat export
  var TKO = 'TKO No. B7-084/PHE52000/2025-S9';
  var BLN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  var DOCS = [
    { k: 'bastb', t: 'BASTB', full: 'Berita Acara Serah Terima Barang', lamp: 'Lampiran 3 – ' + TKO + '-F002' },
    { k: 'spb', t: 'SPB', full: 'Surat Penolakan Barang', lamp: 'Lampiran 4 – ' + TKO + '-F003' },
    { k: 'lhpb', t: 'LHPB', full: 'Laporan Hasil Pemeriksaan Barang', lamp: 'Lampiran 5 – ' + TKO + '-F004' },
    { k: 'denda', t: 'Form Denda', full: 'Form Perhitungan Denda Keterlambatan', lamp: 'Lampiran 6 – ' + TKO + '-F005' },
    { k: 'stamp', t: 'Stamp', full: 'Stamp Keterlambatan', lamp: 'Lampiran 7 – ' + TKO }
  ];
  var CHECKLIST = ['Dokumen Pembelian (PO/RO) asli/salinan bertandatangan', 'Surat Jalan Asli (dengan referensi nomor PO/RO)', 'Sertifikat Barang / dokumen pendukung sesuai PO/RO',
    'Material Mill Certificate', 'Vendor Warranty', 'Vendor Quality Assurance (Jaminan Kualitas)', 'API Certificate', 'Certificate of Compliance/Conformance', 'Pressure Test Report',
    'Chemical Analysis', 'Functional Test Report', 'Calibration Certificate', 'Catalog', 'Instruction Manual', 'Data Sheet', 'Drawing', 'LDK/SDS (Bahasa Indonesia)',
    'MIGAS/Disnaker Certification', 'Minutes of MIGAS Inspection', 'Load Test Report', 'Proof Test Certificate', 'Inspection Release Note', 'Dokumen Kepabeanan (Incoterm DAP)'];
  // Hasil pemeriksaan keseluruhan (LHPB): [kunci, label, pilihan]
  var HASIL = [
    ['kemasan', 'Kondisi Kemasan', ['Baik', 'Rusak']],
    ['jumlah', 'Jumlah Barang', ['Lengkap', 'Kurang'], 'auto'],
    ['spek', 'Jenis dan Spesifikasi', ['Sesuai', 'Tidak Sesuai', 'Sebagian Tidak Sesuai']],
    ['kondisi', 'Kondisi Barang', ['Baru & Baik', 'Tidak Baik', 'Bekas']],
    ['uji', 'Diperlakukan Uji Fungsi*', ['Ya', 'Tidak']],
    ['hasilUji', 'Hasil Uji Fungsi*', ['Lulus', 'Tidak Lulus']],
    ['waktu', 'Kesesuaian Waktu Penyerahan', ['Sesuai PO/RO', 'Terlambat'], 'auto']
  ];
  var KATEGORI = ['Material', 'Dokumen', 'Jadwal', 'Kendaraan', 'Personel', 'Lainnya'];
  // Slot penandatangan: def = 'recv' (profil Receiving), 'other' (profil lain), '' (kosong)
  var SLOTS = [
    { k: 'bastb', doc: 'BASTB', t: 'PT Pertamina (Pejabat Berwenang)', def: 'recv' },
    { k: 'lhpb1', doc: 'LHPB', t: 'Pemeriksa 1', def: 'other', id: true },
    { k: 'lhpb2', doc: 'LHPB', t: 'Pemeriksa 2', def: 'recv', id: true },
    { k: 'lhpbM1', doc: 'LHPB', t: 'Mengetahui 1', def: '', id: true },
    { k: 'lhpbM2', doc: 'LHPB', t: 'Mengetahui 2', def: '', id: true },
    { k: 'spbPrep', doc: 'SPB', t: 'Disiapkan Oleh', def: 'recv' },
    { k: 'spbAppr', doc: 'SPB', t: 'Disetujui Oleh', def: 'other' },
    { k: 'dendaPrep', doc: 'Denda', t: 'Disiapkan Oleh', def: 'recv' },
    { k: 'dendaVer', doc: 'Denda', t: 'Diverifikasi Oleh', def: 'other' },
    { k: 'dendaAppr', doc: 'Denda', t: 'Disetujui Oleh', def: '' }
  ];
  var UOMS = ['PCS', 'EA', 'SET', 'UNIT', 'KG', 'L', 'M', 'M2', 'M3', 'ROLL', 'BOX', 'PAA', 'JT', 'LOT', 'TIN', 'DRUM', 'BTL', 'LBR', 'BAG', 'CYL'];
  var DRAFT_KEY = 'mw:terima-draft';

  root.ReceiveModule = function (ctx) {
    var S = ctx.S, esc = ctx.esc, toast = ctx.toast, loading = ctx.loading, Vault = ctx.Vault;
    var R = S.terima = { data: null, signs: null, draft: null, editId: null, filt: 'Semua', month: '', q: '', img: {}, regQ: '' };
    // Register Receiving: wajib dipilih sebelum mengisi BASTB & LHPB
    var Reg = root.RegisterModule({
      S: S, esc: esc, toast: toast, loading: loading, route: ctx.route, isOwner: ctx.isOwner, closeDrawer: ctx.closeDrawer,
      loadExcelJS: ctx.loadExcelJS, pass: ctx.pass, links: regLinks, onPick: pickReg, rerender: function () { renderHistory(); },
      canReceiving: function () { return canRcv(); }, audit: ctx.audit
    });
    // register → nomor BASTB yang memakainya (pengajuan yang tidak dibatalkan/ditolak)
    function regLinks() {
      var o = {};
      ((R.data || {}).list || []).forEach(function (r) {
        if (!r.reg || r.status === ST.cancel || r.status === ST.no) return;
        (o[r.reg.id] = o[r.reg.id] || []).push(docNo(r, 'bastb') || 'Draft');
      });
      return o;
    }
    // isi data penerimaan dari register (PO, tanggal, GR, vendor, deskripsi, tipe)
    function applyReg(d, y, o) {
      var h = d.h;
      d.reg = { y: y, id: o.id, no: o.no, reg: o.reg || '' };
      if (o.po) h.po = o.po;
      if (o.del) h.delivery = o.del;
      if (o.tiba) { h.tglTerima = o.tiba; h.tglPeriksa = o.tiba; h.tglBast = o.tiba; }
      if (o.gr105 || o.gr103) h.gr = o.gr105 || o.gr103;
      if (o.tgl105 || o.tgl103) h.tglGr = o.tgl105 || o.tgl103;
      if (o.vid) h.vendorId = o.vid;
      if (o.vendor) h.vendor = o.vendor;
      if (o.desc) h.perihal = o.desc;
      if (o.fungsi) h.tipe = /direct|dc\b/i.test(o.fungsi) ? 'Non Persediaan' : 'Persediaan';
      lookupVendor(d);
    }
    function pickReg(y, o, fromHistory) {
      if (!o) return;
      if (fromHistory && R.draft && R.draft.reg && !R.editId) R.draft = null;
      var d = loadDraft();
      applyReg(d, y, o); storeDraft();
      toast('Register ' + Reg.regLabel(o) + ' dipilih — data PO, tanggal, GR & vendor terisi otomatis');
      if (ctx.route() !== 'terima') location.hash = '#/terima'; else rerender();
    }
    function regCard(d) {
      if (d.reg) {
        var o = Reg.get(d.reg.y, d.reg.id) || {};
        return '<div class="card card-pad rcv-sec reg-picked"><div class="reg-picked-row"><span class="reg-step">1</span><div style="flex:1"><div class="small muted">Register Receiving</div>' +
          '<b class="mono">' + esc(Reg.regLabel(o.id ? o : d.reg)) + '</b> <span class="small muted">' + d.reg.y + '</span>' +
          (o.id ? '<div class="small">PO ' + esc(o.po || '') + ' · tiba ' + esc(Reg.dot(o.tiba)) + ' · ' + esc(o.vendor || '') + (o.rp ? ' · Rp ' + idr(o.rp) : '') + '</div>' : '') + '</div>' +
          '<div class="toolbar">' + (o.id && canRcv() ? '<button class="btn sm" data-ra="reg-edit">Edit register</button>' : '') + (R.editId ? '' : '<button class="btn sm" data-ra="reg-change">Ganti register</button>') + '</div></div></div>';
      }
      return '<div class="card card-pad rcv-sec reg-gate"><h4 class="section-title"><span class="reg-step">1</span> Pilih Register Receiving dulu</h4>' +
        '<p class="small muted" style="margin-top:0">Register wajib diisi sebelum BASTB &amp; LHPB. Pilih register yang belum dipakai, atau buat register baru — setelah dipilih, form BASTB/LHPB terbuka dan data PO, tanggal tiba, GR &amp; vendor terisi otomatis.</p>' +
        '<div class="toolbar" style="margin-bottom:8px"><input class="input" id="rcvRegQ" style="flex:1;min-width:220px" placeholder="Cari no. register, PO, vendor…" value="' + esc(R.regQ) + '"><button class="btn primary" data-rga="new">+ Register baru</button></div>' +
        '<div id="rcvRegList"><div class="muted small">Memuat register…</div></div></div>';
    }

    function $(s) { return document.querySelector(s); }
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    function today() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    function dot(s) { if (!s) return ''; var p = String(s).split('-'); return p.length === 3 ? p[2] + '.' + p[1] + '.' + p[0] : s; }
    function longDate(s) { if (!s) return ''; var p = String(s).split('-'); return +p[2] + ' ' + BLN[+p[1] - 1] + ' ' + p[0]; }
    function days(a, b) { var x = a.split('-'), y = b.split('-'); return Math.round((Date.UTC(+y[0], +y[1] - 1, +y[2]) - Date.UTC(+x[0], +x[1] - 1, +x[2])) / 864e5); }
    function fmtTime(iso) { if (!iso) return ''; var d = new Date(iso); return pad(d.getDate()) + '-' + pad(d.getMonth() + 1) + '-' + d.getFullYear() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
    function num(v) { var n = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) ? n : 0; }
    function has(v) { return v !== '' && v != null && isFinite(num(v)); }
    function idr(n) { return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Math.round(n || 0)); }
    function qty(n) { return n === '' || n == null ? '' : new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 }).format(num(n)); }
    function pct(p) { return new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(p * 100) + '%'; }
    function me() { return S.user ? S.user.name : ''; }
    function canApprove() { return ctx.isOwner(); }
    // Receiving (dan Owner/Co-Owner): edit & hapus. Warehouse hanya mengisi & mengajukan.
    function canRcv() { return !!(S.user && ctx.canReceiving && ctx.canReceiving()); }
    function badge(st) { return '<span class="badge ' + (ST_CLS[st] || '') + '">' + esc(st) + '</span>'; }
    function clone(o) { return JSON.parse(JSON.stringify(o)); }
    function getPath(o, p) { return p.split('.').reduce(function (a, k) { return a == null ? a : a[k]; }, o); }
    function setPath(o, p, v) { var ks = p.split('.'), last = ks.pop(); ks.reduce(function (a, k) { if (a[k] == null) a[k] = /^\d+$/.test(k) ? [] : {}; return a[k]; }, o)[last] = v; }

    // ---------- data ----------
    function emptyData() { return { seq: FIRST_SEQ, list: [], vendors: {} }; }
    async function load(force) {
      var pm = ctx.pass();
      if (!R.data || force) R.data = (await pm.readJSON('data/terima.js')) || emptyData();
      if (!R.data.vendors) R.data.vendors = {};
      if (!R.signs || force) R.signs = (await pm.readJSON('data/signs.js')) || { users: {} };
      return R.data;
    }
    async function save(mutate, message) {
      R.data = await ctx.pass().atomic('data/terima.js', 'MW_TERIMA', 'Penerimaan Barang (BASTB/SPB/LHPB/Denda)', function (cur) {
        cur = cur || emptyData(); if (!cur.vendors) cur.vendors = {};
        return mutate(cur);
      }, message);
      if (ctx.refreshNav) ctx.refreshNav();
      return R.data;
    }
    function find(id) { return (R.data ? R.data.list : []).filter(function (r) { return r.id === id; })[0]; }

    // ---------- profil penandatangan (dari Pengaturan → Tanda tangan & profil) ----------
    function titleCase(s) { return String(s || '').toLowerCase().replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }
    function profiles() {
      var U = (R.signs && R.signs.users) || {};
      return Object.keys(U).map(function (uid) {
        var u = U[uid];
        return { uid: uid, name: u.full || titleCase(u.name), jab: u.jab || '', nid: u.nid || '', fungsi: u.fungsi || '', img: u.img, short: u.name };
      });
    }
    function profile(uid) { return profiles().filter(function (p) { return p.uid === uid; })[0] || null; }
    function defaultSlot(def) {
      var ps = profiles(), recv = ps.filter(function (p) { return /receiv/i.test(p.jab); })[0];
      if (def === 'recv') return recv ? { uid: recv.uid } : (ps[0] ? { uid: ps[0].uid } : {});
      if (def === 'other') { var o = ps.filter(function (p) { return !recv || p.uid !== recv.uid; })[0]; return o ? { uid: o.uid } : {}; }
      return {};
    }
    // Isi slot: profil (uid) atau ketik manual. Tanda tangan tampil bila pemilik profil sudah menandatangani dokumen ini.
    function who(r, k) {
      var s = (r.sign || {})[k] || {}, p = s.uid ? profile(s.uid) : null;
      var o = p ? { uid: p.uid, name: p.name, jab: p.jab, nid: p.nid, fungsi: p.fungsi } : { name: s.name || '', jab: s.jab || '', nid: s.nid || '', fungsi: s.fungsi || '' };
      if (p && r.signed && r.signed[p.uid] && p.img) o.img = p.img;
      return o;
    }
    function slotUids(r) {
      var o = {};
      SLOTS.forEach(function (s) { var v = (r.sign || {})[s.k]; if (v && v.uid) o[v.uid] = 1; });
      return Object.keys(o);
    }

    // ---------- perhitungan (sama seperti rumus di Excel contoh) ----------
    function calc(r) {
      var h = r.h || {}, tarif = num(h.tarif) / 100, maks = num(h.maks) / 100, telat = !!h.telat, raw = 0;
      var manual = telat && has(h.hariTelat) ? Math.max(0, Math.round(num(h.hariTelat))) : null;
      var rows = (r.items || []).filter(function (it) { return it && (it.d || it.m); }).map(function (it, i) {
        var due = it.due || h.delivery || '', rcv = it.rcv || h.tglTerima || '';
        var calcLate = due && rcv ? Math.max(0, days(due, rcv)) : null;
        if (calcLate) raw = Math.max(raw, calcLate);
        // tanpa centang "Material terlambat" → dianggap tepat waktu (tanpa denda & stamp)
        var late = !telat ? (calcLate == null ? null : 0) : manual != null ? manual : calcLate;
        var price = has(it.price) ? num(it.price) : null;
        var amtPo = price == null ? null : num(it.qpo) * price, amtRc = price == null ? null : num(it.qrc) * price;
        var p = late == null ? null : Math.min(late * tarif, maks);
        var rej = it.st === 'Ditolak';
        var qrej = rej ? (has(it.qrej) ? num(it.qrej) : (Math.max(0, num(it.qpo) - num(it.qrc)) || num(it.qpo))) : 0;
        return Object.assign({}, it, { no: i + 1, line: it.line || String(i + 1), dueEff: due, rcvEff: rcv, late: late, amtPo: amtPo, amtRc: amtRc, pct: p,
          denda: p == null || amtPo == null ? 0 : Math.round(amtPo * p), rej: rej, qrej: qrej });
      });
      var lateDays = rows.reduce(function (a, x) { return Math.max(a, x.late || 0); }, 0);
      var nOk = rows.filter(function (x) { return !x.rej; }).length, nRej = rows.length - nOk;
      return {
        rows: rows, n: rows.length, tarif: tarif, maks: maks,
        totPo: rows.reduce(function (a, x) { return a + (x.amtPo || 0); }, 0),
        totRc: rows.reduce(function (a, x) { return a + (x.amtRc || 0); }, 0),
        totDenda: rows.reduce(function (a, x) { return a + x.denda; }, 0),
        lateDays: lateDays, late: telat && lateDays > 0, telat: telat, rawLate: raw, status: rows.length ? (telat && lateDays > 0 ? 'terlambat' : 'tidak terlambat') : '',
        lengkap: rows.length ? rows.every(function (x) { return num(x.qrc) >= num(x.qpo); }) : null,
        rejected: rows.filter(function (x) { return x.rej; }),
        kesimpulan: !rows.length ? '' : !nRej ? 'Diterima' : !nOk ? 'Tidak Diterima' : 'Sebagian Diterima'
      };
    }
    function hasil(r, c, k) {
      if (k === 'jumlah') return c.lengkap == null ? '' : c.lengkap ? 'Lengkap' : 'Kurang';
      if (k === 'waktu') return c.n ? (c.late ? 'Terlambat' : 'Sesuai PO/RO') : '';
      return ((r.lhpb || {}).hasil || {})[k] || '';
    }
    function docNo(r, k) { return r.no && r.no[k] ? r.no[k] : ''; }
    function numbers(seq, date) {
      var p = String(date || today()).split('-'), n = String(seq); while (n.length < 4) n = '0' + n;
      var tail = '/' + p[1] + '/' + p[0];
      return { seq: seq, bastb: n + '/BASTB' + tail, lhpb: n + '/LHPB' + tail, spb: n + '/SPB' + tail, denda: n + '/DENDA' + tail };
    }

    // ================= Section 1: Form Penerimaan Barang =================
    function newDraft() {
      var d = {
        h: { tipe: 'Persediaan', partial: 'Ya', commit: 'Full Delivery', buyer: 'PT Pertamina EP Field Rantau', wh: 'Warehouse Field Rantau',
          pengawas: 'Officer SCM Support & Receiving Rantau', tglTerima: today(), tglPeriksa: today(), tglBast: today(), tglGr: today(), tarif: 0.1, maks: 5 },
        items: [{ line: '1', st: 'Diterima' }],
        lhpb: { hasil: { kemasan: 'Baik', spek: 'Sesuai', kondisi: 'Baru & Baik' }, check: CHECKLIST.slice(0, 3).map(function (t) { return { doc: t, ok: 'Yes', note: '' }; }), catatan: '' },
        spb: { kat: [], alasan: '', rekom: '', lain: '', stMat: 'Disimpan Sementara di Gudang', stDok: 'Disimpan Sementara di Gudang' },
        sign: { vendor: { name: '', jab: '' } }
      };
      SLOTS.forEach(function (s) { d.sign[s.k] = defaultSlot(s.def); });
      return d;
    }
    function loadDraft() {
      if (R.draft) return R.draft;
      try {
        var v = localStorage.getItem(draftKey());
        if (!v && localStorage.getItem(DRAFT_KEY)) { v = localStorage.getItem(DRAFT_KEY); localStorage.removeItem(DRAFT_KEY); } // draft lama (sebelum per akun)
        if (v) { var o = JSON.parse(v); R.draft = o.d; R.editId = o.edit || null; R.savedAt = o.at || null; }
      } catch (e) { /* abaikan */ }
      if (!R.draft) R.draft = newDraft();
      return R.draft;
    }
    // Draft tersimpan otomatis di browser, terpisah per akun (aman bila refresh / mati lampu)
    function draftKey() { return DRAFT_KEY + ':' + (S.user ? S.user.id : 'anon'); }
    var saveTimer;
    function flushDraft() {
      clearTimeout(saveTimer); saveTimer = null;
      if (!R.draft || !S.user) return;
      R.savedAt = new Date().toISOString();
      try { localStorage.setItem(draftKey(), JSON.stringify({ d: R.draft, edit: R.editId, at: R.savedAt })); } catch (e) { /* abaikan */ }
      var el = document.getElementById('rcvSaved'); if (el) el.innerHTML = savedHtml();
    }
    function storeDraft() { clearTimeout(saveTimer); saveTimer = setTimeout(flushDraft, 300); }
    function savedHtml() {
      if (!R.savedAt) return '';
      var d = new Date(R.savedAt);
      return '✓ Tersimpan otomatis ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    }
    window.addEventListener('beforeunload', function () { if (saveTimer) flushDraft(); });
    document.addEventListener('visibilitychange', function () { if (document.hidden && saveTimer) flushDraft(); });
    function clearDraft() { R.draft = null; R.editId = null; R.savedAt = null; try { localStorage.removeItem(draftKey()); } catch (e) { /* abaikan */ } }

    function inp(k, v, o) {
      o = o || {};
      return '<input class="input' + (o.cls ? ' ' + o.cls : '') + '" data-k="' + k + '"' + (o.type ? ' type="' + o.type + '"' : '') + (o.num ? ' data-num' : '') +
        (o.step ? ' step="' + o.step + '"' : '') + (o.list ? ' list="' + o.list + '"' : '') + (o.rr ? ' data-rr' : '') +
        ' value="' + esc(v == null ? '' : v) + '" placeholder="' + esc(o.ph || '') + '">';
    }
    function sel(k, v, opts, o) {
      o = o || {};
      return '<select class="select" data-k="' + k + '"' + (o.rr ? ' data-rr' : '') + '>' + (o.blank != null ? '<option value="">' + esc(o.blank) + '</option>' : '') +
        opts.map(function (x) { return '<option' + (x === v ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('') + '</select>';
    }
    function fld(label, html, cls) { return '<label class="fleet-fld' + (cls ? ' ' + cls : '') + '"><span>' + label + '</span>' + html + '</label>'; }
    // Nilai diterima > Rp 1 Miliar: LHPB diperiksa Gerald & Devy, BASTB (Persediaan) ditandatangani Devy + Vendor
    var BIG_LIMIT = 1e9;
    var DEVY = { manual: true, name: 'Devy Andriany', jab: 'Asst Manager Warehouse Opt Zona 1A', nid: '', fungsi: 'SCM' };
    function nonPers(d) { return (d.h || {}).tipe === 'Non Persediaan'; }
    // Susunan penandatangan otomatis:
    //  Persediaan          : BASTB Seto + Vendor; LHPB Gerald + Seto
    //  Persediaan > Rp 1 M : BASTB Devy + Vendor; LHPB Gerald + Devy
    //  Non Persediaan      : BASTB Seto + Vendor; LHPB User (ketik manual) + Seto; cukup Seto yang approve & tanda tangan
    function modeOf(d) { return nonPers(d) ? 'np' : calc(d).totRc > BIG_LIMIT ? 'big' : 'p'; }
    function syncMode(d) {
      var m = modeOf(d);
      if (d.sign.mode === m) return false;
      if (d.sign.mode == null && d.sign.big != null) { d.sign.mode = d.sign.big ? 'big' : 'p'; delete d.sign.big; if (d.sign.mode === m) return false; }
      d.sign.mode = m;
      var ger = profiles().filter(function (p) { return /gerald/i.test(p.name); })[0], G = ger ? { uid: ger.uid } : defaultSlot('other');
      SLOTS.forEach(function (sl) { d.sign[sl.k] = defaultSlot(sl.def); });
      if (m === 'big') { d.sign.bastb = clone(DEVY); d.sign.lhpb1 = G; d.sign.lhpb2 = clone(DEVY); }
      if (m === 'np') {
        d.sign.lhpb1 = { manual: true, user: true, name: '', jab: '', nid: '', fungsi: '' };
        d.sign.spbAppr = {}; d.sign.dendaVer = {}; d.sign.dendaAppr = {};
      }
      return true;
    }
    // Non Persediaan wajib di-approve pejabat BASTB (Seto Agustian / profil Receiving)
    function reqApprover(r) {
      if ((r.h || {}).tipe !== 'Non Persediaan') return null;
      var u = ((r.sign || {}).bastb || {}).uid;
      if (u) return u;
      var rc = profiles().filter(function (p) { return /receiv/i.test(p.jab); })[0];
      return rc ? rc.uid : null;
    }
    function canApproveRec(r) { var q = reqApprover(r); return canApprove() && (!q || q === S.user.id); }
    function slotHtml(d, s) {
      if ((d.sign[s.k] || {}).user) {
        var u = d.sign[s.k], kk = 'sign.' + s.k + '.';
        return '<div class="rcv-slot wide"><span class="rcv-slot-t">' + esc(s.t) + ' — User / Fungsi Pengguna (ketik manual, tanda tangan basah)</span><div class="rcv-slot-m rcv-slot-3">' +
          inp(kk + 'name', u.name, { ph: 'Nama user' }) + inp(kk + 'jab', u.jab, { ph: 'Jabatan' }) + inp(kk + 'fungsi', u.fungsi, { ph: 'Fungsi' }) +
          (s.id ? inp(kk + 'nid', u.nid, { ph: 'No. ID (opsional)' }) : '') + '</div></div>';
      }
      var v = d.sign[s.k] || {}, mode = v.uid ? v.uid : v.manual ? '__m' : '';
      var ps = profiles();
      var h = '<div class="rcv-slot"><span class="rcv-slot-t">' + esc(s.t) + '</span><select class="select" data-slot="' + s.k + '"><option value="">— Kosong (tanda tangan basah) —</option>' +
        ps.map(function (p) { return '<option value="' + esc(p.uid) + '"' + (mode === p.uid ? ' selected' : '') + '>' + esc(p.name + (p.jab ? ' — ' + p.jab : '')) + '</option>'; }).join('') +
        '<option value="__m"' + (mode === '__m' ? ' selected' : '') + '>Ketik manual…</option></select>';
      if (mode === '__m') {
        h += '<div class="rcv-slot-m">' + inp('sign.' + s.k + '.name', v.name, { ph: 'Nama' }) + inp('sign.' + s.k + '.jab', v.jab, { ph: 'Jabatan' }) +
          (s.id ? inp('sign.' + s.k + '.nid', v.nid, { ph: 'No. ID' }) + inp('sign.' + s.k + '.fungsi', v.fungsi, { ph: 'Fungsi/Sub Fungsi' }) : '') + '</div>';
      }
      return h + '</div>';
    }
    function itemRow(it, i) {
      var k = 'items.' + i + '.';
      return '<tr data-row="' + i + '"><td class="c muted">' + (i + 1) + '</td>' +
        '<td>' + inp(k + 'line', it.line, { cls: 'sm', ph: String(i + 1) }) + '</td>' +
        '<td>' + inp(k + 'm', it.m, { cls: 'sm mono', ph: 'KIMAP' }) + '</td>' +
        '<td>' + inp(k + 'd', it.d, { cls: 'sm', ph: 'Deskripsi material' }) + '</td>' +
        '<td>' + inp(k + 'u', it.u, { cls: 'sm', list: 'rcvUom', ph: 'PCS' }) + '</td>' +
        '<td>' + inp(k + 'qpo', it.qpo, { cls: 'sm num', type: 'number', num: 1, step: 'any' }) + '</td>' +
        '<td>' + inp(k + 'qrc', it.qrc, { cls: 'sm num', type: 'number', num: 1, step: 'any' }) + '</td>' +
        '<td>' + inp(k + 'price', it.price, { cls: 'sm num', type: 'number', num: 1, step: 'any', ph: '0' }) + '</td>' +
        '<td>' + inp(k + 'tkdn', it.tkdn, { cls: 'sm', ph: 'mis. 55,41%' }) + '</td>' +
        '<td>' + inp(k + 'due', it.due, { cls: 'sm', type: 'date' }) + '</td>' +
        '<td>' + inp(k + 'rcv', it.rcv, { cls: 'sm', type: 'date' }) + '</td>' +
        '<td>' + sel(k + 'st', it.st || 'Diterima', ['Diterima', 'Ditolak'], { rr: 1 }) +
        (it.st === 'Ditolak' ? inp(k + 'qrej', it.qrej, { cls: 'sm num', type: 'number', num: 1, step: 'any', ph: 'Qty ditolak' }) : '') + '</td>' +
        '<td>' + inp(k + 'note', it.note, { cls: 'sm', ph: 'Catatan' }) + '</td>' +
        '<td><button class="icon-btn" data-ra="row-del" data-i="' + i + '" title="Hapus baris">✕</button></td></tr>';
    }
    var rTimer;
    function rerender() {
      clearTimeout(rTimer);
      rTimer = setTimeout(function () {
        var ae = document.activeElement, k = ae && ae.getAttribute ? ae.getAttribute('data-k') : null;
        renderForm().then(function () { var el = k && document.querySelector('[data-k="' + k + '"]'); if (el) el.focus({ preventScroll: true }); });
      }, 0);
    }
    async function renderForm() {
      R.busy = true;
      try { await renderFormInner(); } finally { R.busy = false; }
    }
    async function renderFormInner() {
      var v = document.getElementById('view');
      var sy = window.scrollY, main = document.querySelector('.main'), my = main ? main.scrollTop : 0;
      if (!R.data) v.innerHTML = '<div class="card card-pad muted">Memuat…</div>';
      try { await load(); } catch (e) { v.innerHTML = '<div class="card card-pad"><b>Gagal memuat</b><div class="small muted">' + esc(e.message) + '</div></div>'; return; }
      if (ctx.route() !== 'terima') return;
      setTimeout(function () { window.scrollTo(0, sy); if (main) main.scrollTop = my; }, 0);
      var d = loadDraft(), h = d.h;
      syncMode(d);
      if (!h.seqManual) h.seq = R.data.seq || FIRST_SEQ;
      var c = calc(d);
      var edit = R.editId ? find(R.editId) : null;
      if (R.editId && !edit) { R.editId = null; edit = null; }
      var hasRej = c.rejected.length > 0;
      try { if (d.reg) await Reg.loadYear(d.reg.y); } catch (e) { /* tetap tampil */ }
      if (!d.reg && !R.editId) {
        v.innerHTML = regCard(d);
        Reg.pickerHtml(R.regQ).then(function (html) { var el = document.getElementById('rcvRegList'); if (el) el.innerHTML = html; }, function (e) { var el = document.getElementById('rcvRegList'); if (el) el.textContent = 'Gagal memuat register: ' + e.message; });
        return;
      }
      v.innerHTML = regCard(d) +
        (edit ? '<div class="card card-pad remind-card"><b>Mengedit ' + esc(docNo(edit, 'bastb') || 'pengajuan') + '</b> (' + esc(edit.status) + ') — ' + esc(h.po || '') + ' · ' + esc(h.vendor || '') + '. <a href="#" data-ra="edit-cancel">Batal edit</a>' +
          (edit.status !== ST.pending && (edit.status !== ST.ok || !ctx.isOwner()) ? '<div class="small" style="margin-top:4px">Setelah <b>Simpan perubahan</b>, status kembali <b>Menunggu Approval</b> dan harus di-approve ulang (tanda tangan sebelumnya dilepas).</div>'
            : edit.status === ST.ok ? '<div class="small" style="margin-top:4px">Status tetap <b>Disetujui</b> &amp; tanda tangan tetap (diedit oleh Owner/Co-Owner).</div>' : '') + '</div>' : '') +
        (!profiles().length ? '<div class="card card-pad remind-card">Belum ada profil penandatangan. Owner / Co-Owner atur di <a href="#/pengaturan">Pengaturan → Tanda tangan &amp; profil penyetuju</a> (nama lengkap, No. ID, jabatan).</div>' : '') +
        '<form id="rcvForm" autocomplete="off" onsubmit="return false">' +
        '<div class="card card-pad rcv-sec"><h4 class="section-title">A. Dokumen Pembelian &amp; Vendor</h4><div class="rcv-grid">' +
        fld('Nomor PO/RO *', inp('h.po', h.po, { cls: 'mono', ph: 'mis. 4300096306' })) +
        fld('Nomor Kontrak/OA', inp('h.oa', h.oa, { cls: 'mono', ph: 'mis. 4720000471 — vendor terisi otomatis' })) +
        fld('Jangka Waktu Kontrak', inp('h.jangka', h.jangka, { ph: 'mis. 2 (DUA) TAHUN' })) +
        fld('Delivery Date (PO/RO) *', inp('h.delivery', h.delivery, { type: 'date', rr: 1 })) +
        fld('Tipe Material', sel('h.tipe', h.tipe, ['Persediaan', 'Non Persediaan'], { rr: 1 })) +
        fld('Partial Quantity diizinkan', sel('h.partial', h.partial, ['Ya', 'Tidak'])) +
        fld('Vendor Commitment', sel('h.commit', h.commit, ['Full Delivery', 'Partial Delivery'])) +
        fld('ID Vendor', inp('h.vendorId', h.vendorId, { cls: 'mono' })) +
        fld('Nama Vendor *', inp('h.vendor', h.vendor, { ph: 'mis. PT. INTI PERKASA TEKNIK' }), 'wide') +
        fld('NPWP/NITKU', inp('h.npwp', h.npwp, { cls: 'mono' })) +
        fld('Email Vendor', inp('h.email', h.email)) +
        fld('Nomor Telp Vendor', inp('h.telp', h.telp)) +
        fld('Entitas Buyer', inp('h.buyer', h.buyer)) +
        '</div></div>' +
        '<div class="card card-pad rcv-sec"><h4 class="section-title">B. Penerimaan &amp; Pemeriksaan</h4><div class="rcv-grid">' +
        fld('Judul Pekerjaan / Perihal *', inp('h.perihal', h.perihal, { ph: 'mis. PEMENUHAN MATERIAL CUP PACKER … REF OA 4720000471' }), 'full') +
        fld('Warehouse / Titik Penerimaan', inp('h.wh', h.wh)) +
        fld('Tanggal Penerimaan Barang *', inp('h.tglTerima', h.tglTerima, { type: 'date', rr: 1 })) +
        fld('Tanggal Pemeriksaan', inp('h.tglPeriksa', h.tglPeriksa, { type: 'date' })) +
        fld('Pengawas Pekerjaan/Pengadaan', inp('h.pengawas', h.pengawas)) +
        fld('Nomor GR', inp('h.gr', h.gr, { cls: 'mono', ph: 'mis. 5013916299' })) +
        fld('Tanggal GR', inp('h.tglGr', h.tglGr, { type: 'date' })) +
        fld('Tanggal BAST', inp('h.tglBast', h.tglBast, { type: 'date' })) +
        fld('Ref. Nomor Surat Jalan', inp('h.sj', h.sj)) +
        fld('Tanggal Pengiriman (Surat Jalan)', inp('h.tglKirim', h.tglKirim, { type: 'date' })) +
        fld('No. urut BASTB / LHPB', inp('h.seq', h.seq, { type: 'number', num: 1, step: '1', cls: 'mono' })) +
        '</div><p class="small muted" style="margin:8px 0 0" id="rcvNoForm">' + noFormHtml(d) + '</p></div>' +
        '<div class="card card-pad rcv-sec"><h4 class="section-title">C. Data Material <span class="small muted">(' + d.items.length + ' baris — tanpa batas; KIMAP terisi otomatis dari data SAP; bisa tempel/paste banyak baris dari Excel)</span></h4>' +
        '<div class="table-wrap"><table class="grid rcv-items"><thead><tr><th>No</th><th>Line No.</th><th>KIMAP</th><th>Deskripsi Material</th><th>Satuan</th><th>Qty PO/RO</th><th>Qty Diterima</th><th>Harga Satuan (IDR)</th><th>% TKDN</th><th>Tgl Jatuh Tempo<div class="small muted">kosong = Delivery Date</div></th><th>Tgl Penerimaan<div class="small muted">kosong = Tgl Terima</div></th><th>Status</th><th>Catatan</th><th></th></tr></thead><tbody>' +
        d.items.map(itemRow).join('') + '</tbody></table></div><datalist id="rcvUom">' + UOMS.map(function (u) { return '<option value="' + u + '">'; }).join('') + '</datalist>' +
        '<div class="toolbar" style="margin-top:8px"><button class="btn sm" data-ra="row-add">+ Tambah baris</button><button class="btn sm" data-ra="row-add" data-n="5">+ 5 baris</button>' +
        '<span class="small muted">Tip: salin kolom dari Excel (Line, KIMAP, Deskripsi, Satuan, Qty PO, Qty Diterima, Harga, % TKDN) lalu tempel di sel pertama.</span></div></div>' +
        '<div class="card card-pad rcv-sec"><h4 class="section-title">D. LHPB — Hasil Pemeriksaan Barang Keseluruhan</h4><div class="rcv-grid">' +
        HASIL.map(function (x) {
          if (x[3] === 'auto') return fld(esc(x[1]), '<div class="rcv-auto" id="rcvAuto_' + x[0] + '">' + esc(hasil(d, c, x[0]) || '—') + ' <span class="small muted">(otomatis)</span></div>');
          return fld(esc(x[1]), sel('lhpb.hasil.' + x[0], (d.lhpb.hasil || {})[x[0]] || '', x[2], { blank: '— (kosong) —' }));
        }).join('') + '</div>' +
        '<div style="margin-top:12px"><b class="small">General Checklist Documents</b> <span class="small muted">(sesuai dokumen yang dipersyaratkan PO/Kontrak)</span></div>' +
        '<table class="grid rcv-check"><thead><tr><th>No</th><th>Dokumen</th><th>Hasil</th><th>Catatan</th><th></th></tr></thead><tbody>' +
        d.lhpb.check.map(function (x, i) {
          return '<tr><td class="c muted">' + (i + 1) + '</td><td>' + inp('lhpb.check.' + i + '.doc', x.doc, { cls: 'sm', list: 'rcvDocs' }) + '</td><td>' + sel('lhpb.check.' + i + '.ok', x.ok, ['Yes', 'No'], { blank: '—' }) + '</td><td>' + inp('lhpb.check.' + i + '.note', x.note, { cls: 'sm' }) + '</td><td><button class="icon-btn" data-ra="chk-del" data-i="' + i + '">✕</button></td></tr>';
        }).join('') + '</tbody></table><datalist id="rcvDocs">' + CHECKLIST.map(function (t) { return '<option value="' + esc(t) + '">'; }).join('') + '</datalist>' +
        (d.lhpb.check.length < 8 ? '<div class="toolbar" style="margin-top:8px"><button class="btn sm" data-ra="chk-add">+ Tambah dokumen</button></div>' : '') +
        fld('Catatan LHPB', '<textarea class="input" rows="2" data-k="lhpb.catatan">' + esc(d.lhpb.catatan || '') + '</textarea>', 'full') + '</div>' +
        '<div class="card card-pad rcv-sec' + (hasRej ? '' : ' rcv-off') + '"><h4 class="section-title">E. SPB — Surat Penolakan Barang ' + (hasRej ? '<span class="badge bad">' + c.rejected.length + ' item ditolak</span>' : '<span class="small muted">(otomatis aktif bila ada item berstatus Ditolak)</span>') + '</h4>' +
        (hasRej ? '<div class="small" style="margin-bottom:6px">Kategori Penolakan:</div><div class="chips">' + KATEGORI.map(function (t) {
          var on = (d.spb.kat || []).indexOf(t) >= 0;
          return '<label class="chip-toggle' + (on ? ' on' : '') + '"><input type="checkbox" data-kat="' + t + '"' + (on ? ' checked' : '') + ' hidden>' + t + '</label>';
        }).join('') + '</div><div class="rcv-grid" style="margin-top:10px">' +
          fld('Alasan Penolakan', '<textarea class="input" rows="2" data-k="spb.alasan">' + esc(d.spb.alasan || '') + '</textarea>', 'full') +
          fld('Rekomendasi Perbaikan', '<textarea class="input" rows="2" data-k="spb.rekom">' + esc(d.spb.rekom || '') + '</textarea>', 'full') +
          fld('Catatan lainnya (Jumlah Koli, No. Kendaraan, dll)', '<textarea class="input" rows="2" data-k="spb.lain">' + esc(d.spb.lain || '') + '</textarea>', 'full') +
          fld('Status Material', sel('spb.stMat', d.spb.stMat, ['Disimpan Sementara di Gudang', 'Dikembalikan ke Vendor'])) +
          fld('Status Dokumen (Surat Jalan, Sertifikat, dll)', sel('spb.stDok', d.spb.stDok, ['Disimpan Sementara di Gudang', 'Dikembalikan ke Vendor'])) + '</div>' : '') + '</div>' +
        '<div class="card card-pad rcv-sec' + (h.telat ? '' : ' rcv-off') + '"><h4 class="section-title">F. Keterlambatan Pengiriman — Form Denda &amp; Stamp</h4>' +
        '<label class="rcv-telat"><input type="checkbox" data-k="h.telat" data-rr' + (h.telat ? ' checked' : '') + '> <b>Material terlambat</b> <span class="small muted">— centang bila vendor terlambat mengirim ke titik penyerahan sesuai delivery date (TKO B7-084 VII.C.2). Bila tidak dicentang, dokumen hanya BASTB &amp; LHPB (+ SPB bila ada yang ditolak).</span></label>' +
        (!h.telat ? (c.rawLate ? '<div class="remind-card card-pad" style="margin-top:10px">Tanggal penerimaan melewati delivery date <b>' + c.rawLate + ' hari</b>. Centang <b>Material terlambat</b> bila memang terlambat sesuai PO/RO.</div>' : '')
          : '<div class="rcv-grid" style="margin-top:10px">' +
          fld('Jumlah hari terlambat', inp('h.hariTelat', h.hariTelat, { type: 'number', num: 1, step: '1', rr: 1, ph: 'otomatis: ' + c.rawLate + ' hari dari tanggal' })) +
          fld('Tarif denda per hari (%)', inp('h.tarif', h.tarif, { type: 'number', num: 1, step: 'any', rr: 1 })) +
          fld('Batas maksimum denda (%)', inp('h.maks', h.maks, { type: 'number', num: 1, step: 'any', rr: 1 })) +
          fld('Hasil', '<div class="rcv-auto">' + (c.late ? 'Terlambat ' + c.lateDays + ' hari · denda Rp ' + idr(c.totDenda) : 'Belum ada hari terlambat') + '</div>') +
          '</div><p class="small muted" style="margin:6px 0 0">Jumlah hari kosong = dihitung otomatis (Tgl Penerimaan − Tgl Jatuh Tempo/Delivery Date, hari kalender). Tarif awal 0,1%/hari &amp; maks. 5% — sesuaikan dengan klausul denda OA/RO/PO. Form Denda &amp; Stamp ikut ter-export.</p>') + '</div>' +
        '<div class="card card-pad rcv-sec"><h4 class="section-title">G. Penandatangan</h4>' +
        (d.sign.mode === 'big' ? '<div class="remind-card card-pad" style="margin-bottom:8px">Nilai diterima <b>&gt; Rp 1 Miliar</b> — LHPB diperiksa <b>Gerald &amp; Devy Andriany</b>, BASTB ditandatangani <b>Devy Andriany</b> &amp; Vendor (otomatis, masih bisa diubah).</div>'
          : d.sign.mode === 'np' ? '<div class="remind-card card-pad" style="margin-bottom:8px"><b>Non Persediaan (Direct Charge)</b> — BASTB: Seto Agustian &amp; Vendor · LHPB: Pemeriksa 1 <b>User</b> (isi nama, jabatan, fungsi) &amp; Pemeriksa 2 Seto Agustian. Approval cukup oleh <b>Seto Agustian</b>.</div>' : '') +
        '<p class="small muted" style="margin-top:0">Pilih dari profil Owner/Co-Owner — tanda tangannya tertempel otomatis setelah orang tersebut approve / ikut tanda tangan. Pilih "Kosong" untuk tanda tangan basah.</p>' +
        ['BASTB', 'LHPB', 'SPB', 'Denda'].map(function (g) {
          return '<div class="rcv-sign-g"><b>' + (g === 'Denda' ? 'Form Denda' : g) + '</b><div class="rcv-slots">' + SLOTS.filter(function (s) { return s.doc === g; }).map(function (s) { return slotHtml(d, s); }).join('') +
            (g === 'BASTB' ? '<div class="rcv-slot"><span class="rcv-slot-t">Vendor (Pejabat Berwenang) — juga "Diterima Oleh" di SPB</span><div class="rcv-slot-m">' + inp('sign.vendor.name', (d.sign.vendor || {}).name, { ph: 'Nama pejabat vendor' }) + inp('sign.vendor.jab', (d.sign.vendor || {}).jab, { ph: 'Jabatan' }) + '</div></div>' : '') + '</div></div>';
        }).join('') + '</div>' +
        '<div class="card card-pad rcv-sum" id="rcvSum">' + sumHtml(d, c) + '</div>' +
        '<div class="card card-pad toolbar rcv-actions"><button class="btn" data-ra="reset">Kosongkan form</button><span class="small muted rcv-saved" id="rcvSaved">' + savedHtml() + '</span><span class="spacer"></span>' +
        '<button class="btn" data-ra="preview">Preview PDF</button><button class="btn primary" data-ra="submit">' + (edit ? 'Simpan perubahan' : 'Ajukan (Approval Owner / Co-Owner)') + '</button></div></form>';
    }
    function noFormHtml(d) {
      var nb = numbers(num(d.h.seq) || R.data.seq || FIRST_SEQ, d.h.tglBast || d.h.tglTerima);
      return 'Nomor otomatis (urut berikutnya, bisa diedit): BASTB <b class="mono">' + esc(nb.bastb) + '</b> · LHPB <b class="mono">' + esc(nb.lhpb) + '</b>' +
        ' <span class="muted">(SPB &amp; Form Denda memakai nomor urut yang sama). Nomor yang sudah dipakai lalu dihapus tidak dipakai ulang.</span>';
    }
    function sumHtml(d, c) {
      var kv = function (k, v, cls) { return '<div><span>' + k + '</span><b' + (cls ? ' class="' + cls + '"' : '') + '>' + v + '</b></div>'; };
      return '<h4 class="section-title" style="margin-top:0">Ringkasan otomatis</h4><div class="kv">' +
        kv('Jumlah item', c.n || '—') + kv('Total (Qty Diterima)', 'Rp ' + idr(c.totRc)) + kv('Total PO/RO', 'Rp ' + idr(c.totPo)) +
        kv('Status penyerahan', c.status ? (c.late ? 'Terlambat ' + c.lateDays + ' hari' : 'Tidak terlambat') : '—', c.late ? 'txt-bad' : '') +
        kv('Total denda', 'Rp ' + idr(c.totDenda), c.totDenda ? 'txt-bad' : '') + kv('Kesimpulan LHPB', c.kesimpulan || '—') +
        kv('Dokumen', ['BASTB', 'LHPB'].concat(c.rejected.length ? ['SPB'] : []).concat(c.telat ? ['Form Denda'] : []).concat(c.late ? ['Stamp'] : []).join(' · ')) + '</div>';
    }
    function refreshSum() {
      var d = R.draft;
      if (syncMode(d)) { storeDraft(); rerender(); toast(d.sign.mode === 'big' ? 'Nilai diterima > Rp 1 M — penandatangan BASTB & LHPB diganti ke Devy Andriany' : 'Nilai diterima ≤ Rp 1 M — penandatangan BASTB & LHPB kembali normal'); return; }
      var c = calc(d), box = document.getElementById('rcvSum');
      if (box) box.innerHTML = sumHtml(d, c);
      var nf = document.getElementById('rcvNoForm'); if (nf) nf.innerHTML = noFormHtml(d);
      ['jumlah', 'waktu'].forEach(function (k) { var el = document.getElementById('rcvAuto_' + k); if (el) el.innerHTML = esc(hasil(d, c, k) || '—') + ' <span class="small muted">(otomatis)</span>'; });
    }
    // isi otomatis dari data SAP
    function lookupOA(d) {
      var oa = String(d.h.oa || '').trim(), o = S.idx && S.idx.oaMap ? S.idx.oaMap.get(oa) : null;
      if (!o) return false;
      if (!d.h.vendor) d.h.vendor = o.vendor || '';
      if (!d.h.vendorId) d.h.vendorId = o.vendorCode || '';
      if (!d.h.jangka && o.vs && o.ve) d.h.jangka = dot(o.vs) + ' s/d ' + dot(o.ve);
      lookupVendor(d);
      d.items.forEach(function (it) { priceFromOA(d, it); });
      return true;
    }
    function lookupVendor(d) {
      var V = (R.data && R.data.vendors) || {}, v = V[d.h.vendorId] || V['N:' + String(d.h.vendor || '').toUpperCase()];
      if (!v) return false;
      ['vendorId', 'npwp', 'email', 'telp'].forEach(function (k) { if (!d.h[k] && v[k]) d.h[k] = v[k]; });
      if (!d.h.vendor && v.vendor) d.h.vendor = v.vendor;
      return true;
    }
    function priceFromOA(d, it) {
      var o = S.idx && S.idx.oaMap ? S.idx.oaMap.get(String(d.h.oa || '').trim()) : null;
      if (!o || !it.m || has(it.price)) return;
      var ln = o.lines.filter(function (l) { return l.m === it.m; })[0];
      if (ln && ln.price) it.price = ln.price;
    }
    function lookupMat(d, it) {
      var o = S.idx && S.idx.mats ? S.idx.mats.get(String(it.m || '').trim().toUpperCase()) : null;
      if (o) { it.m = o.m; if (!it.d) it.d = o.d; if (!it.u) it.u = o.u; }
      priceFromOA(d, it);
      return !!o;
    }

    function validate(d, c) {
      var miss = [];
      if (!d.reg && !R.editId) miss.push('Register Receiving');
      if (!d.h.po) miss.push('Nomor PO/RO');
      if (!d.h.vendor) miss.push('Nama Vendor');
      if (!d.h.perihal) miss.push('Perihal');
      if (!d.h.tglTerima) miss.push('Tanggal Penerimaan');
      if (!d.h.delivery) miss.push('Delivery Date');
      if (!c.n) miss.push('minimal 1 material');
      if (c.rows.some(function (x) { return !x.d || !has(x.qpo) || !has(x.qrc); })) miss.push('Deskripsi, Qty PO/RO & Qty Diterima tiap material');
      return miss;
    }
    async function submit() {
      var d = R.draft, c = calc(d), miss = validate(d, c);
      if (miss.length) { toast('Lengkapi: ' + miss.join(', '), true); return; }
      if (c.rejected.length && !d.spb.alasan) { toast('Isi Alasan Penolakan untuk SPB', true); return; }
      var body = clone(d);
      body.items = body.items.filter(function (it) { return it.d || it.m; });
      var editId = R.editId, id = editId || ('T' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)), at = new Date().toISOString(), lost = false, dupNo = '', reapp = false;
      if (d.h.seqManual && !(num(d.h.seq) > 0)) { toast('Isi No. urut dokumen', true); return; }
      loading(editId ? 'Menyimpan perubahan…' : 'Mengajukan penerimaan barang…');
      try {
        await save(function (D) {
          // nomor urut: otomatis = nomor berikutnya terbaru (aman bila 2 orang mengajukan bersamaan); manual = sesuai isian
          var dt = body.h.tglBast || body.h.tglTerima, prev = editId ? (D.list.filter(function (x) { return x.id === editId; })[0] || {}).no : null;
          var used = function (n) { var b = numbers(n, dt).bastb; return D.list.some(function (x) { return x.id !== id && x.no && x.no.bastb === b; }); };
          var seq;
          if (body.h.seqManual) seq = Math.round(num(body.h.seq));
          else { seq = D.seq || FIRST_SEQ; while (used(seq)) seq++; }
          var nb = numbers(seq, dt);
          if (used(seq)) { dupNo = nb.bastb; throw new Error('Nomor ' + nb.bastb + ' sudah dipakai penerimaan lain — ganti No. urut'); }
          body.no = nb; body.h.seq = seq;
          // nomor diisi manual (mis. mulai 0001) → urutan otomatis berikutnya melanjutkan dari nomor itu; nomor terhapus tidak dipakai ulang
          D.seq = body.h.seqManual && !(prev && prev.seq === seq) ? seq + 1 : Math.max(D.seq || FIRST_SEQ, seq + 1);
          var vkey = body.h.vendorId || ('N:' + String(body.h.vendor).toUpperCase());
          D.vendors[vkey] = { vendor: body.h.vendor, vendorId: body.h.vendorId || '', npwp: body.h.npwp || '', email: body.h.email || '', telp: body.h.telp || '' };
          if (editId) {
            var ok = false;
            D.list = D.list.map(function (x) {
              if (x.id !== editId) return x;
              ok = true;
              var nx = Object.assign({}, x, body, { updatedBy: me(), updatedAt: at });
              // Receiving mengubah dokumen yang sudah disetujui (atau dokumen ditolak/dibatalkan) → kembali Menunggu Approval
              if (x.status !== ST.pending && (x.status !== ST.ok || !ctx.isOwner())) {
                reapp = true;
                nx.status = ST.pending; nx.signed = {}; nx.reapprove = true; nx.reapproveFrom = x.status;
                delete nx.approvedBy; delete nx.approvedById; delete nx.approvedAt; delete nx.rejectBy; delete nx.rejectNote;
              }
              return nx;
            });
            lost = !ok;
          } else {
            D.list.push(Object.assign({ id: id, status: ST.pending, createdBy: me(), createdById: S.user.id, createdAt: at }, body));
          }
          return D;
        }, editId ? 'Penerimaan barang: ubah ' + body.h.po + ' (' + me() + ')' : 'Penerimaan barang: pengajuan PO ' + body.h.po + ' ' + body.h.vendor + ' (' + me() + ')');
        if (dupNo) { toast('Nomor ' + dupNo + ' sudah dipakai penerimaan lain — ganti No. urut', true); return; }
        if (lost) { toast('Data sudah dihapus orang lain — perubahan tidak tersimpan', true); }
        else toast(editId ? (reapp ? 'Perubahan disimpan — menunggu approval ulang' : 'Perubahan disimpan') : 'Diajukan — menunggu approval ' + (reqApprover(body) ? (profile(reqApprover(body)) || {}).name || 'Owner / Co-Owner' : 'Owner / Co-Owner'));
        clearDraft();
        location.hash = '#/terima-riwayat';
      } catch (e) { toast(dupNo ? e.message : 'Gagal menyimpan: ' + e.message, true); }
      finally { loading(false); }
    }

    // ================= Section 2: Riwayat Penerimaan Barang =================
    async function renderHistory(force) {
      var v = document.getElementById('view');
      v.innerHTML = '<div class="card card-pad muted">Memuat riwayat penerimaan…</div>';
      try { await load(force); } catch (e) { v.innerHTML = '<div class="card card-pad"><b>Gagal memuat</b><div class="small muted">' + esc(e.message) + '</div></div>'; return; }
      if (ctx.route() !== 'terima-riwayat') return;
      var all = R.data.list.slice().sort(function (a, b) { return ((b.h.tglTerima || '') + b.createdAt).localeCompare((a.h.tglTerima || '') + a.createdAt); });
      var months = {}; all.forEach(function (r) { months[String(r.h.tglTerima || '').slice(0, 7)] = 1; });
      var base = all.filter(function (r) {
        if (R.month && String(r.h.tglTerima || '').slice(0, 7) !== R.month) return false;
        var q = R.q.trim().toLowerCase();
        if (q && [r.h.po, r.h.oa, r.h.vendor, r.h.perihal, r.h.gr, r.no && r.no.bastb, r.createdBy].concat((r.items || []).map(function (x) { return x.m + ' ' + x.d; })).join(' ').toLowerCase().indexOf(q) < 0) return false;
        return true;
      });
      var tabs = ['Semua', ST.pending, ST.ok, 'Terlambat', ST.no, ST.cancel];
      var cnt = function (t) { return base.filter(function (r) { return t === 'Semua' || (t === 'Terlambat' ? calc(r).late && r.status !== ST.cancel : r.status === t); }).length; };
      var list = base.filter(function (r) { return R.filt === 'Semua' || (R.filt === 'Terlambat' ? calc(r).late && r.status !== ST.cancel : r.status === R.filt); });
      var mySign = R.signs.users[S.user.id], regHtml = await Reg.sectionHtml();
      if (ctx.route() !== 'terima-riwayat') return;
      v.innerHTML = regHtml + '<h3 class="rcv-h2">BASTB &amp; LHPB</h3>' + (canApprove() && (!mySign || !mySign.full) ? '<div class="card card-pad remind-card">Lengkapi <b>nama lengkap, No. ID, jabatan &amp; tanda tangan</b> Anda di <a href="#/pengaturan">Pengaturan → Tanda tangan &amp; profil penyetuju</a> agar tertempel di BASTB/LHPB/SPB/Form Denda.</div>' : '') +
        '<div class="card card-pad toolbar" style="margin-bottom:14px">' +
        '<select class="select" id="rcvMonth"><option value="">Semua bulan</option>' + Object.keys(months).filter(Boolean).sort().reverse().map(function (m) { return '<option value="' + m + '"' + (R.month === m ? ' selected' : '') + '>' + BLN[+m.slice(5) - 1] + ' ' + m.slice(0, 4) + '</option>'; }).join('') + '</select>' +
        '<input class="input" id="rcvQ" style="flex:1;min-width:200px" placeholder="Cari PO, OA, vendor, KIMAP, nomor BASTB…" value="' + esc(R.q) + '">' +
        '<button class="btn" data-ra="refresh">Muat ulang</button><a class="btn primary" href="#/terima">+ Penerimaan baru</a>' +
        '<span class="reg-dl"><span class="small muted">Rekap Excel:</span><button class="btn sm" data-ra="rekap" data-v="month"' + (R.month ? '' : ' disabled title="Pilih bulan dulu"') + '>Bulan</button>' +
        '<button class="btn sm" data-ra="rekap" data-v="year">Tahun ' + rekapYear() + '</button><button class="btn sm" data-ra="rekap" data-v="all">Seluruh tahun</button></span></div>' +
        '<div class="card"><div class="card-pad fleet-statbar"><div class="chips">' + tabs.map(function (t) {
          return '<button class="chip-toggle' + (R.filt === t ? ' on' : '') + '" data-ra="tab" data-v="' + esc(t) + '">' + esc(t === 'Semua' ? 'Semua' : t) + ' <span class="chip-n">' + cnt(t) + '</span></button>';
        }).join('') + '<span class="small muted" style="margin-left:auto">Menampilkan <b>' + list.length + '</b> dari ' + all.length + ' penerimaan</span></div></div>' +
        (list.length ? '<div class="table-wrap"><table class="grid rcv-table"><thead><tr><th>No. BASTB / Tgl Terima</th><th>PO/RO · OA</th><th>Vendor</th><th>Material</th><th class="num">Nilai (IDR)</th><th>Penyerahan</th><th>Status</th><th></th></tr></thead><tbody>' +
          list.map(rowHtml).join('') + '</tbody></table></div>'
          : '<div class="empty" style="padding:28px"><h3>Belum ada penerimaan</h3><p>Isi form di <a href="#/terima">Penerimaan Barang</a> lalu ajukan untuk approval.</p></div>') + '</div>';
    }
    function rowHtml(r) {
      var c = calc(r), first = c.rows[0] || {}, acts = [];
      var myUid = S.user.id, mine = R.signs.users[myUid];
      acts.push('<button class="btn sm" data-ra="export" data-id="' + esc(r.id) + '">' + (r.status === ST.ok ? 'Export' : 'Preview') + '</button>');
      if (r.status === ST.pending && canApproveRec(r)) acts.unshift('<button class="btn sm primary" data-ra="approve" data-id="' + esc(r.id) + '">Approve</button><button class="btn sm" data-ra="reject" data-id="' + esc(r.id) + '">Tolak</button>');
      if (canRcv()) acts.push('<button class="btn sm" data-ra="edit" data-id="' + esc(r.id) + '">Edit</button>');
      if (r.status === ST.pending && (r.createdById === myUid || canRcv())) acts.push('<button class="btn sm" data-ra="cancel" data-id="' + esc(r.id) + '">Batalkan</button>');
      if (r.status === ST.ok && mine && mine.img && slotUids(r).indexOf(myUid) >= 0 && !(r.signed || {})[myUid]) acts.unshift('<button class="btn sm primary" data-ra="cosign" data-id="' + esc(r.id) + '">' + (((r.sign || {}).bastb || {}).uid === myUid ? 'Approve BASTB &amp; tanda tangani' : 'Tanda tangani') + '</button>');
      if (canRcv()) acts.push('<button class="btn sm danger" data-ra="delete" data-id="' + esc(r.id) + '" title="Hapus permanen (Receiving / Owner / Co-Owner)">Hapus</button>');
      var signedNames = Object.keys(r.signed || {}).map(function (u) { var p = profile(u); return p ? p.short || p.name : ''; }).filter(Boolean);
      return '<tr><td><b class="mono">' + esc(docNo(r, 'bastb') || '—') + '</b><div class="small">' + esc(dot(r.h.tglTerima)) + '</div>' + (r.reg ? '<div class="small muted mono">Reg ' + esc(Reg.regLabel(r.reg)) + '</div>' : '') + '</td>' +
        '<td class="mono">' + esc(r.h.po) + (r.h.oa ? '<div class="small muted">OA ' + esc(r.h.oa) + '</div>' : '') + '</td>' +
        '<td>' + esc(r.h.vendor) + '<div class="small muted">' + esc(r.h.perihal || '') + '</div></td>' +
        '<td><b>' + c.n + '</b> item<div class="small muted">' + esc(qty(first.qrc) + ' ' + (first.u || '') + ' ' + (first.d || '')) + (c.n > 1 ? ' …' : '') + '</div>' +
        (c.rejected.length ? '<span class="badge bad">' + c.rejected.length + ' ditolak</span>' : '') + '</td>' +
        '<td class="num">' + idr(c.totRc) + '</td>' +
        '<td>' + (c.late ? '<span class="badge bad">Terlambat ' + c.lateDays + ' hr</span><div class="small muted">Denda Rp ' + idr(c.totDenda) + '</div>' : '<span class="badge ok">Tepat waktu</span>') + '</td>' +
        '<td>' + badge(r.status) + (r.status === ST.pending && r.reapprove ? '<div><span class="badge warn">Diedit — perlu approve ulang</span></div>' : '') +
        (r.status === ST.pending && reqApprover(r) ? '<div class="small muted">Approval: ' + esc((profile(reqApprover(r)) || {}).name || '') + ' (Non Persediaan)</div>' : '') + (r.updatedBy ? '<div class="small muted">Last edit: ' + esc(r.updatedBy) + ' · ' + esc(fmtTime(r.updatedAt)) + '</div>' : '') + (r.status === ST.ok && !bastbOk(r) ? '<div><span class="badge warn">BASTB menunggu ' + esc(who(r, 'bastb').name) + '</span></div>' : '') + '<div class="small muted">' + esc(r.status === ST.ok ? 'Approve: ' + signedNames.join(', ') : r.status === ST.no ? (r.rejectBy || '') + (r.rejectNote ? ': ' + r.rejectNote : '') : 'oleh ' + (r.createdBy || '') + ' · ' + fmtTime(r.createdAt)) + '</div></td>' +
        '<td><div class="fleet-acts">' + acts.join('') + '</div></td></tr>';
    }

    // ---------- Approve / tanda tangan ----------
    function drawerOpen(html) {
      var d = $('#drawer'); d.innerHTML = html;
      d.classList.add('open'); d.setAttribute('aria-hidden', 'false'); $('#scrim').classList.add('open');
    }
    function openApprove(id) {
      var r = find(id), sg = R.signs.users[S.user.id];
      if (!r || !canApproveRec(r)) return;
      if (!sg || !sg.img) { toast('Atur tanda tangan & profil Anda dulu di Pengaturan', true); location.hash = '#/pengaturan'; return; }
      var c = calc(r), seq = r.no && r.no.seq ? r.no.seq : (R.data.seq || FIRST_SEQ), nb = numbers(seq, r.h.tglBast || r.h.tglTerima);
      var mySlots = SLOTS.filter(function (s) { return s.k !== 'bastb' && ((r.sign || {})[s.k] || {}).uid === S.user.id; }).map(function (s) { return s.doc + ' ' + s.t; });
      var myBastb = ((r.sign || {}).bastb || {}).uid === S.user.id;
      drawerOpen('<div class="drawer-head"><div style="flex:1"><div class="mono muted">Approval Penerimaan Barang</div><h2>' + esc(r.h.vendor) + '</h2></div><button class="icon-btn" data-act="close-drawer">✕</button></div>' +
        '<div class="drawer-body">' +
        '<div class="kv"><div><span>PO/RO</span><b>' + esc(r.h.po) + '</b></div><div><span>OA</span><b>' + esc(r.h.oa || '—') + '</b></div><div><span>Tgl terima</span><b>' + esc(dot(r.h.tglTerima)) + '</b></div><div><span>Delivery date</span><b>' + esc(dot(r.h.delivery)) + '</b></div>' +
        '<div><span>Penyerahan</span><b class="' + (c.late ? 'txt-bad' : '') + '">' + (c.late ? 'Terlambat ' + c.lateDays + ' hari' : 'Tepat waktu') + '</b></div><div><span>Denda</span><b>Rp ' + idr(c.totDenda) + '</b></div><div><span>Kesimpulan</span><b>' + esc(c.kesimpulan) + '</b></div><div><span>Diajukan</span><b>' + esc(r.createdBy) + '</b></div></div>' +
        '<table class="grid"><thead><tr><th>No</th><th>KIMAP</th><th>Deskripsi</th><th class="num">PO</th><th class="num">Terima</th><th>Status</th></tr></thead><tbody>' +
        c.rows.map(function (x) { return '<tr><td>' + x.no + '</td><td class="mono">' + esc(x.m || '') + '</td><td>' + esc(x.d) + '</td><td class="num">' + qty(x.qpo) + '</td><td class="num">' + qty(x.qrc) + ' ' + esc(x.u || '') + '</td><td>' + esc(x.st || '') + '</td></tr>'; }).join('') + '</tbody></table>' +
        '<label class="fleet-fld"><span>Nomor urut dokumen</span><input class="input mono" id="rcvSeq" type="number" min="1" value="' + seq + '"></label>' +
        '<div class="small muted" id="rcvNoPrev">' + noPreview(nb, c) + '</div>' +
        (myBastb ? '<div class="small" style="margin:6px 0"><b>BASTB:</b> approve Anda menghapus tanda DRAFT di BASTB (tanpa tempel tanda tangan).</div>' : (((r.sign || {}).bastb || {}).uid ? '<div class="small muted" style="margin:6px 0">BASTB tetap DRAFT sampai di-approve ' + esc(who(r, 'bastb').name) + '.</div>' : '')) +
        '<div class="sign-preview"><div class="small muted">Tanda tangan Anda tertempel di: ' + esc(mySlots.join(', ') || '— (tidak ada slot tanda tangan Anda; ubah di Edit bila perlu)') + '</div><img src="' + sg.img + '" alt="Tanda tangan"><b>' + esc(sg.full || sg.name) + '</b><div class="small muted">' + esc(sg.jab || '') + '</div></div>' +
        '<div class="toolbar"><button class="btn primary" data-ra="approve-do" data-id="' + esc(r.id) + '">Approve &amp; tempel tanda tangan</button><button class="btn" data-ra="export" data-id="' + esc(r.id) + '">Preview</button></div></div>');
    }
    function noPreview(nb, c) {
      return 'BASTB <b class="mono">' + esc(nb.bastb) + '</b> · LHPB <b class="mono">' + esc(nb.lhpb) + '</b>' + (c.rejected.length ? ' · SPB <b class="mono">' + esc(nb.spb) + '</b>' : '') + ' · Denda <b class="mono">' + esc(nb.denda) + '</b>';
    }
    async function approve(id) {
      var r = find(id), seq = parseInt($('#rcvSeq').value, 10);
      if (r && !canApproveRec(r)) { toast('Non Persediaan hanya bisa di-approve ' + (profile(reqApprover(r)) || {}).name, true); return; }
      if (!r || !(seq > 0)) { toast('Isi nomor urut', true); return; }
      var nb = numbers(seq, r.h.tglBast || r.h.tglTerima), at = new Date().toISOString(), dup = false, uid = S.user.id;
      loading('Menyimpan approval…');
      try {
        await save(function (D) {
          dup = D.list.some(function (x) { return x.id !== id && x.no && x.no.bastb === nb.bastb; });
          if (dup) return D;
          D.list = D.list.map(function (x) {
            if (x.id !== id || x.status !== ST.pending) return x;
            var sg = {}; sg[uid] = at;
            return Object.assign({}, x, { status: ST.ok, no: nb, approvedBy: me(), approvedById: uid, approvedAt: at, signed: sg, reapprove: false });
          });
          D.seq = Math.max(D.seq || FIRST_SEQ, seq + 1);
          return D;
        }, 'Penerimaan barang: approve ' + nb.bastb + (((r.sign || {}).bastb || {}).uid && r.sign.bastb.uid !== uid ? ' [BASTB menunggu]' : '') + ' (' + me() + ')');
        if (dup) { toast('Nomor ' + nb.bastb + ' sudah dipakai', true); return; }
        ctx.closeDrawer();
        toast('Disetujui — ' + nb.bastb);
        var rr = find(id); if (rr) openExport(rr.id);
      } catch (e) { toast('Gagal approve: ' + e.message, true); }
      finally { loading(false); if (ctx.route() === 'terima-riwayat') renderHistory(); }
    }
    async function cosign(id) {
      var uid = S.user.id, at = new Date().toISOString();
      loading('Menempel tanda tangan…');
      try {
        await save(function (D) {
          D.list = D.list.map(function (x) {
            if (x.id !== id || x.status !== ST.ok) return x;
            var sg = Object.assign({}, x.signed || {}); sg[uid] = at;
            return Object.assign({}, x, { signed: sg });
          });
          return D;
        }, 'Penerimaan barang: tanda tangan ' + me());
        toast('Tanda tangan Anda sudah tertempel');
      } catch (e) { toast('Gagal: ' + e.message, true); }
      finally { loading(false); renderHistory(); }
    }
    async function setStatus(id, st, extra, msg) {
      loading('Menyimpan…');
      try {
        await save(function (D) {
          D.list = D.list.map(function (x) { return x.id === id && x.status === ST.pending ? Object.assign({}, x, { status: st, updatedBy: me(), updatedAt: new Date().toISOString() }, extra || {}) : x; });
          return D;
        }, 'Penerimaan barang: ' + st.toLowerCase() + ' ' + id + ' (' + me() + ')');
        toast(msg);
      } catch (e) { toast('Gagal: ' + e.message, true); }
      finally { loading(false); renderHistory(); }
    }
    async function remove(r) {
      if (!canRcv()) return;
      if (!confirm('Hapus permanen penerimaan ' + (docNo(r, 'bastb') || r.h.po) + ' (' + r.h.vendor + ')?')) return;
      loading('Menghapus…');
      try {
        await save(function (D) { D.list = D.list.filter(function (x) { return x.id !== r.id; }); return D; }, 'Penerimaan barang: hapus ' + (docNo(r, 'bastb') || r.id) + ' (' + me() + ')');
        toast('Dihapus');
        if (ctx.audit) ctx.audit('Penerimaan Barang', (docNo(r, 'bastb') || 'Draft') + ' · PO ' + (r.h.po || '') + ' · ' + (r.h.vendor || '') + ' · ' + r.status, r);
      } catch (e) { toast('Gagal menghapus: ' + e.message, true); }
      finally { loading(false); renderHistory(); }
    }
    function startEdit(id) {
      var r = find(id);
      if (!r || !canRcv()) return;
      var d = newDraft();
      ['h', 'items', 'lhpb', 'spb', 'sign', 'reg'].forEach(function (k) { if (r[k]) d[k] = clone(r[k]); });
      if (r.no && r.no.seq) { d.h.seq = r.no.seq; d.h.seqManual = true; }
      d.sign.mode = modeOf(d); // pertahankan penandatangan yang tersimpan
      if (!d.items.length) d.items = [{ line: '1', st: 'Diterima' }];
      R.draft = d; R.editId = id; storeDraft();
      location.hash = '#/terima';
    }

    // ---------- Export: pilih dokumen & format ----------
    function avail(r, c) { return { bastb: true, spb: c.rejected.length > 0, lhpb: true, denda: c.telat, stamp: c.late }; }
    function openExport(id) {
      var r = find(id) || (id === 'draft' ? R.previewRec : null);
      if (!r) return;
      var c = calc(r), av = avail(r, c);
      drawerOpen('<div class="drawer-head"><div style="flex:1"><div class="mono muted">' + esc(docNo(r, 'bastb') || 'Draft — belum di-approve') + '</div><h2>Export dokumen penerimaan</h2></div><button class="icon-btn" data-act="close-drawer">✕</button></div>' +
        '<div class="drawer-body"><div class="small muted">' + esc(r.h.vendor) + ' · PO ' + esc(r.h.po) + (r.status !== ST.ok ? ' · <b>' + esc(r.status || 'Draft') + '</b> — dokumen diberi tanda DRAFT' : '') + '</div>' +
        '<div class="rcv-docs">' + DOCS.map(function (x) {
          var on = av[x.k];
          return '<label class="rcv-doc' + (on ? '' : ' off') + '"><input type="checkbox" data-doc="' + x.k + '"' + (on ? ' checked' : ' disabled') + '><b>' + esc(x.t) + '</b><span class="small muted">' + esc(x.full) +
            (!on ? (x.k === 'spb' ? ' — tidak ada barang ditolak' : ' — "Material terlambat" tidak dicentang') : '') + '</span></label>';
        }).join('') + '</div>' +
        '<div class="toolbar"><button class="btn primary" data-ra="pdf" data-id="' + esc(r.id) + '">Download PDF</button><button class="btn" data-ra="xlsx" data-id="' + esc(r.id) + '">Download Excel</button></div></div>');
    }
    function chosenDocs() {
      var o = {}; Array.prototype.forEach.call(document.querySelectorAll('#drawer [data-doc]'), function (el) { if (el.checked && !el.disabled) o[el.getAttribute('data-doc')] = 1; });
      return o;
    }
    function fileBase(r) { return 'Penerimaan_' + String(docNo(r, 'bastb') || ('DRAFT_' + (r.h.po || r.id))).replace(/[\/\\\s]+/g, '_'); }

    // ---------- gambar: logo PHE, stamp keterlambatan ----------
    async function dataUrl(path) {
      if (R.img[path]) return R.img[path];
      var b = await (await fetch(path)).blob();
      R.img[path] = await new Promise(function (res) { var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.readAsDataURL(b); });
      return R.img[path];
    }
    function loadImg(src) { return new Promise(function (res, rej) { var i = new Image(); i.onload = function () { res(i); }; i.onerror = rej; i.src = src; }); }
    // Stamp Lampiran 7 dengan jumlah hari terlambat ditulis di garis kosong
    async function stampImg(daysLate) {
      var key = 'stamp:' + daysLate;
      if (R.img[key]) return R.img[key];
      var im = await loadImg(await dataUrl('assets/terima/stamp.png'));
      var cv = document.createElement('canvas'); cv.width = im.naturalWidth; cv.height = im.naturalHeight;
      var g = cv.getContext('2d'); g.drawImage(im, 0, 0);
      var sx = cv.width / 400;
      g.fillStyle = '#b8463a'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
      g.font = 'bold ' + Math.round(28 * sx) + 'px "Arial Narrow", Arial, sans-serif';
      g.fillText(String(daysLate), 200 * sx, 284 * sx);
      R.img[key] = cv.toDataURL('image/png');
      return R.img[key];
    }

    // ================= PDF (A4 portrait, mengikuti form Lampiran 3–7) =================
    function pdfKit(doc, r, lg, draft) {
      var W = 595.28, H = 841.89, L = 36, RR = W - 36, CW = RR - L, BOT = H - 40;
      var K = { doc: doc, L: L, R: RR, W: CW, y: 0, page: 0, draft: draft };
      K.font = function (sz, st) { doc.setFont('helvetica', st || 'normal'); doc.setFontSize(sz); };
      K.wrap = function (t, w, sz) { if (sz) doc.setFontSize(sz); return doc.splitTextToSize(String(t == null ? '' : t), Math.max(4, w)); };
      K.footer = function (lamp) {
        K.font(6.5, 'italic'); doc.setTextColor(120);
        doc.text(lamp + ' · Revisi Ke-0', L, 24);
        doc.text('Dicetak dari Material Warehouse & Heavy Transport — SCM Field Rantau', L, H - 18);
        doc.setTextColor(0);
        if (K.draft) {
          doc.setTextColor(210, 50, 50); K.font(K.draft.length > 32 ? 19 : 34, 'bold');
          doc.text(K.draft, W / 2, H / 2, { align: 'center', angle: 30 });
          doc.setTextColor(0);
        }
      };
      // kepala form: logo PHE + judul, garis bawah
      K.head = function (t1, t2, lamp) {
        if (K.page++) doc.addPage('a4', 'portrait');
        K.lamp = lamp; K.footer(lamp);
        var top = 32;
        doc.setDrawColor(0); doc.setLineWidth(0.7);
        doc.rect(L, top, CW, 50);
        doc.addImage(lg, 'PNG', L + 8, top + 9, 108, 32.6);
        K.font(t2 ? 12 : 12.5, 'bold');
        var cx = L + 125 + (CW - 125) / 2;
        if (t2) { doc.text(t1, cx, top + 21, { align: 'center' }); doc.text(t2, cx, top + 37, { align: 'center' }); }
        else doc.text(t1, cx, top + 29, { align: 'center' });
        K.y = top + 50 + 10;
        doc.setLineWidth(0.5);
      };
      K.need = function (h) {
        if (K.y + h <= BOT) return;
        var f = doc.getFont(), fs = doc.getFontSize(), lw = doc.getLineWidth();
        doc.addPage('a4', 'portrait'); K.page++; K.footer(K.lamp); K.y = 40;
        doc.setFont(f.fontName, f.fontStyle); doc.setFontSize(fs); doc.setTextColor(0); doc.setLineWidth(lw);
      };
      K.para = function (t, o) {
        o = o || {};
        var x = L + (o.indent || 0), w = CW - (o.indent || 0), sz = o.sz || 8;
        K.font(sz, o.bold ? 'bold' : 'normal');
        var lines = K.wrap(t, w);
        K.need(lines.length * sz * 1.25 + 2);
        lines.forEach(function (ln) { doc.text(ln, x, K.y + sz); K.y += sz * 1.25; });
        K.y += o.after == null ? 3 : o.after;
      };
      // tabel label | nilai (bergaris)
      K.kv = function (rows, lw, sz) {
        sz = sz || 8; lw = lw || 120;
        rows.forEach(function (row) {
          K.font(sz, 'normal');
          var lines = K.wrap(row[1], CW - lw - 6), h = Math.max(13, lines.length * sz * 1.2 + 4.5);
          K.need(h);
          doc.rect(L, K.y, lw, h); doc.rect(L + lw, K.y, CW - lw, h);
          K.font(sz, 'bold'); doc.text(row[0], L + 3, K.y + sz + 2.2);
          K.font(sz, 'normal'); lines.forEach(function (ln, i) { doc.text(ln, L + lw + 3, K.y + sz + 2.2 + i * sz * 1.2); });
          K.y += h;
        });
      };
      K.check = function (x, y, on, s) {
        s = s || 7; doc.setLineWidth(0.5); doc.rect(x, y, s, s);
        if (on) { doc.setLineWidth(1); doc.lines([[s * 0.22, s * 0.28], [s * 0.45, -s * 0.62]], x + s * 0.18, y + s * 0.5); doc.setLineWidth(0.5); }
      };
      // tabel umum. cols: [{t, w, a}] (w relatif), rows: [[cell]]; cell = teks | {t, a, b, chk}
      K.table = function (cols, rows, o) {
        o = o || {};
        var sz = o.sz || 7.6, hs = o.hsz || 7.6, tw = cols.reduce(function (a, c) { return a + c.w; }, 0);
        var ws = cols.map(function (c) { return c.w / tw * CW; }), xs = [L];
        ws.forEach(function (w, i) { xs.push(xs[i] + w); });
        var groups = o.groups || [], gh = groups.length ? 12 : 0;
        // header
        var hl = cols.map(function (c, i) { K.font(hs, 'bold'); return K.wrap(c.t, ws[i] - 4); });
        var hh = Math.max(14, Math.max.apply(null, hl.map(function (l) { return l.length; })) * hs * 1.15 + 5);
        K.need(gh + hh + 14 * Math.min(3, rows.length + 1));
        // kepala tabel (diulang di halaman berikutnya bila tabel panjang)
        var drawHead = function () {
          var y0 = K.y;
          groups.forEach(function (g) {
            doc.rect(xs[g.from], y0, xs[g.to + 1] - xs[g.from], gh);
            K.font(hs, 'bold'); doc.text(g.t, (xs[g.from] + xs[g.to + 1]) / 2, y0 + hs + 2, { align: 'center' });
          });
          cols.forEach(function (c, i) {
            var inG = groups.some(function (g) { return i >= g.from && i <= g.to; });
            var yy = inG ? y0 + gh : y0, hh2 = inG ? hh : hh + gh;
            doc.rect(xs[i], yy, ws[i], hh2);
            K.font(hs, 'bold');
            var ty = yy + hh2 / 2 - (hl[i].length - 1) * hs * 0.575 + hs * 0.35;
            hl[i].forEach(function (ln, j) { doc.text(ln, xs[i] + ws[i] / 2, ty + j * hs * 1.15, { align: 'center' }); });
          });
          K.y = y0 + gh + hh;
        };
        drawHead();
        rows.forEach(function (row) {
          var cells = row.map(function (v) { return v != null && typeof v === 'object' ? v : { t: v }; });
          var ls = cells.map(function (cl, i) { K.font(sz, cl.b ? 'bold' : 'normal'); return cl.chk != null ? [''] : K.wrap(cl.t == null ? '' : cl.t, ws[i] - 4); });
          var rh = Math.max(o.rowH || 12.5, Math.max.apply(null, ls.map(function (l) { return l.length; })) * sz * 1.18 + 4);
          var pg0 = K.page; K.need(rh); if (K.page !== pg0) drawHead();
          cells.forEach(function (cl, i) {
            if (cl.span) { return; }
            var w = ws[i], j = i;
            while (cells[j + 1] && cells[j + 1].span) { w += ws[++j]; }
            doc.rect(xs[i], K.y, w, rh);
            if (cl.chk != null) { K.check(xs[i] + w / 2 - 3.5, K.y + rh / 2 - 3.5, cl.chk); return; }
            K.font(sz, cl.b ? 'bold' : 'normal');
            var a = cl.a || cols[i].a || 'l', lines = cl.span ? [] : (w !== ws[i] ? K.wrap(cl.t, w - 4) : ls[i]);
            lines.forEach(function (ln, k) {
              var x = a === 'c' ? xs[i] + w / 2 : a === 'r' ? xs[i] + w - 2.5 : xs[i] + 2.5;
              doc.text(ln, x, K.y + sz + 2 + k * sz * 1.18, { align: a === 'c' ? 'center' : a === 'r' ? 'right' : 'left' });
            });
          });
          K.y += rh;
        });
        K.y += o.after == null ? 6 : o.after;
      };
      // kolom tanda tangan: slots = [{h: judul, p: {name, jab, img}, foot}]
      K.signs = function (slots, o) {
        o = o || {};
        var n = slots.length, w = CW / n, hh = 14, ah = o.h || 62, nh = 26, y = K.y;
        K.need(hh + ah + nh);
        y = K.y;
        slots.forEach(function (s, i) {
          var x = L + i * w;
          doc.rect(x, y, w, hh + ah + nh);
          K.font(8, 'normal'); doc.text(s.h, x + w / 2, y + 10, { align: 'center' });
          if (s.p && s.p.img) ctx.pass().placeSign(doc, s.p.img, x + w / 2, y + hh + ah + 2.5, Math.min(w - 30, 150), ah - 4);
          var nm = s.p && s.p.name ? s.p.name : '';
          K.font(8, 'bold');
          if (nm) { doc.text(nm, x + w / 2, y + hh + ah + 9, { align: 'center' }); var tw = doc.getTextWidth(nm); doc.setLineWidth(0.5); doc.line(x + w / 2 - tw / 2, y + hh + ah + 10.5, x + w / 2 + tw / 2, y + hh + ah + 10.5); }
          else { doc.setLineWidth(0.4); doc.line(x + w / 2 - 50, y + hh + ah + 10.5, x + w / 2 + 50, y + hh + ah + 10.5); }
          K.font(7.5, 'normal');
          var jl = K.wrap((s.p && s.p.jab) || s.foot || 'Jabatan', w - 8);
          jl.slice(0, 2).forEach(function (ln, k) { doc.text(ln, x + w / 2, y + hh + ah + 19 + k * 8.5, { align: 'center' }); });
        });
        K.y = y + hh + ah + nh + 8;
      };
      return K;
    }

    // BASTB tidak ditempel tanda tangan. DRAFT hilang setelah pejabat BASTB (mis. Seto Agustian) approve / tanda tangani;
    // bila penandatangan BASTB diketik manual (User Non Persediaan) cukup pengajuan disetujui.
    function bastbOk(r) {
      if (r.status !== ST.ok) return false;
      var s = (r.sign || {}).bastb || {};
      return s.uid ? !!(r.signed || {})[s.uid] : true;
    }
    function bastbWait(r) { var p = who(r, 'bastb'); return 'DRAFT - MENUNGGU APPROVAL ' + String(p.name || 'BASTB').toUpperCase(); }
    function bastbSigner(r) {
      var p = who(r, 'bastb'); delete p.img;
      if (((r.sign || {}).bastb || {}).user && p.fungsi) p.jab = [p.jab, 'Fungsi ' + p.fungsi].filter(Boolean).join(' – ');
      return p;
    }
    function bastbRows(c) { return c.rows.filter(function (x) { return num(x.qrc) > 0; }); }
    function buyer(r) { return r.h.buyer || 'PT Pertamina EP'; }
    function vendorName(r) { return r.h.vendor || 'Vendor'; }
    function pdfBastb(K, r, c) {
      var doc = K.doc, po = r.h.po || '________';
      K.head('BERITA ACARA', 'SERAH TERIMA BARANG', DOCS[0].lamp);
      K.kv([['Nomor BAST', docNo(r, 'bastb')], ['Tanggal BAST', dot(r.h.tglBast)], ['Nomor Kontrak', r.h.oa], ['Jangka Waktu Kontrak', r.h.jangka], ['Nomor PO', r.h.po],
        ['NPWP/NITKU', r.h.npwp], ['Nama Vendor', r.h.vendor], ['Email Vendor', r.h.email], ['Nomor Telp Vendor', r.h.telp], ['Entitas Buyer', r.h.buyer], ['Perihal', r.h.perihal]], 128);
      K.y += 8;
      K.para('Pernyataan meliputi :', { bold: true, after: 2 });
      K.para('1. Pada tanggal ' + (longDate(r.h.tglTerima) || '[...]') + ' telah dilakukan penyerahan pekerjaan sebagai berikut:', { after: 4 });
      var rows = bastbRows(c).map(function (x, i) { return [i + 1, x.d, qty(x.qrc), x.m || '', x.amtRc == null ? '' : idr(x.price), x.amtRc == null ? '' : idr(x.amtRc)]; });
      while (rows.length < 2) rows.push(['', '', '', '', '', '']);
      rows.push([{ t: 'Total', a: 'c', b: true }, { span: 1 }, { span: 1 }, { span: 1 }, { span: 1 }, { t: idr(c.totRc), b: true, a: 'r' }]);
      K.table([{ t: 'No.', w: 5, a: 'c' }, { t: 'Deskripsi Barang', w: 40 }, { t: 'Kuantitas', w: 10, a: 'c' }, { t: 'KIMAP', w: 14, a: 'c' }, { t: 'Harga Satuan (IDR)', w: 15, a: 'r' }, { t: 'Jumlah (IDR)', w: 16, a: 'r' }], rows);
      K.para('Dimana jumlah barang tersebut telah sesuai dengan persyaratan yang ada pada Release Order (RO) dan/atau Purchase Order (PO) No. ' + po, { after: 5 });
      doc.line(K.L, K.y, K.R, K.y); K.y += 4;
      K.para('2. Telah dilakukan pemeriksaan di ' + (r.h.wh || 'Warehouse ________') + ' pada tanggal ' + (longDate(r.h.tglPeriksa) || '[...]') + ', dimana dinyatakan bahwa barang tersebut telah diserahterimakan dalam kondisi sesuai dengan persyaratan yang ada pada Release Order (RO) dan/atau Purchase Order (PO) No. ' + po + '.', { after: 5 });
      doc.line(K.L, K.y, K.R, K.y); K.y += 4;
      K.para('3. Berdasarkan tanggal penyerahan yang dinyatakan di poin 1 diatas, kami menyatakan penyerahan barang tersebut ' + (c.status || 'terlambat/tidak terlambat') + ' dengan persyaratan yang ada pada Release Order (RO) dan/atau Purchase Order (PO) No. ' + po + '. Dengan didukung oleh dokumen pendukung pelaksanaan pekerjaan sebagaimana disyaratkan dalam kontrak.', { after: 5 });
      doc.line(K.L, K.y, K.R, K.y); K.y += 4;
      var V = vendorName(r), B = buyer(r);
      K.para('4. Dengan menandatangani BAST ini, maka ' + V + ' dan ' + B + ' menyatakan bahwa:', { after: 2 });
      ['a. Dokumen ini menjadi acuan utama bagi ' + V + ' dalam melakukan penagihan kepada ' + B + ' dan diakui oleh masing-masing pihak keabsahannya tanpa memerlukan tandatangan basah di dokumen ini oleh masing-masing pihak.',
        'b. Segala kewajiban ' + V + ' atas pekerjaan dengan nomor PO ' + po + ', BAST sudah selesai dilakukan sepenuhnya dan diterima baik oleh ' + B + '.',
        'c. ' + V + ' selaku Penyedia Barang/Jasa telah menyampaikan seluruh dokumen pendukung terkait pelaksanaan pekerjaan sebagaimana dipersyaratkan dalam kontrak.',
        'd. ' + B + ' telah melakukan pemeriksaan atas seluruh dokumen pendukung yang telah disampaikan oleh ' + V + '.',
        'e. Dokumen Berita Acara ini menjadi salah satu dasar pembayaran tagihan Penyedia Barang/Jasa oleh ' + B + '.'].forEach(function (t) { K.para(t, { indent: 12, after: 1.5 }); });
      K.y += 8;
      var vs = (r.sign || {}).vendor || {};
      K.signs([{ h: B, p: bastbSigner(r), foot: 'Jabatan' }, { h: V, p: { name: vs.name, jab: vs.jab }, foot: 'Jabatan' }], { h: 66 });
    }
    function pdfSpb(K, r, c) {
      var doc = K.doc;
      K.head('SURAT PENOLAKAN BARANG (SPB)', null, DOCS[1].lamp);
      K.font(8.5, 'bold'); doc.text('No : ' + (docNo(r, 'spb') || '__________'), (K.L + K.R) / 2, K.y + 6, { align: 'center' }); K.y += 14;
      K.kv([['Ref. Nomor Surat Jalan', r.h.sj], ['Tanggal Pengiriman', dot(r.h.tglKirim)], ['Ref. LHPB', docNo(r, 'lhpb')], ['Nomor Kontrak/OA', r.h.oa], ['Nomor PO/RO', r.h.po],
        ['ID Vendor', r.h.vendorId], ['Nama Vendor', r.h.vendor], ['Email Vendor', r.h.email], ['Nomor Telp Vendor', r.h.telp], ['Entitas Buyer', r.h.buyer], ['Perihal', 'Penolakan Barang – ' + (r.h.perihal || '')]], 112);
      K.y += 8;
      K.para('Dengan ini kami ingin memberitahukan bahwa material yang dikirim dengan rincian sebagai berikut ditolak:', { after: 4 });
      var rows = c.rejected.map(function (x, i) { return [i + 1, x.d, qty(x.qrej), x.u || '', x.m || '', x.note || '']; });
      while (rows.length < 5) rows.push(['', '', '', '', '', '']);
      K.table([{ t: 'No', w: 5, a: 'c' }, { t: 'Deskripsi Barang', w: 45 }, { t: 'Qty', w: 7, a: 'c' }, { t: 'Satuan', w: 8, a: 'c' }, { t: 'KIMAP', w: 14, a: 'c' }, { t: 'Catatan', w: 21 }], rows);
      K.font(8, 'normal'); doc.text('Kategori Penolakan :', K.L, K.y + 7); K.y += 12;
      var kx = K.L, kat = (r.spb || {}).kat || [];
      KATEGORI.forEach(function (t) { K.check(kx, K.y, kat.indexOf(t) >= 0); K.font(8, 'normal'); doc.text(t, kx + 10, K.y + 6.3); kx += 82; });
      K.y += 14;
      [['Alasan Penolakan :', (r.spb || {}).alasan, 46], ['Rekomendasi Perbaikan :', (r.spb || {}).rekom, 32], ['Catatan lainnya (Jumlah Koli, No. Kendaraan, dll) :', (r.spb || {}).lain, 32]].forEach(function (b) {
        K.font(8, 'normal'); K.need(b[2] + 14); doc.text(b[0], K.L, K.y + 8); K.y += 11;
        var lines = K.wrap(b[1] || '', K.W - 8, 8), h = Math.max(b[2], lines.length * 9.6 + 6);
        doc.rect(K.L, K.y, K.W, h); lines.forEach(function (ln, i) { doc.text(ln, K.L + 4, K.y + 10 + i * 9.6); });
        K.y += h + 6;
      });
      K.need(60);
      K.font(8, 'normal'); doc.text('Status', K.L, K.y + 8); doc.text(':', K.L + 70, K.y + 8); K.y += 13;
      [['- Material', (r.spb || {}).stMat], ['- Dokumen (Surat Jalan, Sertifikat, dll)', (r.spb || {}).stDok]].forEach(function (s) {
        doc.text(s[0], K.L, K.y + 6.5); doc.text(':', K.L + 170, K.y + 6.5);
        K.check(K.L + 180, K.y, s[1] === 'Disimpan Sementara di Gudang'); doc.text('Disimpan Sementara di Gudang', K.L + 191, K.y + 6.3);
        K.check(K.L + 345, K.y, s[1] === 'Dikembalikan ke Vendor'); doc.text('Dikembalikan ke Vendor', K.L + 356, K.y + 6.3);
        K.y += 12;
      });
      K.y += 4;
      K.para('Terkait penolakan tersebut, kami mohon kerja samanya untuk mengirimkan material sesuai dengan spesifikasi dan persyaratan yang diminta, serta wajib mengajukan ulang Pemberitahuan Rencana Pengiriman Barang.', { after: 1 });
      K.para('Demikian disampaikan', { after: 8 });
      var vs = (r.sign || {}).vendor || {};
      K.signs([{ h: 'Disiapkan Oleh,', p: who(r, 'spbPrep') }, { h: 'Disetujui Oleh,', p: who(r, 'spbAppr') }, { h: 'Diterima Oleh,', p: { name: vs.name, jab: vs.jab || 'Vendor' } }], { h: 52 });
    }
    function pdfLhpb(K, r, c) {
      var doc = K.doc, L = K.L, lx = L + 150;
      K.head('LAPORAN HASIL PEMERIKSAAN BARANG (LHPB)', null, DOCS[2].lamp);
      var info = function (rows) {
        rows.forEach(function (x) {
          K.font(8, 'normal'); var lines = K.wrap(x[1], K.W - 160);
          K.need(lines.length * 9.6 + 1);
          doc.text(x[0], L, K.y + 8); doc.text(':', lx - 6, K.y + 8);
          lines.forEach(function (ln, i) { doc.text(ln, lx, K.y + 8 + i * 9.6); });
          K.y += Math.max(1, lines.length) * 9.6 + 0.5;
        });
      };
      info([['Nomor', docNo(r, 'lhpb')], ['Tanggal Pemeriksaan', dot(r.h.tglPeriksa)], ['Lokasi Pemeriksaan', r.h.wh], ['Pengawas Pekerjaan/Pengadaan', r.h.pengawas], ['Judul Pekerjaan', r.h.perihal], ['Jumlah Item', c.n + ' item']]);
      K.y += 5;
      K.font(8, 'bold'); doc.text('BERDASARKAN', L, K.y + 8); doc.setLineWidth(0.5); doc.line(L, K.y + 9.5, L + doc.getTextWidth('BERDASARKAN'), K.y + 9.5); K.y += 11;
      info([['Nomor PO/RO', r.h.po], ['Nomor OA/Kontrak', r.h.oa], ['Delivery Date', dot(r.h.delivery)]]);
      var opts = function (label, list) {
        K.font(8, 'normal'); doc.text(label, L, K.y + 7); doc.text(':', lx - 6, K.y + 7);
        list.forEach(function (o, i) { var x = lx + i * 125; K.check(x, K.y + 0.5, o[1]); K.font(8, 'normal'); doc.text(o[0], x + 10, K.y + 7); });
        K.y += 11;
      };
      opts('Tipe', [['Persediaan', r.h.tipe === 'Persediaan'], ['Non Persediaan', r.h.tipe === 'Non Persediaan'], ['Partial Quantity', r.h.partial === 'Ya']]);
      opts('Vendor Commitment', [['Full Delivery', r.h.commit === 'Full Delivery'], ['Partial Delivery', r.h.commit === 'Partial Delivery']]);
      K.y += 5;
      var rows = c.rows.map(function (x) { return [x.no, x.m || '', x.d, qty(x.qpo), x.u || '', qty(x.qrc), x.tkdn || '', { chk: !x.rej }, { chk: x.rej }, x.note || '']; });
      while (rows.length < 3) rows.push(['', '', '', '', '', '', '', { chk: false }, { chk: false }, '']);
      K.table([{ t: 'No', w: 4, a: 'c' }, { t: 'Nomor Material', w: 12, a: 'c' }, { t: 'Deskripsi Material', w: 28 }, { t: 'Qty PO/RO', w: 6.5, a: 'c' }, { t: 'Satuan', w: 6.5, a: 'c' },
        { t: 'QTY Diterima', w: 7, a: 'c' }, { t: '% TKDN', w: 7, a: 'c' }, { t: 'Diterima', w: 7.5, a: 'c' }, { t: 'Ditolak', w: 7.5, a: 'c' }, { t: 'Catatan', w: 14 }], rows,
      { groups: [{ t: 'Status Pemeriksaan', from: 7, to: 8 }], sz: 7.2, hsz: 7.2 });
      K.need(100);
      K.font(8, 'bold'); doc.text('HASIL PEMERIKSAAN BARANG KESELURUHAN', (L + K.R) / 2, K.y + 7, { align: 'center' }); K.y += 12;
      HASIL.forEach(function (x) {
        var v = hasil(r, c, x[0]);
        K.font(8, 'normal'); doc.text(x[1], L, K.y + 7); doc.text(':', lx - 6, K.y + 7);
        x[2].forEach(function (o, i) { var xx = lx + i * 125; K.check(xx, K.y + 0.5, v === o); K.font(8, 'normal'); doc.text(o, xx + 10, K.y + 7); });
        K.y += 10.5;
      });
      K.font(7, 'italic'); doc.text('(*) Jika dipersyaratkan', L, K.y + 6); K.y += 12;
      K.font(8, 'bold'); doc.text('GENERAL CHECKLIST DOCUMENTS', (L + K.R) / 2, K.y + 7, { align: 'center' }); K.y += 10;
      K.font(7.5, 'normal'); doc.text('(disesuaikan dengan Dokumen yang dipersyaratkan pada PO/Kontrak)', (L + K.R) / 2, K.y + 6, { align: 'center' }); K.y += 10;
      var chk = ((r.lhpb || {}).check || []).filter(function (x) { return x.doc; }).map(function (x, i) { return [i + 1, x.doc, { chk: x.ok === 'Yes' }, { chk: x.ok === 'No' }, x.note || '']; });
      while (chk.length < 3) chk.push([chk.length + 1, '', { chk: false }, { chk: false }, '']);
      K.table([{ t: 'No.', w: 5, a: 'c' }, { t: 'Dokumen', w: 50 }, { t: 'Yes', w: 7, a: 'c' }, { t: 'No', w: 7, a: 'c' }, { t: 'Catatan', w: 31 }], chk, { groups: [{ t: 'Hasil', from: 2, to: 3 }], rowH: 11.5 });
      K.need(16);
      K.font(8, 'bold'); doc.text('Kesimpulan', L, K.y + 7); K.font(8, 'normal'); doc.text(':', lx - 6, K.y + 7);
      ['Diterima', 'Tidak Diterima', 'Sebagian Diterima'].forEach(function (o, i) { var xx = lx + i * 125; K.check(xx, K.y + 0.5, c.kesimpulan === o); K.font(8, 'normal'); doc.text(o, xx + 10, K.y + 7); });
      K.y += 14;
      var cat = K.wrap((r.lhpb || {}).catatan || '', K.W - 8, 8), ch = Math.max(30, cat.length * 9.6 + 16);
      K.need(ch + 4);
      doc.rect(L, K.y, K.W, ch); K.font(8, 'bold'); doc.text('CATATAN', L + 3, K.y + 9); doc.line(L + 3, K.y + 10.5, L + 3 + doc.getTextWidth('CATATAN'), K.y + 10.5);
      K.font(8, 'normal'); cat.forEach(function (ln, i) { doc.text(ln, L + 4, K.y + 20 + i * 9.6); });
      K.y += ch + 5;
      K.para('Demikian laporan ini dibuat dengan sebenar-benarnya berdasarkan hasil pemeriksaan terhadap kuantitas, kualitas, dan dokumen barang sesuai persyaratan dan prosedur yang berlaku', { after: 5 });
      // tabel pemeriksa + tanda tangan
      var cols = [{ t: 'No.', w: 5 }, { t: 'Nama', w: 26 }, { t: 'No. ID', w: 12 }, { t: 'Jabatan', w: 23 }, { t: 'Fungsi/Sub Fungsi', w: 14 }, { t: 'Tandatangan', w: 20 }];
      var tw = 100, xs = [L]; cols.forEach(function (cc, i) { xs.push(xs[i] + cc.w / tw * K.W); });
      var rh = 27;
      K.need(14 + 12 + rh * 4 + 12);
      K.font(8, 'bold'); doc.text('Pemeriksa/Perwakilan Perusahaan', L, K.y + 8); doc.line(L, K.y + 9.5, L + doc.getTextWidth('Pemeriksa/Perwakilan Perusahaan'), K.y + 9.5); K.y += 12;
      cols.forEach(function (cc, i) { doc.rect(xs[i], K.y, xs[i + 1] - xs[i], 12); K.font(7.6, 'bold'); doc.text(cc.t, (xs[i] + xs[i + 1]) / 2, K.y + 8.5, { align: 'center' }); });
      K.y += 12;
      var prow = function (n, p) {
        cols.forEach(function (cc, i) { doc.rect(xs[i], K.y, xs[i + 1] - xs[i], rh); });
        K.font(7.6, 'normal');
        doc.text(String(n), (xs[0] + xs[1]) / 2, K.y + rh / 2 + 2.5, { align: 'center' });
        [p.name, p.nid, p.jab, p.fungsi].forEach(function (t, i) { K.wrap(t || '', xs[i + 2] - xs[i + 1] - 5, 7.6).slice(0, 3).forEach(function (ln, k, arr) { doc.text(ln, xs[i + 1] + 2.5, K.y + rh / 2 + 2.5 - (arr.length - 1) * 4.4 + k * 8.8); }); });
        if (p.img) ctx.pass().placeSign(doc, p.img, (xs[5] + xs[6]) / 2, K.y + rh - 1.5, xs[6] - xs[5] - 10, rh - 3);
        K.y += rh;
      };
      prow(1, who(r, 'lhpb1')); prow(2, who(r, 'lhpb2'));
      doc.rect(L, K.y, K.W, 12); K.font(8, 'bold'); doc.text('Mengetahui:', L + 3, K.y + 8.5); K.y += 12;
      prow(1, who(r, 'lhpbM1')); prow(2, who(r, 'lhpbM2'));
    }
    async function pdfDenda(K, r, c) {
      var doc = K.doc;
      K.head('FORM PERHITUNGAN DENDA', 'KETERLAMBATAN PENGIRIMAN BARANG', DOCS[3].lamp);
      K.font(8.5, 'bold'); doc.text('Nomor: ' + (docNo(r, 'denda') || '____________________'), (K.L + K.R) / 2, K.y + 6, { align: 'center' }); K.y += 14;
      var y0 = K.y;
      K.kv([['Referensi Nomor GR', r.h.gr], ['Tanggal GR', dot(r.h.tglGr)], ['Nomor Kontrak/OA', r.h.oa], ['Nomor PO/RO', r.h.po], ['ID Vendor', r.h.vendorId], ['Nama Vendor', r.h.vendor],
        ['Email Vendor', r.h.email], ['Nomor Telp Vendor', r.h.telp], ['Entitas Buyer', r.h.buyer], ['Perihal', 'Denda Keterlambatan Pengiriman Barang' + (r.h.perihal ? ' – ' + r.h.perihal : '')]], 105);
      if (c.late) { var st = await stampImg(c.lateDays); doc.addImage(st, 'PNG', K.R - 112, y0 - 6, 100, 100 * 556 / 576); }
      K.y += 8;
      var t1 = c.rows.map(function (x) { return [x.line, x.d, qty(x.qpo), x.u || '', x.m || '', x.amtPo == null ? '' : idr(x.price), x.amtPo == null ? '' : idr(x.amtPo)]; });
      while (t1.length < 3) t1.push(['', '', '', '', '', '', '']);
      t1.push([{ t: 'Total', a: 'c', b: true }, { span: 1 }, { span: 1 }, { span: 1 }, { span: 1 }, { span: 1 }, { t: idr(c.totPo), b: true, a: 'r' }]);
      K.table([{ t: 'Line No.', w: 7, a: 'c' }, { t: 'Deskripsi Barang', w: 35 }, { t: 'Qty', w: 6, a: 'c' }, { t: 'Satuan', w: 7, a: 'c' }, { t: 'KIMAP', w: 13, a: 'c' }, { t: 'Harga Satuan (IDR)', w: 15, a: 'r' }, { t: 'Jumlah Harga (IDR)', w: 17, a: 'r' }], t1);
      K.para('Berdasarkan tanggal penerimaan di Titik Penerimaan Barang (Delivery Point) :', { after: 4 });
      var t2 = c.rows.map(function (x) { return [x.line, x.d, qty(x.qpo), x.u || '', dot(x.dueEff), qty(x.qrc), x.u || '', dot(x.rcvEff), x.late == null ? '' : x.late > 0 ? 'Terlambat ' + x.late + ' hari' : 'Tepat waktu']; });
      while (t2.length < 3) t2.push(['', '', '', '', '', '', '', '', '']);
      K.table([{ t: 'Line No.', w: 7, a: 'c' }, { t: 'Deskripsi Barang', w: 29 }, { t: 'Qty', w: 6, a: 'c' }, { t: 'Satuan', w: 7, a: 'c' }, { t: 'Tanggal Jatuh Tempo', w: 10.5, a: 'c' },
        { t: 'Qty', w: 6, a: 'c' }, { t: 'Satuan', w: 7, a: 'c' }, { t: 'Tanggal Penerimaan', w: 10.5, a: 'c' }, { t: 'Keterangan', w: 17, a: 'c' }], t2,
      { groups: [{ t: 'Persyaratan PO/RO', from: 2, to: 4 }, { t: 'Penerimaan Warehouse', from: 5, to: 7 }] });
      K.para('Denda/sanksi atas ketidaksesuaian Waktu Penerimaan Barang:', { after: 2 });
      K.para('Perhitungan denda dihitung berdasarkan ketentuan yang diatur di dalam Outline Agreement (OA), Release Order (RO), dan Purchase Order (PO) — tarif ' + pct(c.tarif) + ' per hari keterlambatan, maksimum ' + pct(c.maks) + '.', { after: 4 });
      var t3 = c.rows.map(function (x) { return [x.line, x.d, qty(x.qpo), x.amtPo == null ? '' : idr(x.price), x.amtPo == null ? '' : idr(x.amtPo), x.late == null ? '' : String(x.late), x.pct == null ? '' : pct(x.pct), idr(x.denda)]; });
      while (t3.length < 3) t3.push(['', '', '', '', '', '', '', '']);
      t3.push([{ t: 'Total', a: 'c', b: true }, { span: 1 }, { span: 1 }, { span: 1 }, { span: 1 }, { span: 1 }, { span: 1 }, { t: idr(c.totDenda), b: true, a: 'r' }]);
      K.table([{ t: 'Line No.', w: 7, a: 'c' }, { t: 'Deskripsi Barang', w: 31 }, { t: 'Qty', w: 6, a: 'c' }, { t: 'Harga Satuan (IDR)', w: 13, a: 'r' }, { t: 'Jumlah Harga (IDR)', w: 14, a: 'r' },
        { t: 'Hari', w: 6, a: 'c' }, { t: 'Persentase', w: 9, a: 'c' }, { t: 'Denda (IDR)', w: 14, a: 'r' }], t3, { groups: [{ t: 'Keterlambatan', from: 5, to: 6 }] });
      K.para('Demikian form ini dibuat sesuai dengan kondisi sebenarnya.', { after: 6 });
      K.signs([{ h: 'Disiapkan Oleh,', p: who(r, 'dendaPrep'), foot: 'Jabatan' }, { h: 'Diverifikasi Oleh,', p: who(r, 'dendaVer'), foot: 'Jabatan' }, { h: 'Disetujui Oleh,', p: who(r, 'dendaAppr'), foot: 'Jabatan' }], { h: 56 });
    }
    async function pdfStamp(K, r, c) {
      var doc = K.doc;
      K.head('STAMP KETERLAMBATAN PENGIRIMAN BARANG', null, DOCS[4].lamp);
      K.kv([['Referensi Nomor GR', r.h.gr], ['Tanggal GR', dot(r.h.tglGr)], ['Nomor PO/RO', r.h.po], ['Nama Vendor', r.h.vendor], ['Delivery Date', dot(r.h.delivery)], ['Tanggal Penerimaan', dot(r.h.tglTerima)],
        ['Jumlah hari terlambat', c.lateDays + ' hari']], 130);
      var st = await stampImg(c.lateDays), w = 260;
      doc.addImage(st, 'PNG', (K.L + K.R) / 2 - w / 2, K.y + 30, w, w * 556 / 576);
      K.y += 30 + w + 10;
      K.para('Stamp ini dibubuhkan Sub Fungsi Receiving pada GR Slip apabila Vendor terlambat mengirimkan barang ke titik penyerahan sesuai delivery date pada Dokumen Pembelian (TKO B7-084 Bab VII.C.2).', { sz: 7.5 });
    }
    async function buildPdf(r, docs) {
      var JsPDF = await ctx.pass().loadJsPDF(), lg = await dataUrl('assets/terima/logo-phe.png');
      var doc = new JsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' }), c = calc(r);
      var draft = r.status === ST.ok ? '' : r.status === ST.pending || !r.status ? 'DRAFT - MENUNGGU APPROVAL' : r.status.toUpperCase();
      var K = pdfKit(doc, r, lg, draft);
      if (docs.bastb) { K.draft = r.status !== ST.ok ? draft : bastbOk(r) ? '' : bastbWait(r); pdfBastb(K, r, c); K.draft = draft; }
      if (docs.spb && c.rejected.length) pdfSpb(K, r, c);
      if (docs.lhpb) pdfLhpb(K, r, c);
      if (docs.denda) await pdfDenda(K, r, c);
      if (docs.stamp && c.late) await pdfStamp(K, r, c);
      if (!K.page) throw new Error('Pilih minimal 1 dokumen');
      return doc;
    }
    async function downloadPdf(r, docs) {
      loading('Membuat PDF…');
      try { (await buildPdf(r, docs)).save(fileBase(r) + '.pdf'); }
      catch (e) { toast('Gagal membuat PDF: ' + e.message, true); }
      finally { loading(false); }
    }

    // ================= Excel (format template Excel BASTB/LHPB/Denda + sheet SPB & Stamp) =================
    function dateVal(s) { if (!s) return ''; var p = s.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); }
    function colPx(ws, c) { var w = ws.getColumn(c).width; return Math.round((w || 8.43) * 7 + 5); }
    function rowPx(ws, r) { var h = ws.getRow(r).height; return (h || 15) * 4 / 3; }
    // tempel gambar proporsional di tengah area sel (c0..c1, r0..r1; 1-based, inklusif)
    function xlImg(wb, ws, dataurl, c0, c1, r0, r1, o) {
      o = o || {};
      var base64 = dataurl.split(',')[1], id = wb.addImage({ base64: base64, extension: 'png' });
      return loadImg(dataurl).then(function (im) {
        var cw = [], rh = [], W = 0, Hh = 0, c, r;
        for (c = c0; c <= c1; c++) { cw.push(colPx(ws, c)); W += cw[cw.length - 1]; }
        for (r = r0; r <= r1; r++) { rh.push(rowPx(ws, r)); Hh += rh[rh.length - 1]; }
        var mw = W - (o.padX || 10), mh = Hh - (o.padY || 4), k = Math.min(mw / im.naturalWidth, mh / im.naturalHeight);
        var w = im.naturalWidth * k, h = im.naturalHeight * k, x = (W - w) / 2, y = o.top ? (o.padY || 4) / 2 : Hh - h - (o.padY || 4) / 2;
        var toCol = function (px) { var i = 0; while (i < cw.length - 1 && px > cw[i]) { px -= cw[i]; i++; } return c0 - 1 + i + px / cw[i]; };
        var toRow = function (px) { var i = 0; while (i < rh.length - 1 && px > rh[i]) { px -= rh[i]; i++; } return r0 - 1 + i + px / rh[i]; };
        ws.addImage(id, { tl: { col: toCol(x), row: toRow(y) }, ext: { width: w, height: h }, editAs: 'oneCell' });
      });
    }
    async function xlLogo(wb, ws, c1) {
      var lg = await dataUrl('assets/terima/logo-phe.png');
      ws.getCell('A2').value = '';
      await xlImg(wb, ws, lg, 1, c1, 2, 3, { padX: 8, padY: 4 });
    }
    function setv(ws, addr, v) { ws.getCell(addr).value = v == null ? '' : v; }
    // Sisipkan baris setelah baris item terakhir tiap blok (gaya, tinggi & sel gabungan ikut); kembalikan pemetaan nomor baris template → baris baru
    function growBlocks(ws, lasts, n) {
      var extra = Math.max(0, n - TPL_ROWS);
      var map = function (r) { return r + extra * lasts.filter(function (l) { return l < r; }).length; };
      if (!extra) return map;
      var re = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/, nc = ws.columnCount;
      lasts.slice().sort(function (a, b) { return b - a; }).forEach(function (last) {
        var merges = (ws.model.merges || []).slice();
        merges.forEach(function (m) { ws.unMergeCells(m); });
        var tpl = ws.getRow(last), h = tpl.height, styles = [];
        for (var c = 1; c <= nc; c++) styles.push(JSON.stringify(tpl.getCell(c).style || {}));
        var blank = []; for (var i = 0; i < extra; i++) blank.push([]);
        ws.spliceRows.apply(ws, [last + 1, 0].concat(blank));
        for (var rr = last + 1; rr <= last + extra; rr++) {
          var row = ws.getRow(rr); if (h) row.height = h;
          for (var c2 = 1; c2 <= nc; c2++) row.getCell(c2).style = JSON.parse(styles[c2 - 1]);
        }
        merges.forEach(function (m) {
          var p = re.exec(m); if (!p) return;
          var r1 = +p[2], r2 = +p[4];
          if (r1 > last) { r1 += extra; r2 += extra; } else if (r2 > last) r2 += extra;
          ws.mergeCells(p[1] + r1 + ':' + p[3] + r2);
          if (+p[2] === last && +p[4] === last) for (var k = 1; k <= extra; k++) ws.mergeCells(p[1] + (last + k) + ':' + p[3] + (last + k));
        });
        var dv = ws.dataValidations && ws.dataValidations.model;
        if (dv) {
          var nm = {};
          Object.keys(dv).forEach(function (a) { var q = /^([A-Z]+)(\d+)$/.exec(a); nm[q && +q[2] > last ? q[1] + (+q[2] + extra) : a] = dv[a]; });
          ws.dataValidations.model = nm;
        }
        var pa = ws.pageSetup.printArea, q2 = pa && /^(.*[A-Z]+)(\d+)$/.exec(pa);
        if (q2) ws.pageSetup.printArea = q2[1] + (+q2[2] + extra);
      });
      return map;
    }
    function fillInput(ws, r, c) {
      var h = r.h;
      [['D5', h.po], ['D6', h.oa], ['D7', h.jangka], ['D8', dateVal(h.delivery)], ['D9', h.tipe], ['D10', h.partial], ['D11', h.commit], ['D12', h.vendorId], ['D13', h.vendor],
        ['D14', h.npwp], ['D15', h.email], ['D16', h.telp], ['D17', h.buyer], ['D18', c.tarif], ['D19', c.maks],
        ['J5', h.perihal], ['J6', h.wh], ['J7', dateVal(h.tglTerima)], ['J8', dateVal(h.tglPeriksa)], ['J9', h.pengawas], ['J10', h.gr], ['J11', dateVal(h.tglGr)],
        ['J12', docNo(r, 'bastb')], ['J13', dateVal(h.tglBast)], ['J14', docNo(r, 'lhpb')], ['J15', docNo(r, 'denda')], ['J18', c.n || ''], ['J19', c.status], ['J20', c.totDenda]].forEach(function (x) { setv(ws, x[0], x[1]); });
      ['D8', 'J7', 'J8', 'J11', 'J13'].forEach(function (a) { ws.getCell(a).numFmt = 'dd.mm.yyyy'; });
      var n = Math.max(TPL_ROWS, c.rows.length), R0 = growBlocks(ws, [32], n);
      for (var i = 0; i < n; i++) {
        var x = c.rows[i], row = 23 + i;
        var vals = x ? [x.line, x.m || '', x.d, x.u || '', num(x.qpo), num(x.qrc), x.amtPo == null ? '' : num(x.price), x.amtPo == null ? '' : x.amtPo, x.tkdn || '', x.due ? dateVal(x.due) : '', x.rcv ? dateVal(x.rcv) : '', x.late == null ? '' : x.late, x.st || '', x.note || '']
          : ['', '', '', '', '', '', '', '', '', '', '', '', '', ''];
        'BCDEFGHIJKLMNO'.split('').forEach(function (col, j) { setv(ws, col + row, vals[j]); });
        ws.getCell('K' + row).numFmt = 'dd.mm.yyyy'; ws.getCell('L' + row).numFmt = 'dd.mm.yyyy';
      }
      setv(ws, 'I' + R0(33), c.totPo);
    }
    async function fillBastb(wb, ws, r, c) {
      var h = r.h, po = h.po || '________', V = vendorName(r), B = buyer(r);
      [['C5', docNo(r, 'bastb')], ['C6', dot(h.tglBast)], ['C7', h.oa], ['C8', h.jangka], ['C9', h.po], ['C10', h.npwp], ['C11', h.vendor], ['C12', h.email], ['C13', h.telp], ['C14', h.buyer], ['C15', h.perihal]].forEach(function (x) { setv(ws, x[0], x[1]); });
      setv(ws, 'A18', '1. Pada tanggal ' + (longDate(h.tglTerima) || '[...]') + ' telah dilakukan penyerahan pekerjaan sebagai berikut:');
      var br = bastbRows(c), n = Math.max(TPL_ROWS, br.length), M = growBlocks(ws, [29], n);
      for (var i = 0; i < n; i++) {
        var x = br[i], row = 20 + i;
        var vals = x ? [i + 1, x.d, num(x.qrc), x.m || '', x.amtRc == null ? '' : num(x.price), x.amtRc == null ? '' : x.amtRc] : ['', '', '', '', '', ''];
        'ABCDEF'.split('').forEach(function (col, j) { setv(ws, col + row, vals[j]); });
      }
      setv(ws, 'F' + M(30), c.totRc);
      setv(ws, 'A' + M(31), 'Dimana jumlah barang tersebut telah sesuai dengan persyaratan yang ada pada Release Order (RO) dan/atau Purchase Order (PO) No. ' + po);
      setv(ws, 'A' + M(32), '2. Telah dilakukan pemeriksaan di ' + (h.wh || 'Warehouse ________') + ' pada tanggal ' + (longDate(h.tglPeriksa) || '[...]') + ', dimana dinyatakan bahwa barang tersebut telah diserahterimakan dalam kondisi sesuai dengan persyaratan yang ada pada Release Order (RO) dan/atau Purchase Order (PO) No. ' + po + '.');
      setv(ws, 'A' + M(33), '3. Berdasarkan tanggal penyerahan yang dinyatakan di poin 1 diatas, kami menyatakan penyerahan barang tersebut ' + (c.status || 'terlambat/tidak terlambat') + ' dengan persyaratan yang ada pada Release Order (RO) dan/atau Purchase Order (PO) No. ' + po + '. Dengan didukung oleh dokumen pendukung pelaksanaan pekerjaan sebagaimana disyaratkan dalam kontrak.');
      setv(ws, 'A' + M(34), '4. Dengan menandatangani BAST ini, maka ' + V + ' dan ' + B + ' menyatakan bahwa:');
      setv(ws, 'A' + M(35), 'a. Dokumen ini menjadi acuan utama bagi ' + V + ' dalam melakukan penagihan kepada ' + B + ' dan diakui oleh masing-masing pihak keabsahannya tanpa memerlukan tandatangan basah di dokumen ini oleh masing-masing pihak.');
      setv(ws, 'A' + M(36), 'b. Segala kewajiban ' + V + ' atas pekerjaan dengan nomor PO ' + po + ', BAST sudah selesai dilakukan sepenuhnya dan diterima baik oleh ' + B + '.');
      setv(ws, 'A' + M(37), 'c. ' + V + ' selaku Penyedia Barang/Jasa telah menyampaikan seluruh dokumen pendukung terkait pelaksanaan pekerjaan sebagaimana dipersyaratkan dalam kontrak.');
      setv(ws, 'A' + M(38), 'd. ' + B + ' telah melakukan pemeriksaan atas seluruh dokumen pendukung yang telah disampaikan oleh ' + V + '.');
      setv(ws, 'A' + M(39), 'e. Dokumen Berita Acara ini menjadi salah satu dasar pembayaran tagihan Penyedia Barang/Jasa oleh ' + B + '.');
      setv(ws, 'A' + M(41), B); setv(ws, 'D' + M(41), V);
      var p = bastbSigner(r), vs = (r.sign || {}).vendor || {};
      setv(ws, 'A' + M(47), p.name); setv(ws, 'A' + M(48), p.jab); setv(ws, 'D' + M(47), vs.name || ''); setv(ws, 'D' + M(48), vs.jab || '');
      if (p.img) await xlImg(wb, ws, p.img, 1, 3, M(42), M(46), { padX: 120, padY: 4 });
      await xlLogo(wb, ws, 2);
    }
    async function fillLhpb(wb, ws, r, c) {
      var h = r.h, ck = function (b) { return b ? '✓' : ''; };
      [['D5', docNo(r, 'lhpb')], ['D6', dot(h.tglPeriksa)], ['D7', h.wh], ['D8', h.pengawas], ['D9', h.perihal], ['D10', c.n + ' item'], ['D13', h.po], ['D14', h.oa], ['D15', dot(h.delivery)],
        ['D16', ck(h.tipe === 'Persediaan')], ['G16', ck(h.tipe === 'Non Persediaan')], ['I16', ck(h.partial === 'Ya')], ['D17', ck(h.commit === 'Full Delivery')], ['G17', ck(h.commit === 'Partial Delivery')]].forEach(function (x) { setv(ws, x[0], x[1]); });
      var n = Math.max(TPL_ROWS, c.rows.length), M = growBlocks(ws, [32], n);
      for (var i = 0; i < n; i++) {
        var x = c.rows[i], row = 23 + i;
        var vals = x ? [x.no, x.m || '', x.d, num(x.qpo), x.u || '', num(x.qrc), x.tkdn || '', ck(!x.rej), ck(x.rej), x.note || ''] : ['', '', '', '', '', '', '', '', '', ''];
        'ABCDEFGHIJ'.split('').forEach(function (col, j) { setv(ws, col + row, vals[j]); });
      }
      HASIL.forEach(function (x, i) {
        var row = M(35 + i), v = hasil(r, c, x[0]);
        ['D', 'G', 'I'].forEach(function (col, j) { if (x[2][j]) setv(ws, col + row, ck(v === x[2][j])); });
      });
      var chk = ((r.lhpb || {}).check || []).filter(function (x) { return x.doc; });
      for (var k = 0; k < 8; k++) {
        var cx = chk[k], rw = M(48 + k);
        setv(ws, 'B' + rw, cx ? cx.doc : ''); setv(ws, 'G' + rw, cx ? ck(cx.ok === 'Yes') : ''); setv(ws, 'H' + rw, cx ? ck(cx.ok === 'No') : ''); setv(ws, 'I' + rw, cx ? cx.note : '');
      }
      setv(ws, 'D' + M(57), ck(c.kesimpulan === 'Diterima')); setv(ws, 'G' + M(57), ck(c.kesimpulan === 'Tidak Diterima')); setv(ws, 'I' + M(57), ck(c.kesimpulan === 'Sebagian Diterima'));
      setv(ws, 'A' + M(60), (r.lhpb || {}).catatan || '');
      var rowsP = [[M(68), 'lhpb1'], [M(69), 'lhpb2'], [M(71), 'lhpbM1'], [M(72), 'lhpbM2']];
      for (var j = 0; j < rowsP.length; j++) {
        var p = who(r, rowsP[j][1]), rr = rowsP[j][0];
        setv(ws, 'B' + rr, p.name); setv(ws, 'D' + rr, p.nid); setv(ws, 'F' + rr, p.jab); setv(ws, 'H' + rr, p.fungsi); setv(ws, 'J' + rr, '');
        if (p.img) await xlImg(wb, ws, p.img, 10, 10, rr, rr, { padX: 14, padY: 4 });
      }
      await xlLogo(wb, ws, 3);
    }
    async function fillDenda(wb, ws, r, c) {
      var h = r.h;
      [['E5', docNo(r, 'denda')], ['C6', h.gr], ['C7', dot(h.tglGr)], ['C8', h.oa], ['C9', h.po], ['C10', h.vendorId], ['C11', h.vendor], ['C12', h.email], ['C13', h.telp], ['C14', h.buyer],
        ['C15', 'Denda Keterlambatan Pengiriman Barang' + (h.perihal ? ' – ' + h.perihal : '')]].forEach(function (x) { setv(ws, x[0], x[1]); });
      var n = Math.max(TPL_ROWS, c.rows.length), M = growBlocks(ws, [27, 42, 58], n);
      setv(ws, 'C' + M(46), c.tarif); setv(ws, 'H' + M(46), c.maks);
      for (var i = 0; i < n; i++) {
        var x = c.rows[i];
        var v1 = x ? [x.line, x.d, num(x.qpo), x.u || '', x.m || '', x.amtPo == null ? '' : num(x.price), x.amtPo == null ? '' : x.amtPo] : ['', '', '', '', '', '', ''];
        ['A', 'B', 'C', 'D', 'E', 'G', 'I'].forEach(function (col, j) { setv(ws, col + (M(18) + i), v1[j]); });
        var v2 = x ? [x.line, x.d, num(x.qpo), x.u || '', dot(x.dueEff), num(x.qrc), x.u || '', dot(x.rcvEff), x.late == null ? '' : x.late > 0 ? 'Terlambat ' + x.late + ' hari' : 'Tepat waktu'] : ['', '', '', '', '', '', '', '', ''];
        'ABCDEFGHI'.split('').forEach(function (col, j) { setv(ws, col + (M(33) + i), v2[j]); });
        var v3 = x ? [x.line, x.d, num(x.qpo), x.amtPo == null ? '' : num(x.price), x.amtPo == null ? '' : x.amtPo, x.late == null ? '' : x.late, x.pct == null ? '' : x.pct, x.denda] : ['', '', '', '', '', '', '', ''];
        ['A', 'B', 'C', 'D', 'F', 'H', 'I', 'J'].forEach(function (col, j) { setv(ws, col + (M(49) + i), v3[j]); });
      }
      setv(ws, 'I' + M(28), c.totPo); setv(ws, 'J' + M(59), c.totDenda);
      var sl = [['A', 1, 2, 'dendaPrep'], ['C', 3, 6, 'dendaVer'], ['G', 7, 10, 'dendaAppr']];
      for (var k = 0; k < sl.length; k++) {
        var p = who(r, sl[k][3]);
        setv(ws, sl[k][0] + M(69), p.name || ''); setv(ws, sl[k][0] + M(70), p.jab || '');
        if (p.img) await xlImg(wb, ws, p.img, sl[k][1], sl[k][2], M(64), M(68), { padX: 40, padY: 4 });
      }
      if (c.late) await xlImg(wb, ws, await stampImg(c.lateDays), 9, 10, 6, 13, { padX: 6, padY: 2, top: true });
      await xlLogo(wb, ws, 2);
    }
    function xlBorder(cell) { var t = { style: 'thin', color: { argb: 'FF000000' } }; cell.border = { top: t, left: t, bottom: t, right: t }; }
    async function sheetSpb(wb, r, c) {
      var ws = wb.addWorksheet('SPB', { pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 1, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } }, views: [{ showGridLines: false }] });
      ws.columns = [{ width: 5 }, { width: 22 }, { width: 30 }, { width: 8 }, { width: 9 }, { width: 15 }, { width: 22 }];
      var F = { name: 'Arial', size: 9 }, FB = { name: 'Arial', size: 9, bold: true };
      var put = function (addr, v, f, al) { var cl = ws.getCell(addr); cl.value = v == null ? '' : v; cl.font = f || F; cl.alignment = Object.assign({ vertical: 'middle', wrapText: true }, al || {}); return cl; };
      ws.mergeCells('A1:G1'); put('A1', DOCS[1].lamp + ' · Revisi Ke-0', { name: 'Arial', size: 7, italic: true, color: { argb: 'FF808080' } });
      ws.mergeCells('A2:C3'); ws.mergeCells('D2:G3'); put('D2', 'SURAT PENOLAKAN BARANG (SPB)', { name: 'Arial', size: 12, bold: true }, { horizontal: 'center' });
      ws.getRow(2).height = 19.5; ws.getRow(3).height = 19.5;
      ws.mergeCells('A4:G4'); put('A4', 'No : ' + (docNo(r, 'spb') || '__________'), FB, { horizontal: 'center' });
      var kv = [['Ref. Nomor Surat Jalan', r.h.sj], ['Tanggal Pengiriman', dot(r.h.tglKirim)], ['Ref. LHPB', docNo(r, 'lhpb')], ['Nomor Kontrak/OA', r.h.oa], ['Nomor PO/RO', r.h.po], ['ID Vendor', r.h.vendorId],
        ['Nama Vendor', r.h.vendor], ['Email Vendor', r.h.email], ['Nomor Telp Vendor', r.h.telp], ['Entitas Buyer', r.h.buyer], ['Perihal', 'Penolakan Barang – ' + (r.h.perihal || '')]];
      var row = 5;
      kv.forEach(function (x) {
        ws.mergeCells('A' + row + ':B' + row); ws.mergeCells('C' + row + ':G' + row);
        put('A' + row, x[0], FB); put('C' + row, x[1]);
        ['A', 'B', 'C', 'D', 'E', 'F', 'G'].forEach(function (cc) { xlBorder(ws.getCell(cc + row)); });
        if (x[0] === 'Perihal') ws.getRow(row).height = 27;
        row++;
      });
      row++;
      ws.mergeCells('A' + row + ':G' + row); put('A' + row, 'Dengan ini kami ingin memberitahukan bahwa material yang dikirim dengan rincian sebagai berikut ditolak:'); row++;
      var hdr = ['No', 'Deskripsi Barang', '', 'Qty', 'Satuan', 'KIMAP', 'Catatan'];
      ws.mergeCells('B' + row + ':C' + row);
      hdr.forEach(function (t, i) { if (i === 2) return; var cl = put(String.fromCharCode(65 + i) + row, t, FB, { horizontal: 'center' }); xlBorder(cl); cl.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } }; });
      row++;
      var rej = c.rejected.slice(); while (rej.length < 5) rej.push(null);
      rej.forEach(function (x, i) {
        ws.mergeCells('B' + row + ':C' + row);
        var vals = x ? [i + 1, x.d, '', num(x.qrej), x.u || '', x.m || '', x.note || ''] : ['', '', '', '', '', '', ''];
        vals.forEach(function (v, j) { if (j === 2) return; var cl = put(String.fromCharCode(65 + j) + row, v, F, j === 0 || j === 3 || j === 4 || j === 5 ? { horizontal: 'center' } : {}); xlBorder(cl); });
        row++;
      });
      row++;
      var kat = (r.spb || {}).kat || [];
      ws.mergeCells('A' + row + ':G' + row); put('A' + row, 'Kategori Penolakan :  ' + KATEGORI.map(function (t) { return (kat.indexOf(t) >= 0 ? '☑ ' : '☐ ') + t; }).join('     ')); row += 2;
      [['Alasan Penolakan :', (r.spb || {}).alasan, 45], ['Rekomendasi Perbaikan :', (r.spb || {}).rekom, 30], ['Catatan lainnya (Jumlah Koli, No. Kendaraan, dll) :', (r.spb || {}).lain, 30]].forEach(function (b) {
        ws.mergeCells('A' + row + ':G' + row); put('A' + row, b[0]); row++;
        ws.mergeCells('A' + row + ':G' + row); var cl = put('A' + row, b[1] || '', F, { vertical: 'top' }); ws.getRow(row).height = b[2];
        ['A', 'B', 'C', 'D', 'E', 'F', 'G'].forEach(function (cc) { xlBorder(ws.getCell(cc + row)); });
        row += 2;
      });
      var box = function (on) { return on ? '☑' : '☐'; };
      put('A' + row, 'Status'); put('C' + row, ':'); row++;
      [['- Material', (r.spb || {}).stMat], ['- Dokumen (Surat Jalan, Sertifikat, dll)', (r.spb || {}).stDok]].forEach(function (s) {
        ws.mergeCells('A' + row + ':C' + row); put('A' + row, s[0] + '   :');
        ws.mergeCells('D' + row + ':F' + row); put('D' + row, box(s[1] === 'Disimpan Sementara di Gudang') + ' Disimpan Sementara di Gudang');
        put('G' + row, box(s[1] === 'Dikembalikan ke Vendor') + ' Dikembalikan ke Vendor'); row++;
      });
      row++;
      ws.mergeCells('A' + row + ':G' + row); put('A' + row, 'Terkait penolakan tersebut, kami mohon kerja samanya untuk mengirimkan material sesuai dengan spesifikasi dan persyaratan yang diminta, serta wajib mengajukan ulang Pemberitahuan Rencana Pengiriman Barang.'); ws.getRow(row).height = 27; row++;
      ws.mergeCells('A' + row + ':G' + row); put('A' + row, 'Demikian disampaikan'); row += 2;
      var vs = (r.sign || {}).vendor || {};
      var slots = [['A', 'B', 1, 2, 'Disiapkan Oleh,', who(r, 'spbPrep')], ['C', 'C', 3, 3, 'Disetujui Oleh,', who(r, 'spbAppr')], ['D', 'G', 4, 7, 'Diterima Oleh,', { name: vs.name, jab: vs.jab || 'Vendor' }]];
      var top = row;
      for (var hr = 1; hr <= top + 6; hr++) if (!ws.getRow(hr).height) ws.getRow(hr).height = 15;
      for (var i = 0; i < slots.length; i++) {
        var s = slots[i];
        if (s[0] !== s[1]) { ws.mergeCells(s[0] + top + ':' + s[1] + top); ws.mergeCells(s[0] + (top + 1) + ':' + s[1] + (top + 4)); ws.mergeCells(s[0] + (top + 5) + ':' + s[1] + (top + 5)); ws.mergeCells(s[0] + (top + 6) + ':' + s[1] + (top + 6)); }
        else ws.mergeCells(s[0] + (top + 1) + ':' + s[1] + (top + 4));
        put(s[0] + top, s[4], F, { horizontal: 'center' });
        put(s[0] + (top + 5), s[5].name || '', Object.assign({}, FB, { underline: true }), { horizontal: 'center' });
        put(s[0] + (top + 6), s[5].jab || 'Jabatan', F, { horizontal: 'center' });
        ws.getRow(top + 6).height = 26;
        for (var rr = top; rr <= top + 6; rr++) for (var cc = s[2]; cc <= s[3]; cc++) xlBorder(ws.getCell(rr, cc));
        if (s[5].img) await xlImg(wb, ws, s[5].img, s[2], s[3], top + 1, top + 4, { padX: 30, padY: 4 });
      }
      ws.pageSetup.printArea = 'A1:G' + (top + 6);
      await xlLogo(wb, ws, 3);
      return ws;
    }
    async function sheetStamp(wb, r, c) {
      var ws = wb.addWorksheet('Stamp Keterlambatan', { pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 1 }, views: [{ showGridLines: false }] });
      ws.columns = [{ width: 24 }, { width: 50 }];
      ws.mergeCells('A1:B1'); ws.getCell('A1').value = DOCS[4].lamp + ' · Revisi Ke-0'; ws.getCell('A1').font = { name: 'Arial', size: 7, italic: true, color: { argb: 'FF808080' } };
      ws.mergeCells('A2:B2'); ws.getCell('A2').value = 'STAMP KETERLAMBATAN PENGIRIMAN BARANG'; ws.getCell('A2').font = { name: 'Arial', size: 12, bold: true }; ws.getCell('A2').alignment = { horizontal: 'center' };
      [['Referensi Nomor GR', r.h.gr], ['Tanggal GR', dot(r.h.tglGr)], ['Nomor PO/RO', r.h.po], ['Nama Vendor', r.h.vendor], ['Delivery Date', dot(r.h.delivery)], ['Tanggal Penerimaan', dot(r.h.tglTerima)], ['Jumlah hari terlambat', c.lateDays + ' hari']].forEach(function (x, i) {
        var a = ws.getCell('A' + (4 + i)), b = ws.getCell('B' + (4 + i));
        a.value = x[0]; b.value = x[1] || ''; a.font = { name: 'Arial', size: 9, bold: true }; b.font = { name: 'Arial', size: 9 }; xlBorder(a); xlBorder(b);
      });
      for (var i = 12; i <= 28; i++) ws.getRow(i).height = 15;
      await xlImg(wb, ws, await stampImg(c.lateDays), 1, 2, 12, 28, { padX: 60, padY: 6 });
      ws.pageSetup.printArea = 'A1:B28';
    }
    async function buildXlsx(r, docs) {
      var ExcelJS = await ctx.loadExcelJS(), c = calc(r);
      var wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await (await fetch('assets/terima/template.xlsx')).arrayBuffer());
      wb.calcProperties = { fullCalcOnLoad: true };
      fillInput(wb.getWorksheet('Input Data'), r, c);
      var draft = r.status === ST.ok ? '' : 'DRAFT – ' + (r.status || ST.pending).toUpperCase() + ' · ';
      var map = { bastb: 'BASTB', lhpb: 'LHPB', denda: 'Denda Keterlambatan' };
      if (docs.bastb) await fillBastb(wb, wb.getWorksheet('BASTB'), r, c);
      if (docs.lhpb) await fillLhpb(wb, wb.getWorksheet('LHPB'), r, c);
      if (docs.denda) await fillDenda(wb, wb.getWorksheet('Denda Keterlambatan'), r, c);
      Object.keys(map).forEach(function (k) {
        var ws = wb.getWorksheet(map[k]);
        if (!docs[k]) { wb.removeWorksheet(ws.id); return; }
        var dr = k === 'bastb' && r.status === ST.ok && !bastbOk(r) ? bastbWait(r).replace('DRAFT - ', 'DRAFT – ') + ' · ' : draft;
        if (dr) { var a1 = ws.getCell('A1'); a1.value = dr + a1.value; a1.font = Object.assign({}, a1.font, { color: { argb: 'FFC00000' }, bold: true }); }
      });
      if (docs.spb && c.rejected.length) await sheetSpb(wb, r, c);
      if (docs.stamp && c.late) await sheetStamp(wb, r, c);
      // urutan sheet: Input Data, BASTB, SPB, LHPB, Denda, Stamp, Daftar
      var order = ['Input Data', 'BASTB', 'SPB', 'LHPB', 'Denda Keterlambatan', 'Stamp Keterlambatan', 'Daftar'];
      wb.worksheets.forEach(function (ws) { var i = order.indexOf(ws.name); ws.orderNo = i < 0 ? 99 : i; });
      var first = wb.worksheets.filter(function (ws) { return ws.name !== 'Input Data'; }).sort(function (a, b) { return a.orderNo - b.orderNo; })[0];
      wb.views = [{ x: 0, y: 0, width: 20000, height: 12000, firstSheet: 0, activeTab: first ? first.orderNo - (docs.bastb ? 0 : 0) : 0, visibility: 'visible' }];
      return wb;
    }
    async function downloadXlsx(r, docs) {
      loading('Membuat Excel…');
      try {
        var wb = await buildXlsx(r, docs), buf = await wb.xlsx.writeBuffer();
        var url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
        var a = document.createElement('a'); a.href = url; a.download = fileBase(r) + '.xlsx'; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      } catch (e) { toast('Gagal membuat Excel: ' + e.message, true); }
      finally { loading(false); }
    }

    // ---------- Event ----------
    function inForm(t) { return t.closest && t.closest('#rcvForm'); }
    function onField(t, final) {
      var d = R.draft; if (!d || R.busy) return;
      if (t.hasAttribute('data-slot')) {
        var k = t.getAttribute('data-slot'), v = t.value;
        d.sign[k] = v === '__m' ? { manual: true, name: '', jab: '' } : v ? { uid: v } : {};
        storeDraft(); rerender(); return;
      }
      if (t.hasAttribute('data-kat')) {
        var kat = d.spb.kat || (d.spb.kat = []), name = t.getAttribute('data-kat'), i = kat.indexOf(name);
        if (t.checked && i < 0) kat.push(name); if (!t.checked && i >= 0) kat.splice(i, 1);
        t.parentNode.classList.toggle('on', t.checked); storeDraft(); return;
      }
      var path = t.getAttribute('data-k'); if (!path) return;
      var val = t.type === 'checkbox' ? t.checked : t.hasAttribute('data-num') ? (t.value === '' ? '' : num(t.value)) : t.value;
      setPath(d, path, val);
      if (path === 'h.seq') d.h.seqManual = t.value !== '';
      storeDraft();
      if (!final) { refreshSum(); return; }
      var m = /^items\.(\d+)\.m$/.exec(path);
      if (m) { var it = d.items[+m[1]]; if (it.m) { var found = lookupMat(d, it); if (!found) toast('KIMAP ' + it.m + ' tidak ada di data stok — isi deskripsi manual', true); } rerender(); return; }
      if (path === 'h.oa' && d.h.oa) { if (lookupOA(d)) toast('Vendor & harga terisi dari kontrak ' + d.h.oa); rerender(); return; }
      if ((path === 'h.vendorId' || path === 'h.vendor') && lookupVendor(d)) { rerender(); return; }
      if (t.hasAttribute('data-rr')) { rerender(); return; }
      refreshSum();
    }
    document.addEventListener('input', function (e) { if (inForm(e.target)) onField(e.target, false); });
    var PASTE_COLS = ['line', 'm', 'd', 'u', 'qpo', 'qrc', 'price', 'tkdn', 'due', 'rcv', 'st', 'note'];
    document.addEventListener('paste', function (e) {
      var t = e.target, k = t.getAttribute && t.getAttribute('data-k'), m = k && /^items\.(\d+)\.(\w+)$/.exec(k);
      if (!m || !R.draft) return;
      var txt = (e.clipboardData || window.clipboardData).getData('text');
      if (!/[\t\n]/.test(txt.replace(/\n$/, ''))) return; // satu nilai biasa
      e.preventDefault();
      var lines = txt.replace(/\r/g, '').replace(/\n+$/, '').split('\n'), r0 = +m[1], c0 = PASTE_COLS.indexOf(m[2]);
      if (c0 < 0) return;
      var toNum = function (v) { v = String(v).trim(); if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(v)) v = v.replace(/\./g, '').replace(',', '.'); else v = v.replace(/,/g, '.'); var n = parseFloat(v); return isFinite(n) ? n : ''; };
      lines.forEach(function (ln, i) {
        var it = R.draft.items[r0 + i] || (R.draft.items[r0 + i] = { line: String(r0 + i + 1), st: 'Diterima' });
        ln.split('\t').forEach(function (v, j) {
          var f = PASTE_COLS[c0 + j]; if (!f) return;
          v = v.trim();
          it[f] = /^(qpo|qrc|price)$/.test(f) ? toNum(v) : f === 'st' ? (/tolak/i.test(v) ? 'Ditolak' : 'Diterima') : f === 'm' || f === 'u' ? v.toUpperCase() : v;
        });
        if (it.m && !it.d) lookupMat(R.draft, it);
      });
      storeDraft(); rerender();
      toast(lines.length + ' baris ditempel dari Excel');
    });
    document.addEventListener('change', function (e) {
      var t = e.target;
      if (inForm(t)) onField(t, true);
      else if (t.id === 'rcvMonth') { R.month = t.value; renderHistory(); }
    });
    var rqTimer;
    document.addEventListener('input', function (e) {
      if (e.target.id !== 'rcvRegQ') return;
      R.regQ = e.target.value; clearTimeout(rqTimer);
      rqTimer = setTimeout(function () { Reg.pickerHtml(R.regQ).then(function (html) { var el = document.getElementById('rcvRegList'); if (el) el.innerHTML = html; }); }, 200);
    });
    var qTimer;
    document.addEventListener('input', function (e) {
      if (e.target.id !== 'rcvQ') return;
      R.q = e.target.value; clearTimeout(qTimer);
      qTimer = setTimeout(function () { renderHistory().then(function () { var q = document.getElementById('rcvQ'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }); }, 300);
    });
    document.addEventListener('click', function (e) {
      var a = e.target.closest('[data-ra]');
      if (!a) return;
      e.preventDefault();
      var act = a.getAttribute('data-ra'), id = a.getAttribute('data-id'), d = R.draft;
      if (act === 'row-add' && d) { for (var ni = +(a.getAttribute('data-n') || 1); ni > 0; ni--) d.items.push({ line: String(d.items.length + 1), st: 'Diterima' }); storeDraft(); rerender(); }
      else if (act === 'row-del' && d) { d.items.splice(+a.getAttribute('data-i'), 1); if (!d.items.length) d.items.push({ line: '1', st: 'Diterima' }); storeDraft(); rerender(); }
      else if (act === 'chk-add' && d) { d.lhpb.check.push({ doc: '', ok: 'Yes', note: '' }); storeDraft(); rerender(); }
      else if (act === 'chk-del' && d) { d.lhpb.check.splice(+a.getAttribute('data-i'), 1); storeDraft(); rerender(); }
      else if (act === 'reg-change' && d) { d.reg = null; storeDraft(); rerender(); }
      else if (act === 'reg-edit' && d && d.reg && canRcv()) Reg.openForm(d.reg.y, d.reg.id, pickReg);
      else if (act === 'reset') { if (confirm('Kosongkan seluruh isian form?')) { clearDraft(); rerender(); } }
      else if (act === 'edit-cancel') { clearDraft(); rerender(); }
      else if (act === 'submit') submit();
      else if (act === 'preview' && d) {
        var miss = validate(d, calc(d));
        if (miss.length) { toast('Lengkapi dulu: ' + miss.join(', '), true); return; }
        R.previewRec = Object.assign({ id: 'draft', status: '' }, clone(d)); openExport('draft');
      }
      else if (act === 'tab') { R.filt = a.getAttribute('data-v'); renderHistory(); }
      else if (act === 'rekap') exportRekap(a.getAttribute('data-v'));
      else if (act === 'refresh') renderHistory(true);
      else if (act === 'approve') openApprove(id);
      else if (act === 'approve-do') approve(id);
      else if (act === 'cosign') cosign(id);
      else if (act === 'reject') { var why = prompt('Alasan menolak (opsional):', ''); if (why !== null) setStatus(id, ST.no, { rejectBy: me(), rejectNote: why }, 'Pengajuan ditolak'); }
      else if (act === 'cancel') { if (confirm('Batalkan pengajuan ini?')) setStatus(id, ST.cancel, null, 'Pengajuan dibatalkan'); }
      else if (act === 'delete') { var rd = find(id); if (rd) remove(rd); }
      else if (act === 'edit' && canRcv()) startEdit(id);
      else if (act === 'export') openExport(id);
      else if (act === 'pdf' || act === 'xlsx') {
        var r = id === 'draft' ? R.previewRec : find(id), docs = chosenDocs();
        if (!r) return;
        if (!Object.keys(docs).length) { toast('Pilih minimal 1 dokumen', true); return; }
        (act === 'pdf' ? downloadPdf : downloadXlsx)(r, docs);
      }
    });
    document.addEventListener('input', function (e) {
      if (e.target.id === 'rcvSeq') {
        var r = find(($('#drawer [data-ra="approve-do"]') || {}).getAttribute ? $('#drawer [data-ra="approve-do"]').getAttribute('data-id') : '');
        var box = document.getElementById('rcvNoPrev');
        if (r && box && +e.target.value > 0) box.innerHTML = noPreview(numbers(+e.target.value, r.h.tglBast || r.h.tglTerima), calc(r));
      }
    });

    function pendingCount() { return R.data ? R.data.list.filter(function (r) { return r.status === ST.pending; }).length : 0; }
    function reset() { R.data = null; R.signs = null; R.filt = 'Semua'; Reg.reset(); }

    // ---------- Rekap BASTB & LHPB (Excel) per bulan / tahun / seluruh tahun ----------
    function rekapYear() { return R.month ? +R.month.slice(0, 4) : new Date().getFullYear(); }
    async function exportRekap(kind) {
      loading('Membuat rekap Excel…');
      try {
        var ExcelJS = await ctx.loadExcelJS(), wb = new ExcelJS.Workbook();
        var list = R.data.list.filter(function (r) { return r.status !== ST.cancel; });
        var dateOf = function (r) { return r.h.tglBast || r.h.tglTerima || ''; };
        var groups = {};
        list.forEach(function (r) {
          var dt = dateOf(r), y = dt.slice(0, 4);
          if (kind === 'month' && dt.slice(0, 7) !== R.month) return;
          if (kind === 'year' && +y !== rekapYear()) return;
          (groups[y] = groups[y] || []).push(r);
        });
        var ys = Object.keys(groups).sort();
        if (!ys.length) ys = [String(rekapYear())];
        var thin = { style: 'thin', color: { argb: 'FF000000' } }, border = { top: thin, left: thin, bottom: thin, right: thin };
        var cols = [['No.', 5], ['No. BASTB', 20], ['No. LHPB', 20], ['Tanggal BAST', 13], ['Register', 14], ['PO / RO', 14], ['Kontrak / OA', 14], ['Vendor', 32], ['Perihal', 50], ['Tipe', 15],
          ['Item', 6], ['Nilai Diterima (Rp.)', 18], ['Penyerahan', 15], ['Hari Terlambat', 10], ['Denda (Rp.)', 15], ['Kesimpulan LHPB', 17], ['Status', 17], ['Approve oleh', 26]];
        ys.forEach(function (y) {
          var rows = (groups[y] || []).sort(function (a, b) { return (dateOf(a) + docNo(a, 'bastb')).localeCompare(dateOf(b) + docNo(b, 'bastb')); });
          var title = kind === 'month' ? 'Rekap BASTB & LHPB Bulan ' + BLN[+R.month.slice(5) - 1] + ' ' + y : 'Rekap BASTB & LHPB Tahun ' + y;
          var ws = wb.addWorksheet(kind === 'month' ? 'Rekap-' + R.month : 'Rekap-' + y, { views: [{ state: 'frozen', ySplit: 3 }], pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
          ws.columns = cols.map(function (c) { return { width: c[1] }; });
          ws.mergeCells(1, 1, 1, cols.length);
          ws.getCell(1, 1).value = title; ws.getCell(1, 1).font = { name: 'Baskerville Old Face', size: 18, bold: true }; ws.getCell(1, 1).alignment = { horizontal: 'center' };
          ws.getRow(1).height = 26;
          var hr = ws.getRow(3);
          cols.forEach(function (c, i) {
            var cl = hr.getCell(i + 1); cl.value = c[0]; cl.font = { name: 'Arial', size: 10, bold: true }; cl.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; cl.border = border;
            cl.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } };
          });
          hr.height = 30;
          rows.forEach(function (r, i) {
            var c = calc(r), signed = Object.keys(r.signed || {}).map(function (u) { var p = profile(u); return p ? p.name : ''; }).filter(Boolean).join(', ');
            var row = ws.getRow(4 + i);
            [i + 1, docNo(r, 'bastb'), docNo(r, 'lhpb'), dateOf(r) ? new Date(Date.UTC(+dateOf(r).slice(0, 4), +dateOf(r).slice(5, 7) - 1, +dateOf(r).slice(8, 10))) : '',
              r.reg ? Reg.regLabel(r.reg) : '', r.h.po || '', r.h.oa || '', r.h.vendor || '', r.h.perihal || '', r.h.tipe || '', c.n, c.totRc, c.late ? 'Terlambat' : 'Tepat waktu', c.late ? c.lateDays : 0,
              c.totDenda, c.kesimpulan, r.status, signed].forEach(function (v, j) {
              var cl = row.getCell(j + 1); cl.value = v; cl.font = { name: 'Arial', size: 10 }; cl.border = border;
              cl.alignment = { vertical: 'top', wrapText: j === 7 || j === 8, horizontal: [0, 3, 4, 10, 12, 13].indexOf(j) >= 0 ? 'center' : undefined };
              if (j === 3) cl.numFmt = 'dd.mm.yyyy';
              if (j === 11 || j === 14) cl.numFmt = '_(* #,##0_);_(* (#,##0);_(* "-"??_);_(@_)';
            });
          });
          var tr = ws.getRow(4 + rows.length);
          tr.getCell(9).value = 'Total'; tr.getCell(9).font = { name: 'Arial', size: 10, bold: true }; tr.getCell(9).alignment = { horizontal: 'right' };
          [12, 15].forEach(function (cn) {
            var L = String.fromCharCode(64 + cn), cl = tr.getCell(cn);
            cl.value = rows.length ? { formula: 'SUM(' + L + '4:' + L + (3 + rows.length) + ')', result: rows.reduce(function (a, r) { var c = calc(r); return a + (cn === 12 ? c.totRc : c.totDenda); }, 0) } : 0;
            cl.numFmt = '_(* #,##0_);_(* (#,##0);_(* "-"??_);_(@_)'; cl.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF008000' } }; cl.border = border;
          });
        });
        var name = kind === 'month' ? 'REKAP_BASTB_LHPB_' + R.month : kind === 'year' ? 'REKAP_BASTB_LHPB_' + rekapYear() : 'REKAP_BASTB_LHPB_SEMUA_TAHUN';
        var buf = await wb.xlsx.writeBuffer(), url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
        var a = document.createElement('a'); a.href = url; a.download = name + '.xlsx'; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      } catch (e) { toast('Gagal membuat rekap: ' + e.message, true); }
      finally { loading(false); }
    }
    return { renderForm: renderForm, renderHistory: renderHistory, load: load, pendingCount: pendingCount, reset: reset,
      _test: { calc: calc, buildPdf: buildPdf, buildXlsx: buildXlsx, numbers: numbers } };
  };
})(this);
