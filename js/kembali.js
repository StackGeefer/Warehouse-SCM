/*
 * Pengembalian Material & Penitipan Material Direct Charge (DC).
 *
 * 1. BA Pengembalian Material — TKO B7-044/PHE52000/2022-S9 Rev.1 (Lampiran 4: Berita Acara Serah Terima &
 *    Point of Agreement + Daftar Material). Jenis: Ex Operation, Ex Project, Ex Drilling.
 *    Diisi Fungsi Warehouse → approval Gerald atau Seto → tanda tangan yang approve tertempel otomatis.
 *    GR Slip tidak dibuat (dari SAP).
 * 2. BA Penitipan Material Direct Charge — Memo VP SCM No. 2230/PHR17000/2025-S9.
 *    Dari User (Pihak Pertama) ke SCM Receiving (Pihak Kedua = Seto Agustian). Approval Seto (Owner Gerald juga bisa),
 *    tanda tangan yang tertempel selalu Seto (jobdesc Receiving). Memo 2230 otomatis dilampirkan di PDF.
 *    Masa penitipan maks. 3 bulan (+ perpanjangan 1 bulan) dipantau di Riwayat.
 *
 * Data: data/kembali.js (terenkripsi): { seq: {ret, dc}, list } · lampiran memo User: data/kembali/<id>-memo.js
 */
