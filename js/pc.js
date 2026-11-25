/*
 * Physical Check (stock opname sederhana)
 * - Owner / Co-Owner: Create Physical Check → judul + paste banyak KIMAP sekaligus (dari Excel/teks) → otomatis terdeteksi.
 * - Warehouse / Receiving / Owner: cukup isi Jumlah Fisik per KIMAP → tersimpan otomatis (tanpa tombol Simpan).
 * - "Terakhir keluar" tahun ini dihitung dari data MB51 yang di-upload di Data SAP.
 * - Cari Material menampilkan kapan Physical Check terakhir per material.
 * Penyimpanan (terenkripsi): data/pc.js = daftar check + peta "terakhir dicek" per material,
 *                             data/pc/<id>.js = isi (item) satu check. Setiap simpan = 1 commit berisi keduanya.
 */
(function (root) {
  'use strict';
  var BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  var BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  var IDX = 'data/pc.js';

  root.PcModule = function (ctx) {
    var S = ctx.S, esc = ctx.esc, toast = ctx.toast, loading = ctx.loading;
    var P = S.pc = { idx: null, cur: null, qid: null, filt: 'Semua', q: '', queue: {}, saving: false, timer: null, err: null, savedAt: null, det: null };

    function pad(n) { return (n < 10 ? '0' : '') + n; }
    function today() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    function fmtDate(s) { if (!s) return '—'; var p = String(s).slice(0, 10).split('-'); return +p[2] + ' ' + BLN[+p[1] - 1] + ' ' + p[0]; }
    function fmtTime(iso) { if (!iso) return ''; var d = new Date(iso); return d.getDate() + ' ' + BLN[d.getMonth()] + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
    function nf(n) { return n == null || n === '' ? '—' : new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 }).format(n); }
    function me() { return S.user ? S.user.name : ''; }
    function canManage() { return ctx.isOwner(); }
    function canInput() { return ctx.canInput(); }
    function isOpen(c) { return c && c.status !== 'Selesai'; }
    function pass() { return ctx.pass(); }
    function itemsPath(id) { return 'data/pc/' + id + '.js'; }
    function view() { return document.getElementById('view'); }
    function emptyIdx() { return { seq: 1, list: [], last: {} }; }

    // ---------- data ----------
    async function loadIndex(force) {
      if (!P.idx || force) P.idx = (await pass().readJSON(IDX)) || emptyIdx();
      if (!P.idx.last) P.idx.last = {};
      return P.idx;
    }
    // Physical check terakhir untuk Cari Material: [tanggal, qty, idCheck, judul, oleh]
    function lastOf(m) { return P.idx && P.idx.last ? P.idx.last[m] || null : null; }

    // ---------- deteksi KIMAP dari teks tempelan ----------
    function detect(text) {
      var mats = S.idx ? S.idx.mats : new Map(), seen = {}, found = [], unknown = [];
      String(text || '').toUpperCase().split(/[^A-Z0-9]+/).forEach(function (t) {
        if (!t || seen[t]) return;
        var known = mats.has(t);
        if (!known && !/^[A-Z]\d{9}$/.test(t)) return; // bukan pola KIMAP (huruf + 9 angka) dan tidak ada di data
        seen[t] = 1;
        (known ? found : unknown).push(t);
      });
      return { found: found, unknown: unknown };
    }
    function snapItem(m) {
      var o = S.idx && S.idx.mats.get(m);
      return { m: m, d: o ? o.d : '', u: o ? o.u : '', sap: o ? (o.homeStock || 0) : null, q: null };
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
      // tanpa detail transaksi: bulan terakhir ada pemakaian (agregat MB51)
      var o = S.idx && S.idx.mats.get(m), ym = null;
      if (o && o.homeUse) Object.keys(o.homeUse).forEach(function (k) { if (k.slice(0, 4) === y && o.homeUse[k] > 0 && (!ym || k > ym)) ym = k; });
      return ym ? { ym: ym } : { none: true };
    }
    function outHtml(m) {
      if (P.det === null) return '<span class="muted small">…</span>';
      var x = lastOut(m);
      if (x.d) return '<span class="nowrap">' + fmtDate(x.d) + '</span><div class="small muted">keluar ' + nf(x.q) + '</div>';
      if (x.ym) return '<span class="nowrap">' + BULAN[+x.ym.slice(5, 7) - 1] + ' ' + x.ym.slice(0, 4) + '</span>';
      return '<span class="muted small">Belum keluar ' + curYear() + '</span>';
    }

    // ================= Halaman daftar =================
    async function render() {
      var r = ctx.routeArg();
      if (r) return renderCheck(r);
      var v = view();
      v.innerHTML = '<div class="card card-pad muted">Memuat Physical Check…</div>';
      try { await loadIndex(true); } catch (e) { v.innerHTML = '<div class="card card-pad"><b>Gagal memuat Physical Check</b><div class="small muted">' + esc(e.message) + '</div></div>'; return; }
      if (ctx.route() !== 'pc' || ctx.routeArg()) return;
      var list = P.idx.list.slice().sort(function (a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); });
      v.innerHTML = (canManage() ? createCard() : '') +
        '<div class="card">' + (list.length ? '<div class="table-wrap"><table class="grid pc-list"><thead><tr><th>Physical Check</th><th>Tanggal</th><th>Progres</th><th>Status</th><th></th></tr></thead><tbody>' +
          list.map(function (c) {
            var pct = c.n ? Math.round((c.done || 0) / c.n * 100) : 0;
            return '<tr class="clickable" data-pc-open="' + esc(c.id) + '"><td><b>' + esc(c.title) + '</b><div class="small muted">dibuat ' + esc(c.by || '') + ' · ' + fmtTime(c.createdAt) + '</div></td>' +
              '<td class="nowrap">' + fmtDate(c.date) + '</td>' +
              '<td style="min-width:180px"><div class="small"><b>' + (c.done || 0) + '</b> / ' + (c.n || 0) + ' KIMAP terisi</div><div class="progress" style="margin-top:4px"><i style="width:' + pct + '%"></i></div>' + (c.lastAt ? '<div class="small muted">terakhir diisi ' + fmtTime(c.lastAt) + '</div>' : '') + '</td>' +
              '<td>' + (isOpen(c) ? '<span class="badge warn">Berjalan</span>' : '<span class="badge ok">Selesai</span>') + '</td>' +
              '<td class="right"><a class="btn sm primary" href="#/pc/' + esc(c.id) + '">' + (isOpen(c) && canInput() ? 'Isi jumlah' : 'Buka') + '</a></td></tr>';
          }).join('') + '</tbody></table></div>'
          : '<div class="empty" style="padding:28px"><h3>Belum ada Physical Check</h3><p>' + (canManage() ? 'Buat di atas: isi judul lalu paste daftar KIMAP.' : 'Owner / Co-Owner akan membuat Physical Check, lalu Anda tinggal mengisi jumlah fisik.') + '</p></div>') + '</div>';
      bindCreate();
    }
    function createCard() {
      var d = new Date();
      return '<details class="card card-pad pc-create" style="margin-bottom:14px"' + (P.idx.list.length ? '' : ' open') + '><summary style="cursor:pointer;font-weight:800">+ Create Physical Check</summary>' +
        '<div class="pc-create-grid" style="margin-top:12px">' +
        '<label class="fleet-fld"><span>Judul *</span><input class="input" id="pcTitle" value="Physical Check ' + BULAN[d.getMonth()] + ' ' + d.getFullYear() + '"></label>' +
        '<label class="fleet-fld"><span>Tanggal</span><input class="input" type="date" id="pcDate" value="' + today() + '"></label></div>' +
        '<label class="fleet-fld" style="margin-top:10px"><span>Paste KIMAP (boleh banyak sekaligus — dari kolom Excel, dipisah baris/spasi/koma)</span>' +
        '<textarea class="input mono" id="pcPaste" rows="6" placeholder="K180900047&#10;B160900024&#10;M295900003&#10;…"></textarea></label>' +
        '<div id="pcDetect" class="small muted" style="margin-top:8px">Belum ada KIMAP.</div>' +
        '<div class="toolbar" style="margin-top:10px"><button class="btn primary" data-pc="create">Create Physical Check</button></div></details>';
    }
    function detectHtml(r, withUnknownToggle) {
      if (!r.found.length && !r.unknown.length) return 'Belum ada KIMAP terdeteksi.';
      return '<b style="color:var(--ok)">' + r.found.length + ' KIMAP terdeteksi</b>' +
        (r.unknown.length ? ' · <b style="color:var(--warn)">' + r.unknown.length + ' tidak ada di data stok SAP</b> <span class="mono">' + esc(r.unknown.slice(0, 12).join(', ')) + (r.unknown.length > 12 ? ', …' : '') + '</span>' +
          (withUnknownToggle ? ' <label class="small" style="margin-left:6px"><input type="checkbox" id="pcUnk" checked> ikut sertakan</label>' : '') : '');
    }
    function bindCreate() {
      var ta = document.getElementById('pcPaste');
      if (!ta) return;
      ta.addEventListener('input', function () { document.getElementById('pcDetect').innerHTML = detectHtml(detect(ta.value), true); });
    }
    async function create() {
      var title = document.getElementById('pcTitle').value.trim(), date = document.getElementById('pcDate').value || today();
      var r = detect(document.getElementById('pcPaste').value), unk = document.getElementById('pcUnk');
      var codes = r.found.concat(unk && !unk.checked ? [] : r.unknown);
      if (!title) { toast('Isi judul Physical Check', true); return; }
      if (!codes.length) { toast('Paste dulu daftar KIMAP', true); return; }
      var id = 'PC' + Date.now().toString(36).toUpperCase();
      var items = codes.map(snapItem), sapDate = S.idx ? S.idx.homeDate : null;
      loading('Membuat Physical Check…');
      try {
        await pass().atomicMulti([
          { path: itemsPath(id), varName: 'MW_PCI', note: 'Physical Check ' + id, mutate: function () { return { id: id, sapDate: sapDate, items: items }; } },
          { path: IDX, varName: 'MW_PC', note: 'Physical Check — daftar', mutate: function (cur) {
            cur = cur || emptyIdx();
            cur.list.push({ id: id, no: cur.seq++, title: title, date: date, createdAt: new Date().toISOString(), by: me(), status: 'Berjalan', n: items.length, done: 0, sapDate: sapDate });
            P.idx = cur; return cur;
          } }
        ], 'Physical Check: buat "' + title + '" (' + items.length + ' KIMAP, ' + me() + ')');
        toast('Physical Check dibuat — ' + items.length + ' KIMAP');
        location.hash = '#/pc/' + id;
      } catch (e) { toast('Gagal membuat: ' + e.message, true); }
      finally { loading(false); }
    }

    // ================= Halaman isi satu check =================
    async function renderCheck(id) {
      var v = view();
      if (!P.cur || P.cur.id !== id) v.innerHTML = '<div class="card card-pad muted">Memuat Physical Check…</div>';
      // pindah ke check lain: simpan dulu antrian check sebelumnya
      if (P.qid && P.qid !== id && Object.keys(P.queue).length) {
        while (P.saving) await new Promise(function (r) { setTimeout(r, 200); });
        await flush();
      }
      try {
        await loadIndex(true);
        var meta = P.idx.list.filter(function (c) { return c.id === id; })[0];
        if (!meta) { v.innerHTML = '<div class="card card-pad">Physical Check tidak ditemukan. <a href="#/pc">← Kembali</a></div>'; return; }
        var data = await pass().readJSON(itemsPath(id));
        P.cur = { id: id, meta: meta, items: (data && data.items) || [], sapDate: data && data.sapDate };
        restorePending(id);
      } catch (e) { v.innerHTML = '<div class="card card-pad"><b>Gagal memuat</b><div class="small muted">' + esc(e.message) + '</div><a href="#/pc">← Kembali</a></div>'; return; }
      if (ctx.route() !== 'pc' || ctx.routeArg() !== id) return;
      drawCheck();
      if (P.det === null) ensureDet().then(function () { if (P.cur && P.cur.id === id) refreshOut(); });
    }
    function counts() {
      var it = P.cur.items, done = 0;
      it.forEach(function (x) { if (x.q != null) done++; });
      return { n: it.length, done: done };
    }
    function drawCheck() {
      var c = P.cur, meta = c.meta, open = isOpen(meta), mg = canManage(), ed = open && canInput(), k = counts();
      var pct = k.n ? Math.round(k.done / k.n * 100) : 0;
      var tabs = ['Semua', 'Belum diisi', 'Sudah diisi'];
      view().innerHTML =
        '<div class="card card-pad pc-head"><div class="toolbar"><a class="btn sm" href="#/pc">← Daftar</a><div style="min-width:0"><h3 style="margin:0">' + esc(meta.title) + '</h3>' +
        '<div class="small muted">' + fmtDate(meta.date) + ' · dibuat ' + esc(meta.by || '') + (c.sapDate ? ' · stok SAP per ' + fmtDate(c.sapDate) : '') + '</div></div>' +
        '<span class="spacer"></span>' + (open ? '<span class="badge warn">Berjalan</span>' : '<span class="badge ok">Selesai</span>') + '</div>' +
        '<div class="pc-prog"><div><b id="pcDone">' + k.done + '</b> / ' + k.n + ' KIMAP terisi</div><div class="progress"><i id="pcBar" style="width:' + pct + '%"></i></div></div>' +
        '<div class="toolbar" style="margin-top:10px"><input class="input" id="pcQ" placeholder="Cari KIMAP / deskripsi…" style="flex:1;min-width:200px" value="' + esc(P.q) + '">' +
        tabs.map(function (t) { return '<span class="chip-toggle' + (P.filt === t ? ' on' : '') + '" data-pc="filt" data-v="' + t + '">' + t + '</span>'; }).join('') +
        '<button class="btn sm" data-pc="reload">Muat ulang</button><button class="btn sm" data-pc="excel">Export Excel</button>' +
        (mg ? (open ? '<button class="btn sm" data-pc="add">+ Tambah KIMAP</button><button class="btn sm success" data-pc="close">Tandai Selesai</button>' : '<button class="btn sm" data-pc="reopen">Buka lagi</button>') +
          '<button class="btn sm danger" data-pc="delete">Hapus</button>' : '') + '</div>' +
        (ed ? '<div class="pc-save" id="pcSave">' + saveText() + '</div>' : (open ? '' : '<div class="small muted" style="margin-top:8px">Physical Check sudah selesai — jumlah tidak bisa diubah' + (mg ? ' (klik Buka lagi untuk mengubah)' : '') + '.</div>')) +
        '</div>' +
        '<div class="card" style="margin-top:14px"><div class="table-wrap tall"><table class="grid pc-table"><thead><tr><th class="c">No</th><th>Material</th><th>UOM</th><th>Terakhir keluar ' + curYear() + '</th>' +
        (mg ? '<th class="num">Stok SAP</th>' : '') + '<th class="num">Jumlah fisik</th>' + (mg ? '<th class="num">Selisih</th>' : '') + '<th>Diisi</th></tr></thead><tbody id="pcBody">' + rowsHtml() + '</tbody></table></div></div>';
      bindCheck();
    }
    function shownItems() {
      var q = P.q.trim().toUpperCase();
      return P.cur.items.map(function (x, i) { return { x: x, i: i }; }).filter(function (o) {
        var x = o.x, filled = curQ(x) != null;
        if (P.filt === 'Belum diisi' && filled) return false;
        if (P.filt === 'Sudah diisi' && !filled) return false;
        return !q || (x.m + ' ' + x.d).toUpperCase().indexOf(q) >= 0;
      });
    }
    // nilai yang tampil: antrian lokal (belum tersimpan) didahulukan
    function curQ(x) { return Object.prototype.hasOwnProperty.call(P.queue, x.m) ? P.queue[x.m] : x.q; }
    function rowsHtml() {
      var mg = canManage(), ed = isOpen(P.cur.meta) && canInput();
      var rows = shownItems();
      if (!rows.length) return '<tr><td colspan="' + (mg ? 8 : 6) + '" class="muted center" style="padding:20px">Tidak ada KIMAP.</td></tr>';
      return rows.map(function (o) {
        var x = o.x, q = curQ(x), diff = q != null && x.sap != null ? q - x.sap : null;
        return '<tr data-m="' + esc(x.m) + '"' + (q != null ? ' class="pc-filled"' : '') + '><td class="c muted">' + (o.i + 1) + '</td>' +
          '<td><div class="mat-desc">' + (x.d ? esc(x.d) : '<span class="muted">(tidak ada di data stok SAP)</span>') + '</div><div class="mat-code">' + esc(x.m) + '</div></td>' +
          '<td>' + esc(x.u || '') + '</td><td class="pc-out" data-out="' + esc(x.m) + '">' + outHtml(x.m) + '</td>' +
          (mg ? '<td class="num">' + nf(x.sap) + '</td>' : '') +
          '<td class="num">' + (ed ? '<input class="input pc-q" type="number" inputmode="decimal" step="any" min="0" data-pcq="' + esc(x.m) + '" value="' + (q == null ? '' : esc(q)) + '" placeholder="isi">' : '<b>' + nf(q) + '</b>') + '</td>' +
          (mg ? '<td class="num pc-diff" data-diff="' + esc(x.m) + '">' + diffHtml(diff) + '</td>' : '') +
          '<td class="small muted pc-by" data-by="' + esc(x.m) + '">' + byHtml(x) + '</td></tr>';
      }).join('');
    }
    function diffHtml(d) { if (d == null) return '<span class="muted">—</span>'; return '<b style="color:' + (d === 0 ? 'var(--ok)' : 'var(--bad)') + '">' + (d > 0 ? '+' : '') + nf(d) + '</b>'; }
    function byHtml(x) {
      if (Object.prototype.hasOwnProperty.call(P.queue, x.m)) return '<span style="color:var(--warn)">menyimpan…</span>';
      return x.by ? esc(x.by) + '<br>' + fmtTime(x.at) : '';
    }
    function refreshOut() { document.querySelectorAll('[data-out]').forEach(function (td) { td.innerHTML = outHtml(td.getAttribute('data-out')); }); }
    function refreshRow(x) {
      var by = document.querySelector('[data-by="' + cssq(x.m) + '"]'); if (by) by.innerHTML = byHtml(x);
      var q = curQ(x), df = document.querySelector('[data-diff="' + cssq(x.m) + '"]');
      if (df) df.innerHTML = diffHtml(q != null && x.sap != null ? q - x.sap : null);
      var inp = document.querySelector('[data-pcq="' + cssq(x.m) + '"]');
      if (inp && document.activeElement !== inp && !Object.prototype.hasOwnProperty.call(P.queue, x.m)) inp.value = x.q == null ? '' : x.q;
      var tr = inp ? inp.closest('tr') : (by && by.closest('tr'));
      if (tr) tr.classList.toggle('pc-filled', q != null);
    }
    function cssq(s) { return String(s).replace(/"/g, '\\"'); }
    function refreshProgress() {
      var k = counts(), d = document.getElementById('pcDone'), b = document.getElementById('pcBar');
      if (d) d.textContent = k.done;
      if (b) b.style.width = (k.n ? Math.round(k.done / k.n * 100) : 0) + '%';
    }
    function bindCheck() {
      var qi = document.getElementById('pcQ');
      if (qi) qi.addEventListener('input', function () { P.q = qi.value; document.getElementById('pcBody').innerHTML = rowsHtml(); });
      var body = document.getElementById('pcBody');
      body.addEventListener('input', function (e) {
        var t = e.target; if (!t.matches || !t.matches('[data-pcq]')) return;
        var m = t.getAttribute('data-pcq'), v = t.value.trim().replace(',', '.');
        if (v !== '' && !isFinite(+v)) return;
        enqueue(m, v === '' ? null : +v, 1500);
      });
      body.addEventListener('change', function (e) { if (e.target.matches && e.target.matches('[data-pcq]')) schedule(250); });
      // Enter = lanjut ke baris berikutnya (input cepat)
      body.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' || !e.target.matches('[data-pcq]')) return;
        e.preventDefault();
        var all = Array.prototype.slice.call(body.querySelectorAll('[data-pcq]')), i = all.indexOf(e.target);
        if (all[i + 1]) { all[i + 1].focus(); all[i + 1].select(); }
        schedule(250);
      });
    }

    // ---------- simpan otomatis ----------
    function pendKey(id) { return 'mw-pc-pending:' + id; }
    function persistPending() {
      if (!P.qid) return;
      try { if (Object.keys(P.queue).length) localStorage.setItem(pendKey(P.qid), JSON.stringify(P.queue)); else localStorage.removeItem(pendKey(P.qid)); } catch (e) { /* abaikan */ }
    }
    function restorePending(id) {
      P.queue = {}; P.qid = id; P.err = null;
      try { var q = JSON.parse(localStorage.getItem(pendKey(id)) || 'null'); if (q && Object.keys(q).length && isOpen(P.cur.meta) && canInput()) { P.queue = q; schedule(800); } } catch (e) { /* abaikan */ }
    }
    function enqueue(m, q, delay) {
      P.queue[m] = q;
      persistPending();
      var x = P.cur.items.filter(function (it) { return it.m === m; })[0];
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
      if (P.saving) return '<span class="dot on" style="background:var(--warn)"></span> Menyimpan ' + n + ' perubahan…';
      if (P.err) return '<span style="color:var(--bad)">Gagal menyimpan (' + esc(P.err) + ') — mencoba lagi otomatis…</span>';
      if (n) return '<span class="dot" style="background:var(--warn)"></span> ' + n + ' perubahan akan tersimpan otomatis…';
      return '<span class="dot on"></span> Tersimpan otomatis' + (P.savedAt ? ' · ' + fmtTime(P.savedAt) : '') + ' — cukup isi jumlah, tidak perlu klik Simpan. Enter = baris berikutnya.';
    }
    function setSave() { var el = document.getElementById('pcSave'); if (el) el.innerHTML = saveText(); }
    async function flush() {
      if (P.saving || !P.cur) return;
      var id = P.qid, batch = Object.assign({}, P.queue), keys = Object.keys(batch);
      if (!keys.length || !id) return;
      P.saving = true; P.err = null; setSave();
      var m0 = P.idx && P.idx.list.filter(function (c) { return c.id === id; })[0];
      var now = new Date().toISOString(), day = today(), title = m0 ? m0.title : id, by = me(), done = 0, items = null;
      try {
        var out = await pass().atomicMulti([
          { path: itemsPath(id), varName: 'MW_PCI', note: 'Physical Check ' + id, mutate: function (cur) {
            if (!cur) throw new Error('Physical Check sudah dihapus');
            cur.items.forEach(function (x) {
              if (!Object.prototype.hasOwnProperty.call(batch, x.m)) return;
              x.q = batch[x.m];
              if (x.q == null) { delete x.by; delete x.at; } else { x.by = by; x.at = now; }
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
              var q = batch[m], L = cur.last[m];
              if (q == null) { if (L && L[2] === id) delete cur.last[m]; }
              else if (!L || L[0] <= day) cur.last[m] = [day, q, id, title, by];
            });
            P.idx = cur; return cur;
          } }
        ], 'Physical Check: ' + keys.length + ' jumlah fisik "' + title + '" (' + by + ')');
        if (!out) throw new Error('tidak tersimpan');
        // hapus dari antrian hanya yang nilainya belum diubah lagi selama proses simpan
        keys.forEach(function (m) { if (P.queue[m] === batch[m]) delete P.queue[m]; });
        P.savedAt = now;
        if (P.cur && P.cur.id === id) {
          P.cur.items = items;
          var meta = P.idx.list.filter(function (c) { return c.id === id; })[0]; if (meta) P.cur.meta = meta;
          items.forEach(refreshRow); refreshProgress();
        }
      } catch (e) {
        P.err = e.message;
        if (/dihapus/.test(e.message)) { P.queue = {}; toast(e.message, true); }
        else setTimeout(function () { schedule(10); }, 5000);
      } finally {
        P.saving = false;
        if (P.qid === id) persistPending();
        if (P.cur && P.cur.id === id) setSave();
        if (!P.err && Object.keys(P.queue).length) schedule(400);
      }
    }
    function hasPending() { return Object.keys(P.queue).length > 0 || P.saving; }

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
        toast(codes.length + ' KIMAP ditambahkan' + (r.unknown.length ? ' (' + r.unknown.length + ' tidak ada di data stok)' : ''));
        await renderCheck(id);
      } catch (e) { toast('Gagal: ' + e.message, true); }
      finally { loading(false); }
    }
    async function remove() {
      var c = P.cur, k = counts();
      if (!confirm('Hapus Physical Check "' + c.meta.title + '"?\n' + k.done + ' dari ' + k.n + ' jumlah fisik yang sudah diisi ikut terhapus.')) return;
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
        if (ctx.audit) ctx.audit('Physical Check', c.meta.title + ' · ' + k.done + '/' + k.n + ' terisi', { meta: c.meta, items: c.items });
        P.cur = null; toast('Physical Check dihapus');
        location.hash = '#/pc';
      } catch (e) { toast('Gagal menghapus: ' + e.message, true); }
      finally { loading(false); }
    }
    async function exportExcel() {
      var c = P.cur, mg = canManage();
      loading('Menyiapkan Excel…');
      try {
        await ensureDet();
        var ExcelJS = await ctx.loadExcelJS(), wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('Physical Check');
        ws.addRow([c.meta.title]); ws.getRow(1).font = { bold: true, size: 14 };
        ws.addRow(['Tanggal: ' + fmtDate(c.meta.date) + (c.sapDate ? ' · Stok SAP per ' + fmtDate(c.sapDate) : '') + ' · Status: ' + (isOpen(c.meta) ? 'Berjalan' : 'Selesai')]);
        ws.addRow([]);
        var head = ['No', 'KIMAP', 'Deskripsi', 'UOM', 'Terakhir keluar ' + curYear(), 'Qty keluar terakhir'].concat(mg ? ['Stok SAP'] : []).concat(['Jumlah Fisik']).concat(mg ? ['Selisih'] : []).concat(['Diisi oleh', 'Waktu isi']);
        var hr = ws.addRow(head); hr.font = { bold: true }; hr.eachCell(function (cl) { cl.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7F0FC' } }; cl.border = { bottom: { style: 'thin' } }; });
        c.items.forEach(function (x, i) {
          var o = lastOut(x.m), lo = o.d ? fmtDate(o.d) : o.ym ? BULAN[+o.ym.slice(5, 7) - 1] + ' ' + o.ym.slice(0, 4) : 'Belum keluar ' + curYear();
          var row = [i + 1, x.m, x.d, x.u, lo, o.d ? o.q : null].concat(mg ? [x.sap] : []).concat([x.q]).concat(mg ? [x.q != null && x.sap != null ? x.q - x.sap : null] : []).concat([x.by || '', x.at ? fmtTime(x.at) : '']);
          ws.addRow(row);
        });
        [5, 14, 48, 7, 18, 12].concat(mg ? [11] : []).concat([12]).concat(mg ? [10] : []).concat([18, 16]).forEach(function (w, i) { ws.getColumn(i + 1).width = w; });
        ws.views = [{ state: 'frozen', ySplit: 4 }];
        var buf = await wb.xlsx.writeBuffer(), a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
        a.download = c.meta.title.replace(/[\\/:*?"<>|]+/g, ' ').trim() + '.xlsx';
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
      else if (a === 'filt') { P.filt = b.getAttribute('data-v'); drawCheck(); }
      else if (a === 'reload') { if (hasPending()) { schedule(10); toast('Menyimpan perubahan dulu…'); } else renderCheck(P.cur.id); }
      else if (a === 'excel') exportExcel();
      else if (a === 'add') addCodes();
      else if (a === 'delete') remove();
      else if (a === 'close' || a === 'reopen') {
        if (a === 'close' && !confirm('Tandai Physical Check ini Selesai? Jumlah fisik tidak bisa diubah lagi (bisa dibuka lagi oleh Owner).')) return;
        loading('Menyimpan…');
        updateMeta(function (m) { m.status = a === 'close' ? 'Selesai' : 'Berjalan'; m.closedAt = a === 'close' ? new Date().toISOString() : null; }, 'Physical Check: ' + (a === 'close' ? 'selesai' : 'dibuka lagi') + ' "' + P.cur.meta.title + '" (' + me() + ')')
          .then(function () { toast(a === 'close' ? 'Physical Check selesai' : 'Physical Check dibuka lagi'); return renderCheck(P.cur.id); })
          .catch(function (err) { toast('Gagal: ' + err.message, true); })
          .then(function () { loading(false); });
      }
    });
    window.addEventListener('beforeunload', function (e) { if (hasPending()) { e.preventDefault(); e.returnValue = ''; } });

    return { render: render, loadIndex: loadIndex, lastOf: lastOf, hasPending: hasPending, flush: flush };
  };
})(typeof window !== 'undefined' ? window : this);
