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
      A.m = m; A.o = o; A.rows = []; A.f = emptyFilter(); A.limit = 300;
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
      var list = filtered(), f = A.f;
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
        '<div class="chips ana-mvt"><span class="small muted" style="margin-right:4px">Movement type:</span>' +
        '<button class="chip-toggle' + (!Object.keys(f.mvt).length ? ' on' : '') + '" data-ana="mvt-all">Semua <span class="chip-n">' + base.length + '</span></button>' +
        Object.keys(mv).sort(function (a, b) { return +a - +b; }).map(function (t) {
          return '<button class="chip-toggle' + (f.mvt[t] ? ' on' : '') + (GI[t] ? ' gi' : mv[t].q > 0 ? ' inn' : '') + '" data-ana="mvt" data-v="' + t + '" title="' + esc(mvtText(t)) + '">' + t + ' <span class="small">' + esc(mvtText(t)) + '</span> <span class="chip-n">' + mv[t].n + '</span></button>';
        }).join('') + '</div>' +
        '<div class="toolbar" style="margin-top:8px">' +
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
        '<div class="ana-grid"><div class="card card-pad"><h4 class="section-title" style="margin-top:0">Pemakaian (GI) per bulan — 24 bulan</h4><div class="bars">' + bars + '</div><div class="bar-labels">' + labels + '</div></div>' +
        '<div class="card card-pad"><h4 class="section-title" style="margin-top:0">Rekap per tahun</h4><div class="table-wrap" style="max-height:190px"><table class="grid"><thead><tr><th>Tahun</th><th class="num">Masuk</th><th class="num">Keluar</th><th class="num">Pemakaian GI</th><th class="num">Trx</th></tr></thead><tbody>' +
        Object.keys(yr).sort().reverse().map(function (y) { var x = yr[y]; return '<tr><td>' + y + '</td><td class="num">' + fmtQ(x.inq) + '</td><td class="num">' + fmtQ(x.outq) + '</td><td class="num"><b>' + fmtQ(x.gi) + '</b></td><td class="num">' + x.n + '</td></tr>'; }).join('') +
        '</tbody></table></div></div></div>' +
        '<div class="card"><div class="table-wrap ana-wrap"><table class="grid ana-table"><thead><tr><th>Posting Date</th><th>Plant</th><th>SLoc</th><th>MvT</th><th class="num">Qty</th><th class="num">Nilai (Rp)</th><th>Material Doc.</th><th>Reservasi</th><th>Header Text</th><th>User</th><th>PO</th></tr></thead><tbody>' +
        (list.length ? list.slice(0, A.limit).map(function (r) {
          return '<tr><td class="nowrap">' + dmy(r[0]) + '</td><td class="nowrap"><span class="mono">' + esc(r[1]) + '</span><div class="small muted">' + esc(plantLabel(r[1])) + '</div></td><td class="mono">' + esc(r[2]) + '</td>' +
            '<td class="nowrap"><b class="mono">' + r[3] + '</b><div class="small muted">' + esc(mvtText(r[3])) + '</div></td>' +
            '<td class="num ' + (r[4] < 0 ? 'q-out' : 'q-in') + '">' + (r[4] > 0 ? '+' : '') + fmtQ(r[4]) + '</td><td class="num small">' + fmtRp(r[5]) + '</td>' +
            '<td class="mono small">' + esc(r[6]) + '</td><td class="mono small">' + esc(r[7] === '0' ? '' : r[7]) + '</td><td class="small">' + esc(r[8]) + '</td><td class="small">' + esc(r[9]) + '</td><td class="mono small">' + esc(r[10]) + '</td></tr>';
        }).join('') : '<tr><td colspan="11" class="muted center" style="padding:20px">Tidak ada transaksi sesuai filter</td></tr>') +
        '</tbody></table></div>' +
        (list.length > A.limit ? '<div class="card-pad toolbar"><span class="small muted">Menampilkan ' + A.limit + ' dari ' + list.length + ' transaksi</span><button class="btn sm" data-ana="more">Tampilkan lebih banyak</button></div>' : '') + '</div>';
    }
    function kpi(k, v, s) { return '<div class="kpi"><div class="k">' + esc(k) + '</div><div class="v">' + esc(String(v)) + '</div><div class="s">' + esc(s || '') + '</div></div>'; }

    async function exportXlsx() {
      var list = filtered(), o = A.o || {};
      ctx.loading('Membuat Excel…');
      try {
        var ExcelJS = await ctx.loadExcelJS(), wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('MB51 ' + A.m, { views: [{ state: 'frozen', ySplit: 3 }] });
        var cols = [['Posting Date', 12], ['Plant', 8], ['Field', 14], ['SLoc', 7], ['Movement Type', 9], ['Movement Type Text', 26], ['Quantity', 11], ['Unit', 7], ['Amount in LC', 16], ['Material Document', 14], ['Reservation', 12], ['Document Header Text', 26], ['User name', 14], ['Purchase Order', 14], ['Reference', 14]];
        ws.columns = cols.map(function (c) { return { width: c[1] }; });
        ws.getCell(1, 1).value = 'Analisa Material ' + A.m + ' — ' + (o.d || '') + ' (MB51 ' + dmy(A.det.min) + ' s/d ' + dmy(A.det.max) + ')';
        ws.getCell(1, 1).font = { bold: true, size: 12 };
        var hr = ws.getRow(3);
        cols.forEach(function (c, i) { var cl = hr.getCell(i + 1); cl.value = c[0]; cl.font = { bold: true }; cl.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } }; cl.border = { bottom: { style: 'thin' } }; });
        list.forEach(function (r, i) {
          var row = ws.getRow(4 + i), p = r[0].split('-');
          [new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])), r[1], plantLabel(r[1]), r[2], r[3], mvtText(r[3]), r[4], o.u || '', r[5], r[6], r[7] === '0' ? '' : r[7], r[8], r[9], r[10], r[11]].forEach(function (v, j) { row.getCell(j + 1).value = v; });
          row.getCell(1).numFmt = 'dd.mm.yyyy'; row.getCell(9).numFmt = '#,##0';
        });
        var buf = await wb.xlsx.writeBuffer(), url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
        var a = document.createElement('a'); a.href = url; a.download = 'Analisa_MB51_' + A.m + '.xlsx'; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      } catch (e) { toast('Gagal export: ' + e.message, true); }
      finally { ctx.loading(false); }
    }

    document.addEventListener('click', function (e) {
      var a = e.target.closest('[data-ana]');
      if (!a) { if (e.target.id === 'anaOv') close(); return; }
      var act = a.getAttribute('data-ana');
      if (act === 'close') close();
      else if (act === 'mvt-all') { A.f.mvt = {}; A.limit = 300; render(); }
      else if (act === 'mvt') { var v = a.getAttribute('data-v'); if (A.f.mvt[v]) delete A.f.mvt[v]; else A.f.mvt[v] = 1; A.limit = 300; render(); }
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
    document.addEventListener('change', function (e) { if (e.target.getAttribute && e.target.getAttribute('data-anaf') !== 'q') onF(e); });
    document.addEventListener('input', function (e) { if (e.target.getAttribute && e.target.getAttribute('data-anaf') === 'q') onF(e); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && document.getElementById('anaOv') && !document.getElementById('anaOv').classList.contains('hidden')) close(); });

    return { open: open, close: close };
  };
})(this);
