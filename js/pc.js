/*
 * Physical Check (pemeriksaan fisik material persediaan)
 * - Owner / Co-Owner: Create Physical Check → judul + paste banyak KIMAP sekaligus (+ opsional File Base MP-01 / database stok)
 *   → KIMAP otomatis terdeteksi, info material diambil dari File Base (Qty, Harga, Aging, Valuation Type, Kondisi, Bin) atau data SAP.
 * - Owner, Co-Owner, Warehouse, Receiving: isi 4 kolom — Qty Aktual, Kondisi (A–E), Storage Bin baru (opsional), Keterangan.
 *   Tersimpan otomatis & LIVE: semua perangkat (walau akun yang sama) melihat isian terbaru dalam hitungan detik.
 * - Qty SAP & selisih hanya terlihat Owner / Co-Owner / Viewer (penghitung tidak melihat qty sistem = blind count).
 * - Viewer: hanya melihat riwayat & hasil. Owner / Co-Owner: hapus, tandai selesai, export Excel.
 * Penyimpanan (terenkripsi): data/pc.js = daftar check + "terakhir dicek" per material; data/pc/<id>.js = isi satu check.
 */
(function (root) {
  'use strict';
  var BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  var BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  var IDX = 'data/pc.js';
  var KOND = {
    A: 'Baru dan baik',
    B: 'Baru, diperbaiki',
    C: 'Rusak, diperbaiki',
    D: 'Salvaged',
    E: 'Rencana FUPP'
  };
  var KONDL = { A: 'Quantity Kondisi Aset Baru dan baik', B: 'Quantity Kondisi Aset Baru, diperbaiki', C: 'Quantity Kondisi Aset Rusak, diperbaiki', D: 'Quantity Kondisi Aset Salvaged', E: 'Quantity Kondisi Aset Rencana FUPP' };
  var FIELDS = ['q', 'k', 'nb', 'ket'];
  var KSHORT = { A: 'Baik', B: 'Baru-fix', C: 'Rusak-fix', D: 'Salvage', E: 'FUPP' };
  var POLL_MS = 5000, POLL_STATIC_MS = 12000;

  root.PcModule = function (ctx) {
    var S = ctx.S, esc = ctx.esc, toast = ctx.toast, loading = ctx.loading;
    var P = S.pc = { idx: null, cur: null, qid: null, filt: 'Semua', q: '', queue: {}, saving: false, timer: null, err: null, savedAt: null, det: null, base: null, etag: null, etagIdx: null, txt: null, poll: null, tick: 0 };

    // ---------- util ----------
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    function today() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    function fmtDate(s) { if (!s) return '—'; var p = String(s).slice(0, 10).split('-'); return +p[2] + ' ' + BLN[+p[1] - 1] + ' ' + p[0]; }
    function fmtTime(iso) { if (!iso) return ''; var d = new Date(iso); return d.getDate() + ' ' + BLN[d.getMonth()] + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
    function nf(n) { return n == null || n === '' ? '—' : new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 }).format(n); }
    function rp(n) { return n == null || n === '' ? '—' : 'Rp ' + new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(n); }
    function me() { return S.user ? S.user.name : ''; }
    function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
    function canManage() { return ctx.isOwner(); }                 // Owner / Co-Owner: create, hapus, selesai
    function canInput() { return ctx.canInput(); }                 // Owner, Co-Owner, Warehouse, Receiving
    function seesSap() { return ctx.isOwner() || ctx.readOnly(); } // penghitung tidak melihat qty SAP
    function isOpen(c) { return c && c.status !== 'Selesai'; }
    function editable() { return P.cur && isOpen(P.cur.meta) && canInput(); }
    function pass() { return ctx.pass(); }
    function itemsPath(id) { return 'data/pc/' + id + '.js'; }
    function view() { return document.getElementById('view'); }
    function emptyIdx() { return { seq: 1, list: [], last: {} }; }
    function cssq(s) { return String(s).replace(/["\\]/g, '\\$&'); }
    function findItem(m) { return P.cur ? P.cur.items.filter(function (x) { return x.m === m; })[0] : null; }

    // ---------- data ----------
    async function loadIndex(force) {
      if (!P.idx || force) P.idx = (await pass().readJSON(IDX)) || emptyIdx();
      if (!P.idx.last) P.idx.last = {};
      return P.idx;
    }
    // Physical Check terakhir untuk Cari Material: [tanggal, qty, idCheck, judul, oleh, kondisi]
    function lastOf(m) {
      var L = P.idx && P.idx.last ? P.idx.last[m] || null : null;
      return L && L[1] === 0 && L[5] ? L.slice(0, 5).concat(['']) : L; // qty 0 -> tanpa kondisi
    }

    // ---------- File Base (MP-01 / database stok) ----------
    var CODE_RE = /^([A-Z]\d{9}|\d{9,12})$/;
    function normCode(v) { return String(v == null ? '' : v).trim().toUpperCase().replace(/\.0$/, ''); }
    function numv(v) { if (v == null || v === '') return null; var n = typeof v === 'number' ? v : parseFloat(String(v).replace(/\./g, '').replace(',', '.')); return isFinite(n) ? n : null; }
    function parseBase(buf, name) {
      var wb = root.XLSX.read(buf, { type: 'array' }), best = null;
      wb.SheetNames.forEach(function (sn) {
        var rows = root.XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true, defval: null, blankrows: false });
        var r = parseRows(rows);
        if (r && (!best || r.n > best.n)) { best = r; best.sheet = sn; }
      });
      if (!best) throw new Error('Kolom "Kode Material" tidak ditemukan di file ini');
      best.name = name;
      return best;
    }
    function parseRows(rows) {
      var h = -1, codeCol = -1;
      for (var i = 0; i < Math.min(rows.length, 15) && h < 0; i++) {
        (rows[i] || []).forEach(function (v, c) { if (h < 0 && /kode material|^material$|^kimap$/i.test(String(v || '').trim())) { h = i; codeCol = c; } });
      }
      if (h < 0) return null;
      var start = h + 1;
      while (start < rows.length && start < h + 8 && !CODE_RE.test(normCode((rows[start] || [])[codeCol]))) start++;
      var width = 0; rows.slice(h, start).forEach(function (r) { width = Math.max(width, (r || []).length); });
      var head = [];
      for (var c = 0; c < width; c++) head.push(rows.slice(h, start).map(function (r) { return String((r || [])[c] == null ? '' : r[c]).trim(); }).filter(Boolean).join(' ').toLowerCase());
      function col(re, after) { for (var c = after || 0; c < head.length; c++) if (re.test(head[c])) return c; return -1; }
      var K = {};
      rows.slice(h, start).forEach(function (r) {
        for (var c = 0; c + 4 < (r || []).length; c++) if (['A', 'B', 'C', 'D', 'E'].every(function (l, j) { return String(r[c + j] || '').trim() === l; })) { if (K.A == null) 'ABCDE'.split('').forEach(function (l, j) { K[l] = c + j; }); }
      });
      var C = {
        d: col(/full description|material description|deskripsi/), u: col(/satuan|uom|unit of measure/),
        qty: col(/^quantity|unrestricted|qty sap|^sap\b|kuantitas/), price: col(/harga satuan/), aging: col(/aging/),
        vt: col(/valuation type|^batch$/), bin: col(/storage bin|bin loc|lokasi bin|^bin/), sloc: col(/s\.? ?loc|storage location/)
      };
      var map = {}, n = 0;
      for (var r = start; r < rows.length; r++) {
        var row = rows[r] || [], m = normCode(row[codeCol]);
        if (!CODE_RE.test(m)) continue;
        var g = function (c) { return c >= 0 ? row[c] : null; };
        var k = null, kq = 0;
        if (K.A != null) 'ABCDE'.split('').forEach(function (l) { var v = numv(row[K[l]]); if (v && v > kq) { kq = v; k = l; } });
        var o = map[m];
        if (!o) { o = map[m] = { d: String(g(C.d) || '').trim(), u: String(g(C.u) || '').trim(), sap: 0, price: numv(g(C.price)), aging: String(g(C.aging) || '').trim(), vt: String(g(C.vt) || '').trim(), bin: String(g(C.bin) || '').trim(), sloc: String(g(C.sloc) || '').trim(), k: k }; n++; }
        var q = numv(g(C.qty)); if (q) o.sap += q;
        if (!o.vt && g(C.vt)) o.vt = String(g(C.vt)).trim();
      }
      return n ? { map: map, n: n, hasQty: C.qty >= 0 } : null;
    }

    // ---------- deteksi KIMAP dari teks tempelan ----------
    function detect(text) {
      var mats = S.idx ? S.idx.mats : new Map(), base = P.base ? P.base.map : {}, seen = {}, found = [], unknown = [];
      String(text || '').toUpperCase().split(/[^A-Z0-9]+/).forEach(function (t) {
        if (!t || seen[t]) return;
        var known = mats.has(t) || has(base, t);
        if (!known && !/^[A-Z]\d{9}$/.test(t)) return; // bukan pola KIMAP & tidak ada di data
        seen[t] = 1;
        (known ? found : unknown).push(t);
      });
      return { found: found, unknown: unknown };
    }
    function snapItem(m) {
      var o = S.idx && S.idx.mats.get(m), b = P.base && P.base.map[m];
      var home = {}; ((S.idx && S.idx.homePlants) || []).forEach(function (p) { home[p] = 1; });
      var hr = o ? o.rows.filter(function (r) { return home[r.plant]; }) : [];
      var vt = b && b.vt ? b.vt : (hr.map(function (r) { return r.batch; }).filter(Boolean)[0] || '');
      var sloc = b && b.sloc ? b.sloc : hr.map(function (r) { return r.sloc; }).filter(Boolean).filter(function (v, i, a) { return a.indexOf(v) === i; }).join('/');
      return {
        m: m, d: (b && b.d) || (o ? o.d : ''), u: (b && b.u) || (o ? o.u : ''),
        sap: b && P.base.hasQty ? b.sap : (o ? (o.homeStock || 0) : null),
        price: b && b.price != null ? b.price : (o && o.map != null ? Math.round(o.map) : null),
        aging: (b && b.aging) || (o && o.aging) || '', vt: vt, bin: (b && b.bin) || '', sloc: sloc,
        k0: b ? b.k : null, k: b ? b.k : null, q: null, nb: '', ket: ''
      };
    }

    // ---------- terakhir keluar (MB51) tahun berjalan, plant Home ----------
    function curYear() { return (S.idx && S.idx.dataYear) || new Date().getFullYear(); }
    async function ensureDet() {
      if (P.det !== null) return P.det;
      try { P.det = (await ctx.loadDet()) || false; } catch (e) { P.det = false; }
      return P.det;
    }
    function lastOut(m) {
      var y = String(curYear()), hp = {};
      ((S.idx && S.idx.homePlants) || []).forEach(function (p) { hp[p] = 1; });
      if (P.det && P.det.m && P.det.m[m]) {
        var best = null, q = 0;
        P.det.m[m].forEach(function (r) {
          if (!hp[r[1]] || r[4] >= 0 || String(r[0]).slice(0, 4) !== y) return;
          if (!best || r[0] > best) { best = r[0]; q = r[4]; } else if (r[0] === best) q += r[4];
        });
        return best ? { d: best, q: -q } : { none: true };
      }
      var o = S.idx && S.idx.mats.get(m), ym = null;
      if (o && o.homeUse) Object.keys(o.homeUse).forEach(function (k) { if (k.slice(0, 4) === y && o.homeUse[k] > 0 && (!ym || k > ym)) ym = k; });
      return ym ? { ym: ym } : { none: true };
    }
    function outText(m) {
      if (P.det === null) return '…';
      var x = lastOut(m);
      if (x.d) return fmtDate(x.d) + ' (' + nf(x.q) + ')';
      if (x.ym) return BULAN[+x.ym.slice(5, 7) - 1] + ' ' + x.ym.slice(0, 4);
      return 'belum keluar ' + curYear();
    }

    // ================= Halaman daftar =================
    async function render() {
      stopPoll();
      var r = ctx.routeArg();
      if (r) return renderCheck(r);
      var v = view();
      v.innerHTML = '<div class="card card-pad muted">Memuat Physical Check…</div>';
      try { await loadIndex(true); } catch (e) { v.innerHTML = '<div class="card card-pad"><b>Gagal memuat Physical Check</b><div class="small muted">' + esc(e.message) + '</div></div>'; return; }
      if (ctx.route() !== 'pc' || ctx.routeArg()) return;
      drawList();
      startPoll();
    }
    function drawList() {
      var list = P.idx.list.slice().sort(function (a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); });
      var keepCreate = document.querySelector('.pc-create');
      if (keepCreate && keepCreate.open) { var box = document.getElementById('pcListBox'); if (box) { box.innerHTML = listHtml(list); return; } }
      view().innerHTML = (canManage() ? createCard() : '') + '<div class="card" id="pcListBox">' + listHtml(list) + '</div>';
      bindCreate();
    }
    function listHtml(list) {
      if (!list.length) return '<div class="empty" style="padding:28px"><h3>Belum ada Physical Check</h3><p>' + (canManage() ? 'Buat di atas: isi judul lalu paste daftar KIMAP.' : 'Owner / Co-Owner akan membuat Physical Check, lalu Anda tinggal mengisi.') + '</p></div>';
      return '<div class="table-wrap"><table class="grid pc-list"><thead><tr><th>Physical Check</th><th>Tanggal</th><th>Progres</th><th>Status</th><th></th></tr></thead><tbody>' +
        list.map(function (c) {
          var pct = c.n ? Math.round((c.done || 0) / c.n * 100) : 0;
          return '<tr class="clickable" data-pc-open="' + esc(c.id) + '"><td><b>' + esc(c.title) + '</b><div class="small muted">dibuat ' + esc(c.by || '') + ' · ' + fmtTime(c.createdAt) + (c.baseName ? ' · base: ' + esc(c.baseName) : '') + '</div></td>' +
            '<td class="nowrap">' + fmtDate(c.date) + '</td>' +
            '<td style="min-width:190px"><div class="small"><b>' + (c.done || 0) + '</b> / ' + (c.n || 0) + ' KIMAP dihitung</div><div class="progress" style="margin-top:4px"><i style="width:' + pct + '%"></i></div>' + (c.lastAt ? '<div class="small muted">terakhir diisi ' + fmtTime(c.lastAt) + '</div>' : '') + '</td>' +
            '<td>' + (isOpen(c) ? '<span class="badge warn">Berjalan</span>' : '<span class="badge ok">Selesai</span>') + '</td>' +
            '<td class="right"><a class="btn sm primary" href="#/pc/' + esc(c.id) + '">' + (isOpen(c) && canInput() ? 'Isi' : 'Lihat') + '</a></td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    function createCard() {
      var d = new Date();
      return '<details class="card card-pad pc-create" style="margin-bottom:14px"' + (P.idx.list.length ? '' : ' open') + '><summary style="cursor:pointer;font-weight:800">+ Create Physical Check</summary>' +
        '<div class="pc-create-grid" style="margin-top:12px">' +
        '<label class="fleet-fld"><span>Judul *</span><input class="input" id="pcTitle" value="Physical Check ' + BULAN[d.getMonth()] + ' ' + d.getFullYear() + '"></label>' +
        '<label class="fleet-fld"><span>Tanggal</span><input class="input" type="date" id="pcDate" value="' + today() + '"></label></div>' +
        '<label class="fleet-fld" style="margin-top:10px"><span>File Base (opsional) — MP-01 / database stok (.xlsx): Qty, Harga Satuan, Aging, Valuation Type, Kondisi, Bin</span>' +
        '<input class="input" type="file" id="pcBase" accept=".xlsx,.xls,.xlsm"></label><div id="pcBaseInfo" class="small muted" style="margin-top:4px">' + baseInfo() + '</div>' +
        '<label class="fleet-fld" style="margin-top:10px"><span>Paste KIMAP — boleh banyak sekaligus (dari kolom Excel, dipisah baris/spasi/koma). Kosongkan untuk memakai semua KIMAP di File Base.</span>' +
        '<textarea class="input mono" id="pcPaste" rows="6" placeholder="K180900047&#10;B160900024&#10;M295900003&#10;…"></textarea></label>' +
        '<div id="pcDetect" class="small muted" style="margin-top:8px">Belum ada KIMAP.</div>' +
        '<div class="toolbar" style="margin-top:10px"><button class="btn primary" data-pc="create">Create Physical Check</button></div></details>';
    }
    function baseInfo() {
      if (!P.base) return 'Tanpa File Base: info diambil dari data SAP website (stok ' + esc(ctx.homeName()) + ', harga rata-rata stok, aging pemakaian).';
      return '<b style="color:var(--ok)">✓ ' + esc(P.base.name) + '</b> — ' + P.base.n.toLocaleString('id-ID') + ' material dibaca dari sheet "' + esc(P.base.sheet) + '". <a href="#" data-pc="base-clear">hapus</a>';
    }
    function detectHtml(r, withToggle) {
      if (!r.found.length && !r.unknown.length) return P.base ? 'Paste kosong → akan memakai <b>semua ' + P.base.n.toLocaleString('id-ID') + ' KIMAP</b> di File Base.' : 'Belum ada KIMAP terdeteksi.';
      return '<b style="color:var(--ok)">' + r.found.length + ' KIMAP terdeteksi</b>' +
        (r.unknown.length ? ' · <b style="color:var(--warn)">' + r.unknown.length + ' tidak ada di data</b> <span class="mono">' + esc(r.unknown.slice(0, 12).join(', ')) + (r.unknown.length > 12 ? ', …' : '') + '</span>' +
          (withToggle ? ' <label class="small" style="margin-left:6px"><input type="checkbox" id="pcUnk" checked> ikut sertakan</label>' : '') : '');
    }
    function refreshDetect() { var ta = document.getElementById('pcPaste'), d = document.getElementById('pcDetect'); if (ta && d) d.innerHTML = detectHtml(detect(ta.value), true); }
    function bindCreate() {
      var ta = document.getElementById('pcPaste');
      if (ta) ta.addEventListener('input', refreshDetect);
      var f = document.getElementById('pcBase');
      if (f) f.addEventListener('change', function () {
        var file = f.files && f.files[0]; if (!file) return;
        loading('Membaca File Base…');
        file.arrayBuffer().then(function (buf) { P.base = parseBase(new Uint8Array(buf), file.name); toast('File Base: ' + P.base.n.toLocaleString('id-ID') + ' material'); })
          .catch(function (e) { P.base = null; toast('File Base gagal dibaca: ' + e.message, true); })
          .then(function () { loading(false); document.getElementById('pcBaseInfo').innerHTML = baseInfo(); refreshDetect(); });
      });
      if (ta) refreshDetect();
    }
    async function create() {
      var title = document.getElementById('pcTitle').value.trim(), date = document.getElementById('pcDate').value || today();
      var r = detect(document.getElementById('pcPaste').value), unk = document.getElementById('pcUnk');
      var codes = r.found.concat(unk && !unk.checked ? [] : r.unknown);
      if (!codes.length && P.base) codes = Object.keys(P.base.map);
      if (!title) { toast('Isi judul Physical Check', true); return; }
      if (!codes.length) { toast('Paste dulu daftar KIMAP (atau pilih File Base)', true); return; }
      var id = 'PC' + Date.now().toString(36).toUpperCase();
      var items = codes.map(snapItem), sapDate = S.idx ? S.idx.homeDate : null, baseName = P.base ? P.base.name : null;
      loading('Membuat Physical Check…');
      try {
        await pass().atomicMulti([
          { path: itemsPath(id), varName: 'MW_PCI', note: 'Physical Check ' + id, mutate: function () { return { id: id, sapDate: sapDate, baseName: baseName, items: items }; } },
          { path: IDX, varName: 'MW_PC', note: 'Physical Check — daftar', mutate: function (cur) {
            cur = cur || emptyIdx();
            cur.list.push({ id: id, no: cur.seq++, title: title, date: date, createdAt: new Date().toISOString(), by: me(), status: 'Berjalan', n: items.length, done: 0, sapDate: sapDate, baseName: baseName });
            P.idx = cur; return cur;
          } }
        ], 'Physical Check: buat "' + title + '" (' + items.length + ' KIMAP, ' + me() + ')');
        toast('Physical Check dibuat — ' + items.length + ' KIMAP');
        P.base = null;
        location.hash = '#/pc/' + id;
      } catch (e) { toast('Gagal membuat: ' + e.message, true); }
      finally { loading(false); }
    }

    // ================= Halaman isi satu check =================
    async function renderCheck(id) {
      var v = view();
      if (!P.cur || P.cur.id !== id) v.innerHTML = '<div class="card card-pad muted">Memuat Physical Check…</div>';
      if (P.qid && P.qid !== id && Object.keys(P.queue).length) {
        while (P.saving) await new Promise(function (r) { setTimeout(r, 200); });
        await flush();
      }
      try {
        await loadIndex(true);
        var meta = P.idx.list.filter(function (c) { return c.id === id; })[0];
        if (!meta) { v.innerHTML = '<div class="card card-pad">Physical Check tidak ditemukan. <a href="#/pc">← Kembali</a></div>'; return; }
        var data = await pass().readJSON(itemsPath(id));
        P.cur = { id: id, meta: meta, items: (data && data.items) || [], sapDate: data && data.sapDate, baseName: data && data.baseName };
        P.etag = null; P.txt = null;
        restorePending(id);
      } catch (e) { v.innerHTML = '<div class="card card-pad"><b>Gagal memuat</b><div class="small muted">' + esc(e.message) + '</div><a href="#/pc">← Kembali</a></div>'; return; }
      if (ctx.route() !== 'pc' || ctx.routeArg() !== id) return;
      drawCheck();
      startPoll();
      if (P.det === null) ensureDet().then(function () { if (P.cur && P.cur.id === id) refreshOut(); });
    }
    function counts() {
      var n = P.cur.items.length, done = 0, sel = 0;
      P.cur.items.forEach(function (x) { var q = val(x, 'q'); if (q != null) { done++; if (x.sap != null && q !== x.sap) sel++; } });
      return { n: n, done: done, sel: sel };
    }
    // nilai yang tampil: perubahan lokal (belum tersimpan) didahulukan
    function val(x, f) { var p = P.queue[x.m]; return p && has(p, f) ? p[f] : x[f]; }
    // Qty Aktual 0 = barang tidak ada -> kondisi otomatis kosong
    function kv(x) { return val(x, 'q') === 0 ? null : val(x, 'k'); }
    function needK(x) { var q = val(x, 'q'); return q != null && q !== 0 && !val(x, 'k'); }
    function drawCheck() {
      var c = P.cur, meta = c.meta, open = isOpen(meta), mg = canManage(), ed = editable(), sap = seesSap(), k = counts();
      var pct = k.n ? Math.round(k.done / k.n * 100) : 0;
      var tabs = ['Semua', 'Belum dihitung', 'Sudah dihitung'].concat(sap ? ['Selisih'] : []);
      view().innerHTML =
        '<div class="card card-pad pc-head"><div class="toolbar"><a class="btn sm" href="#/pc">← Daftar</a><div style="min-width:0;flex:1"><h3 style="margin:0">' + esc(meta.title) + '</h3>' +
        '<div class="small muted">' + fmtDate(meta.date) + ' · dibuat ' + esc(meta.by || '') + (c.baseName ? ' · base ' + esc(c.baseName) : (c.sapDate ? ' · data SAP ' + fmtDate(c.sapDate) : '')) + '</div></div>' +
        (open ? '<span class="badge warn">Berjalan</span>' : '<span class="badge ok">Selesai</span>') + '</div>' +
        '<div class="pc-prog"><div><b id="pcDone">' + k.done + '</b> / ' + k.n + ' dihitung' + (sap ? ' · <span id="pcSel">' + k.sel + '</span> selisih' : '') + '</div><div class="progress"><i id="pcBar" style="width:' + pct + '%"></i></div></div>' +
        '<div class="toolbar" style="margin-top:10px"><input class="input" id="pcQ" placeholder="Cari KIMAP / deskripsi / bin…" style="flex:1;min-width:200px" value="' + esc(P.q) + '">' +
        tabs.map(function (t) { return '<span class="chip-toggle' + (P.filt === t ? ' on' : '') + '" data-pc="filt" data-v="' + t + '">' + t + '</span>'; }).join('') +
        (sap ? '<button class="btn sm" data-pc="excel">Download Excel</button>' : '') +
        (mg ? (open ? '<button class="btn sm" data-pc="add">+ Tambah KIMAP</button><button class="btn sm success" data-pc="close">Tandai Selesai</button>' : '<button class="btn sm" data-pc="reopen">Buka lagi</button>') +
          '<button class="btn sm danger" data-pc="delete">Hapus</button>' : '') + '</div>' +
        '<div class="pc-save" id="pcSave">' + saveText() + '</div>' +
        (ed ? '<div class="pc-legend small muted">Kondisi: ' + Object.keys(KOND).map(function (l) { return '<b>' + l + '</b> ' + KOND[l]; }).join(' · ') + '</div>' : '') +
        '</div>' +
        '<div class="card pc-card" style="margin-top:14px"><div class="table-wrap tall pc-wrap"><table class="grid pc-table' + (ed ? ' pc-ed' : '') + (sap ? ' pc-sapv' : '') + '"><thead><tr><th class="c">No</th><th>Material</th>' +
        (sap ? '<th class="num">Qty SAP</th>' : '') + '<th class="num">Qty Aktual *</th><th>Kondisi *</th><th>Storage Bin</th><th>Keterangan</th>' + (sap ? '<th class="num">Selisih</th>' : '') + '<th>Diisi</th></tr></thead>' +
        '<tbody id="pcBody">' + rowsHtml() + '</tbody></table></div></div>';
      bindCheck();
    }
    function shownItems() {
      var q = P.q.trim().toUpperCase();
      return P.cur.items.map(function (x, i) { return { x: x, i: i }; }).filter(function (o) {
        var x = o.x, qv = val(x, 'q'), filled = qv != null;
        if (P.filt === 'Belum dihitung' && filled) return false;
        if (P.filt === 'Sudah dihitung' && !filled) return false;
        if (P.filt === 'Selisih' && !(filled && x.sap != null && qv !== x.sap)) return false;
        return !q || [x.m, x.d, x.bin, x.sloc, val(x, 'nb'), val(x, 'ket')].join(' ').toUpperCase().indexOf(q) >= 0;
      });
    }
    function infoHtml(x) {
      var chips = [];
      if (x.u) chips.push('<span>UoM <b>' + esc(x.u) + '</b></span>');
      if (x.price != null) chips.push('<span>Harga <b>' + rp(x.price) + '</b></span>');
      if (x.aging) chips.push('<span>Aging <b>' + esc(x.aging) + '</b></span>');
      if (x.vt) chips.push('<span>Val. <b>' + esc(x.vt) + '</b></span>');
      if (x.bin || x.sloc) chips.push('<span>Bin <b>' + esc(x.bin || x.sloc) + '</b></span>');
      chips.push('<span class="pc-out" data-out="' + esc(x.m) + '">Keluar terakhir <b>' + esc(outText(x.m)) + '</b></span>');
      return '<div class="pc-info">' + chips.join('') + '</div>';
    }
    function kondHtml(x, ed) {
      var k = kv(x), zero = val(x, 'q') === 0;
      if (!ed) return k ? '<span class="pc-kb on" title="' + esc(KONDL[k] || '') + '">' + esc(k) + '</span>' : '<span class="muted">—</span>';
      return '<div class="pc-k' + (zero ? ' pc-k-off' : '') + '" role="radiogroup">' + 'ABCDE'.split('').map(function (l) {
        return '<button type="button" class="pc-kb' + (k === l ? ' on' : '') + '" data-pck="' + esc(x.m) + '" data-v="' + l + '"' + (zero ? ' disabled' : '') + ' title="' + l + ' — ' + esc(KONDL[l]) + '" aria-pressed="' + (k === l) + '">' + l + '<small>' + KSHORT[l] + '</small></button>';
      }).join('') + '</div>' + (zero ? '<div class="pc-k-note">Qty 0 — kondisi dikosongkan</div>' : '');
    }
    function diffOf(x) { var q = val(x, 'q'); return q != null && x.sap != null ? q - x.sap : null; }
    function diffHtml(x) {
      var d = diffOf(x);
      if (d == null) return '<span class="muted">—</span>';
      if (d === 0) return '<span class="badge ok">Match</span>';
      return '<b style="color:var(--bad)">' + (d > 0 ? '+' : '') + nf(d) + '</b>' + (x.price != null ? '<div class="small muted">' + rp(d * x.price) + '</div>' : '');
    }
    function byHtml(x) {
      if (P.queue[x.m]) return '<span style="color:var(--warn)">menyimpan…</span>';
      return x.by ? '<span class="pc-who">' + esc(x.by) + '</span><span class="pc-at">' + fmtTime(x.at) + '</span>' : '';
    }
    function rowHtml(o) {
      var x = o.x, ed = editable(), sap = seesSap(), q = val(x, 'q');
      var miss = ed && needK(x);
      return '<tr data-m="' + esc(x.m) + '" class="' + (q != null ? 'pc-filled' : '') + (miss ? ' pc-miss' : '') + '"><td class="c muted pc-no">' + (o.i + 1) + '</td>' +
        '<td class="pc-mat"><div class="mat-desc">' + (x.d ? esc(x.d) : '<span class="muted">(tidak ada di data)</span>') + '</div><div class="mat-code">' + esc(x.m) + '</div>' + infoHtml(x) + '</td>' +
        (sap ? '<td class="num pc-sap" data-label="Qty SAP"><b>' + nf(x.sap) + '</b></td>' : '') +
        '<td class="num pc-qc" data-label="Qty Aktual">' + (ed ? '<input class="input pc-q" type="number" inputmode="decimal" step="any" min="0" data-pcf="q" data-m="' + esc(x.m) + '" value="' + (q == null ? '' : esc(q)) + '" placeholder="qty">' : '<b>' + nf(q) + '</b>') + '</td>' +
        '<td class="pc-kc" data-label="Kondisi" data-kc="' + esc(x.m) + '">' + kondHtml(x, ed) + '</td>' +
        '<td class="pc-bc" data-label="Storage Bin">' + (ed ? '<input class="input pc-t" data-pcf="nb" data-m="' + esc(x.m) + '" value="' + esc(val(x, 'nb') || '') + '" placeholder="' + esc(x.bin ? 'bin baru (opsional)' : 'opsional') + '">' : esc(val(x, 'nb') || '')) + '</td>' +
        '<td class="pc-tc" data-label="Keterangan">' + (ed ? '<input class="input pc-t" data-pcf="ket" data-m="' + esc(x.m) + '" value="' + esc(val(x, 'ket') || '') + '" placeholder="opsional">' : esc(val(x, 'ket') || '')) + '</td>' +
        (sap ? '<td class="num pc-dc" data-label="Selisih" data-diff="' + esc(x.m) + '">' + diffHtml(x) + '</td>' : '') +
        '<td class="small muted pc-by" data-by="' + esc(x.m) + '">' + byHtml(x) + '</td></tr>';
    }
    function rowsHtml() {
      var rows = shownItems(), cols = seesSap() ? 9 : 7;
      if (!rows.length) return '<tr><td colspan="' + cols + '" class="muted center" style="padding:20px">Tidak ada KIMAP.</td></tr>';
      return rows.map(rowHtml).join('');
    }
    function refreshOut() { document.querySelectorAll('[data-out]').forEach(function (el) { var b = el.querySelector('b'); if (b) b.textContent = outText(el.getAttribute('data-out')); }); }
    // perbarui satu baris tanpa mengganggu kolom yang sedang diketik
    function refreshRow(x) {
      var tr = document.querySelector('#pcBody tr[data-m="' + cssq(x.m) + '"]');
      if (!tr) return;
      var ed = editable(), act = document.activeElement;
      FIELDS.forEach(function (f) {
        if (f === 'k') return;
        var inp = tr.querySelector('[data-pcf="' + f + '"]');
        if (inp && inp !== act && !(P.queue[x.m] && has(P.queue[x.m], f))) { var v = x[f]; inp.value = v == null ? '' : v; }
      });
      var kc = tr.querySelector('[data-kc]'); if (kc) kc.innerHTML = kondHtml(x, ed);
      var by = tr.querySelector('[data-by]'); if (by) by.innerHTML = byHtml(x);
      var df = tr.querySelector('[data-diff]'); if (df) df.innerHTML = diffHtml(x);
      var q = val(x, 'q');
      tr.classList.toggle('pc-filled', q != null);
      tr.classList.toggle('pc-miss', ed && needK(x));
    }
    function refreshProgress() {
      var k = counts(), d = document.getElementById('pcDone'), b = document.getElementById('pcBar'), s = document.getElementById('pcSel');
      if (d) d.textContent = k.done;
      if (s) s.textContent = k.sel;
      if (b) b.style.width = (k.n ? Math.round(k.done / k.n * 100) : 0) + '%';
    }
    function bindCheck() {
      var qi = document.getElementById('pcQ');
      if (qi) qi.addEventListener('input', function () { P.q = qi.value; document.getElementById('pcBody').innerHTML = rowsHtml(); });
      var body = document.getElementById('pcBody');
      body.addEventListener('input', function (e) {
        var t = e.target; if (!t.matches || !t.matches('[data-pcf]')) return;
        var m = t.getAttribute('data-m'), f = t.getAttribute('data-pcf'), v = t.value;
        if (f === 'q') { v = v.trim().replace(',', '.'); if (v !== '' && !isFinite(+v)) return; v = v === '' ? null : +v; }
        else v = v.slice(0, 200);
        enqueue(m, f, v, f === 'q' ? 1500 : 2500);
      });
      body.addEventListener('change', function (e) { if (e.target.matches && e.target.matches('[data-pcf]')) schedule(300); });
      body.addEventListener('click', function (e) {
        var b = e.target.closest('[data-pck]'); if (!b) return;
        var m = b.getAttribute('data-pck'), l = b.getAttribute('data-v'), x = findItem(m);
        if (!x || b.disabled || val(x, 'q') === 0 || val(x, 'k') === l) return;
        enqueue(m, 'k', l, 400);
      });
      // Enter di Qty Aktual = lanjut ke Qty baris berikutnya (input cepat)
      body.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' || !e.target.matches('[data-pcf]')) return;
        e.preventDefault();
        var all = Array.prototype.slice.call(body.querySelectorAll('[data-pcf="q"]'));
        var tr = e.target.closest('tr'), i = all.indexOf(tr.querySelector('[data-pcf="q"]'));
        if (all[i + 1]) { all[i + 1].focus(); all[i + 1].select(); }
        schedule(300);
      });
    }

    // ---------- simpan otomatis ----------
    function pendKey(id) { return 'mw-pc-pending:' + id; }
    function persistPending() {
      if (!P.qid) return;
      try { if (Object.keys(P.queue).length) localStorage.setItem(pendKey(P.qid), JSON.stringify(P.queue)); else localStorage.removeItem(pendKey(P.qid)); } catch (e) { /* abaikan */ }
    }
    function restorePending(id) {
      if (P.qid === id && Object.keys(P.queue).length) return; // antrian check ini masih di memori
      P.queue = {}; P.qid = id; P.err = null;
      try {
        var q = JSON.parse(localStorage.getItem(pendKey(id)) || 'null');
        if (q && Object.keys(q).length && isOpen(P.cur.meta) && canInput()) {
          Object.keys(q).forEach(function (m) { if (typeof q[m] !== 'object' || q[m] === null) q[m] = { q: q[m] }; }); // format lama
          P.queue = q; schedule(800);
        }
      } catch (e) { /* abaikan */ }
    }
    function enqueue(m, f, v, delay) {
      (P.queue[m] || (P.queue[m] = {}))[f] = v;
      persistPending();
      var x = findItem(m);
      if (x) refreshRow(x);
      refreshProgress(); setSave();
      schedule(delay);
    }
    function schedule(ms) {
      clearTimeout(P.timer);
      if (!Object.keys(P.queue).length) return;
      P.timer = setTimeout(flush, ms);
    }
    function saveText() {
      var n = Object.keys(P.queue).length;
      if (!editable()) return P.cur && !isOpen(P.cur.meta) ? 'Physical Check sudah selesai — isian dikunci' + (canManage() ? ' (klik Buka lagi untuk mengubah)' : '') + '.' : '<span class="dot on"></span> Live — tampilan ikut berubah saat rekan mengisi.';
      if (P.saving) return '<span class="dot on" style="background:var(--warn)"></span> Menyimpan ' + n + ' baris…';
      if (P.err) return '<span style="color:var(--bad)">Belum tersimpan (' + esc(P.err) + ') — dicoba lagi otomatis…</span>';
      if (n) return '<span class="dot" style="background:var(--warn)"></span> ' + n + ' baris akan tersimpan otomatis…';
      return '<span class="dot on"></span> Tersimpan otomatis & live di semua perangkat' + (P.savedAt ? ' · ' + fmtTime(P.savedAt) : '') + '. Enter = baris berikutnya.';
    }
    function setSave() { var el = document.getElementById('pcSave'); if (el) el.innerHTML = saveText(); }
    async function flush() {
      if (P.saving) return;
      var id = P.qid, batch = JSON.parse(JSON.stringify(P.queue)), keys = Object.keys(batch);
      if (!keys.length || !id) return;
      P.saving = true; P.err = null; setSave();
      var m0 = P.idx && P.idx.list.filter(function (c) { return c.id === id; })[0];
      var now = new Date().toISOString(), day = today(), title = m0 ? m0.title : id, by = me(), done = 0, items = null;
      try {
        var out = await pass().atomicMulti([
          { path: itemsPath(id), varName: 'MW_PCI', note: 'Physical Check ' + id, mutate: function (cur) {
            if (!cur) throw new Error('Physical Check sudah dihapus');
            cur.items.forEach(function (x) {
              var p = batch[x.m]; if (!p) return;
              Object.keys(p).forEach(function (f) { if (FIELDS.indexOf(f) >= 0) x[f] = p[f]; });
              if (x.q === 0) x.k = null;
              x.by = by; x.at = now;
            });
            done = cur.items.filter(function (x) { return x.q != null; }).length;
            items = cur.items;
            return cur;
          } },
          { path: IDX, varName: 'MW_PC', note: 'Physical Check — daftar', mutate: function (cur) {
            cur = cur || emptyIdx(); if (!cur.last) cur.last = {};
            var meta = cur.list.filter(function (c) { return c.id === id; })[0];
            if (meta) { meta.done = done; meta.n = items.length; meta.lastAt = now; }
            keys.forEach(function (m) {
              var x = items.filter(function (it) { return it.m === m; })[0], L = cur.last[m];
              if (!x) return;
              if (x.q == null) { if (L && L[2] === id) delete cur.last[m]; }
              else if (!L || L[0] <= day) cur.last[m] = [day, x.q, id, title, by, x.k || ''];
            });
            P.idx = cur; return cur;
          } }
        ], 'Physical Check: ' + keys.length + ' baris "' + title + '" (' + by + ')');
        // hapus dari antrian hanya nilai yang belum diubah lagi selama proses simpan
        keys.forEach(function (m) {
          var p = P.queue[m]; if (!p) return;
          Object.keys(batch[m]).forEach(function (f) { if (has(p, f) && p[f] === batch[m][f]) delete p[f]; });
          if (!Object.keys(p).length) delete P.queue[m];
        });
        P.savedAt = now;
        if (P.cur && P.cur.id === id) {
          P.cur.items = items;
          var meta = P.idx.list.filter(function (c) { return c.id === id; })[0]; if (meta) P.cur.meta = meta;
          items.forEach(refreshRow); refreshProgress();
        }
        void out;
      } catch (e) {
        P.err = e.message;
        if (/dihapus/.test(e.message)) { P.queue = {}; toast(e.message, true); }
        else setTimeout(function () { schedule(10); }, 5000);
      } finally {
        P.saving = false;
        if (P.qid === id) persistPending();
        setSave();
        if (!P.err && Object.keys(P.queue).length) schedule(400);
      }
    }
    function hasPending() { return Object.keys(P.queue).length > 0 || P.saving; }

    // ---------- LIVE: ambil perubahan dari perangkat lain ----------
    function stopPoll() { clearTimeout(P.poll); P.poll = null; }
    function startPoll() {
      stopPoll();
      var ms = ctx.hasToken() ? POLL_MS : POLL_STATIC_MS;
      P.poll = setTimeout(function () { poll().catch(function () {}).then(function () { if (P.poll && ctx.route() === 'pc') startPoll(); }); }, ms);
    }
    async function poll() {
      if (document.hidden || ctx.route() !== 'pc' || P.saving) return;
      P.tick++;
      var arg = ctx.routeArg();
      // daftar & status (selesai/dibuka) — tiap ±20 detik, atau tiap putaran di halaman daftar
      if (!arg || P.tick % 4 === 0) {
        var ri = await ctx.ghCond(IDX, P.etagIdx);
        if (ri.status === 200 && ri.text) {
          P.etagIdx = ri.etag;
          var di = await ctx.decryptText(ri.text);
          if (di) {
            P.idx = di; if (!P.idx.last) P.idx.last = {};
            if (!arg && ctx.route() === 'pc' && !ctx.routeArg()) drawList();
            else if (P.cur) {
              var nm = di.list.filter(function (c) { return c.id === P.cur.id; })[0];
              if (!nm) { toast('Physical Check ini sudah dihapus', true); location.hash = '#/pc'; return; }
              if (nm.status !== P.cur.meta.status) { P.cur.meta = nm; drawCheck(); }
              else P.cur.meta = nm;
            }
          }
        }
      }
      if (!arg || !P.cur || P.cur.id !== arg) return;
      var r = await ctx.ghCond(itemsPath(arg), P.etag);
      if (r.status !== 200 || !r.text || r.text === P.txt) return;
      P.etag = r.etag; P.txt = r.text;
      var d = await ctx.decryptText(r.text);
      if (!d || !d.items || P.saving || !P.cur || P.cur.id !== arg) return;
      mergeRemote(d.items);
    }
    function mergeRemote(items) {
      var old = {}, structural = items.length !== P.cur.items.length;
      P.cur.items.forEach(function (x) { old[x.m] = x; });
      var changed = items.filter(function (x) {
        var o = old[x.m]; if (!o) { structural = true; return false; }
        return FIELDS.some(function (f) { return (o[f] == null ? '' : o[f]) !== (x[f] == null ? '' : x[f]); }) || o.by !== x.by || o.at !== x.at;
      });
      P.cur.items = items;
      if (structural) {
        var act = document.activeElement;
        if (!(act && act.closest && act.closest('#pcBody'))) { drawCheck(); return; }
      }
      changed.forEach(refreshRow);
      if (changed.length) refreshProgress();
    }

    // ---------- aksi Owner / Co-Owner ----------
    async function updateMeta(fn, msg) {
      var id = P.cur.id;
      await pass().atomicMulti([{ path: IDX, varName: 'MW_PC', note: 'Physical Check — daftar', mutate: function (cur) {
        cur = cur || emptyIdx();
        var meta = cur.list.filter(function (c) { return c.id === id; })[0];
        if (meta) fn(meta);
        P.idx = cur; return cur;
      } }], msg);
    }
    async function addCodes() {
      var text = prompt('Paste KIMAP tambahan (boleh banyak sekaligus):');
      if (!text) return;
      var r = detect(text), have = {};
      P.cur.items.forEach(function (x) { have[x.m] = 1; });
      var codes = r.found.concat(r.unknown).filter(function (m) { return !have[m]; });
      if (!codes.length) { toast('Tidak ada KIMAP baru (semua sudah ada di daftar)', true); return; }
      var id = P.cur.id, add = codes.map(snapItem), n = 0;
      loading('Menambah ' + codes.length + ' KIMAP…');
      try {
        await pass().atomicMulti([
          { path: itemsPath(id), varName: 'MW_PCI', note: 'Physical Check ' + id, mutate: function (cur) {
            var h2 = {}; cur.items.forEach(function (x) { h2[x.m] = 1; });
            add.forEach(function (x) { if (!h2[x.m]) cur.items.push(x); });
            n = cur.items.length; return cur;
          } },
          { path: IDX, varName: 'MW_PC', note: 'Physical Check — daftar', mutate: function (cur) {
            var meta = cur.list.filter(function (c) { return c.id === id; })[0]; if (meta) meta.n = n; P.idx = cur; return cur;
          } }
        ], 'Physical Check: tambah ' + codes.length + ' KIMAP ke "' + P.cur.meta.title + '" (' + me() + ')');
        toast(codes.length + ' KIMAP ditambahkan' + (r.unknown.length ? ' (' + r.unknown.length + ' tidak ada di data)' : ''));
        await renderCheck(id);
      } catch (e) { toast('Gagal: ' + e.message, true); }
      finally { loading(false); }
    }
    async function remove() {
      var c = P.cur, k = counts();
      if (!confirm('Hapus Physical Check "' + c.meta.title + '"?\n' + k.done + ' dari ' + k.n + ' hasil hitung ikut terhapus.')) return;
      loading('Menghapus…');
      try {
        await pass().atomicMulti([
          { path: itemsPath(c.id), del: true },
          { path: IDX, varName: 'MW_PC', note: 'Physical Check — daftar', mutate: function (cur) {
            cur = cur || emptyIdx();
            cur.list = cur.list.filter(function (x) { return x.id !== c.id; });
            Object.keys(cur.last || {}).forEach(function (m) { if (cur.last[m][2] === c.id) delete cur.last[m]; });
            P.idx = cur; return cur;
          } }
        ], 'Physical Check: hapus "' + c.meta.title + '" (' + me() + ')');
        if (ctx.audit) ctx.audit('Physical Check', c.meta.title + ' · ' + k.done + '/' + k.n + ' dihitung', { meta: c.meta, items: c.items });
        try { localStorage.removeItem(pendKey(c.id)); } catch (e) { /* abaikan */ }
        P.cur = null; P.queue = {}; toast('Physical Check dihapus');
        location.hash = '#/pc';
      } catch (e) { toast('Gagal menghapus: ' + e.message, true); }
      finally { loading(false); }
    }

    // ---------- Download Excel (format laporan rapi) ----------
    function statusOf(x) {
      if (x.q == null) return 'Belum dihitung';
      if (x.sap == null) return 'Tidak ada qty SAP';
      var d = x.q - x.sap;
      return d === 0 ? 'Match' : d < 0 ? 'Selisih Kurang' : 'Selisih Lebih';
    }
    async function exportExcel() {
      // qty aktual 0 -> kondisi kosong (hanya di laporan; data tersimpan tidak diubah)
      var c = Object.assign({}, P.cur, { items: P.cur.items.map(function (x) { return x.q === 0 && x.k ? Object.assign({}, x, { k: null }) : x; }) });
      loading('Menyiapkan Excel…');
      try {
        await ensureDet();
        var ExcelJS = await ctx.loadExcelJS(), wb = new ExcelJS.Workbook();
        wb.creator = 'Material Warehouse'; wb.created = new Date();
        var BLUE = 'FF0A5CC2', thin = { style: 'thin', color: { argb: 'FFC5D0DE' } }, border = { top: thin, left: thin, bottom: thin, right: thin };
        var ws = wb.addWorksheet('Hasil Physical Check', { views: [{ state: 'frozen', ySplit: 6, xSplit: 3 }], pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });
        var cols = [
          ['No', 5], ['KIMAP', 14], ['Deskripsi Material', 44], ['UoM', 7], ['Valuation Type', 13], ['Aging', 8], ['Bin / SLoc SAP', 14], ['Storage Bin Update', 16],
          ['Harga Satuan (IDR)', 15], ['Qty SAP', 10], ['Qty Aktual', 10], ['Selisih (Aktual − SAP)', 12], ['Selisih Kurang', 10], ['Selisih Lebih', 10],
          ['Nilai SAP (IDR)', 16], ['Nilai Aktual (IDR)', 16], ['Nilai Selisih (IDR)', 16], ['Kondisi', 8], ['Keterangan Kondisi', 34], ['Status', 15],
          ['Keterangan', 30], ['Terakhir Keluar ' + curYear(), 16], ['Diisi oleh', 16], ['Waktu Isi', 15]
        ];
        var N = cols.length, L = function (i) { return ws.getColumn(i).letter; };
        cols.forEach(function (cl, i) { ws.getColumn(i + 1).width = cl[1]; });
        ws.mergeCells(1, 1, 1, N); ws.getCell(1, 1).value = 'LAPORAN HASIL PHYSICAL CHECK MATERIAL PERSEDIAAN';
        ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: BLUE } };
        ws.mergeCells(2, 1, 2, N); ws.getCell(2, 1).value = 'PT Pertamina EP — Field ' + ctx.homeName() + ' · Warehouse & Distribution';
        ws.mergeCells(3, 1, 3, N); ws.getCell(3, 1).value = c.meta.title + ' · Tanggal: ' + fmtDate(c.meta.date) + ' · Status: ' + (isOpen(c.meta) ? 'Berjalan' : 'Selesai') + (c.baseName ? ' · File Base: ' + c.baseName : (c.sapDate ? ' · Qty SAP per ' + fmtDate(c.sapDate) : ''));
        ws.mergeCells(4, 1, 4, N); ws.getCell(4, 1).value = 'Kondisi: ' + Object.keys(KONDL).map(function (l) { return l + ' = ' + KONDL[l]; }).join(' · ');
        [2, 3, 4].forEach(function (r) { ws.getCell(r, 1).font = { size: 10, color: { argb: 'FF475569' } }; });
        var hr = ws.getRow(6);
        cols.forEach(function (cl, i) { hr.getCell(i + 1).value = cl[0]; });
        hr.height = 44;
        hr.eachCell(function (cl) { cl.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cl.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } }; cl.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }; cl.border = border; });
        var first = 7;
        c.items.forEach(function (x, i) {
          var r = first + i, lo = lastOut(x.m), loTxt = lo.d ? fmtDate(lo.d) : lo.ym ? BULAN[+lo.ym.slice(5, 7) - 1] + ' ' + lo.ym.slice(0, 4) : '-';
          var row = ws.getRow(r);
          row.values = [i + 1, x.m, x.d, x.u, x.vt || '', x.aging || '', x.bin || x.sloc || '', x.nb || '', x.price, x.sap, x.q, null, null, null, null, null, null, x.k || '', x.k ? KONDL[x.k] : '', null, x.ket || '', loTxt, x.by || '', x.at ? fmtTime(x.at) : ''];
          var K = L(11), J = L(10), I = L(9), Lc = L(12);
          var dq = x.q != null && x.sap != null ? x.q - x.sap : null, pr = x.price || 0;
          // formula + hasil tersimpan (angka tetap tampil walau dibuka di aplikasi yang tidak menghitung ulang)
          row.getCell(12).value = { formula: 'IF(OR(' + K + r + '="",' + J + r + '=""),"",' + K + r + '-' + J + r + ')', result: dq == null ? '' : dq };
          row.getCell(13).value = { formula: 'IF(' + Lc + r + '="","",IF(' + Lc + r + '<0,-' + Lc + r + ',0))', result: dq == null ? '' : dq < 0 ? -dq : 0 };
          row.getCell(14).value = { formula: 'IF(' + Lc + r + '="","",IF(' + Lc + r + '>0,' + Lc + r + ',0))', result: dq == null ? '' : dq > 0 ? dq : 0 };
          row.getCell(15).value = { formula: 'IF(' + J + r + '="","",' + J + r + '*' + I + r + ')', result: x.sap == null ? '' : x.sap * pr };
          row.getCell(16).value = { formula: 'IF(' + K + r + '="","",' + K + r + '*' + I + r + ')', result: x.q == null ? '' : x.q * pr };
          row.getCell(17).value = { formula: 'IF(' + Lc + r + '="","",' + Lc + r + '*' + I + r + ')', result: dq == null ? '' : dq * pr };
          row.getCell(20).value = { formula: 'IF(' + K + r + '="","Belum dihitung",IF(' + J + r + '="","Tidak ada qty SAP",IF(' + Lc + r + '=0,"Match",IF(' + Lc + r + '<0,"Selisih Kurang","Selisih Lebih"))))', result: statusOf(x) };
          for (var c2 = 1; c2 <= N; c2++) { var cl = row.getCell(c2); cl.border = border; cl.alignment = { vertical: 'top', wrapText: c2 === 3 || c2 === 19 || c2 === 21 }; }
          [9, 15, 16, 17].forEach(function (c3) { row.getCell(c3).numFmt = '#,##0;[Red]-#,##0'; });
          [10, 11, 12, 13, 14].forEach(function (c3) { row.getCell(c3).numFmt = '#,##0.###;[Red]-#,##0.###'; });
          [1, 4, 5, 6, 18, 20].forEach(function (c3) { row.getCell(c3).alignment = { vertical: 'top', horizontal: 'center' }; });
          if (i % 2) for (var c4 = 1; c4 <= N; c4++) row.getCell(c4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF6F8FB' } };
        });
        var last = first + c.items.length - 1;
        if (c.items.length) {
          var st = L(20);
          ws.addConditionalFormatting({ ref: st + first + ':' + st + last, rules: [
            { type: 'containsText', operator: 'containsText', text: 'Match', style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFE6F6EC' } }, font: { color: { argb: 'FF15803D' }, bold: true } }, priority: 1 },
            { type: 'containsText', operator: 'containsText', text: 'Selisih', style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFDECEC' } }, font: { color: { argb: 'FFC81E1E' }, bold: true } }, priority: 2 },
            { type: 'containsText', operator: 'containsText', text: 'Belum', style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFDF3E2' } }, font: { color: { argb: 'FFB45309' } } }, priority: 3 }
          ] });
          var tr = ws.getRow(last + 1);
          tr.getCell(3).value = 'TOTAL';
          var sumOf = function (c5) { var t = 0; for (var r5 = first; r5 <= last; r5++) { var v5 = ws.getRow(r5).getCell(c5).value; v5 = v5 && typeof v5 === 'object' ? v5.result : v5; if (typeof v5 === 'number') t += v5; } return t; };
          [10, 11, 13, 14, 15, 16, 17].forEach(function (c5) { tr.getCell(c5).value = { formula: 'SUM(' + L(c5) + first + ':' + L(c5) + last + ')', result: sumOf(c5) }; tr.getCell(c5).numFmt = c5 >= 15 ? '#,##0;[Red]-#,##0' : '#,##0.###'; });
          tr.eachCell(function (cl) { cl.font = { bold: true }; cl.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7F0FC' } }; cl.border = border; });
          ws.autoFilter = { from: { row: 6, column: 1 }, to: { row: last, column: N } };
        }
        // ---- Ringkasan ----
        var rs = wb.addWorksheet('Ringkasan');
        rs.getColumn(1).width = 44; rs.getColumn(2).width = 14; rs.getColumn(3).width = 22;
        rs.getCell('A1').value = 'Ringkasan — ' + c.meta.title; rs.getCell('A1').font = { bold: true, size: 13, color: { argb: BLUE } };
        var R = c.items.length ? "'Hasil Physical Check'!" : null, rng = function (col) { return R + '$' + L(col) + '$' + first + ':$' + L(col) + '$' + last; };
        var lines = [['Item', 'Jumlah', 'Nilai (IDR)']];
        var cntS = function (s) { return c.items.filter(function (x) { return statusOf(x) === s; }).length; };
        var tot = function (fn) { return c.items.reduce(function (a, x) { var v = fn(x); return a + (typeof v === 'number' && isFinite(v) ? v : 0); }, 0); };
        var dv = function (x) { return x.q != null && x.sap != null ? (x.q - x.sap) * (x.price || 0) : 0; };
        if (R) {
          lines.push(['Total KIMAP', { formula: 'COUNTA(' + rng(2) + ')', result: c.items.length }, { formula: 'SUM(' + rng(15) + ')', result: tot(function (x) { return x.sap * (x.price || 0); }) }]);
          lines.push(['Sudah dihitung', { formula: 'COUNT(' + rng(11) + ')', result: c.items.filter(function (x) { return x.q != null; }).length }, { formula: 'SUM(' + rng(16) + ')', result: tot(function (x) { return x.q * (x.price || 0); }) }]);
          ['Belum dihitung', 'Match', 'Selisih Kurang', 'Selisih Lebih'].forEach(function (s) {
            lines.push([s, { formula: 'COUNTIF(' + rng(20) + ',"' + s + '")', result: cntS(s) }, s === 'Selisih Kurang' ? { formula: '-SUMIF(' + rng(17) + ',"<0")', result: -tot(function (x) { var v = dv(x); return v < 0 ? v : 0; }) } : s === 'Selisih Lebih' ? { formula: 'SUMIF(' + rng(17) + ',">0")', result: tot(function (x) { var v = dv(x); return v > 0 ? v : 0; }) } : '']);
          });
          lines.push(['', '', '']);
          lines.push(['Kondisi (yang sudah dihitung)', 'Jumlah item', 'Nilai Aktual (IDR)']);
          'ABCDE'.split('').forEach(function (l) { lines.push([l + ' — ' + KONDL[l], { formula: 'COUNTIFS(' + rng(18) + ',"' + l + '",' + rng(11) + ',"<>")', result: c.items.filter(function (x) { return x.k === l && x.q != null; }).length }, { formula: 'SUMIF(' + rng(18) + ',"' + l + '",' + rng(16) + ')', result: tot(function (x) { return x.k === l && x.q != null ? x.q * (x.price || 0) : 0; }) }]); });
        }
        lines.forEach(function (ln, i) {
          var row = rs.getRow(3 + i); row.values = ln;
          row.getCell(3).numFmt = '#,##0;[Red]-#,##0';
          if (i === 0 || /^Kondisi/.test(ln[0])) row.eachCell(function (cl) { cl.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cl.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } }; });
        });
        var buf = await wb.xlsx.writeBuffer(), a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
        a.download = c.meta.title.replace(/[\\/:*?"<>|]+/g, ' ').trim() + ' - Hasil Physical Check.xlsx';
        document.body.appendChild(a); a.click(); a.remove();
      } catch (e) { toast('Gagal export: ' + e.message, true); }
      finally { loading(false); }
    }

    // ---------- klik ----------
    document.addEventListener('click', function (e) {
      if (ctx.route() !== 'pc') return;
      var open = e.target.closest('[data-pc-open]');
      if (open && !e.target.closest('a,button')) { location.hash = '#/pc/' + open.getAttribute('data-pc-open'); return; }
      var b = e.target.closest('[data-pc]');
      if (!b) return;
      var a = b.getAttribute('data-pc');
      if (a === 'create') create();
      else if (a === 'base-clear') { e.preventDefault(); P.base = null; var f = document.getElementById('pcBase'); if (f) f.value = ''; document.getElementById('pcBaseInfo').innerHTML = baseInfo(); refreshDetect(); }
      else if (a === 'filt') { P.filt = b.getAttribute('data-v'); drawCheck(); }
      else if (a === 'excel') exportExcel();
      else if (a === 'add') addCodes();
      else if (a === 'delete') remove();
      else if (a === 'close' || a === 'reopen') {
        if (a === 'close' && hasPending()) { toast('Tunggu sampai semua isian tersimpan', true); schedule(10); return; }
        if (a === 'close' && !confirm('Tandai Physical Check ini Selesai? Isian dikunci (bisa dibuka lagi oleh Owner / Co-Owner).')) return;
        loading('Menyimpan…');
        updateMeta(function (m) { m.status = a === 'close' ? 'Selesai' : 'Berjalan'; m.closedAt = a === 'close' ? new Date().toISOString() : null; }, 'Physical Check: ' + (a === 'close' ? 'selesai' : 'dibuka lagi') + ' "' + P.cur.meta.title + '" (' + me() + ')')
          .then(function () { toast(a === 'close' ? 'Physical Check selesai' : 'Physical Check dibuka lagi'); return renderCheck(P.cur.id); })
          .catch(function (err) { toast('Gagal: ' + err.message, true); })
          .then(function () { loading(false); });
      }
    });
    window.addEventListener('beforeunload', function (e) { if (hasPending()) { e.preventDefault(); e.returnValue = ''; } });
    window.addEventListener('hashchange', function () { if (ctx.route() !== 'pc') stopPoll(); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden && ctx.route() === 'pc' && P.poll) { stopPoll(); poll().catch(function () {}).then(startPoll); } });

    return { render: render, loadIndex: loadIndex, lastOf: lastOf, hasPending: hasPending, flush: flush, kondLabel: function (k) { return KONDL[k] || ''; } };
  };
})(typeof window !== 'undefined' ? window : this);
