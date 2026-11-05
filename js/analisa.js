/*
 * Analisa Material — tabel transaksi MB51 (semua movement type) untuk satu material.
 * Filter movement type, plant, SLoc, periode & teks; ringkasan masuk/keluar, rekap per tahun, export Excel.
 * Data detail: file <versi MB51>-det.js (terenkripsi), dimuat saat dibutuhkan.
 */
(function (root) {
  'use strict';
  var BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  // Keterangan movement type umum (dipakai bila file MB51 tidak membawa "Movement Type Text")
  var MVT = {
    101: 'GR goods receipt', 102: 'GR reversal', 103: 'GR into blocked stock', 104: 'GR blocked – reversal', 105: 'GR from blocked stock', 106: 'GR from blocked – reversal',
    122: 'Return delivery to vendor', 161: 'GR returns', 201: 'GI for cost center', 202: 'RE for cost center', 221: 'GI for project', 222: 'RE for project',
    241: 'GI for asset', 242: 'RE for asset', 261: 'GI for order', 262: 'RE for order', 291: 'GI all acc. assignments', 292: 'RE all acc. assignments',
    301: 'Transfer plant to plant', 302: 'Transfer plant – reversal', 303: 'Remove from storage (plant)', 305: 'Place in storage (plant)', 311: 'Transfer SLoc to SLoc',
    312: 'Transfer SLoc – reversal', 313: 'Remove from storage (SLoc)', 315: 'Place in storage (SLoc)', 343: 'Blocked to unrestricted', 344: 'Unrestricted to blocked',
    351: 'Goods issue: stock transport order', 352: 'GI stock transport – reversal', 501: 'Receipt w/o purchase order', 502: 'Receipt w/o PO – reversal',
    561: 'Initial entry of stock', 562: 'Initial entry – reversal', 701: 'Inventory difference (gain)', 702: 'Inventory difference (loss)',
    949: 'GI (custom)', 950: 'GI (custom) – reversal', 963: 'GI (custom)', 964: 'GI (custom) – reversal'
  };
  var GI = { 201: 1, 202: 1, 221: 1, 222: 1, 261: 1, 262: 1, 291: 1, 292: 1, 949: 1, 950: 1, 963: 1, 964: 1 };
  // Movement type yang TIDAK mengubah stok unrestricted (stok ZMB52): GR ke blocked / valuated blocked stock
  var NON_UNR = { 103: 1, 104: 1, 107: 1, 108: 1, 124: 1, 125: 1 };

  root.AnalisaModule = function (ctx) {
    var S = ctx.S, esc = ctx.esc, toast = ctx.toast;
    var A = { m: null, o: null, det: null, rows: [], f: null, limit: 300 };

    function fmtQ(n) { return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 }).format(n || 0); }
    function fmtRp(n) { return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Math.round(n || 0)); }
    function dmy(s) { return s ? s.slice(8, 10) + '.' + s.slice(5, 7) + '.' + s.slice(0, 4) : ''; }
    function mvtText(t) { return (A.det && A.det.mt && A.det.mt[t]) || MVT[t] || ''; }
    function plantLabel(pl) { return ctx.plantLabel ? ctx.plantLabel(pl) : pl; }
    // default plant = Field Home (Rantau) bila material punya transaksi di sana
    function defPlant() {
      var hp = (S.idx && S.idx.homePlants) || [];
      for (var i = 0; i < hp.length; i++) if (A.rows.some(function (r) { return r[1] === hp[i]; })) return hp[i];
      return '';
    }
    function emptyFilter() { return { mvt: {}, plant: defPlant(), sloc: '', year: '', from: '', to: '', q: '', kind: '' }; }

    function overlay() {
      var el = document.getElementById('anaOv');
      if (!el) {
        el = document.createElement('div'); el.id = 'anaOv'; el.className = 'ana-ov hidden';
        document.body.appendChild(el);
      }
      return el;
    }
    function close() { var el = document.getElementById('anaOv'); if (el) { el.classList.add('hidden'); el.innerHTML = ''; } document.body.classList.remove('ana-lock'); }

    async function open(m) {
      var o = S.idx && S.idx.mats.get(m);
      A.m = m; A.o = o; A.rows = []; A.f = emptyFilter(); A.limit = 300; A.dd = false;
      var el = overlay();
      el.classList.remove('hidden'); document.body.classList.add('ana-lock');
      el.innerHTML = '<div class="ana-box"><div class="ana-head"><div><div class="mat-code">' + esc(m) + '</div><h2>Analisa Material</h2></div><button class="icon-btn" data-ana="close">✕</button></div><div class="ana-body"><div class="muted">Memuat detail transaksi MB51…</div></div></div>';
      try { A.det = await ctx.loadDet(); }
      catch (e) { A.det = null; el.querySelector('.ana-body').innerHTML = '<div class="card card-pad"><b>Gagal memuat detail MB51</b><div class="small muted">' + esc(e.message) + '</div></div>'; return; }
      A.rows = ((A.det && A.det.m[m]) || []).slice().sort(function (a, b) { return a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0; });
      A.f = emptyFilter();
      render();
    }

    function filtered() {
      var f = A.f, q = f.q.trim().toLowerCase(), useMvt = Object.keys(f.mvt).length > 0;
      return A.rows.filter(function (r) {
        if (useMvt && !f.mvt[r[3]]) return false;
        if (f.plant && r[1] !== f.plant) return false;
        if (f.sloc && r[2] !== f.sloc) return false;
        if (f.year && r[0].slice(0, 4) !== f.year) return false;
        if (f.from && r[0] < f.from) return false;
        if (f.to && r[0] > f.to) return false;
        if (f.kind === 'in' && !(r[4] > 0)) return false;
        if (f.kind === 'out' && !(r[4] < 0)) return false;
        if (f.kind === 'gi' && !GI[r[3]]) return false;
        if (q && [r[6], r[7], r[8], r[9], r[10], r[11], r[3], mvtText(r[3])].join(' ').toLowerCase().indexOf(q) < 0) return false;
        return true;
      });
    }

    function render() {
      var el = document.getElementById('anaOv'); if (!el) return;
      var o = A.o || {}, u = o.u || '', body = el.querySelector('.ana-body'), head = el.querySelector('.ana-head');
      head.innerHTML = '<div style="min-width:0"><div class="mat-code">' + esc(A.m) + (u ? ' · ' + esc(u) : '') + '</div><h2>Analisa Material — ' + esc(o.d || '') + '</h2>' +
        '<div class="small muted">Detail transaksi MB51 ' + (A.det && A.det.min ? dmy(A.det.min) + ' s/d ' + dmy(A.det.max) : '') + '</div></div><button class="icon-btn" data-ana="close">✕</button>';
      if (!A.det) {
        body.innerHTML = '<div class="card card-pad remind-card"><b>Detail transaksi MB51 belum tersedia.</b><div class="small">Upload file ZMB51 (Detail list) di halaman <b>Data SAP</b> — mulai versi ini website menyimpan detail semua movement type untuk Analisa Material.</div></div>';
        return;
      }
      if (!A.rows.length) { body.innerHTML = '<div class="card card-pad muted">Tidak ada transaksi MB51 untuk material ini pada periode data.</div>'; return; }
      var list = filtered(), f = A.f, sm = stockModel(); A.sm = sm;
      // ringkasan
      var tin = 0, tout = 0, vout = 0, gi = 0;
      list.forEach(function (r) { if (r[4] > 0) tin += r[4]; else tout += -r[4]; if (r[5] < 0) vout += -r[5]; if (GI[r[3]]) gi += -r[4]; });
      // chip movement type (dari semua baris, jumlah mengikuti filter lain)
      var base = A.rows.filter(function (r) { return (!f.plant || r[1] === f.plant) && (!f.year || r[0].slice(0, 4) === f.year); }), mv = {};
      base.forEach(function (r) { var x = mv[r[3]] || (mv[r[3]] = { n: 0, q: 0 }); x.n++; x.q += r[4]; });
      var plants = {}, slocs = {}, years = {};
      A.rows.forEach(function (r) { plants[r[1]] = 1; years[r[0].slice(0, 4)] = 1; });
      base.forEach(function (r) { if (r[2]) slocs[r[2]] = 1; });
      // per tahun
      var yr = {};
      list.forEach(function (r) { var y = r[0].slice(0, 4), x = yr[y] || (yr[y] = { inq: 0, outq: 0, gi: 0, n: 0 }); x.n++; if (r[4] > 0) x.inq += r[4]; else x.outq += -r[4]; if (GI[r[3]]) x.gi += -r[4]; });
      // grafik pemakaian (GI) per bulan 24 bulan terakhir data
      var lastM = (A.det.max || '').slice(0, 7), months = [];
      if (lastM) { var y0 = +lastM.slice(0, 4), m0 = +lastM.slice(5, 7); for (var i = 23; i >= 0; i--) { var mm = m0 - i, yy = y0; while (mm <= 0) { mm += 12; yy--; } months.push(yy + '-' + (mm < 10 ? '0' : '') + mm); } }
      var byM = {};
      list.forEach(function (r) { if (GI[r[3]]) byM[r[0].slice(0, 7)] = (byM[r[0].slice(0, 7)] || 0) + -r[4]; });
      var mx = Math.max.apply(null, months.map(function (k) { return byM[k] || 0; }).concat([1]));
      var bars = months.map(function (k, i) { var v = byM[k] || 0; return '<div class="b' + (i === months.length - 1 ? ' cur' : '') + '" style="height:' + (v > 0 ? Math.max(3, v / mx * 100) : 0) + '%" title="' + BLN[+k.slice(5) - 1] + ' ' + k.slice(0, 4) + ': ' + fmtQ(v) + ' ' + esc(u) + '"></div>'; }).join('');
      var labels = months.map(function (k, i) { return '<span>' + (i % 3 === 0 ? BLN[+k.slice(5) - 1] + '<br>' + k.slice(2, 4) : '') + '</span>'; }).join('');

      body.innerHTML =
        '<div class="ana-filters">' +
        '<div class="toolbar">' +
        // Movement type: dropdown dengan centang (Semua / satu / beberapa)
        (function () {
          var sel = Object.keys(f.mvt).sort(function (a, b) { return +a - +b; });
          var lbl = !sel.length ? 'Semua' : sel.length <= 4 ? sel.join(', ') : sel.length + ' dipilih';
          return '<div class="ana-dd' + (A.dd ? ' open' : '') + '"><button class="select sm ana-dd-btn" data-ana="dd" type="button">Movement type: <b>' + esc(lbl) + '</b></button>' +
            '<div class="ana-dd-menu">' +
            '<label class="ana-dd-it all"><input type="checkbox" data-ana-mvt="__all"' + (!sel.length ? ' checked' : '') + '><span class="mono">Semua</span><span class="small muted">semua movement type</span><span class="chip-n">' + base.length + '</span></label>' +
            Object.keys(mv).sort(function (a, b) { return +a - +b; }).map(function (t) {
              return '<label class="ana-dd-it' + (GI[t] ? ' gi' : mv[t].q > 0 ? ' inn' : '') + '"><input type="checkbox" data-ana-mvt="' + t + '"' + (f.mvt[t] ? ' checked' : '') + '><b class="mono">' + t + '</b><span class="small">' + esc(mvtText(t)) + '</span><span class="chip-n">' + mv[t].n + '</span></label>';
            }).join('') +
            '<div class="ana-dd-foot"><button class="btn sm" data-ana="mvt-all" type="button">Semua</button><button class="btn sm primary" data-ana="dd-close" type="button">Selesai</button></div></div></div>';
        })() +
        '<select class="select sm" data-anaf="kind"><option value="">Semua arah</option><option value="out"' + (f.kind === 'out' ? ' selected' : '') + '>Keluar (qty −)</option><option value="in"' + (f.kind === 'in' ? ' selected' : '') + '>Masuk (qty +)</option><option value="gi"' + (f.kind === 'gi' ? ' selected' : '') + '>Pemakaian (GI)</option></select>' +
        '<select class="select sm" data-anaf="year"><option value="">Semua tahun</option>' + Object.keys(years).sort().reverse().map(function (y) { return '<option' + (f.year === y ? ' selected' : '') + '>' + y + '</option>'; }).join('') + '</select>' +
        '<select class="select sm" data-anaf="plant"><option value="">Semua plant</option>' + Object.keys(plants).sort().map(function (p) { return '<option value="' + esc(p) + '"' + (f.plant === p ? ' selected' : '') + '>' + esc(p + ' · ' + plantLabel(p)) + '</option>'; }).join('') + '</select>' +
        '<select class="select sm" data-anaf="sloc"><option value="">Semua SLoc</option>' + Object.keys(slocs).sort().map(function (p) { return '<option' + (f.sloc === p ? ' selected' : '') + '>' + esc(p) + '</option>'; }).join('') + '</select>' +
        '<label class="small muted">Dari <input class="input sm" type="date" data-anaf="from" value="' + esc(f.from) + '"></label>' +
        '<label class="small muted">s/d <input class="input sm" type="date" data-anaf="to" value="' + esc(f.to) + '"></label>' +
        '<input class="input sm" data-anaf="q" id="anaQ" style="flex:1;min-width:180px" placeholder="Cari no. dokumen, reservasi, header text, user, PO…" value="' + esc(f.q) + '">' +
        '<button class="btn sm" data-ana="reset">Reset</button><button class="btn sm primary" data-ana="xlsx">Export Excel</button></div></div>' +
        '<div class="kpis ana-kpis">' +
        kpi('Transaksi', list.length, 'dari ' + A.rows.length + ' total') +
        kpi('Masuk (qty +)', fmtQ(tin) + ' ' + u, '') + kpi('Keluar (qty −)', fmtQ(tout) + ' ' + u, 'nilai Rp ' + fmtRp(vout)) +
        kpi('Pemakaian (GI)', fmtQ(gi) + ' ' + u, '201/221/261/291/949…') + kpi('Transaksi terakhir', list[0] ? dmy(list[0][0]) : '—', list[0] ? list[0][3] + ' · ' + list[0][1] : '') + '</div>' +
        stockPanel(sm, u) +
        '<div class="ana-grid"><div class="card card-pad"><h4 class="section-title" style="margin-top:0">Pemakaian (GI) per bulan — 24 bulan</h4><div class="bars">' + bars + '</div><div class="bar-labels">' + labels + '</div></div>' +
        '<div class="card card-pad"><h4 class="section-title" style="margin-top:0">Rekap per tahun</h4><div class="table-wrap" style="max-height:190px"><table class="grid"><thead><tr><th>Tahun</th><th class="num">Masuk</th><th class="num">Keluar</th><th class="num">Pemakaian GI</th><th class="num">Trx</th></tr></thead><tbody>' +
        Object.keys(yr).sort().reverse().map(function (y) { var x = yr[y]; return '<tr><td>' + y + '</td><td class="num">' + fmtQ(x.inq) + '</td><td class="num">' + fmtQ(x.outq) + '</td><td class="num"><b>' + fmtQ(x.gi) + '</b></td><td class="num">' + x.n + '</td></tr>'; }).join('') +
        '</tbody></table></div></div></div>' +
        '<div class="card"><div class="table-wrap ana-wrap"><table class="grid ana-table"><thead><tr><th>Posting Date</th><th>Plant</th><th>SLoc</th><th>MvT</th><th class="num">Qty</th><th class="num" title="Stok ' + esc(f.plant || 'semua plant') + (f.sloc ? ' ' + esc(f.sloc) : '') + ' setelah transaksi ini">Stok setelah</th><th class="num">Nilai (Rp)</th><th>Material Doc.</th><th>Reservasi</th><th>Header Text</th><th>User</th><th>PO</th></tr></thead><tbody>' +
        (list.length ? list.slice(0, A.limit).map(function (r) {
          return '<tr><td class="nowrap">' + dmy(r[0]) + '</td><td class="nowrap"><span class="mono">' + esc(r[1]) + '</span><div class="small muted">' + esc(plantLabel(r[1])) + '</div></td><td class="mono">' + esc(r[2]) + '</td>' +
            '<td class="nowrap"><b class="mono">' + r[3] + '</b><div class="small muted">' + esc(mvtText(r[3])) + '</div></td>' +
            '<td class="num ' + (r[4] < 0 ? 'q-out' : 'q-in') + '">' + (r[4] > 0 ? '+' : '') + fmtQ(r[4]) + '</td>' +
            '<td class="num">' + (sm.bal.has(r) ? '<b>' + fmtQ(sm.bal.get(r)) + '</b>' : '<span class="muted small" title="Tidak mengubah stok unrestricted">—</span>') + '</td><td class="num small">' + fmtRp(r[5]) + '</td>' +
            '<td class="mono small">' + esc(r[6]) + '</td><td class="mono small">' + esc(r[7] === '0' ? '' : r[7]) + '</td><td class="small">' + esc(r[8]) + '</td><td class="small">' + esc(r[9]) + '</td><td class="mono small">' + esc(r[10]) + '</td></tr>';
        }).join('') : '<tr><td colspan="12" class="muted center" style="padding:20px">Tidak ada transaksi sesuai filter</td></tr>') +
        '</tbody></table></div>' +
        (list.length > A.limit ? '<div class="card-pad toolbar"><span class="small muted">Menampilkan ' + A.limit + ' dari ' + list.length + ' transaksi</span><button class="btn sm" data-ana="more">Tampilkan lebih banyak</button></div>' : '') + '</div>';
    }
    function addDays(d, n) { var p = d.split('-'), t = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n)); return t.toISOString().slice(0, 10); }
    // Stok per tanggal: dihitung mundur dari stok ZMB52 (unrestricted) dengan transaksi MB51 plant/SLoc yang sama
    function stockModel() {
      var f = A.f, o = A.o || {}, dates = (S.idx && S.idx.plantDates) || {};
      var srows = (o.rows || []).filter(function (r) { return (!f.plant || r.plant === f.plant) && (!f.sloc || r.sloc === f.sloc); });
      var now = srows.reduce(function (a, r) { return a + (+r.qty || 0); }, 0);
      var pl = f.plant ? [f.plant] : Object.keys(srows.reduce(function (a, r) { a[r.plant] = 1; return a; }, {}));
      var sd = pl.map(function (p) { return dates[p]; }).filter(Boolean).sort().pop() || (S.idx && S.idx.homeDate) || A.det.max;
      var tx = A.rows.filter(function (r) { return (!f.plant || r[1] === f.plant) && (!f.sloc || r[2] === f.sloc) && !NON_UNR[r[3]]; }).slice().reverse(); // urut lama → baru
      var cum = 0, cdates = [], cvals = [], bal = new Map();
      tx.forEach(function (r) { cum += r[4]; cdates.push(r[0]); cvals.push(cum); });
      var P = function (d) { var lo = 0, hi = cdates.length - 1, ans = 0; while (lo <= hi) { var mid = (lo + hi) >> 1; if (cdates[mid] <= d) { ans = cvals[mid]; lo = mid + 1; } else hi = mid - 1; } return ans; };
      var Ps = P(sd);
      tx.forEach(function (r, i) { bal.set(r, now + cvals[i] - Ps); });
      return { now: now, sd: sd, at: function (d) { return now + P(d) - Ps; }, bal: bal, tx: tx, gap: sd > A.det.max };
    }
    function stockPanel(sm, u) {
      var f = A.f, to = f.to || A.det.max, from = f.from || addDays(to, -30), auto = !f.from && !f.to;
      var start = sm.at(addDays(from, -1)), end = sm.at(to), inq = 0, outq = 0, byDay = {};
      sm.tx.forEach(function (r) {
        if (r[0] < from || r[0] > to) return;
        var x = byDay[r[0]] || (byDay[r[0]] = { i: 0, o: 0, n: 0 });
        if (r[4] > 0) { inq += r[4]; x.i += r[4]; } else { outq += -r[4]; x.o += -r[4]; }
        x.n++;
      });
      var span = Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1, days = [];
      if (span <= 62) { for (var d = from; d <= to; d = addDays(d, 1)) days.push(d); }
      else days = Object.keys(byDay).sort();
      var where = (f.plant ? f.plant + ' · ' + plantLabel(f.plant) : 'Semua plant') + (f.sloc ? ' · SLoc ' + f.sloc : '');
      var run = start;
      return '<div class="card card-pad ana-stock"><div class="toolbar" style="margin-bottom:8px"><h4 class="section-title" style="margin:0">Stok per tanggal — ' + esc(where) + '</h4>' +
        '<span class="small muted">' + (auto ? '30 hari terakhir data · pilih <b>Dari</b> &amp; <b>s/d</b> untuk periode lain' : dmy(from) + ' s/d ' + dmy(to)) + '</span></div>' +
        '<div class="kpis ana-kpis">' + kpi('Stok awal · akhir ' + dmy(addDays(from, -1)), fmtQ(start) + ' ' + u, '') + kpi('Masuk', '+' + fmtQ(inq) + ' ' + u, dmy(from) + ' – ' + dmy(to)) +
        kpi('Keluar', '−' + fmtQ(outq) + ' ' + u, dmy(from) + ' – ' + dmy(to)) + kpi('Stok akhir · ' + dmy(to), fmtQ(end) + ' ' + u, '') + '</div>' +
        '<div class="table-wrap ana-days"><table class="grid"><thead><tr><th>Tanggal</th><th class="num">Stok awal hari</th><th class="num">Masuk</th><th class="num">Keluar</th><th class="num">Stok akhir hari</th><th class="num">Trx</th></tr></thead><tbody>' +
        (days.length ? days.map(function (d) {
          var x = byDay[d] || { i: 0, o: 0, n: 0 }, s0 = sm.at(addDays(d, -1)), s1 = sm.at(d);
          return '<tr' + (x.n ? ' class="has-trx"' : '') + '><td class="nowrap">' + dmy(d) + '</td><td class="num">' + fmtQ(s0) + '</td><td class="num q-in">' + (x.i ? '+' + fmtQ(x.i) : '') + '</td><td class="num q-out">' + (x.o ? '−' + fmtQ(x.o) : '') + '</td><td class="num"><b>' + fmtQ(s1) + '</b></td><td class="num small">' + (x.n || '') + '</td></tr>';
        }).join('') : '<tr><td colspan="6" class="muted center">Tidak ada transaksi pada periode ini — stok tetap ' + fmtQ(start) + ' ' + esc(u) + '</td></tr>') +
        '</tbody></table></div>' +
        '<div class="small muted" style="margin-top:6px">Dihitung mundur dari stok ZMB52 <b>' + dmy(sm.sd) + '</b> (' + fmtQ(sm.now) + ' ' + esc(u) + ') dengan transaksi MB51 — cocok untuk rekonsiliasi dengan MB51/MB5B. ' +
        'Movement 103/104/107/108/124 (GR ke blocked stock) tidak dihitung karena belum masuk stok unrestricted.' +
        (sm.gap ? ' <span class="txt-bad">MB51 baru tersedia s/d ' + dmy(A.det.max) + ' — transaksi ' + dmy(addDays(A.det.max, 1)) + ' s/d ' + dmy(sm.sd) + ' belum ada, jadi hasil bisa selisih bila ada transaksi di rentang itu.</span>' : '') + '</div></div>';
    }
    function kpi(k, v, s) { return '<div class="kpi"><div class="k">' + esc(k) + '</div><div class="v">' + esc(String(v)) + '</div><div class="s">' + esc(s || '') + '</div></div>'; }

    async function exportXlsx() {
      var list = filtered(), o = A.o || {};
      ctx.loading('Membuat Excel…');
      try {
        var ExcelJS = await ctx.loadExcelJS(), wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('MB51 ' + A.m, { views: [{ state: 'frozen', ySplit: 3 }] });
        var cols = [['Posting Date', 12], ['Plant', 8], ['Field', 14], ['SLoc', 7], ['Movement Type', 9], ['Movement Type Text', 26], ['Quantity', 11], ['Unit', 7], ['Stok setelah transaksi', 14], ['Amount in LC', 16], ['Material Document', 14], ['Reservation', 12], ['Document Header Text', 26], ['User name', 14], ['Purchase Order', 14], ['Reference', 14]];
        ws.columns = cols.map(function (c) { return { width: c[1] }; });
        ws.getCell(1, 1).value = 'Analisa Material ' + A.m + ' — ' + (o.d || '') + ' (MB51 ' + dmy(A.det.min) + ' s/d ' + dmy(A.det.max) + ')';
        ws.getCell(1, 1).font = { bold: true, size: 12 };
        var hr = ws.getRow(3);
        cols.forEach(function (c, i) { var cl = hr.getCell(i + 1); cl.value = c[0]; cl.font = { bold: true }; cl.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } }; cl.border = { bottom: { style: 'thin' } }; });
        list.forEach(function (r, i) {
          var row = ws.getRow(4 + i), p = r[0].split('-');
          [new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])), r[1], plantLabel(r[1]), r[2], r[3], mvtText(r[3]), r[4], o.u || '', A.sm && A.sm.bal.has(r) ? A.sm.bal.get(r) : '', r[5], r[6], r[7] === '0' ? '' : r[7], r[8], r[9], r[10], r[11]].forEach(function (v, j) { row.getCell(j + 1).value = v; });
          row.getCell(1).numFmt = 'dd.mm.yyyy'; row.getCell(10).numFmt = '#,##0';
        });
        var buf = await wb.xlsx.writeBuffer(), url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
        var a = document.createElement('a'); a.href = url; a.download = 'Analisa_MB51_' + A.m + '.xlsx'; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      } catch (e) { toast('Gagal export: ' + e.message, true); }
      finally { ctx.loading(false); }
    }

    document.addEventListener('click', function (e) {
      if (A.dd && !e.target.closest('.ana-dd')) { A.dd = false; render(); }
      var a = e.target.closest('[data-ana]');
      if (!a) { if (e.target.id === 'anaOv') close(); return; }
      var act = a.getAttribute('data-ana');
      if (act === 'close') close();
      else if (act === 'mvt-all') { A.f.mvt = {}; A.limit = 300; render(); }
      else if (act === 'dd') { A.dd = !A.dd; render(); }
      else if (act === 'dd-close') { A.dd = false; render(); }
      else if (act === 'reset') { A.f = emptyFilter(); A.limit = 300; render(); }
      else if (act === 'more') { A.limit += 500; render(); }
      else if (act === 'xlsx') exportXlsx();
    });
    var qT;
    function onF(e) {
      var t = e.target, k = t.getAttribute && t.getAttribute('data-anaf');
      if (!k || !A.f) return;
      A.f[k] = t.value; A.limit = 300;
      if (k === 'q') { clearTimeout(qT); qT = setTimeout(function () { render(); var q = document.getElementById('anaQ'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }, 250); }
      else render();
    }
    document.addEventListener('change', function (e) {
      var t = e.target, v = t.getAttribute && t.getAttribute('data-ana-mvt');
      if (v) {
        if (v === '__all') A.f.mvt = {};
        else if (t.checked) A.f.mvt[v] = 1; else delete A.f.mvt[v];
        A.limit = 300; A.dd = true; render(); return;
      }
      if (t.getAttribute && t.getAttribute('data-anaf') && t.getAttribute('data-anaf') !== 'q') onF(e);
    });
    document.addEventListener('input', function (e) { if (e.target.getAttribute && e.target.getAttribute('data-anaf') === 'q') onF(e); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && document.getElementById('anaOv') && !document.getElementById('anaOv').classList.contains('hidden')) close(); });

    return { open: open, close: close };
  };
})(this);