(function (root) {
  'use strict';
  var ST = { pending: 'Menunggu Approval', ok: 'Disetujui', rev: 'Perlu Revisi', no: 'Ditolak', cancel: 'Dibatalkan' };
  var ST_CLS = { 'Menunggu Approval': 'warn', 'Disetujui': 'ok', 'Perlu Revisi': 'bad', 'Ditolak': 'bad', 'Dibatalkan': '' };
  var BLN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  var HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  var KIND = { ret: 'BA Pengembalian Material', dc: 'BA Penitipan Material Direct Charge' };
  var KIND_SHORT = { ret: 'Pengembalian', dc: 'Penitipan DC' };
  var TKO_RET = 'TKO No. B7-044/PHE52000/2022-S9 Rev.1';
  var MEMO_NO = '2230/PHR17000/2025-S9';
  var JENIS = ['Ex Operation', 'Ex Project', 'Ex Drilling'];
  var STATMAT = ['Stock', 'Non Stock', 'Direct Charge'];
  var INTEG = ['Goods Value', 'Purchase Value', 'Zero Value', 'Full Value'];
  var AFE_ST = ['Sudah PIS & sudah Close Out', 'Sudah PIS & belum Close Out', 'Belum PIS & belum Close Out'];
  var INSPEKSI = ['Baik', 'Sebagian rusak', 'Rusak'];
  var KONDISI = ['Baik', 'Repairable', 'Rusak', 'Scrap / Cut Off'];
  var CATS = { 'Ex Operation': ['Material Operasi', 'MRO Storage', 'MRO Repair', 'Chemical', 'HBM / HBI'], 'Ex Project': ['Surplus Project', 'Scrap / Cut Off', 'Spool Fabrication', 'HBM / HBI'], 'Ex Drilling': ['Material Drilling', 'Fabrikasi / Subcontracting', 'Direct Charge', 'Scrap / Cut Off'] };
  // Kelengkapan dokumen (TKO B7-044 VII & Lampiran 4 butir 6)
  var DOCREQ = {
    'Ex Operation': ['Memo justifikasi pengembalian (min. Manager End User)', 'Keterangan status material (stock / non stock)', 'Hasil preliminary inspection Fungsi User', 'Salinan dokumen Reservasi / PO', 'Reservasi return (untuk material stock)'],
    'Ex Project': ['Dokumen pengadaan (deskripsi material & harga per item)', 'Copy Reservasi (ex-stock) / PO (expense) / PO kontraktor EPCI', 'Dokumen master list (bila pembelian memakai masterlist)', 'Material certificate, MSDS, tally report, dll', 'List material sesuai format terlampir', 'Justifikasi kelebihan pembelian material Project', 'Hasil inspeksi pihak ketiga / QA-QC', 'Persetujuan AFE', 'Surat Pengajuan PIS beserta proposal *', 'Persetujuan PIS *', 'Pengajuan AFE Close Out *', 'Persetujuan AFE Close Out *'],
    'Ex Drilling': ['Manifest (dokumen informasi material)', 'Keterangan status material (stock / non stock)', 'Inspection report (third party / Fungsi User)', 'Reservasi return (kondisi baik)', 'Dokumen PO (Direct Charge)']
  };
  var ALASAN_DC = ['Material proyek — dibeli lebih awal sesuai jadwal pelaksanaan proyek', 'Memerlukan fasilitas penyimpanan khusus (mis. chemical)', 'Lainnya'];
  var UOMS = ['PCS', 'EA', 'SET', 'UNIT', 'KG', 'L', 'M', 'M2', 'M3', 'ROLL', 'BOX', 'PAA', 'JT', 'LOT', 'TIN', 'DRUM', 'BTL', 'LBR', 'BAG', 'CYL', 'PALLET'];
  var DRAFT_KEY = 'mw:kembali-draft';

  root.ReturnModule = function (ctx) {
    var S = ctx.S, esc = ctx.esc, toast = ctx.toast, loading = ctx.loading;
    var R = S.kembali = { data: null, signs: null, kind: 'ret', drafts: {}, editId: null, filt: 'Semua', kf: 'Semua', q: '', month: '', img: {}, savedAt: null, memo: {}, fotos: {} };

    // ---------- util ----------
    function $(s) { return document.querySelector(s); }
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    function pad4(n) { n = String(Math.max(0, Math.round(n || 0))); while (n.length < 4) n = '0' + n; return n; }
    function today() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    function ymd(dt) { return dt.getUTCFullYear() + '-' + pad(dt.getUTCMonth() + 1) + '-' + pad(dt.getUTCDate()); }
    function utc(s) { var p = String(s || '').split('-'); return p.length === 3 ? new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])) : null; }
    function dot(s) { if (!s) return ''; var p = String(s).split('-'); return p.length === 3 ? p[2] + '.' + p[1] + '.' + p[0] : s; }
    function longDate(s) { var d = utc(s); return d ? d.getUTCDate() + ' ' + BLN[d.getUTCMonth()] + ' ' + d.getUTCFullYear() : ''; }
    function hari(s) { var d = utc(s); return d ? HARI[d.getUTCDay()] : ''; }
    // tambah n bulan lalu mundur 1 hari (3 Nov 2026 + 3 bulan → 2 Feb 2027, sesuai contoh BA)
    function addMonths(s, n) {
      var d = utc(s); if (!d) return '';
      var y = d.getUTCFullYear(), m = d.getUTCMonth() + (+n || 0), day = d.getUTCDate();
      var last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      var t = new Date(Date.UTC(y, m, Math.min(day, last)));
      t.setUTCDate(t.getUTCDate() - 1);
      return ymd(t);
    }
    function daysTo(s) { var d = utc(s), t = utc(today()); return d && t ? Math.round((d - t) / 864e5) : null; }
    function fmtTime(iso) { if (!iso) return ''; var d = new Date(iso); return pad(d.getDate()) + '-' + pad(d.getMonth() + 1) + '-' + d.getFullYear() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
    function num(v) { var n = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) ? n : 0; }
    function has(v) { return v !== '' && v != null && isFinite(num(v)); }
    function idr(n) { return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Math.round(n || 0)); }
    function qty(n) { return n === '' || n == null ? '' : new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 }).format(num(n)); }
    function me() { return S.user ? S.user.name : ''; }
    function clone(o) { return JSON.parse(JSON.stringify(o)); }
    function setPath(o, p, v) { var ks = p.split('.'), last = ks.pop(); ks.reduce(function (a, k) { if (a[k] == null) a[k] = /^\d+$/.test(k) ? [] : {}; return a[k]; }, o)[last] = v; }
    function badge(st) { return '<span class="badge ' + (ST_CLS[st] || '') + '">' + esc(st) + '</span>'; }
    function canRcv() { return !!(S.user && ctx.canReceiving && ctx.canReceiving()); }
    function titleCase(s) { return String(s || '').toLowerCase().replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }

    // ---------- data ----------
    function emptyData() { return { seq: { ret: 1, dc: 1 }, list: [] }; }
    async function load(force) {
      var pm = ctx.pass();
      if (!R.data || force) R.data = (await pm.readJSON('data/kembali.js')) || emptyData();
      if (!R.data.seq) R.data.seq = { ret: 1, dc: 1 };
      if (!R.signs || force) R.signs = (await pm.readJSON('data/signs.js')) || { users: {} };
      return R.data;
    }
    async function save(mutate, message) {
      R.data = await ctx.pass().atomic('data/kembali.js', 'MW_KEMBALI', 'Pengembalian Material & Penitipan Material DC', function (cur) {
        cur = cur || emptyData(); if (!cur.seq) cur.seq = { ret: 1, dc: 1 };
        return mutate(cur);
      }, message);
      if (ctx.refreshNav) ctx.refreshNav();
      return R.data;
    }
    function find(id) { return (R.data ? R.data.list : []).filter(function (r) { return r.id === id; })[0]; }

    // ---------- profil penandatangan (Pengaturan → Tanda tangan & profil) ----------
    function profiles() {
      var U = (R.signs && R.signs.users) || {};
      return Object.keys(U).map(function (uid) { var u = U[uid]; return { uid: uid, name: u.full || titleCase(u.name), jab: u.jab || '', nid: u.nid || '', fungsi: u.fungsi || '', img: u.img, short: u.name }; });
    }
    function profile(uid) { return profiles().filter(function (p) { return p.uid === uid; })[0] || null; }
    // SCM Receiving (Seto Agustian) — profil yang jabatannya mengandung "Receiving"
    function recvProfile() { return profiles().filter(function (p) { return /receiv/i.test(p.jab); })[0] || null; }
    function recvUid() { var p = recvProfile(); return p ? p.uid : null; }
    function canApproveRec(r) {
      if (!ctx.isOwner()) return false;
      if (r.kind === 'dc') return ctx.isMainOwner() || S.user.id === recvUid();
      return true;
    }

    // ---------- nomor dokumen ----------
    function docNoFor(kind, seq, h) {
      var d = utc(h.tgl) || new Date();
      if (kind === 'dc') return pad4(seq) + '/BA-DC/' + pad(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear();
      return 'BA-' + pad4(seq) + '/' + (h.kbo || 'KBO') + '/' + d.getUTCFullYear() + '-' + (h.kode || 'W101');
    }

    // ---------- masa penitipan DC ----------
    function dueOf(r) {
      var h = r.h || {};
      var base = h.dueManual && h.due ? h.due : addMonths(h.tgl, h.bulan || 3);
      return r.ext && r.ext.until ? r.ext.until : base;
    }
    function dcState(r) {
      if (r.kind !== 'dc' || r.status !== ST.ok) return null;
      if (r.done) return { k: 'done', t: 'Selesai — diambil ' + dot(r.done.tgl), cls: '' };
      var n = daysTo(dueOf(r));
      if (n == null) return null;
      if (n < 0) return { k: 'over', t: 'Lewat jatuh tempo ' + (-n) + ' hari', cls: 'bad', n: n };
      if (n <= 14) return { k: 'soon', t: 'Jatuh tempo ' + (n ? n + ' hari lagi' : 'hari ini'), cls: 'warn', n: n };
      return { k: 'active', t: 'Titip aktif · sisa ' + n + ' hari', cls: 'ok', n: n };
    }

    // ---------- draft (otomatis tersimpan per akun) ----------
    function newDraft(kind) {
      if (kind === 'dc') {
        return { kind: 'dc', h: { tgl: today(), field: 'Rantau', wh: 'Warehouse Field Rantau', gudang: 'Gudang Rantau', bulan: 3, alasan: ALASAN_DC[0], p1name: '', p1jab: '', p1fungsi: '', memoUser: '', memoTgl: '' },
          items: [{ d: '', q: '', u: '', ket: '' }] };
      }
      return { kind: 'ret', h: { jenis: 'Ex Operation', tgl: today(), ap: 'PT Pertamina EP Field Rantau', wh: 'Warehouse Field Rantau', kbo: 'KBO', kode: 'W101', fungsi: '', project: '', afe: '', afeSt: '',
        statMat: 'Stock', integ: 'Goods Value', reservasi: '', inspeksi: 'Baik' },
        items: [{ cat: 'Material Operasi', kond: 'Baik' }], docs: [], sign: { user: [{ name: '', jab: '' }], wh: [], ack: [] } };
    }
    function draftKey() { return DRAFT_KEY + ':' + (S.user ? S.user.id : 'anon'); }
    function loadDrafts() {
      if (R.loaded) return;
      R.loaded = true;
      try {
        var v = localStorage.getItem(draftKey());
        if (v) { var o = JSON.parse(v); R.drafts = o.drafts || {}; R.kind = o.kind || 'ret'; R.editId = o.edit || null; R.savedAt = o.at || null; }
      } catch (e) { /* abaikan */ }
      // foto draft disimpan di IndexedDB (terlalu besar untuk localStorage)
      if (root.Store) root.Store.get(fotoKey()).then(function (m) {
        if (!m) return;
        var miss = false;
        Object.keys(m).forEach(function (k) { if (!R.fotos[k]) { R.fotos[k] = m[k]; miss = true; } });
        if (miss && ctx.route() === 'kembali') rerender();
      }, function () {});
    }
    function fotoKey() { return 'kb-foto:' + (S.user ? S.user.id : 'anon'); }
    function draftFids() {
      var o = {};
      Object.keys(R.drafts).forEach(function (k) { ((R.drafts[k] || {}).items || []).forEach(function (it) { if (it.fid && R.fotos[it.fid]) o[it.fid] = R.fotos[it.fid]; }); });
      return o;
    }
    function storeFotos() { if (root.Store) root.Store.set(fotoKey(), draftFids()).catch(function () {}); }
    function itemFotos(items) { var o = {}; (items || []).forEach(function (it) { if (it.fid && R.fotos[it.fid]) o[it.fid] = R.fotos[it.fid]; }); return o; }
    // kompres foto: sisi terpanjang maks. 1100 px, JPEG
    function compress(file) {
      return new Promise(function (res, rej) {
        var fr = new FileReader();
        fr.onload = function () {
          var im = new Image();
          im.onload = function () {
            var k = Math.min(1, 1100 / Math.max(im.naturalWidth, im.naturalHeight)), cv = document.createElement('canvas');
            cv.width = Math.round(im.naturalWidth * k); cv.height = Math.round(im.naturalHeight * k);
            var g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(im, 0, 0, cv.width, cv.height);
            res(cv.toDataURL('image/jpeg', 0.72));
          };
          im.onerror = function () { rej(new Error('File bukan gambar')); };
          im.src = fr.result;
        };
        fr.onerror = function () { rej(fr.error); };
        fr.readAsDataURL(file);
      });
    }
    function draft() { loadDrafts(); if (!R.drafts[R.kind]) R.drafts[R.kind] = newDraft(R.kind); return R.drafts[R.kind]; }
    var saveTimer;
    function flushDraft() {
      clearTimeout(saveTimer); saveTimer = null;
      if (!S.user) return;
      R.savedAt = new Date().toISOString();
      try { localStorage.setItem(draftKey(), JSON.stringify({ drafts: R.drafts, kind: R.kind, edit: R.editId, at: R.savedAt })); } catch (e) { /* abaikan */ }
      var el = document.getElementById('kbSaved'); if (el) el.innerHTML = savedHtml();
    }
    function storeDraft() { clearTimeout(saveTimer); saveTimer = setTimeout(flushDraft, 300); }
    function savedHtml() { if (!R.savedAt) return ''; var d = new Date(R.savedAt); return '✓ Tersimpan otomatis ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); }
    window.addEventListener('beforeunload', function () { if (saveTimer) flushDraft(); });
    document.addEventListener('visibilitychange', function () { if (document.hidden && saveTimer) flushDraft(); });
    function clearDraft(kind) {
      delete R.drafts[kind || R.kind]; delete R.memo[kind || R.kind];
      if (R.editId) R.editId = null;
      flushDraft(); storeFotos();
    }

    // ---------- form helpers ----------
    function inp(k, v, o) {
      o = o || {};
      return '<input class="input' + (o.cls ? ' ' + o.cls : '') + '" data-k="' + k + '"' + (o.type ? ' type="' + o.type + '"' : '') + (o.num ? ' data-num' : '') +
        (o.step ? ' step="' + o.step + '"' : '') + (o.list ? ' list="' + o.list + '"' : '') + (o.rr ? ' data-rr' : '') + (o.ro ? ' readonly' : '') +
        ' value="' + esc(v == null ? '' : v) + '" placeholder="' + esc(o.ph || '') + '">';
    }
    function sel(k, v, opts, o) {
      o = o || {};
      return '<select class="select" data-k="' + k + '"' + (o.rr ? ' data-rr' : '') + '>' + (o.blank != null ? '<option value="">' + esc(o.blank) + '</option>' : '') +
        opts.map(function (x) { return '<option' + (x === v ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('') + '</select>';
    }
    function fld(label, html, cls) { return '<label class="fleet-fld' + (cls ? ' ' + cls : '') + '"><span>' + label + '</span>' + html + '</label>'; }
    function rerender() {
      setTimeout(function () {
        var ae = document.activeElement, k = ae && ae.getAttribute ? ae.getAttribute('data-k') : null;
        renderForm().then(function () { var el = k && document.querySelector('[data-k="' + k + '"]'); if (el) el.focus({ preventScroll: true }); });
      }, 0);
    }
    function totals(d) {
      var rows = (d.items || []).filter(function (x) { return x.d || x.m; }), val = 0;
      rows.forEach(function (x) { val += num(x.q) * num(x.price); });
      return { rows: rows, n: rows.length, val: val };
    }

    // ================= Form =================
    async function renderForm() {
      R.busy = true;
      try { await renderFormInner(); } finally { R.busy = false; }
    }
    async function renderFormInner() {
      var v = document.getElementById('view');
      var sy = window.scrollY, main = document.querySelector('.main'), my = main ? main.scrollTop : 0;
      if (!R.data) v.innerHTML = '<div class="card card-pad muted">Memuat…</div>';
      try { await load(); } catch (e) { v.innerHTML = '<div class="card card-pad"><b>Gagal memuat</b><div class="small muted">' + esc(e.message) + '</div></div>'; return; }
      if (ctx.route() !== 'kembali') return;
      setTimeout(function () { window.scrollTo(0, sy); if (main) main.scrollTop = my; }, 0);
      var d = draft(), edit = R.editId ? find(R.editId) : null;
      if (R.editId && (!edit || edit.kind !== R.kind)) { if (!edit) R.editId = null; edit = edit && edit.kind === R.kind ? edit : null; }
      if (!d.h.seqManual) d.h.seq = (R.data.seq || {})[R.kind] || 1;
      var head = '<div class="card card-pad toolbar" style="margin-bottom:14px"><span class="small muted" style="font-weight:700">Jenis dokumen</span><div class="chips">' +
        ['ret', 'dc'].map(function (k) { return '<button class="chip-toggle' + (R.kind === k ? ' on' : '') + '" data-ka="kind" data-v="' + k + '"' + (R.editId && R.kind !== k ? ' disabled' : '') + '>' + esc(KIND[k]) + '</button>'; }).join('') +
        '</div><span class="spacer"></span><a class="btn sm" href="#/kembali-riwayat">Riwayat →</a></div>';
      var editHtml = edit ? '<div class="card card-pad remind-card"><b>Mengedit ' + esc((edit.no && edit.no.no) || 'pengajuan') + '</b> (' + esc(edit.status) + '). <a href="#" data-ka="edit-cancel">Batal edit</a>' +
        (edit.status !== ST.pending && (edit.status !== ST.ok || !ctx.isOwner()) ? '<div class="small" style="margin-top:4px">Setelah <b>Simpan perubahan</b>, status kembali <b>Menunggu Approval</b> dan harus di-approve ulang (tanda tangan dilepas).</div>' : '') + '</div>' : '';
      var prof = !profiles().length ? '<div class="card card-pad remind-card">Belum ada profil penandatangan. Owner / Co-Owner atur di <a href="#/pengaturan">Pengaturan → Tanda tangan &amp; profil penyetuju</a>.</div>' : '';
      v.innerHTML = head + editHtml + prof + '<form id="kbForm" autocomplete="off" onsubmit="return false">' + (R.kind === 'dc' ? formDc(d) : formRet(d)) +
        '<div class="card card-pad toolbar rcv-actions"><button class="btn" data-ka="reset">Kosongkan form</button><span class="small muted rcv-saved" id="kbSaved">' + savedHtml() + '</span><span class="spacer"></span>' +
        '<button class="btn" data-ka="preview">Preview PDF</button><button class="btn primary" data-ka="submit">' + (edit ? 'Simpan perubahan' : R.kind === 'dc' ? 'Ajukan (Approval Seto Agustian)' : 'Ajukan (Approval Gerald / Seto)') + '</button></div></form>' +
        '<datalist id="kbUom">' + UOMS.map(function (u) { return '<option value="' + u + '">'; }).join('') + '</datalist>';
    }
    function noLine(d) {
      return 'Nomor otomatis (urut berikutnya, bisa diedit): <b class="mono">' + esc(docNoFor(d.kind, num(d.h.seq) || 1, d.h)) + '</b>';
    }
    function formRet(d) {
      var h = d.h, proj = h.jenis === 'Ex Project', t = totals(d), cats = CATS[h.jenis] || [];
      return '<div class="card card-pad rcv-sec"><h4 class="section-title">A. Informasi Pengembalian <span class="small muted">(' + esc(TKO_RET) + ' · Lampiran 4)</span></h4><div class="rcv-grid">' +
        fld('Jenis pengembalian', sel('h.jenis', h.jenis, JENIS, { rr: 1 })) +
        fld('Tanggal BA *', inp('h.tgl', h.tgl, { type: 'date', rr: 1 })) +
        fld('Fungsi User (yang mengembalikan) *', inp('h.fungsi', h.fungsi, { ph: 'mis. Production Operation / Well Service / Drilling' })) +
        fld('Status material', sel('h.statMat', h.statMat, STATMAT)) +
        fld('Integrasi SAP', sel('h.integ', h.integ, INTEG)) +
        fld('Hasil preliminary inspection', sel('h.inspeksi', h.inspeksi, INSPEKSI)) +
        (proj ? fld('Nama Project *', inp('h.project', h.project, { ph: 'mis. Flowline RK 2025' })) + fld('No. AFE *', inp('h.afe', h.afe, { cls: 'mono' })) + fld('Status AFE', sel('h.afeSt', h.afeSt, AFE_ST, { blank: '— pilih —' })) : '') +
        fld('No. Reservasi return / dokumen SAP', inp('h.reservasi', h.reservasi, { cls: 'mono' })) +
        fld('Nama AP / Entitas', inp('h.ap', h.ap)) +
        fld('Lokasi Warehouse', inp('h.wh', h.wh, { rr: 1 })) +
        fld('Kode (No. BA–…/KBO)', inp('h.kbo', h.kbo, { cls: 'mono', rr: 1 })) +
        fld('Kode Simpan', inp('h.kode', h.kode, { cls: 'mono', rr: 1, ph: 'W101' })) +
        fld('No. urut BA', inp('h.seq', h.seq, { type: 'number', num: 1, step: '1', cls: 'mono', rr: 1 })) +
        '</div><p class="small muted" style="margin:8px 0 0">' + noLine(d) + '</p></div>' +
        '<div class="card card-pad rcv-sec"><h4 class="section-title">B. Daftar Material <span class="small muted">(' + d.items.length + ' baris — tanpa batas; KIMAP terisi otomatis dari data SAP; bisa paste dari Excel)</span></h4>' +
        '<div class="table-wrap"><table class="grid rcv-items"><thead><tr><th>No</th><th>Category</th><th>KIMAP</th><th>Deskripsi *</th><th>UOM</th><th>Kondisi</th><th>Qty check *</th><th>PO Unit Price (IDR)</th><th>Keterangan</th><th>Foto <span class="small muted">(maks. 1)</span></th><th></th></tr></thead><tbody>' +
        d.items.map(function (it, i) {
          var k = 'items.' + i + '.';
          return '<tr><td class="c muted">' + (i + 1) + '</td><td>' + inp(k + 'cat', it.cat, { cls: 'sm', list: 'kbCats' }) + '</td><td>' + inp(k + 'm', it.m, { cls: 'sm mono', ph: 'KIMAP' }) + '</td>' +
            '<td>' + inp(k + 'd', it.d, { cls: 'sm', ph: 'Deskripsi material' }) + '</td><td>' + inp(k + 'u', it.u, { cls: 'sm', list: 'kbUom' }) + '</td>' +
            '<td>' + sel(k + 'kond', it.kond || 'Baik', KONDISI) + '</td><td>' + inp(k + 'q', it.q, { cls: 'sm num', type: 'number', num: 1, step: 'any' }) + '</td>' +
            '<td>' + inp(k + 'price', it.price, { cls: 'sm num', type: 'number', num: 1, step: 'any', ph: '0' }) + '</td>' +
            '<td>' + inp(k + 'note', it.note, { cls: 'sm' }) + '</td><td>' + fotoCell(it, i) + '</td><td><button class="icon-btn" data-ka="row-del" data-i="' + i + '" title="Hapus baris">✕</button></td></tr>';
        }).join('') + '</tbody></table></div><datalist id="kbCats">' + cats.map(function (c) { return '<option value="' + esc(c) + '">'; }).join('') + '</datalist>' +
        '<div class="toolbar" style="margin-top:8px"><button class="btn sm" data-ka="row-add">+ Tambah baris</button><button class="btn sm" data-ka="row-add" data-n="5">+ 5 baris</button>' +
        '<span class="small muted">Tip: salin kolom dari Excel (Category, KIMAP, Deskripsi, UOM, Kondisi, Qty, Harga, Keterangan) lalu tempel di sel pertama.</span><span class="spacer"></span><b class="small" id="kbTot">' + t.n + ' item · PO Value Rp ' + idr(t.val) + '</b></div></div>' +
        '<div class="card card-pad rcv-sec"><h4 class="section-title">C. Penandatangan</h4>' +
        '<div class="kb-sign-g"><b>' + (proj ? 'Tim Project' : 'Fungsi User') + '</b> <span class="small muted">(ketik manual, tanda tangan basah — min. 1, maks. 3)</span>' + people('user', d.sign.user, 3) + '</div></div>';
    }
    // Foto material: maks. 1 foto per baris (KIMAP), dikompres di browser
    function fotoCell(it, i) {
      var src = it.fid && R.fotos[it.fid];
      if (src) return '<div class="kb-foto"><img src="' + src + '" alt="Foto" data-ka="foto-view" data-fid="' + esc(it.fid) + '"><button class="icon-btn" data-ka="foto-del" data-i="' + i + '" title="Hapus foto">✕</button></div>';
      return '<label class="btn sm kb-foto-add">📷 Foto<input type="file" accept="image/*" data-kfoto="' + i + '" hidden></label>' + (it.fid ? '<div class="small muted">memuat…</div>' : '');
    }
    function people(key, list, max) {
      list = list || [];
      return '<div class="kb-people">' + list.map(function (p, i) {
        var k = 'sign.' + key + '.' + i + '.';
        return '<div class="kb-person">' + inp(k + 'name', p.name, { ph: 'Nama' }) + inp(k + 'jab', p.jab, { ph: 'Jabatan' }) + '<button class="icon-btn" data-ka="p-del" data-g="' + key + '" data-i="' + i + '" title="Hapus">✕</button></div>';
      }).join('') + (list.length < max ? '<button class="btn sm" data-ka="p-add" data-g="' + key + '">+ Tambah</button>' : '') + '</div>';
    }
    function formDc(d) {
      var h = d.h, due = h.dueManual && h.due ? h.due : addMonths(h.tgl, h.bulan || 3), rp = recvProfile();
      var memoF = R.memo.dc || (R.editId && (find(R.editId) || {}).memoFile) || null;
      return '<div class="card card-pad rcv-sec"><h4 class="section-title">A. Data Penitipan <span class="small muted">(Memo VP SCM No. ' + MEMO_NO + ')</span></h4><div class="rcv-grid">' +
        fld('Tanggal BA *', inp('h.tgl', h.tgl, { type: 'date', rr: 1 })) +
        fld('Field', inp('h.field', h.field, { ph: 'Rantau' })) +
        fld('Lokasi Warehouse', inp('h.wh', h.wh)) +
        fld('Gudang penyimpanan', inp('h.gudang', h.gudang)) +
        fld('Masa penitipan (bulan, maks. 3)', sel('h.bulan', String(h.bulan || 3), ['1', '2', '3'], { rr: 1 })) +
        fld('Jatuh tempo', inp('h.due', due, { type: 'date', rr: 1 }) + '<span class="small muted">' + (h.dueManual ? 'diisi manual · <a href="#" data-ka="due-auto">otomatis</a>' : 'otomatis dari tanggal BA + masa penitipan') + '</span>') +
        fld('Alasan penitipan', sel('h.alasan', h.alasan, ALASAN_DC, { rr: 1 })) +
        (h.alasan === 'Lainnya' ? fld('Alasan lainnya', inp('h.alasanLain', h.alasanLain)) : '') +
        fld('Lampiran memo User (PDF, opsional, maks. 3 MB)', '<input type="file" class="input" accept="application/pdf,.pdf" id="kbMemoFile">' +
          (memoF ? '<span class="small">📎 ' + esc(memoF.name) + ' · ' + Math.round((memoF.size || 0) / 1024) + ' KB' + (R.memo.dc ? ' <a href="#" data-ka="memo-clear">hapus</a>' : ' (tersimpan)') + '</span>' : '<span class="small muted">Ikut dilampirkan di PDF sebagai Lampiran 2</span>')) +
        (memoF ? fld('No. Memo Permohonan Penitipan *', inp('h.memoUser', h.memoUser, { ph: 'mis. 2088/PHR72320/2025-S5' })) + fld('Tanggal memo *', inp('h.memoTgl', h.memoTgl, { type: 'date' })) : '') +
        fld('No. urut BA', inp('h.seq', h.seq, { type: 'number', num: 1, step: '1', cls: 'mono', rr: 1 })) +
        '</div><p class="small muted" style="margin:8px 0 0">' + noLine(d) + ' · Maks. penitipan 3 bulan, perpanjangan maks. 1 bulan (memo perpanjangan User).</p></div>' +
        '<div class="card card-pad rcv-sec"><h4 class="section-title">B. Para Pihak</h4><div class="rcv-grid">' +
        fld('PIHAK PERTAMA (User) — Nama *', inp('h.p1name', h.p1name, { ph: 'mis. Juinaldo Romero Rianggana' })) +
        fld('Jabatan *', inp('h.p1jab', h.p1jab, { ph: 'mis. Pjs. Ast Manager Well Service Field Rantau' })) +
        fld('Fungsi', inp('h.p1fungsi', h.p1fungsi, { ph: 'mis. Well Service' })) +
        fld('PIHAK KEDUA (SCM Receiving)', '<div class="rcv-auto">' + (rp ? esc(rp.name) + ' — ' + esc(rp.jab) : '<span class="txt-bad">Profil Receiving belum diatur di Pengaturan</span>') + ' <span class="small muted">(otomatis)</span></div>', 'wide') +
        '</div></div>' +
        '<div class="card card-pad rcv-sec"><h4 class="section-title">C. Material yang Dititipkan <span class="small muted">(' + d.items.length + ' baris)</span></h4>' +
        '<div class="table-wrap"><table class="grid rcv-items"><thead><tr><th>No</th><th>Deskripsi *</th><th>Qty *</th><th>UOM *</th><th>Keterangan (No. PO / SPK, item)</th><th></th></tr></thead><tbody>' +
        d.items.map(function (it, i) {
          var k = 'items.' + i + '.';
          return '<tr><td class="c muted">' + (i + 1) + '</td><td>' + inp(k + 'd', it.d, { cls: 'sm', ph: 'mis. Pipa Spoolable 4", 750 Psig, 82X' }) + '</td>' +
            '<td>' + inp(k + 'q', it.q, { cls: 'sm num', type: 'number', num: 1, step: 'any' }) + '</td><td>' + inp(k + 'u', it.u, { cls: 'sm', list: 'kbUom', ph: 'Roll' }) + '</td>' +
            '<td>' + inp(k + 'ket', it.ket, { cls: 'sm', ph: 'mis. PO 4300089259 item 4' }) + '</td><td><button class="icon-btn" data-ka="row-del" data-i="' + i + '">✕</button></td></tr>';
        }).join('') + '</tbody></table></div><div class="toolbar" style="margin-top:8px"><button class="btn sm" data-ka="row-add">+ Tambah baris</button><span class="small muted">Tip: bisa paste dari Excel (Deskripsi, Qty, UOM, Keterangan).</span></div></div>';
    }

    // ---------- validasi & submit ----------
    function validate(d) {
      var miss = [], h = d.h, t = totals(d);
      if (!h.tgl) miss.push('Tanggal BA');
      if (d.kind === 'dc') {
        if (!h.p1name) miss.push('Nama Pihak Pertama'); if (!h.p1jab) miss.push('Jabatan Pihak Pertama');
        if (!t.n) miss.push('minimal 1 material');
        if (t.rows.some(function (x) { return !x.d || !has(x.q) || !x.u; })) miss.push('Deskripsi, Qty & UOM tiap material');
        if (!recvUid()) miss.push('profil Receiving (Seto) di Pengaturan');
        if (R.memo.dc || (R.editId && (find(R.editId) || {}).memoFile)) { if (!h.memoUser) miss.push('No. Memo Permohonan'); if (!h.memoTgl) miss.push('Tanggal memo'); }
      } else {
        if (!h.fungsi) miss.push('Fungsi User (bagian A)');
        if (h.jenis === 'Ex Project') { if (!h.project) miss.push('Nama Project'); if (!h.afe) miss.push('No. AFE'); }
        if (!t.n) miss.push('minimal 1 material');
        if (t.rows.some(function (x) { return !x.d || !has(x.q); })) miss.push('Deskripsi & Qty tiap material');
        if (!(d.sign.user || []).some(function (p) { return p.name; })) miss.push('minimal 1 penandatangan ' + (h.jenis === 'Ex Project' ? 'Tim Project' : 'Fungsi User'));
      }
      return miss;
    }
    function cleanBody(d) {
      var b = clone(d);
      b.items = b.items.filter(function (x) { return x.d || x.m; });
      if (b.kind === 'ret') { b.sign.user = (b.sign.user || []).filter(function (p) { return p.name || p.jab; }); b.sign.wh = []; b.sign.ack = []; }
      if (b.kind === 'dc' && !R.memo.dc && !(R.editId && (find(R.editId) || {}).memoFile)) { b.h.memoUser = ''; b.h.memoTgl = ''; }
      if (b.kind === 'dc') { b.h.bulan = +b.h.bulan || 3; if (!b.h.dueManual) b.h.due = addMonths(b.h.tgl, b.h.bulan); }
      return b;
    }
    async function submit() {
      var d = draft(), miss = validate(d);
      if (miss.length) { toast('Lengkapi: ' + miss.join(', '), true); return; }
      if (d.h.seqManual && !(num(d.h.seq) > 0)) { toast('Isi No. urut BA', true); return; }
      var body = cleanBody(d), kind = body.kind, editId = R.editId, id = editId || ('K' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5));
      var at = new Date().toISOString(), lost = false, dupNo = '', reapp = false, memo = R.memo[kind];
      loading(editId ? 'Menyimpan perubahan…' : 'Mengajukan ' + KIND[kind] + '…');
      try {
        if (memo) body.memoFile = { name: memo.name, size: memo.size, path: 'data/kembali/' + id + '-memo.js' };
        var fotos = itemFotos(body.items), nF = Object.keys(fotos).length;
        body.fotoFile = nF ? { path: 'data/kembali/' + id + '-foto.js', n: nF } : null;
        await save(function (D) {
          var seqs = D.seq || (D.seq = { ret: 1, dc: 1 });
          var used = function (n) { var no = docNoFor(kind, n, body.h); return D.list.some(function (x) { return x.id !== id && x.kind === kind && x.no && x.no.no === no; }); };
          var seq = body.h.seqManual ? Math.round(num(body.h.seq)) : (seqs[kind] || 1);
          if (!body.h.seqManual) while (used(seq)) seq++;
          if (used(seq)) { dupNo = docNoFor(kind, seq, body.h); throw new Error('dup'); }
          body.no = { seq: seq, no: docNoFor(kind, seq, body.h) }; body.h.seq = seq;
          seqs[kind] = Math.max(seqs[kind] || 1, seq + 1);
          if (editId) {
            var ok = false;
            D.list = D.list.map(function (x) {
              if (x.id !== editId) return x;
              ok = true;
              var nx = Object.assign({}, x, body, { memoFile: body.memoFile || x.memoFile, updatedBy: me(), updatedAt: at });
              if (x.status !== ST.pending && (x.status !== ST.ok || !ctx.isOwner())) {
                reapp = true;
                nx.status = ST.pending; nx.signed = {}; nx.reapprove = true; nx.reapproveFrom = x.status;
                delete nx.approvedBy; delete nx.approvedById; delete nx.approvedAt; delete nx.rejectBy; delete nx.rejectNote;
                if (x.status === ST.rev) nx.revFixedBy = me();
              }
              return nx;
            });
            lost = !ok;
          } else D.list.push(Object.assign({ id: id, status: ST.pending, createdBy: me(), createdById: S.user.id, createdAt: at }, body));
          return D;
        }, (kind === 'dc' ? 'Penitipan DC' : 'Pengembalian material') + ': ' + (editId ? 'ubah ' : 'pengajuan ') + (kind === 'dc' ? body.h.p1name : body.h.jenis + ' ' + body.h.fungsi) + ' (' + me() + ')');
        if (nF && !lost) await ctx.pass().atomic(body.fotoFile.path, 'MW_KBF', 'Foto material — ' + id, function () { return fotos; }, 'Pengembalian/Penitipan: foto material ' + body.no.no + ' (' + me() + ')');
        if (memo && !lost) await ctx.pass().atomic(body.memoFile.path, 'MW_KBF', 'Lampiran memo User — ' + id, function () { return memo; }, 'Penitipan DC: lampiran memo ' + body.no.no + ' (' + me() + ')');
        if (lost) toast('Data sudah dihapus orang lain — perubahan tidak tersimpan', true);
        else toast(editId ? (reapp ? 'Perubahan disimpan — menunggu approval ulang' : 'Perubahan disimpan') : 'Diajukan — menunggu approval ' + (kind === 'dc' ? 'Seto Agustian' : 'Gerald / Seto'));
        clearDraft(kind);
        location.hash = '#/kembali-riwayat';
      } catch (e) { toast(dupNo ? 'Nomor ' + dupNo + ' sudah dipakai — ganti No. urut' : 'Gagal menyimpan: ' + e.message, true); }
      finally { loading(false); }
    }

    // ================= Riwayat =================
    var TABS = ['Semua', ST.pending, ST.rev, ST.ok, 'Titip aktif', 'Segera jatuh tempo', 'Lewat jatuh tempo', 'Selesai diambil', ST.no, ST.cancel];
    function inTab(r, t) {
      if (t === 'Semua') return true;
      var s = dcState(r);
      if (t === 'Titip aktif') return !!s && s.k !== 'done';
      if (t === 'Segera jatuh tempo') return !!s && s.k === 'soon';
      if (t === 'Lewat jatuh tempo') return !!s && s.k === 'over';
      if (t === 'Selesai diambil') return !!s && s.k === 'done';
      return r.status === t;
    }
    async function renderHistory(force) {
      var v = document.getElementById('view');
      v.innerHTML = '<div class="card card-pad muted">Memuat riwayat…</div>';
      try { await load(force); } catch (e) { v.innerHTML = '<div class="card card-pad"><b>Gagal memuat</b><div class="small muted">' + esc(e.message) + '</div></div>'; return; }
      if (ctx.route() !== 'kembali-riwayat') return;
      var all = R.data.list.slice().sort(function (a, b) { return ((b.h.tgl || '') + b.createdAt).localeCompare((a.h.tgl || '') + a.createdAt); });
      var months = {}; all.forEach(function (r) { months[String(r.h.tgl || '').slice(0, 7)] = 1; });
      var q = R.q.trim().toLowerCase();
      var base = all.filter(function (r) {
        if (R.kf !== 'Semua' && r.kind !== R.kf) return false;
        if (R.month && String(r.h.tgl || '').slice(0, 7) !== R.month) return false;
        if (q && [r.no && r.no.no, r.h.fungsi, r.h.project, r.h.afe, r.h.p1name, r.h.p1jab, r.h.memoUser, r.h.memo, r.createdBy].concat((r.items || []).map(function (x) { return (x.m || '') + ' ' + x.d + ' ' + (x.ket || '') + ' ' + (x.po || ''); })).join(' ').toLowerCase().indexOf(q) < 0) return false;
        return true;
      });
      var list = base.filter(function (r) { return inTab(r, R.filt); });
      var warn = all.filter(function (r) { var s = dcState(r); return s && (s.k === 'over' || s.k === 'soon'); });
      var mine = R.signs.users[S.user.id];
      v.innerHTML = (ctx.isOwner() && (!mine || !mine.img) ? '<div class="card card-pad remind-card">Lengkapi <b>nama lengkap, jabatan &amp; tanda tangan</b> Anda di <a href="#/pengaturan">Pengaturan → Tanda tangan &amp; profil penyetuju</a> agar tertempel otomatis saat approve.</div>' : '') +
        (warn.length ? '<div class="card card-pad remind-card"><b>Penitipan Direct Charge perlu ditindaklanjuti:</b> ' + warn.map(function (r) { var s = dcState(r); return esc(r.no.no) + ' (' + esc(r.h.p1name || '') + ') — <span class="' + (s.k === 'over' ? 'txt-bad' : '') + '">' + esc(s.t) + '</span>'; }).join(' · ') +
          '<div class="small muted" style="margin-top:4px">Sesuai Memo ' + MEMO_NO + ' butir 5–6: kirim notifikasi ke User untuk pengambilan / memo perpanjangan (maks. 1 bulan); lewat masa titip SCM Warehouse berhak mengembalikan material ke User.</div></div>' : '') +
        '<div class="card card-pad toolbar" style="margin-bottom:14px"><div class="chips">' + ['Semua', 'ret', 'dc'].map(function (k) {
          return '<button class="chip-toggle' + (R.kf === k ? ' on' : '') + '" data-ka="kf" data-v="' + k + '">' + (k === 'Semua' ? 'Semua dokumen' : esc(KIND_SHORT[k])) + ' <span class="chip-n">' + all.filter(function (r) { return k === 'Semua' || r.kind === k; }).length + '</span></button>';
        }).join('') + '</div>' +
        '<select class="select" id="kbMonth"><option value="">Semua bulan</option>' + Object.keys(months).filter(Boolean).sort().reverse().map(function (m) { return '<option value="' + m + '"' + (R.month === m ? ' selected' : '') + '>' + BLN[+m.slice(5) - 1] + ' ' + m.slice(0, 4) + '</option>'; }).join('') + '</select>' +
        '<input class="input" id="kbQ" style="flex:1;min-width:200px" placeholder="Cari nomor BA, fungsi, user, KIMAP, PO, AFE…" value="' + esc(R.q) + '">' +
        '<button class="btn" data-ka="refresh">Muat ulang</button><button class="btn" data-ka="rekap">Rekap Excel</button><a class="btn primary" href="#/kembali">+ Buat BA</a></div>' +
        '<div class="card"><div class="card-pad fleet-statbar"><div class="chips">' + TABS.map(function (t) {
          return '<button class="chip-toggle' + (R.filt === t ? ' on' : '') + '" data-ka="tab" data-v="' + esc(t) + '">' + esc(t) + ' <span class="chip-n">' + base.filter(function (r) { return inTab(r, t); }).length + '</span></button>';
        }).join('') + '<span class="small muted" style="margin-left:auto">Menampilkan <b>' + list.length + '</b> dari ' + all.length + ' dokumen</span></div></div>' +
        (list.length ? '<div class="table-wrap"><table class="grid rcv-table"><thead><tr><th>No. BA / Tanggal</th><th>Jenis</th><th>User / Fungsi</th><th>Material</th><th>Integrasi / Masa titip</th><th>Status</th><th></th></tr></thead><tbody>' + list.map(rowHtml).join('') + '</tbody></table></div>'
          : '<div class="empty" style="padding:28px"><h3>Belum ada dokumen</h3><p>Buat BA di <a href="#/kembali">Pengembalian Material &amp; Penitipan DC</a> lalu ajukan untuk approval.</p></div>') + '</div>';
    }
    function rowHtml(r) {
      var t = totals(r), first = t.rows[0] || {}, acts = [], s = dcState(r);
      acts.push('<button class="btn sm" data-ka="export" data-id="' + esc(r.id) + '">' + (r.status === ST.ok ? 'Export' : 'Preview') + '</button>');
      if (r.status === ST.pending && canApproveRec(r)) acts.unshift('<button class="btn sm primary" data-ka="approve" data-id="' + esc(r.id) + '">Approve</button><button class="btn sm" data-ka="reject" data-id="' + esc(r.id) + '">Tolak</button>');
      if (canRcv()) acts.push('<button class="btn sm" data-ka="edit" data-id="' + esc(r.id) + '">Edit</button>');
      if (r.status === ST.pending && (r.createdById === S.user.id || canRcv())) acts.push('<button class="btn sm" data-ka="cancel" data-id="' + esc(r.id) + '">Batalkan</button>');
      if (s && s.k !== 'done' && canRcv()) {
        if (!r.ext) acts.push('<button class="btn sm" data-ka="extend" data-id="' + esc(r.id) + '" title="Perpanjangan maks. 1 bulan dengan memo perpanjangan User">Perpanjang 1 bulan</button>');
        acts.push('<button class="btn sm" data-ka="done" data-id="' + esc(r.id) + '" title="Material sudah diambil User">Selesai — diambil</button>');
      }
      if (r.status === ST.ok && canRcv()) acts.push('<button class="btn sm warn-btn" data-ka="revise" data-id="' + esc(r.id) + '">Ajukan Revisi</button>');
      if (canRcv()) acts.push('<button class="btn sm danger" data-ka="delete" data-id="' + esc(r.id) + '">Hapus</button>');
      var who = r.kind === 'dc' ? '<b>' + esc(r.h.p1name || '') + '</b><div class="small muted">' + esc(r.h.p1jab || '') + '</div>' : '<b>' + esc(r.h.fungsi || '') + '</b><div class="small muted">' + esc((r.sign && r.sign.user || []).map(function (p) { return p.name; }).join(', ')) + '</div>';
      var mid = r.kind === 'dc' ? '<div class="small">s/d <b>' + esc(dot(dueOf(r))) + '</b>' + (r.ext ? ' <span class="badge">diperpanjang</span>' : '') + '</div>' + (s ? '<span class="badge ' + s.cls + '">' + esc(s.t) + '</span>' : '<span class="small muted">' + esc((r.h.bulan || 3) + ' bulan') + '</span>')
        : '<div class="small">' + esc(r.h.statMat || '') + ' · ' + esc(r.h.integ || '') + '</div>' + (t.val ? '<div class="small muted">Rp ' + idr(t.val) + '</div>' : '');
      var signedBy = r.approvedBy ? 'Approve: ' + r.approvedBy + (r.kind === 'dc' ? ' · TTD ' + ((profile(recvUid()) || {}).name || 'Receiving') : '') : '';
      return '<tr><td><b class="mono">' + esc((r.no && r.no.no) || '—') + '</b><div class="small">' + esc(dot(r.h.tgl)) + '</div></td>' +
        '<td><span class="badge ' + (r.kind === 'dc' ? 'bau' : 'ro') + '">' + esc(KIND_SHORT[r.kind]) + '</span>' + (r.kind === 'ret' ? '<div class="small muted">' + esc(r.h.jenis) + (r.h.project ? ' · ' + esc(r.h.project) : '') + '</div>' : '') + '</td>' +
        '<td>' + who + '</td><td><b>' + t.n + '</b> item<div class="small muted">' + esc(qty(first.q) + ' ' + (first.u || '') + ' ' + (first.d || '')) + (t.n > 1 ? ' …' : '') + '</div></td><td>' + mid + '</td>' +
        '<td>' + badge(r.status) + (r.status === ST.rev ? '<div class="small txt-bad">Revisi: ' + esc(r.revBy || '') + (r.revNote ? ' — ' + esc(r.revNote) : '') + '</div>' : '') +
        (r.status === ST.pending && r.reapprove ? '<div><span class="badge warn">Diedit — perlu approve ulang</span></div>' : '') +
        (r.status === ST.pending ? '<div class="small muted">Approval: ' + (r.kind === 'dc' ? 'Seto Agustian / Owner' : 'Gerald / Seto') + '</div>' : '') +
        (r.updatedBy ? '<div class="small muted">Last edit: ' + esc(r.updatedBy) + ' · ' + esc(fmtTime(r.updatedAt)) + '</div>' : '') +
        '<div class="small muted">' + esc(r.status === ST.ok ? signedBy : r.status === ST.no ? (r.rejectBy || '') + (r.rejectNote ? ': ' + r.rejectNote : '') : 'oleh ' + (r.createdBy || '') + ' · ' + fmtTime(r.createdAt)) + '</div>' +
        (r.done ? '<div class="small muted">Diambil ' + esc(dot(r.done.tgl)) + (r.done.note ? ' — ' + esc(r.done.note) : '') + ' (' + esc(r.done.by) + ')</div>' : '') + '</td>' +
        '<td><div class="fleet-acts">' + acts.join('') + '</div></td></tr>';
    }

    // ---------- approve / status ----------
    function drawerOpen(html) { var d = $('#drawer'); d.innerHTML = html; d.classList.add('open'); d.setAttribute('aria-hidden', 'false'); $('#scrim').classList.add('open'); }
    function signerFor(r) { return r.kind === 'dc' ? profile(recvUid()) : profile(S.user.id); }
    function openApprove(id) {
      var r = find(id);
      if (!r || !canApproveRec(r)) return;
      var sg = signerFor(r);
      if (!sg || !sg.img) { toast(r.kind === 'dc' ? 'Tanda tangan Seto Agustian (Receiving) belum diatur di Pengaturan' : 'Atur tanda tangan & profil Anda dulu di Pengaturan', true); if (!(r.kind === 'dc')) location.hash = '#/pengaturan'; return; }
      var t = totals(r);
      drawerOpen('<div class="drawer-head"><div style="flex:1"><div class="mono muted">Approval ' + esc(KIND[r.kind]) + '</div><h2>' + esc((r.no && r.no.no) || '') + '</h2></div><button class="icon-btn" data-act="close-drawer">✕</button></div><div class="drawer-body">' +
        '<div class="kv">' + (r.kind === 'dc'
          ? '<div><span>Pihak Pertama</span><b>' + esc(r.h.p1name) + '</b></div><div><span>Jabatan</span><b>' + esc(r.h.p1jab) + '</b></div><div><span>Tanggal BA</span><b>' + esc(dot(r.h.tgl)) + '</b></div><div><span>Jatuh tempo</span><b>' + esc(dot(dueOf(r))) + '</b></div><div><span>Memo User</span><b>' + esc(r.h.memoUser || '—') + '</b></div>'
          : '<div><span>Jenis</span><b>' + esc(r.h.jenis) + '</b></div><div><span>Fungsi User</span><b>' + esc(r.h.fungsi) + '</b></div><div><span>Tanggal BA</span><b>' + esc(dot(r.h.tgl)) + '</b></div><div><span>Status / Integrasi</span><b>' + esc(r.h.statMat + ' · ' + r.h.integ) + '</b></div>' + (r.h.project ? '<div><span>Project / AFE</span><b>' + esc(r.h.project + ' / ' + r.h.afe) + '</b></div>' : '')) +
        '<div><span>Diajukan</span><b>' + esc(r.createdBy) + '</b></div></div>' +
        '<table class="grid"><thead><tr><th>No</th><th>Deskripsi</th><th class="num">Qty</th><th>' + (r.kind === 'dc' ? 'Keterangan' : 'Kondisi') + '</th></tr></thead><tbody>' +
        t.rows.map(function (x, i) { return '<tr><td>' + (i + 1) + '</td><td>' + esc((x.m ? x.m + ' · ' : '') + x.d) + '</td><td class="num">' + qty(x.q) + ' ' + esc(x.u || '') + '</td><td>' + esc(r.kind === 'dc' ? x.ket || '' : x.kond || '') + '</td></tr>'; }).join('') + '</tbody></table>' +
        '<div class="sign-preview"><div class="small muted">' + (r.kind === 'dc' ? 'Tanda tangan yang tertempel di <b>Pihak Kedua</b> (fungsi Receiving):' : 'Tanda tangan Anda tertempel di <b>Tim Warehouse Operation &amp; Material Management</b>:') + '</div><img src="' + sg.img + '" alt="Tanda tangan"><b>' + esc(sg.name) + '</b><div class="small muted">' + esc(sg.jab || '') + '</div></div>' +
        '<div class="toolbar"><button class="btn primary" data-ka="approve-do" data-id="' + esc(r.id) + '">Approve &amp; tempel tanda tangan</button><button class="btn" data-ka="export" data-id="' + esc(r.id) + '">Preview</button></div></div>');
    }
    async function approve(id) {
      var r = find(id);
      if (!r || !canApproveRec(r)) return;
      var signer = signerFor(r), at = new Date().toISOString(), uid = S.user.id;
      if (!signer || !signer.img) { toast('Tanda tangan belum diatur', true); return; }
      loading('Menyimpan approval…');
      try {
        await save(function (D) {
          D.list = D.list.map(function (x) {
            if (x.id !== id || x.status !== ST.pending) return x;
            var sg = {}; sg[signer.uid] = at;
            return Object.assign({}, x, { status: ST.ok, approvedBy: me(), approvedById: uid, approvedAt: at, signerUid: signer.uid, signed: sg, reapprove: false });
          });
          return D;
        }, (r.kind === 'dc' ? 'Penitipan DC' : 'Pengembalian material') + ': approve ' + ((r.no && r.no.no) || id) + ' (' + me() + ')');
        ctx.closeDrawer(); toast('Disetujui — ' + ((r.no && r.no.no) || ''));
        openExport(id);
      } catch (e) { toast('Gagal approve: ' + e.message, true); }
      finally { loading(false); if (ctx.route() === 'kembali-riwayat') renderHistory(); }
    }
    async function update(id, fn, msg, okMsg) {
      loading('Menyimpan…');
      try {
        await save(function (D) { D.list = D.list.map(function (x) { return x.id === id ? fn(x) : x; }); return D; }, msg);
        toast(okMsg);
      } catch (e) { toast('Gagal: ' + e.message, true); }
      finally { loading(false); renderHistory(); }
    }
    function setStatus(id, st, extra, okMsg) {
      update(id, function (x) { return x.status === ST.pending ? Object.assign({}, x, { status: st, updatedBy: me(), updatedAt: new Date().toISOString() }, extra || {}) : x; },
        'Pengembalian/Penitipan: ' + st.toLowerCase() + ' ' + id + ' (' + me() + ')', okMsg);
    }
    function requestRevision(id) {
      var r = find(id); if (!r || r.status !== ST.ok || !canRcv()) return;
      var why = prompt('Ajukan revisi ' + r.no.no + '\nApa yang perlu diperbaiki? (tanda tangan dilepas, lalu approve ulang)', '');
      if (why === null) return;
      update(id, function (x) {
        if (x.status !== ST.ok) return x;
        var nx = Object.assign({}, x, { status: ST.rev, signed: {}, revBy: me(), revAt: new Date().toISOString(), revNote: why, reapprove: true, reapproveFrom: ST.ok });
        delete nx.approvedBy; delete nx.approvedById; delete nx.approvedAt; delete nx.signerUid;
        return nx;
      }, 'Pengembalian/Penitipan: ajukan revisi ' + r.no.no + ' (' + me() + ')', 'Revisi diajukan — dokumen kembali untuk diperbaiki');
    }
    function extend(id) {
      var r = find(id); if (!r || r.ext) return;
      var memo = prompt('Perpanjangan penitipan 1 bulan (maks.) — ' + r.no.no + '\nNo. Memo Perpanjangan dari User (disetujui pejabat satu tingkat di atas penandatangan memo permohonan):', '');
      if (memo === null) return;
      if (!memo.trim()) { toast('Isi nomor memo perpanjangan', true); return; }
      var until = addMonths(utc(dueOf(r)) ? ymd(new Date(utc(dueOf(r)).getTime() + 864e5)) : today(), 1);
      update(id, function (x) { return Object.assign({}, x, { ext: { at: new Date().toISOString(), by: me(), memo: memo.trim(), from: dueOf(x), until: until } }); },
        'Penitipan DC: perpanjang ' + r.no.no + ' s/d ' + until + ' (' + me() + ')', 'Diperpanjang s/d ' + dot(until));
    }
    function markDone(id) {
      var r = find(id); if (!r) return;
      var tgl = prompt('Tanggal material diambil User (YYYY-MM-DD):', today());
      if (tgl === null) return;
      if (!utc(tgl)) { toast('Format tanggal YYYY-MM-DD', true); return; }
      var note = prompt('Catatan (opsional, mis. No. Pass Keluar / penerima):', '') || '';
      update(id, function (x) { return Object.assign({}, x, { done: { tgl: tgl, note: note, by: me(), at: new Date().toISOString() } }); },
        'Penitipan DC: selesai ' + r.no.no + ' (' + me() + ')', 'Penitipan ditandai selesai');
    }
    async function remove(r) {
      if (!canRcv() || !confirm('Hapus permanen ' + KIND[r.kind] + ' ' + ((r.no && r.no.no) || '') + '?')) return;
      loading('Menghapus…');
      try {
        await save(function (D) { D.list = D.list.filter(function (x) { return x.id !== r.id; }); return D; }, 'Pengembalian/Penitipan: hapus ' + ((r.no && r.no.no) || r.id) + ' (' + me() + ')');
        toast('Dihapus');
        if (ctx.audit) ctx.audit('Pengembalian Material & Penitipan DC', KIND_SHORT[r.kind] + ' ' + ((r.no && r.no.no) || 'Draft') + ' · ' + (r.h.fungsi || r.h.p1name || '') + ' · ' + r.status, r);
      } catch (e) { toast('Gagal menghapus: ' + e.message, true); }
      finally { loading(false); renderHistory(); }
    }
    function startEdit(id) {
      var r = find(id); if (!r || !canRcv()) return;
      var d = newDraft(r.kind);
      ['h', 'items', 'docs', 'sign'].forEach(function (k) { if (r[k]) d[k] = clone(r[k]); });
      if (r.no && r.no.seq) { d.h.seq = r.no.seq; d.h.seqManual = true; }
      if (!d.items.length) d.items = newDraft(r.kind).items;
      R.kind = r.kind; R.drafts[r.kind] = d; R.editId = id; delete R.memo[r.kind]; storeDraft();
      location.hash = '#/kembali';
      if (r.fotoFile && r.fotoFile.path) ctx.pass().readJSON(r.fotoFile.path).then(function (m) { Object.assign(R.fotos, m || {}); storeFotos(); if (ctx.route() === 'kembali') rerender(); }, function () { toast('Foto material gagal dimuat', true); });
    }

    // ================= Export =================
    function openExport(id) {
      var r = find(id) || (id === 'draft' ? R.previewRec : null);
      if (!r) return;
      var dcMemo = r.kind === 'dc' ? memoDoc() : null;
      drawerOpen('<div class="drawer-head"><div style="flex:1"><div class="mono muted">' + esc((r.no && r.no.no) || 'Draft — belum diajukan') + '</div><h2>' + esc(KIND[r.kind]) + '</h2></div><button class="icon-btn" data-act="close-drawer">✕</button></div>' +
        '<div class="drawer-body"><div class="small muted">' + (r.status !== ST.ok ? '<b>' + esc(r.status || 'Draft') + '</b> — PDF diberi tanda DRAFT sampai di-approve.' : 'Disetujui ' + esc(r.approvedBy || '') + ' · ' + esc(fmtTime(r.approvedAt))) + '</div>' +
        (r.kind === 'dc' ? '<div class="small" style="margin:8px 0">Lampiran 1: Memo VP SCM ' + MEMO_NO + (dcMemo ? ' <span class="badge ok">otomatis dilampirkan</span>' : ' <span class="badge bad">belum ada di TKO &amp; Referensi</span>') + (r.memoFile ? '<br>Lampiran 2: Memo Permohonan User (' + esc(r.memoFile.name) + ')' : '') + '</div>'
          : '<div class="small" style="margin:8px 0">Isi PDF: Berita Acara Serah Terima &amp; Point of Agreement + Daftar Material (TKO B7-044 Lampiran 4). GR Slip dari SAP.</div>') +
        '<div class="toolbar"><button class="btn primary" data-ka="pdf" data-id="' + esc(r.id) + '">Download PDF</button>' + (r.kind === 'ret' ? '<button class="btn" data-ka="xlsx" data-id="' + esc(r.id) + '">Daftar Material (Excel)</button>' : '') + '</div></div>');
    }
    function memoDoc() { return (ctx.docs() || []).filter(function (x) { return String(x.no || '').indexOf(MEMO_NO) >= 0; })[0] || null; }
    async function dataUrl(path) {
      if (R.img[path]) return R.img[path];
      var b = await (await fetch(path)).blob();
      R.img[path] = await new Promise(function (res) { var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.readAsDataURL(b); });
      return R.img[path];
    }
    function loadPdfLib() {
      if (root.PDFLib) return Promise.resolve(root.PDFLib);
      return new Promise(function (resolve, reject) {
        var s = document.createElement('script'); s.src = 'vendor/pdf-lib.min.js';
        s.onload = function () { resolve(root.PDFLib); }; s.onerror = function () { reject(new Error('Library PDF gagal dimuat')); };
        document.head.appendChild(s);
      });
    }

    // ---------- PDF kit (A4, pt) ----------
    function kit(doc, lg, draft) {
      var K = { doc: doc, page: 0, draft: draft };
      K.setPage = function (o) {
        K.o = o; K.W = o === 'landscape' ? 841.89 : 595.28; K.H = o === 'landscape' ? 595.28 : 841.89;
        K.L = o === 'landscape' ? 36 : 60; K.R = K.W - (o === 'landscape' ? 36 : 56); K.CW = K.R - K.L; K.BOT = K.H - 48;
      };
      K.font = function (sz, st) { doc.setFont('helvetica', st || 'normal'); doc.setFontSize(sz); };
      K.deco = function () {
        K.font(6.5, 'italic'); doc.setTextColor(130);
        doc.text('Dicetak dari Material Warehouse & Heavy Transport — SCM Field Rantau', K.L, K.H - 20);
        doc.text('Hal. ' + K.page, K.R, K.H - 20, { align: 'right' });
        doc.setTextColor(0);
        doc.addImage(lg, 'PNG', K.R - 104, 26, 104, 31.4);
        if (K.draft) { doc.setTextColor(210, 50, 50); K.font(K.draft.length > 30 ? 22 : 36, 'bold'); doc.text(K.draft, K.W / 2, K.H / 2, { align: 'center', angle: 30 }); doc.setTextColor(0); }
      };
      K.newPage = function (o) {
        o = o || 'portrait';
        if (K.page) doc.addPage('a4', o);
        K.page++; K.setPage(o); K.deco(); K.y = 72;
      };
      K.need = function (h) { if (K.y + h > K.BOT) { var f = doc.getFont(), fs = doc.getFontSize(); K.newPage(K.o); doc.setFont(f.fontName, f.fontStyle); doc.setFontSize(fs); } };
      K.center = function (t, sz, st, o) {
        o = o || {}; K.font(sz, st);
        var lines = doc.splitTextToSize(String(t), K.CW - 20);
        lines.forEach(function (ln) {
          K.need(sz * 1.3); doc.text(ln, K.W / 2, K.y + sz, { align: 'center' });
          if (o.u) { var tw = doc.getTextWidth(ln); doc.setLineWidth(0.8); doc.line(K.W / 2 - tw / 2, K.y + sz + 2, K.W / 2 + tw / 2, K.y + sz + 2); }
          K.y += sz * 1.3;
        });
        K.y += o.after == null ? 2 : o.after;
      };
      // lebar teks tanpa kerning (doc.text tidak memakai kerning → posisi kata per kata tetap pas)
      K.tw = function (t) { return doc.getStringUnitWidth(t, { kerning: {} }) * doc.getFontSize() / doc.internal.scaleFactor; };
      // teks dengan **tebal**, rata kiri-kanan, label nomor menggantung
      K.rich = function (txt, o) {
        o = o || {};
        var sz = o.sz || 10, x0 = K.L + (o.indent || 0), w = K.CW - (o.indent || 0), lh = sz * 1.4, toks = [];
        String(txt).split('**').forEach(function (p, i) { p.split(/(\s+)/).forEach(function (t) { if (t) toks.push({ t: t, b: i % 2 === 1 || !!o.bold }); }); });
        var lines = [], cur = [], cw = 0;
        toks.forEach(function (tk) {
          K.font(sz, tk.b ? 'bold' : 'normal');
          if (/^\s+$/.test(tk.t)) { if (cur.length) { var sw = K.tw(' '); cur.push({ t: ' ', w: sw, b: tk.b }); cw += sw; } return; }
          var tw = K.tw(tk.t);
          if (cw + tw > w && cur.length) { while (cur.length && cur[cur.length - 1].t === ' ') cw -= cur.pop().w; lines.push(cur); cur = []; cw = 0; }
          cur.push({ t: tk.t, b: tk.b, w: tw }); cw += tw;
        });
        while (cur.length && cur[cur.length - 1].t === ' ') cur.pop();
        if (cur.length) lines.push(cur);
        lines.forEach(function (ln, li) {
          K.need(lh);
          var tot = ln.reduce(function (a, s) { return a + s.w; }, 0), sp = ln.filter(function (s) { return s.t === ' '; }).length, gap = 0, x = x0;
          if (o.justify !== false && li < lines.length - 1 && sp) gap = (w - tot) / sp;
          if (o.center) x = x0 + (w - tot) / 2;
          if (li === 0 && o.label) { K.font(sz, o.labelBold ? 'bold' : 'normal'); doc.text(o.label, x0 - (o.labelW || 16), K.y + sz); }
          // kata per kata (lebar tanpa kerning) → selisih metrik tidak menumpuk sepanjang baris
          ln.forEach(function (s) { if (s.t === ' ') { x += s.w + gap; return; } K.font(sz, s.b ? 'bold' : 'normal'); doc.text(s.t, x, K.y + sz); x += s.w; });
          K.y += lh;
        });
        K.y += o.after == null ? 4 : o.after;
      };
      K.check = function (x, y, on) {
        doc.setLineWidth(0.6); doc.rect(x, y, 8, 8);
        if (on) { doc.setLineWidth(1.1); doc.lines([[1.8, 2.3], [3.6, -5]], x + 1.5, y + 4); doc.setLineWidth(0.6); }
      };
      K.table = function (cols, rows, o) {
        o = o || {};
        var sz = o.sz || 8.5, hs = o.hsz || sz, tw = cols.reduce(function (a, c) { return a + c.w; }, 0);
        var ws = cols.map(function (c) { return c.w / tw * K.CW; }), xs = [K.L];
        ws.forEach(function (w, i) { xs.push(xs[i] + w); });
        var hl = cols.map(function (c, i) { K.font(hs, 'bold'); return doc.splitTextToSize(c.t, ws[i] - 4); });
        var hh = Math.max(16, Math.max.apply(null, hl.map(function (l) { return l.length; })) * hs * 1.18 + 6);
        var head = function () {
          cols.forEach(function (c, i) {
            if (o.fill) { doc.setFillColor(221, 235, 247); doc.rect(xs[i], K.y, ws[i], hh, 'FD'); } else doc.rect(xs[i], K.y, ws[i], hh);
            K.font(hs, 'bold');
            var ty = K.y + hh / 2 - (hl[i].length - 1) * hs * 0.59 + hs * 0.35;
            hl[i].forEach(function (ln, j) { doc.text(ln, xs[i] + ws[i] / 2, ty + j * hs * 1.18, { align: 'center' }); });
          });
          K.y += hh;
        };
        doc.setLineWidth(0.5); doc.setDrawColor(0);
        K.need(hh + 18); head();
        rows.forEach(function (row) {
          var cells = row.map(function (v) { return v != null && typeof v === 'object' ? v : { t: v }; });
          var ls = cells.map(function (cl, i) { K.font(sz, cl.b ? 'bold' : 'normal'); return doc.splitTextToSize(String(cl.t == null ? '' : cl.t), ws[i] - 5); });
          var rh = Math.max(o.rowH || 15, Math.max.apply(null, ls.map(function (l) { return l.length; })) * sz * 1.2 + 6, Math.max.apply(null, cells.map(function (cl) { return cl.minH || 0; })));
          var pg = K.page; K.need(rh); if (pg !== K.page) head();
          cells.forEach(function (cl, i) {
            if (cl.span) return;
            var w = ws[i], j = i; while (cells[j + 1] && cells[j + 1].span) w += ws[++j];
            doc.rect(xs[i], K.y, w, rh);
            if (cl.img) {
              var ip = doc.getImageProperties(cl.img), kk = Math.min((w - 4) / ip.width, (rh - 4) / ip.height);
              doc.addImage(cl.img, 'JPEG', xs[i] + w / 2 - ip.width * kk / 2, K.y + rh / 2 - ip.height * kk / 2, ip.width * kk, ip.height * kk);
              return;
            }
            K.font(sz, cl.b ? 'bold' : 'normal');
            var a = cl.a || cols[i].a || 'l', lines = w !== ws[i] ? doc.splitTextToSize(String(cl.t || ''), w - 5) : ls[i];
            var y0 = K.y + rh / 2 - (lines.length - 1) * sz * 0.6 + sz * 0.35;
            lines.forEach(function (ln, k) { doc.text(ln, a === 'c' ? xs[i] + w / 2 : a === 'r' ? xs[i] + w - 3 : xs[i] + 3, y0 + k * sz * 1.2, { align: a === 'c' ? 'center' : a === 'r' ? 'right' : 'left' }); });
          });
          K.y += rh;
        });
        K.y += o.after == null ? 8 : o.after;
      };
      // satu penandatangan: ruang tanda tangan, nama (garis bawah), jabatan
      K.person = function (x, w, y, p, sigH) {
        if (p.img) ctx.pass().placeSign(doc, p.img, x + w / 2, y + sigH - 2, Math.min(w - 16, 150), sigH - 6);
        K.font(9.5, 'bold');
        var nm = p.name ? p.name : '';
        if (nm) { doc.text(nm, x + w / 2, y + sigH + 10, { align: 'center' }); var tw = doc.getTextWidth(nm); doc.setLineWidth(0.5); doc.line(x + w / 2 - tw / 2, y + sigH + 11.5, x + w / 2 + tw / 2, y + sigH + 11.5); }
        else { doc.setLineWidth(0.4); doc.line(x + w / 2 - 60, y + sigH + 11.5, x + w / 2 + 60, y + sigH + 11.5); }
        K.font(8.5, 'normal');
        var jl = doc.splitTextToSize(p.jab || '', w - 8);
        jl.slice(0, 3).forEach(function (ln, k) { doc.text(ln, x + w / 2, y + sigH + 22 + k * 10, { align: 'center' }); });
        return sigH + 24 + Math.min(3, jl.length) * 10;
      };
      return K;
    }
    function draftMark(r) { return r.status === ST.ok ? '' : r.status === ST.pending || !r.status ? 'DRAFT - MENUNGGU APPROVAL' : 'DRAFT - ' + r.status.toUpperCase(); }

    // ---------- PDF: BA Pengembalian (TKO B7-044 Lampiran 4) ----------
    function retTitle(h) {
      var jn = h.jenis.toUpperCase().replace('EX ', 'EX ');
      if (h.jenis === 'Ex Project') return 'SERAH TERIMA & POINT OF AGREEMENT MATERIAL EXCESS PROJECT (' + (h.project || '…') + ') (AFE ' + (h.afe || '…') + ')' + (h.statMat === 'Direct Charge' ? ' / DIRECT CHARGE' : h.statMat === 'Stock' ? ' / STOCK MATERIAL' : '');
      return 'SERAH TERIMA & POINT OF AGREEMENT PENGEMBALIAN MATERIAL ' + jn + ' (' + (h.statMat === 'Direct Charge' ? 'DIRECT CHARGE' : h.statMat === 'Stock' ? 'STOCK MATERIAL' : 'NON STOCK MATERIAL') + ')';
    }
    function retAgreement(r) {
      var h = r.h, P = h.project || '…', A = h.afe || '…';
      if (h.jenis === 'Ex Project') return [
        'Tim **Project** menyatakan bahwa material yang tercantum dalam daftar material di BAST ini merupakan keseluruhan material sisa Project **' + P + '**, AFE **' + A + '** tanpa ada material yang tertinggal di lokasi Kontraktor.',
        'Material yang akan dilaporkan ke SKK Migas sebagai Material Surplus Project dan dilampirkan ke dalam laporan PIS adalah material yang sudah dibebankan ke AFE Project dan akan dilaporkan pada dokumen AFE Close Out. Pemanfaatan terhadap material tersebut diperbolehkan setelah PIS disetujui.',
        'Seluruh pengelolaan material sisa proyek diserahkan ke SCM yang selanjutnya akan dikelola oleh SCM sesuai aturan yang berlaku termasuk alokasi pemakaian ke internal dan eksternal beserta pengajuan usulan pelepasan dan penghapusan.',
        'Apabila nantinya diajukan pelepasan dan penghapusan, tim Project akan membantu dalam memberikan justifikasi teknis dan keekonomian, serta menandatangani dokumen pelepasan dan penghapusan.',
        'Apabila nantinya terdapat material sisa Project yang tidak disetujui untuk dibebankan ke dalam AFE, tim Project akan membuatkan Justifikasi untuk Realokasi Cost ke Inventory.'];
      var drill = h.jenis === 'Ex Drilling';
      return [
        'Fungsi User **' + (h.fungsi || '…') + '** menyatakan bahwa material yang tercantum dalam daftar material di BAST ini merupakan material sisa ' + (drill ? 'kegiatan drilling' : 'aktivitas operasional') + ' yang dikembalikan ke warehouse, dengan status material **' + h.statMat + '**.',
        'Material telah melalui preliminary inspection oleh Fungsi User (hasil: **' + (h.inspeksi || 'Baik') + '**) dan pemeriksaan oleh Fungsi Warehouse setelah material sampai di warehouse; kondisi tiap material sebagaimana tercantum pada Daftar Material.',
        'Integrasi ke dalam sistem SAP dilakukan dengan **' + h.integ + '**' + (drill ? '; material kondisi baik return ke warehouse, material repairable diperbaiki/rekondisi dengan anggaran Fungsi User, dan material yang tidak dapat diperbaiki tidak diintegrasikan (proses scrap).' : ' sesuai status cost object material (open/closed).'),
        'Pengelolaan material selanjutnya diserahkan ke SCM sesuai aturan yang berlaku, dan proses penerimaan material mengacu ke TKO B7-038/PHE52000/2022-S9 Rev.0 dan/atau perubahannya.'];
    }
    function fotoCount(r) { var F = r._fotos || {}; return totals(r).rows.filter(function (x) { return x.fid && F[x.fid]; }).length; }
    function groupItems(r) {
      var g = {}, order = [];
      totals(r).rows.forEach(function (x) { var c = x.cat || 'Material'; if (!g[c]) { g[c] = []; order.push(c); } g[c].push(x); });
      return order.map(function (c) { return { cat: c, items: g[c] }; });
    }
    function pdfRet(K, r) {
      var h = r.h, doc = K.doc, no = (r.no && r.no.no) || docNoFor('ret', num(h.seq) || 1, h), t = totals(r);
      K.newPage('portrait'); K.y = 84;
      K.center('BERITA ACARA', 16, 'bold', { u: true, after: 4 });
      K.center('No. ' + no, 11, 'normal', { after: 8 });
      K.center('TENTANG', 13, 'normal', { after: 8 });
      K.center(retTitle(h), 12.5, 'bold', { after: 0 });
      K.center('DI GUDANG PENYIMPANAN PT. PERTAMINA HULU ENERGI', 12.5, 'bold', { after: 0 });
      K.center('(' + (h.ap || '…') + ', ' + (h.wh || '…') + ')', 12.5, 'bold', { after: 16 });
      var hdr = 'Pada hari ini **' + hari(h.tgl) + '** tanggal **' + (utc(h.tgl) ? utc(h.tgl).getUTCDate() : '…') + '** bulan **' + (utc(h.tgl) ? BLN[utc(h.tgl).getUTCMonth()] : '…') + '** tahun **' + (utc(h.tgl) ? utc(h.tgl).getUTCFullYear() : '…') +
        '** bertempat di gudang penyimpanan PT. Pertamina Hulu Energi **' + (h.ap || '…') + '** di **' + (h.wh || '…') + '** telah dilaksanakan serah terima ';
      if (h.jenis === 'Ex Project') hdr += 'material excess **' + (h.project || '…') + '** AFE **' + (h.afe || '…') + '**.' + (h.afeSt ? ' Status untuk AFE **' + h.afe + '** tersebut **' + h.afeSt + '**.' : '');
      else hdr += 'pengembalian material **' + h.jenis + '** dari Fungsi User **' + (h.fungsi || '…') + '**' + (h.memo ? ' berdasarkan memo justifikasi No. **' + h.memo + '**' : '') + (h.reservasi ? ' (dokumen/reservasi SAP **' + h.reservasi + '**)' : '') + '.';
      K.rich(hdr, { after: 6 });
      K.rich('Serah terima terdiri dari:', { after: 2 });
      var gs = groupItems(r), n = 0;
      gs.forEach(function (g) {
        n++;
        K.rich((h.jenis === 'Ex Project' && /surplus/i.test(g.cat) ? 'Material surplus project yang dilaporkan ke dalam laporan PIS' : g.cat) + ' (' + g.items.length + ' item):', { indent: 18, label: n + '.', after: 1 });
        g.items.slice(0, 8).forEach(function (x, i) {
          K.rich(x.d + ' — ' + qty(x.q) + ' ' + (x.u || '') + (x.kond ? ' (' + x.kond + ')' : ''), { indent: 36, label: String.fromCharCode(97 + i) + '.', justify: false, after: 0 });
        });
        if (g.items.length > 8) K.rich('… dan ' + (g.items.length - 8) + ' item lainnya (lihat Daftar Material terlampir)', { indent: 36, justify: false, after: 0 });
        K.y += 3;
      });
      K.rich('Daftar Material terlampir' + (fotoCount(r) ? ' beserta foto material.' : '.'), { indent: 18, label: (n + 1) + '.', after: 8 });
      K.rich('**Point of Agreement:**', { after: 2 });
      var pts = retAgreement(r);
      pts.forEach(function (p, i) { K.rich(p, { indent: 18, label: (i + 1) + '.', after: 2 }); });
      K.y += 6;
      K.rich('Demikian berita acara serah terima material ' + (h.jenis === 'Ex Project' ? 'excess **' + (h.project || '…') + '** (AFE **' + (h.afe || '…') + '**)' : '**' + h.jenis + '**') + ' ini dibuat dengan sebenarnya sebagai dokumen pendukung untuk proses serah terima pengelolaan material ke Logistic' + (h.jenis === 'Ex Project' ? ' sebagai material sisa proyek.' : '.'), { after: 14 });
      // tanda tangan: kiri Tim Project / Fungsi User, kanan Tim Warehouse
      var left = (r.sign && r.sign.user) || [], wh = [];
      var ap = r.status === ST.ok ? profile(r.signerUid || r.approvedById) : null;
      wh.push(ap ? { name: ap.name, jab: ap.jab, img: (r.signed || {})[ap.uid] ? ap.img : null } : { name: '', jab: 'Gerald / Seto (yang approve)' });
      var colW = K.CW / 2, rowsN = Math.max(left.length, wh.length), sigH = 52;
      K.need(40 + sigH + 50);
      K.font(10, 'bold');
      doc.text(h.jenis === 'Ex Project' ? 'Tim Project' : 'Fungsi User', K.L + colW / 2, K.y + 10, { align: 'center' });
      var wl = doc.splitTextToSize('Tim Warehouse Operation & Material Management', colW - 10);
      wl.forEach(function (ln, i) { doc.text(ln, K.L + colW * 1.5, K.y + 10 + i * 12, { align: 'center' }); });
      K.y += 8 + wl.length * 12;
      for (var i = 0; i < rowsN; i++) {
        K.need(sigH + 50);
        var y = K.y, h1 = left[i] ? K.person(K.L, colW, y, left[i], sigH) : 0, h2 = wh[i] ? K.person(K.L + colW, colW, y, wh[i], sigH) : 0;
        K.y = y + Math.max(h1, h2) + 6;
      }
      // Daftar material (landscape)
      K.newPage('landscape'); K.y = 70;
      K.center('DAFTAR MATERIAL ' + (h.jenis === 'Ex Project' ? 'SISA PROJECT' : 'PENGEMBALIAN ' + h.jenis.toUpperCase()), 11, 'bold', { after: 0 });
      K.center('SERAH TERIMA MATERIAL ' + no, 10, 'bold', { after: 8 });
      var proj = h.jenis === 'Ex Project', F = r._fotos || {}, anyF = fotoCount(r) > 0;
      var cols = [{ t: 'NO', w: 3, a: 'c' }, { t: 'CATEGORY', w: 9 }, { t: 'KIMAP', w: 8, a: 'c' }, { t: 'DESKRIPSI', w: 24 }, { t: 'UOM', w: 4, a: 'c' }, { t: 'KONDISI', w: 6, a: 'c' }, { t: 'QTY CHECK', w: 5, a: 'c' }]
        .concat(proj ? [{ t: 'AFE NO', w: 6, a: 'c' }, { t: 'PROJECT NAME', w: 8 }] : [])
        .concat([{ t: 'PO UNIT PRICE', w: 8, a: 'r' }, { t: 'PO VALUE', w: 9, a: 'r' }, { t: 'KET.', w: 9 }]).concat(anyF ? [{ t: 'GAMBAR', w: 10, a: 'c' }] : []);
      var rows = t.rows.map(function (x, i) {
        var row = [i + 1, x.cat || '', x.m || '', x.d, x.u || '', x.kond || '', qty(x.q)].concat(proj ? [h.afe || '', h.project || ''] : [])
          .concat([has(x.price) ? idr(x.price) : '', has(x.price) ? idr(num(x.q) * num(x.price)) : '', x.note || '']);
        if (anyF) row.push(x.fid && F[x.fid] ? { img: F[x.fid], minH: 54 } : '');
        return row;
      });
      var pre = proj ? 9 : 7, tot = [{ t: 'TOTAL', a: 'r', b: true }];
      for (var sp = 1; sp < pre + 1; sp++) tot.push({ span: 1 });
      tot.push({ t: idr(t.val), a: 'r', b: true }, ''); if (anyF) tot.push('');
      rows.push(tot);
      K.table(cols, rows, { sz: 7.5, hsz: 7.5, fill: true });
      K.font(7.5, 'italic'); doc.text('Lampiran BA ' + no + ' — mengacu ' + TKO_RET + ' Lampiran 4. GR Slip mengikuti dokumen SAP.', K.L, K.y + 4);
      // halaman foto material (3 x 2 per halaman)
      var withF = t.rows.map(function (x, i) { return { x: x, i: i }; }).filter(function (o) { return o.x.fid && F[o.x.fid]; });
      for (var fi = 0; fi < withF.length; fi++) {
        var pos = fi % 6;
        if (!pos) { K.newPage('landscape'); K.y = 70; K.center('FOTO MATERIAL — ' + no, 11, 'bold', { after: 6 }); }
        var gw = K.CW / 3, gh = 215, gx = K.L + (pos % 3) * gw, gy = K.y + Math.floor(pos / 3) * (gh + 8), o = withF[fi];
        doc.setLineWidth(0.5); doc.rect(gx + 4, gy, gw - 8, gh);
        var ip = doc.getImageProperties(F[o.x.fid]), kk = Math.min((gw - 20) / ip.width, (gh - 40) / ip.height), iw = ip.width * kk, ih = ip.height * kk;
        doc.addImage(F[o.x.fid], 'JPEG', gx + gw / 2 - iw / 2, gy + 6 + (gh - 40 - ih) / 2, iw, ih);
        K.font(8, 'bold'); doc.text((o.i + 1) + '. ' + (o.x.m || '') , gx + 10, gy + gh - 22);
        K.font(7.5, 'normal'); doc.text(doc.splitTextToSize((o.x.d || '') + ' — ' + qty(o.x.q) + ' ' + (o.x.u || '') + ' (' + (o.x.kond || '') + ')', gw - 22)[0], gx + 10, gy + gh - 10);
      }
    }

    // ---------- PDF: BA Penitipan Material Direct Charge ----------
    function pdfDc(K, r) {
      var h = r.h, doc = K.doc, no = (r.no && r.no.no) || docNoFor('dc', num(h.seq) || 1, h), rp = recvProfile() || { name: 'Seto Agustian', jab: 'Officer SCM Support & Receiving Rantau' };
      var dt = utc(h.tgl), F = h.field || 'Rantau';
      K.newPage('portrait'); K.y = 92;
      K.center('BERITA ACARA PENITIPAN MATERIAL', 13, 'bold', { after: 0 });
      K.center('No. ' + no, 10, 'normal', { after: 14 });
      K.rich('Dilakukan serah terima Aset/Material yang dituangkan di dalam Berita Acara Serah Penitipan Material (selanjutnya disebut "Berita Acara") berikut yang dibuat pada hari **' + hari(h.tgl) + ', tanggal ' + (dt ? dt.getUTCDate() : '…') + ', Bulan ' + (dt ? BLN[dt.getUTCMonth()] : '…') + ', Tahun ' + (dt ? dt.getUTCFullYear() : '…') + '** di **' + (h.wh || 'Warehouse Field ' + F) + '** oleh dan antara:', { after: 4 });
      var party = function (nm, jb) {
        [['1.', 'Nama', nm], ['2.', 'Jabatan', jb]].forEach(function (x) {
          K.need(14); K.font(10, 'normal');
          doc.text(x[0], K.L + 16, K.y + 10); doc.text(x[1], K.L + 32, K.y + 10); doc.text(':', K.L + 110, K.y + 10);
          var ls = doc.splitTextToSize(x[2] || '', K.CW - 122); ls.forEach(function (ln, i) { doc.text(ln, K.L + 118, K.y + 10 + i * 13); });
          K.y += 13 * Math.max(1, ls.length) + 1;
        });
      };
      party(h.p1name, h.p1jab);
      K.rich('Dalam hal ini berwenang sebagai ' + (h.p1jab || '…') + (h.p1fungsi && String(h.p1jab || '').toLowerCase().indexOf(String(h.p1fungsi).toLowerCase()) < 0 ? ' (Fungsi ' + h.p1fungsi + ')' : '') + ' sebagai **PIHAK PERTAMA**.', { after: 4 });
      party(rp.name, rp.jab);
      K.rich('Dalam hal ini berwenang sebagai ' + rp.jab + ' sebagai **PIHAK KEDUA**.', { after: 6 });
      K.rich('**PIHAK PERTAMA** menitipkan material kepada **PIHAK KEDUA** berupa;', { after: 4 });
      var rows = totals(r).rows.map(function (x, i) { return [i + 1, x.d, qty(x.q) + ' ' + (x.u || ''), x.ket || '']; });
      K.table([{ t: 'No', w: 6, a: 'c' }, { t: 'Deskripsi', w: 50 }, { t: 'Qty (UOM)', w: 16, a: 'c' }, { t: 'Keterangan', w: 28 }], rows, { sz: 9.5, hsz: 9.5, after: 8 });
      K.rich('Material tersebut akan disimpan oleh Field ' + F + ' pada ' + (h.gudang || 'Gudang ' + F) + '.', { after: 4 });
      if (h.alasan) K.rich('Alasan penitipan: ' + (h.alasan === 'Lainnya' ? h.alasanLain || 'Lainnya' : h.alasan) + '.', { after: 4 });
      K.rich('**PIHAK PERTAMA menyatakan bahwa :**', { after: 2 });
      var due = dueOf(Object.assign({}, r, { ext: null }));
      var pts = [
        'Status Material tersebut **Bukan Stock** dan **Bukan Ex Stock** sehingga pencatatan tidak diperlukan di SCM ' + F + '.',
        'Bersedia memindahkan material tersebut keluar gudang penyimpanan SCM ' + F + ' apabila diminta dalam hal diadakan Audit, arahan manajemen, dan/atau okupansi gudang meningkat.',
        'Sesuai Memo VP SCM No.' + MEMO_NO + ' terkait Ketentuan Penyimpanan Sementara Material Direct Charge di Warehouse (Lampiran 1)' + (h.memoUser ? ' dan Memo Permohonan Penitipan No. ' + h.memoUser + (h.memoTgl ? ' tanggal ' + longDate(h.memoTgl) : '') + (r.memoFile ? ' (Lampiran 2)' : '') : '') + '.',
        'Penitipan material memiliki durasi maksimum penitipan material Direct Charge di warehouse selama **' + (h.bulan || 3) + ' Bulan jatuh pada tanggal ' + longDate(due) + '**, dan apabila dibutuhkan perpanjangan maka diperbolehkan selama **1 Bulan setelahnya**.'];
      if (r.ext) pts.push('Perpanjangan penitipan selama 1 (satu) bulan s/d **' + longDate(r.ext.until) + '** berdasarkan Memo Perpanjangan No. ' + r.ext.memo + '.');
      pts.forEach(function (p, i) { K.rich(p, { indent: 18, label: (i + 1) + '.', after: 2 }); });
      K.y += 12;
      // kotak tanda tangan 2 kolom
      var colW = K.CW / 2, top, hh = 34, sh = 78, nh = 20;
      K.need(hh + sh + nh + 4); top = K.y;
      doc.setLineWidth(0.6);
      [[h.p1jab, h.p1name, null, 'PIHAK PERTAMA'], [rp.jab, rp.name, r.status === ST.ok && (r.signed || {})[rp.uid] ? rp.img : null, 'PIHAK KEDUA']].forEach(function (c, i) {
        var x = K.L + i * colW;
        doc.rect(x, top, colW, hh); doc.rect(x, top + hh, colW, sh); doc.rect(x, top + hh + sh, colW, nh);
        K.font(10, 'bold'); doc.text(c[3], x + colW / 2, top + 13, { align: 'center' });
        K.font(8.5, 'normal'); doc.splitTextToSize(c[0] || '', colW - 10).slice(0, 2).forEach(function (ln, k) { doc.text(ln, x + colW / 2, top + 24 + k * 9, { align: 'center' }); });
        if (c[2]) ctx.pass().placeSign(doc, c[2], x + colW / 2, top + hh + sh - 4, colW - 50, sh - 10);
        K.font(9.5, 'normal'); doc.text('(' + (c[1] || '                              ') + ')', x + colW / 2, top + hh + sh + 13.5, { align: 'center' });
      });
      K.y = top + hh + sh + nh + 10;
      if (r.done) { K.font(8.5, 'italic'); doc.text('Material telah diambil User pada ' + longDate(r.done.tgl) + (r.done.note ? ' — ' + r.done.note : ''), K.L, K.y + 6); }
    }

    async function buildPdf(r) {
      var JsPDF = await ctx.pass().loadJsPDF(), lg = await dataUrl('assets/terima/logo-phe.png');
      var doc = new JsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' }), K = kit(doc, lg, draftMark(r));
      if (r.kind === 'ret') {
        var F = r.id === 'draft' ? itemFotos(r.items) : {};
        if (r.id !== 'draft' && r.fotoFile && r.fotoFile.path) { try { F = (await ctx.pass().readJSON(r.fotoFile.path)) || {}; } catch (e) { toast('Foto material gagal dimuat: ' + e.message, true); } }
        r = Object.assign({}, r, { _fotos: F });
      }
      if (r.kind === 'dc') pdfDc(K, r); else pdfRet(K, r);
      return doc;
    }
    // BA DC + Lampiran 1 (Memo VP SCM 2230) + Lampiran 2 (memo User) digabung dengan pdf-lib
    async function buildDcBytes(r, doc) {
      var PL = await loadPdfLib(), out = await PL.PDFDocument.load(doc.output('arraybuffer'));
      var font = await out.embedFont(PL.StandardFonts.HelveticaBold), warn = [];
      var attach = async function (bytes, label) {
        var src = await PL.PDFDocument.load(bytes, { ignoreEncryption: true });
        var pages = await out.copyPages(src, src.getPageIndices());
        pages.forEach(function (p, i) {
          out.addPage(p);
          if (!i) { var sz = p.getSize(); p.drawText(label, { x: 40, y: sz.height - 24, size: 10, font: font, color: PL.rgb(0, 0, 0) }); }
        });
      };
      var md = memoDoc();
      if (md) {
        try { var url = await ctx.docBlob(md.id); await attach(await (await fetch(url)).arrayBuffer(), 'Lampiran 1. Memo VP SCM No. ' + MEMO_NO); }
        catch (e) { warn.push('Memo 2230 gagal dilampirkan: ' + e.message); }
      } else warn.push('Memo VP SCM ' + MEMO_NO + ' belum ada di TKO & Referensi');
      if (r.memoFile && r.memoFile.path) {
        try {
          var f = r.id === 'draft' ? R.memo.dc : await ctx.pass().readJSON(r.memoFile.path);
          if (f && f.b64) { var bin = atob(f.b64), u8 = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); await attach(u8, 'Lampiran 2. Memo Permohonan Penitipan' + (r.h.memoUser ? ' No. ' + r.h.memoUser : '')); }
        } catch (e) { warn.push('Memo User gagal dilampirkan: ' + e.message); }
      }
      return { bytes: await out.save(), warn: warn };
    }
    function fileBase(r) { return (r.kind === 'dc' ? 'BA_Penitipan_DC_' : 'BA_Pengembalian_') + String((r.no && r.no.no) || 'DRAFT').replace(/[\/\\\s]+/g, '_'); }
    function saveBlob(blob, name) {
      var url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    }
    async function downloadPdf(r) {
      loading('Membuat PDF…');
      try {
        var doc = await buildPdf(r);
        if (r.kind === 'dc') {
          var o = await buildDcBytes(r, doc);
          saveBlob(new Blob([o.bytes], { type: 'application/pdf' }), fileBase(r) + '.pdf');
          if (o.warn.length) toast(o.warn.join(' · '), true);
        } else doc.save(fileBase(r) + '.pdf');
      } catch (e) { toast('Gagal membuat PDF: ' + e.message, true); }
      finally { loading(false); }
    }

    // ---------- Excel: Daftar Material (Lampiran 4) & Rekap ----------
    var thin = { style: 'thin', color: { argb: 'FF000000' } }, BORDER = { top: thin, left: thin, bottom: thin, right: thin };
    function sheetTable(ws, row, cols, rows) {
      var hr = ws.getRow(row);
      cols.forEach(function (c, i) {
        var cl = hr.getCell(i + 1); cl.value = c[0]; cl.font = { name: 'Arial', size: 10, bold: true }; cl.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; cl.border = BORDER;
        cl.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } };
      });
      hr.height = 30;
      rows.forEach(function (vals, i) {
        var rr = ws.getRow(row + 1 + i);
        vals.forEach(function (v, j) { var cl = rr.getCell(j + 1); cl.value = v; cl.font = { name: 'Arial', size: 10 }; cl.border = BORDER; cl.alignment = { vertical: 'top', wrapText: true }; if (cols[j][2]) cl.numFmt = cols[j][2]; });
      });
    }
    var NUMF = '_(* #,##0_);_(* (#,##0);_(* "-"??_);_(@_)';
    async function downloadXlsx(r) {
      loading('Membuat Excel…');
      try {
        var ExcelJS = await ctx.loadExcelJS(), wb = new ExcelJS.Workbook(), t = totals(r), no = (r.no && r.no.no) || 'DRAFT';
        var ws = wb.addWorksheet('Daftar Material', { pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }, views: [{ state: 'frozen', ySplit: 4 }] });
        var cols = [['NO', 5], ['CATEGORY', 18], ['KIMAP', 13], ['DESKRIPSI', 42], ['UOM', 7], ['KONDISI', 12], ['QTY CHECK', 10, '#,##0.###'], ['AFE NO', 12], ['PROJECT NAME', 20], ['PO UNIT PRICE', 15, NUMF], ['PO VALUE', 16, NUMF], ['KETERANGAN', 24]];
        ws.columns = cols.map(function (c) { return { width: c[1] }; });
        ws.mergeCells(1, 1, 1, cols.length); ws.mergeCells(2, 1, 2, cols.length);
        ws.getCell(1, 1).value = 'DAFTAR MATERIAL ' + (r.h.jenis === 'Ex Project' ? 'SISA PROJECT' : 'PENGEMBALIAN ' + r.h.jenis.toUpperCase());
        ws.getCell(2, 1).value = 'SERAH TERIMA MATERIAL ' + no + (r.status !== ST.ok ? ' (DRAFT – ' + (r.status || 'belum diajukan').toUpperCase() + ')' : '');
        [1, 2].forEach(function (i) { ws.getCell(i, 1).font = { name: 'Arial', size: 12, bold: true }; ws.getCell(i, 1).alignment = { horizontal: 'center' }; });
        sheetTable(ws, 4, cols, t.rows.map(function (x, i) {
          return [i + 1, x.cat || '', x.m || '', x.d, x.u || '', x.kond || '', num(x.q), r.h.afe || '', r.h.project || '', has(x.price) ? num(x.price) : '', has(x.price) ? num(x.q) * num(x.price) : '', x.note || ''];
        }));
        var tr = ws.getRow(5 + t.rows.length);
        tr.getCell(10).value = 'TOTAL'; tr.getCell(10).font = { name: 'Arial', size: 10, bold: true };
        tr.getCell(11).value = { formula: 'SUM(K5:K' + (4 + t.rows.length) + ')', result: t.val }; tr.getCell(11).numFmt = NUMF; tr.getCell(11).font = { name: 'Arial', size: 10, bold: true }; tr.getCell(11).border = BORDER;
        var buf = await wb.xlsx.writeBuffer();
        saveBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileBase(r) + '_Daftar_Material.xlsx');
      } catch (e) { toast('Gagal membuat Excel: ' + e.message, true); }
      finally { loading(false); }
    }
    async function exportRekap() {
      loading('Membuat rekap Excel…');
      try {
        var ExcelJS = await ctx.loadExcelJS(), wb = new ExcelJS.Workbook();
        var list = R.data.list.slice().sort(function (a, b) { return (a.h.tgl || '').localeCompare(b.h.tgl || ''); });
        var dv = function (s) { var d = utc(s); return d || ''; };
        var ws = wb.addWorksheet('Pengembalian', { views: [{ state: 'frozen', ySplit: 3 }] });
        var c1 = [['No.', 5], ['No. BA', 26], ['Tanggal', 12, 'dd.mm.yyyy'], ['Jenis', 13], ['Fungsi User', 24], ['Project / AFE', 26], ['Status Material', 14], ['Integrasi', 14], ['Item', 6], ['PO Value (Rp.)', 16, NUMF], ['Status', 18], ['Approve oleh', 22]];
        ws.columns = c1.map(function (c) { return { width: c[1] }; });
        ws.getCell(1, 1).value = 'Rekap BA Pengembalian Material (TKO B7-044)'; ws.getCell(1, 1).font = { name: 'Arial', size: 14, bold: true };
        sheetTable(ws, 3, c1, list.filter(function (r) { return r.kind === 'ret'; }).map(function (r, i) {
          var t = totals(r); return [i + 1, (r.no && r.no.no) || '', dv(r.h.tgl), r.h.jenis, r.h.fungsi || '', [r.h.project, r.h.afe].filter(Boolean).join(' / '), r.h.statMat, r.h.integ, t.n, t.val, r.status, r.approvedBy || ''];
        }));
        var ws2 = wb.addWorksheet('Penitipan DC', { views: [{ state: 'frozen', ySplit: 3 }] });
        var c2 = [['No.', 5], ['No. BA', 22], ['Tanggal BA', 12, 'dd.mm.yyyy'], ['Pihak Pertama (User)', 26], ['Jabatan', 32], ['Material', 48], ['Memo User', 22], ['Jatuh tempo', 12, 'dd.mm.yyyy'], ['Perpanjangan', 20], ['Status', 16], ['Masa titip', 24], ['Diambil', 12, 'dd.mm.yyyy']];
        ws2.columns = c2.map(function (c) { return { width: c[1] }; });
        ws2.getCell(1, 1).value = 'Rekap BA Penitipan Material Direct Charge (Memo VP SCM ' + MEMO_NO + ')'; ws2.getCell(1, 1).font = { name: 'Arial', size: 14, bold: true };
        sheetTable(ws2, 3, c2, list.filter(function (r) { return r.kind === 'dc'; }).map(function (r, i) {
          var s = dcState(r);
          return [i + 1, (r.no && r.no.no) || '', dv(r.h.tgl), r.h.p1name || '', r.h.p1jab || '', totals(r).rows.map(function (x) { return x.d + ' — ' + qty(x.q) + ' ' + (x.u || ''); }).join('\n'), r.h.memoUser || '', dv(dueOf(r)), r.ext ? 's/d ' + dot(r.ext.until) + ' (' + r.ext.memo + ')' : '', r.status, s ? s.t : '', r.done ? dv(r.done.tgl) : ''];
        }));
        var buf = await wb.xlsx.writeBuffer();
        saveBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'REKAP_PENGEMBALIAN_PENITIPAN_DC.xlsx');
      } catch (e) { toast('Gagal membuat rekap: ' + e.message, true); }
      finally { loading(false); }
    }

    // ---------- Event ----------
    function inForm(t) { return t.closest && t.closest('#kbForm'); }
    function lookupMat(it) {
      var o = S.idx && S.idx.mats && S.idx.mats.get(String(it.m || '').trim().toUpperCase());
      if (!o) return false;
      it.m = o.m; if (!it.d) it.d = o.d; if (!it.u) it.u = o.u; if (!has(it.price) && o.map) it.price = Math.round(o.map);
      return true;
    }
    function onField(t, final) {
      var d = draft(); if (R.busy) return;
      if (t.hasAttribute('data-kdoc')) {
        var nm = t.getAttribute('data-kdoc'), L = d.docs || (d.docs = []), i = L.indexOf(nm);
        if (t.checked && i < 0) L.push(nm); if (!t.checked && i >= 0) L.splice(i, 1);
        t.parentNode.classList.toggle('on', t.checked); storeDraft(); return;
      }
      if (t.hasAttribute('data-kfoto')) {
        var fi = +t.getAttribute('data-kfoto'), file = t.files[0], row = d.items[fi]; if (!file || !row) return;
        loading('Memproses foto…');
        compress(file).then(function (url) {
          row.fid = row.fid || ('f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5));
          R.fotos[row.fid] = url; storeDraft(); storeFotos(); rerender();
        }, function (e) { toast('Gagal memproses foto: ' + e.message, true); }).then(function () { loading(false); });
        return;
      }
      if (t.id === 'kbMemoFile') {
        var f = t.files[0]; if (!f) return;
        if (f.size > 3 * 1048576) { toast('Maksimal 3 MB', true); t.value = ''; return; }
        var fr = new FileReader();
        fr.onload = function () { R.memo.dc = { name: f.name, size: f.size, b64: String(fr.result).split(',')[1] }; rerender(); };
        fr.readAsDataURL(f); return;
      }
      var path = t.getAttribute('data-k'); if (!path) return;
      var val = t.type === 'checkbox' ? t.checked : t.hasAttribute('data-num') ? (t.value === '' ? '' : num(t.value)) : t.value;
      setPath(d, path, val);
      if (path === 'h.seq') d.h.seqManual = t.value !== '';
      if (path === 'h.due') d.h.dueManual = true;
      if (path === 'h.jenis') { var c0 = (CATS[val] || [''])[0]; d.items.forEach(function (x) { if (!x.cat || Object.keys(CATS).some(function (k) { return CATS[k][0] === x.cat; })) x.cat = c0; }); d.docs = []; }
      storeDraft();
      if (!final) { var tb = document.getElementById('kbTot'); if (tb) { var tt = totals(d); tb.textContent = tt.n + ' item · PO Value Rp ' + idr(tt.val); } return; }
      var m = /^items\.(\d+)\.m$/.exec(path);
      if (m) { var it = d.items[+m[1]]; if (it.m && !lookupMat(it)) toast('KIMAP ' + it.m + ' tidak ada di data stok — isi deskripsi manual', true); rerender(); return; }
      if (t.hasAttribute('data-rr')) rerender();
    }
    document.addEventListener('input', function (e) { if (inForm(e.target) && e.target.type !== 'file') onField(e.target, false); });
    document.addEventListener('change', function (e) {
      var t = e.target;
      if (inForm(t)) onField(t, true);
      else if (t.id === 'kbMonth') { R.month = t.value; renderHistory(); }
    });
    var PASTE = { ret: ['cat', 'm', 'd', 'u', 'kond', 'q', 'price', 'note'], dc: ['d', 'q', 'u', 'ket'] };
    document.addEventListener('paste', function (e) {
      var t = e.target, k = t.getAttribute && t.getAttribute('data-k'), m = k && /^items\.(\d+)\.(\w+)$/.exec(k);
      if (!m || !inForm(t)) return;
      var txt = (e.clipboardData || window.clipboardData).getData('text');
      if (!/[\t\n]/.test(txt.replace(/\n$/, ''))) return;
      e.preventDefault();
      var d = draft(), cols = PASTE[d.kind], lines = txt.replace(/\r/g, '').replace(/\n+$/, '').split('\n'), r0 = +m[1], c0 = cols.indexOf(m[2]);
      if (c0 < 0) return;
      var toNum = function (v) { v = String(v).trim(); if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(v)) v = v.replace(/\./g, '').replace(',', '.'); else v = v.replace(/,/g, '.'); var n = parseFloat(v); return isFinite(n) ? n : ''; };
      lines.forEach(function (ln, i) {
        var it = d.items[r0 + i] || (d.items[r0 + i] = d.kind === 'dc' ? {} : { kond: 'Baik' });
        ln.split('\t').forEach(function (v, j) {
          var f = cols[c0 + j]; if (!f) return; v = v.trim();
          it[f] = f === 'q' || f === 'price' ? toNum(v) : f === 'kond' ? (KONDISI.filter(function (x) { return x.toLowerCase().indexOf(v.toLowerCase()) === 0; })[0] || v) : f === 'm' ? v.toUpperCase() : v;
        });
        if (it.m && !it.d) lookupMat(it);
      });
      storeDraft(); rerender(); toast(lines.length + ' baris ditempel dari Excel');
    });
    var qTimer;
    document.addEventListener('input', function (e) {
      if (e.target.id !== 'kbQ') return;
      R.q = e.target.value; clearTimeout(qTimer);
      qTimer = setTimeout(function () { renderHistory().then(function () { var q = document.getElementById('kbQ'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }); }, 300);
    });
    document.addEventListener('click', function (e) {
      var a = e.target.closest('[data-ka]');
      if (!a) return;
      e.preventDefault();
      var act = a.getAttribute('data-ka'), id = a.getAttribute('data-id'), d;
      if (act === 'kind') { if (R.editId) return; R.kind = a.getAttribute('data-v'); storeDraft(); rerender(); return; }
      d = ctx.route() === 'kembali' ? draft() : null;
      if (act === 'row-add' && d) { for (var n = +(a.getAttribute('data-n') || 1); n > 0; n--) d.items.push(d.kind === 'dc' ? { d: '', q: '', u: '', ket: '' } : { cat: (CATS[d.h.jenis] || [''])[0], kond: 'Baik' }); storeDraft(); rerender(); }
      else if (act === 'row-del' && d) { d.items.splice(+a.getAttribute('data-i'), 1); if (!d.items.length) d.items = newDraft(d.kind).items; storeDraft(); rerender(); }
      else if (act === 'p-add' && d) { (d.sign[a.getAttribute('data-g')] = d.sign[a.getAttribute('data-g')] || []).push({ name: '', jab: '' }); storeDraft(); rerender(); }
      else if (act === 'p-del' && d) { d.sign[a.getAttribute('data-g')].splice(+a.getAttribute('data-i'), 1); storeDraft(); rerender(); }
      else if (act === 'due-auto' && d) { d.h.dueManual = false; d.h.due = ''; storeDraft(); rerender(); }
      else if (act === 'memo-clear') { delete R.memo.dc; rerender(); }
      else if (act === 'foto-del' && d) { var fr0 = d.items[+a.getAttribute('data-i')]; if (fr0) { delete R.fotos[fr0.fid]; delete fr0.fid; storeDraft(); storeFotos(); rerender(); } }
      else if (act === 'foto-view') { var src = R.fotos[a.getAttribute('data-fid')]; if (src) { var w = window.open(''); if (w) w.document.write('<img src="' + src + '" style="max-width:100%">'); } }
      else if (act === 'reset') { if (confirm('Kosongkan seluruh isian form?')) { clearDraft(); rerender(); } }
      else if (act === 'edit-cancel') { clearDraft(); rerender(); }
      else if (act === 'submit') submit();
      else if (act === 'preview' && d) {
        var miss = validate(d);
        if (miss.length) { toast('Lengkapi dulu: ' + miss.join(', '), true); return; }
        R.previewRec = Object.assign({ id: 'draft', status: '' }, cleanBody(d), R.memo.dc && d.kind === 'dc' ? { memoFile: { name: R.memo.dc.name, size: R.memo.dc.size, path: 'draft' } } : {});
        openExport('draft');
      }
      else if (act === 'kf') { R.kf = a.getAttribute('data-v'); renderHistory(); }
      else if (act === 'tab') { R.filt = a.getAttribute('data-v'); renderHistory(); }
      else if (act === 'refresh') renderHistory(true);
      else if (act === 'rekap') exportRekap();
      else if (act === 'approve') openApprove(id);
      else if (act === 'approve-do') approve(id);
      else if (act === 'reject') { var why = prompt('Alasan menolak (opsional):', ''); if (why !== null) setStatus(id, ST.no, { rejectBy: me(), rejectNote: why }, 'Pengajuan ditolak'); }
      else if (act === 'cancel') { if (confirm('Batalkan pengajuan ini?')) setStatus(id, ST.cancel, null, 'Pengajuan dibatalkan'); }
      else if (act === 'revise') requestRevision(id);
      else if (act === 'extend') extend(id);
      else if (act === 'done') markDone(id);
      else if (act === 'delete') { var rd = find(id); if (rd) remove(rd); }
      else if (act === 'edit' && canRcv()) startEdit(id);
      else if (act === 'export') openExport(id);
      else if (act === 'pdf' || act === 'xlsx') {
        var r = id === 'draft' ? R.previewRec : find(id);
        if (r) (act === 'pdf' ? downloadPdf : downloadXlsx)(r);
      }
    });

    function pendingCount() {
      if (!R.data) return 0;
      var n = 0;
      R.data.list.forEach(function (r) {
        if (r.status === ST.pending && canApproveRec(r)) n++;
        else if (!ctx.isOwner() && r.status === ST.rev) n++;
      });
      return n;
    }
    function reset() { R.data = null; R.signs = null; R.filt = 'Semua'; R.kf = 'Semua'; R.loaded = false; R.drafts = {}; R.editId = null; R.memo = {}; }
    return { renderForm: renderForm, renderHistory: renderHistory, load: load, pendingCount: pendingCount, reset: reset,
      _test: { buildPdf: buildPdf, buildDcBytes: buildDcBytes, addMonths: addMonths, docNoFor: docNoFor, dueOf: dueOf } };
  };
})(this);
