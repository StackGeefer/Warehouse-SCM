/*
 * Register Receiving (buku register barang masuk) — diisi sebelum BASTB & LHPB.
 *
 * Format kolom mengikuti Excel REGISTER_RECEIVING sheet Detail-2026 (A–Y):
 * No, Bantek, Register (mis. "26 R"), PO/RO, Del. Date PO, Tanggal Barang Tiba, GR 103 + Tanggal,
 * GR 105 + Tanggal, Lead Time GR (103→105), Keterlambatan, Vendor, Perusahaan, Description, Qty,
 * Nilai Rp/US, Denda Rp/US, PR, Sandi Bagian, Fungsi, DT, Masa Simpan.
 *
 * Data: data/register/<tahun>.js (terenkripsi) + data/register/index.js (daftar tahun).
 * Export Excel memakai assets/terima/register-template.xlsx (header & gaya asli) — per bulan, per tahun, seluruh tahun.
 */
(function (root) {
  'use strict';
  var BLN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  // [kunci, label, tipe, kolom Excel]
  var FIELDS = [
    ['no', 'No.', 'num'], ['bantek', 'Bantek'], ['reg', 'Register'], ['po', 'PO / RO'], ['del', 'Del. Date PO', 'date'], ['tiba', 'Tanggal Barang Tiba', 'date'],
    ['gr103', 'GR 103'], ['tgl103', 'Tanggal GR 103', 'date'], ['gr105', 'GR 105'], ['tgl105', 'Tanggal GR 105', 'date'],
    ['lead', 'Lead Time GR (103-105) (Hari)', 'calc'], ['late', 'Keterlambatan (Hari)', 'calc'], ['vid', 'Vendor'], ['vendor', 'Perusahaan'], ['desc', 'Description'],
    ['qty', 'Qty. (Item)', 'num'], ['rp', 'Nilai Rp.', 'num'], ['us', 'Nilai US', 'num'], ['drp', 'Nilai Denda Rp.', 'num'], ['dus', 'Nilai Denda US', 'num'],
    ['pr', 'PR'], ['cc', 'Sandi Bagian (Cost Center)'], ['fungsi', 'Fungsi'], ['dt', 'DT (Hari)'], ['masa', 'Masa Simpan']
  ];
  var FUNGSI = ['STOCK', 'DIRECT CHARGE'];

  root.RegisterModule = function (ctx) {
    var S = ctx.S, esc = ctx.esc, toast = ctx.toast, loading = ctx.loading;
    var G = S.register = { index: null, years: {}, year: new Date().getFullYear(), month: '', q: '', form: null, tpl: null };

    function $(s) { return document.querySelector(s); }
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    function today() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    function isIso(s) { return /^\d{4}-\d\d-\d\d$/.test(String(s || '')); }
    function dot(s) { return isIso(s) ? s.slice(8, 10) + '.' + s.slice(5, 7) + '.' + s.slice(0, 4) : (s || ''); }
    function days(a, b) { var x = a.split('-'), y = b.split('-'); return Math.round((Date.UTC(+y[0], +y[1] - 1, +y[2]) - Date.UTC(+x[0], +x[1] - 1, +x[2])) / 864e5); }
    function num(v) { var n = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(/\./g, '').replace(',', '.')); return isFinite(n) ? n : null; }
    function idr(n) { return n == null || n === '' ? '' : new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(n); }
    function me() { return S.user ? S.user.name : ''; }
    // Warehouse & Receiving bisa membuat register; edit & hapus hanya Receiving / Owner / Co-Owner
    function canCreate() { return !!(S.user && (ctx.isOwner() || S.user.role === 'viewer' || S.user.role === 'receiving')); }
    function canEdit() { return !!(ctx.canReceiving && ctx.canReceiving()); }
    function canDelete() { return canEdit(); }
    function yy(y) { return String(y).slice(2); }
    function fmtTime(iso) { if (!iso) return ''; var d = new Date(iso); return pad(d.getDate()) + '-' + pad(d.getMonth() + 1) + '-' + d.getFullYear() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
    function regLabel(o) { return 'No. ' + (o.no != null ? o.no : '—') + ' · ' + (o.reg || ''); }

    // Lead time & keterlambatan otomatis bila kosong
    function lead(o) { return o.lead != null && o.lead !== '' ? o.lead : (isIso(o.tgl103) && isIso(o.tgl105) ? days(o.tgl103, o.tgl105) : ''); }
    function late(o) { return o.late != null && o.late !== '' ? o.late : (isIso(o.del) && isIso(o.tiba) ? Math.max(0, days(o.del, o.tiba)) : ''); }

    // ---------- data ----------
    async function loadIndex(force) {
      if (!G.index || force) G.index = (await ctx.pass().readJSON('data/register/index.js')) || { years: {} };
      return G.index;
    }
    async function loadYear(y, force) {
      if (!G.years[y] || force) { var d = await ctx.pass().readJSON('data/register/' + y + '.js'); G.years[y] = d ? d.list : []; }
      return G.years[y];
    }
    function years() {
      var ys = Object.keys((G.index || {}).years || {}).map(Number), cur = new Date().getFullYear();
      if (ys.indexOf(cur) < 0) ys.push(cur);
      return ys.sort(function (a, b) { return b - a; });
    }
    async function saveYear(y, mutate, msg) {
      var D = await ctx.pass().atomic('data/register/' + y + '.js', 'MW_REG', 'Register Receiving ' + y, function (cur) {
        cur = cur || { year: y, list: [] };
        return mutate(cur);
      }, msg);
      G.years[y] = D.list;
      if (!((G.index || {}).years || {})[y] || G.index.years[y] !== D.list.length) {
        G.index = await ctx.pass().atomic('data/register/index.js', 'MW_REG_INDEX', 'Register Receiving — daftar tahun', function (cur) {
          cur = cur || { years: {} }; cur.years[y] = D.list.length; return cur;
        }, 'Register receiving: indeks tahun ' + y);
      }
      return D.list;
    }
    function find(y, id) { return (G.years[y] || []).filter(function (o) { return o.id === id; })[0]; }
    function nextNo(list) { return list.reduce(function (a, o) { return Math.max(a, num(o.no) || 0); }, 0) + 1; }

    // BASTB/LHPB yang memakai register ini (dari modul Penerimaan Barang)
    function links() { return ctx.links ? ctx.links() : {}; }

    // ================= Form register (drawer) =================
    var lists = '<datalist id="regFungsi">' + FUNGSI.map(function (x) { return '<option value="' + x + '">'; }).join('') + '</datalist>' +
      '<datalist id="regMasa"><option value="10 TAHUN"><option value="5 TAHUN"></datalist>';
    function fld(k, label, o, v, opt) {
      opt = opt || {};
      var t = o === 'date' ? ' type="date"' : o === 'num' ? ' type="number" step="any"' : '';
      return '<label class="fleet-fld' + (opt.cls ? ' ' + opt.cls : '') + '"><span>' + esc(label) + (opt.req ? ' *' : '') + '</span><input class="input' + (opt.mono ? ' mono' : '') + '" data-rg="' + k + '"' + t +
        (opt.list ? ' list="' + opt.list + '"' : '') + ' value="' + esc(v == null ? '' : v) + '" placeholder="' + esc(opt.ph || '') + '"></label>';
    }
    function openForm(y, id, onSaved) {
      var cur = id ? find(y, id) : null, o = cur ? JSON.parse(JSON.stringify(cur)) : { tiba: today(), fungsi: 'STOCK', masa: '10 TAHUN' };
      G.form = { y: y, id: id || null, o: o, onSaved: onSaved || null };
      var d = $('#drawer');
      d.classList.add('open', 'wide'); d.setAttribute('aria-hidden', 'false'); $('#scrim').classList.add('open');
      drawForm();
    }
    async function drawForm() {
      var F = G.form, o = F.o, y = isIso(o.tiba) ? +o.tiba.slice(0, 4) : F.y;
      try { await loadYear(y); } catch (e) { /* tampilkan form saja */ }
      if (!F.id) { if (!o.noManual) o.no = nextNo(G.years[y] || []); if (!o.regManual) o.reg = yy(y) + ' R'; }
      var L = lead(o), T = late(o);
      $('#drawer').innerHTML = '<div class="drawer-head"><div style="flex:1"><div class="mono muted">Register Receiving ' + y + '</div><h2>' + (F.id ? 'Edit ' + esc(regLabel(o)) : 'Register baru') + '</h2></div><button class="icon-btn" data-act="close-drawer">✕</button></div>' +
        '<div class="drawer-body" id="regForm">' + lists +
        '<div class="reg-sec"><b>Identitas</b><div class="reg-grid">' + fld('no', 'No.', 'num', o.no, { mono: 1 }) + fld('bantek', 'Bantek', '', o.bantek, { mono: 1 }) + fld('reg', 'Register', '', o.reg, { mono: 1, ph: yy(y) + ' R' }) + '</div></div>' +
        '<div class="reg-sec"><b>PO &amp; tanggal</b><div class="reg-grid">' + fld('po', 'PO / RO', '', o.po, { mono: 1, req: 1 }) + fld('del', 'Del. Date PO', 'date', o.del, { req: 1 }) + fld('tiba', 'Tanggal Barang Tiba', 'date', o.tiba, { req: 1 }) +
        '<div class="fleet-fld"><span>Keterlambatan (Hari)</span><div class="rcv-auto" id="regLate">' + (T === '' ? '—' : T + ' hari') + ' <span class="small muted">(otomatis)</span></div></div></div></div>' +
        '<div class="reg-sec"><b>Goods Receipt</b><div class="reg-grid">' + fld('gr103', 'GR 103', '', o.gr103, { mono: 1 }) + fld('tgl103', 'Tanggal GR 103', 'date', o.tgl103) + fld('gr105', 'GR 105', '', o.gr105, { mono: 1 }) + fld('tgl105', 'Tanggal GR 105', 'date', o.tgl105) +
        '<div class="fleet-fld"><span>Lead Time GR 103→105</span><div class="rcv-auto" id="regLead">' + (L === '' ? '—' : L + ' hari') + ' <span class="small muted">(otomatis)</span></div></div></div></div>' +
        '<div class="reg-sec"><b>Vendor &amp; barang</b><div class="reg-grid">' + fld('vid', 'Vendor (ID)', '', o.vid, { mono: 1, ph: 'mis. 144821' }) + fld('vendor', 'Perusahaan', '', o.vendor, { cls: 'wide', req: 1 }) +
        fld('desc', 'Description', '', o.desc, { cls: 'full', req: 1, ph: 'mis. PEMENUHAN MATERIAL … REFF OA …' }) + fld('qty', 'Qty. (Item)', 'num', o.qty) + '</div></div>' +
        '<div class="reg-sec"><b>Nilai</b><div class="reg-grid">' + fld('rp', 'Nilai (Rp.)', 'num', o.rp) + fld('us', 'Nilai (US)', 'num', o.us) + fld('drp', 'Nilai Denda Keterlambatan (Rp.)', 'num', o.drp) + fld('dus', 'Nilai Denda Keterlambatan (US)', 'num', o.dus) + '</div></div>' +
        '<div class="reg-sec"><b>Lainnya</b><div class="reg-grid">' + fld('pr', 'PR', '', o.pr, { mono: 1 }) + fld('cc', 'Sandi Bagian (Cost Center)', '', o.cc) + fld('fungsi', 'Fungsi', '', o.fungsi, { list: 'regFungsi' }) +
        fld('dt', 'DT (Hari)', '', o.dt) + fld('masa', 'Masa Simpan', '', o.masa, { list: 'regMasa' }) + '</div></div>' +
        '<div class="toolbar" style="margin-top:6px"><button class="btn primary" data-rga="save">' + (F.id ? 'Simpan perubahan' : (F.onSaved ? 'Simpan &amp; pakai untuk BASTB/LHPB' : 'Simpan register')) + '</button><button class="btn" data-act="close-drawer">Batal</button></div></div>';
    }
    function syncForm() {
      var o = G.form.o;
      Array.prototype.forEach.call(document.querySelectorAll('#regForm [data-rg]'), function (el) {
        var k = el.getAttribute('data-rg'), v = el.value.trim();
        o[k] = el.type === 'number' ? (v === '' ? '' : +v) : v;
      });
    }
    function vendorName(vid) {
      if (!vid) return '';
      var hit = '';
      if (S.idx && S.idx.oaMap) S.idx.oaMap.forEach(function (h) { if (!hit && h.vendorCode === vid) hit = h.vendor; });
      if (hit) return hit;
      Object.keys(G.years).sort().reverse().some(function (y) { return (G.years[y] || []).some(function (o) { if (o.vid === vid && o.vendor) { hit = o.vendor; return true; } return false; }); });
      return hit;
    }
    async function saveForm() {
      syncForm();
      var F = G.form, o = F.o, miss = [];
      if (!o.po) miss.push('PO / RO'); if (!o.tiba) miss.push('Tanggal Barang Tiba'); if (!o.del) miss.push('Del. Date PO');
      if (!o.vendor) miss.push('Perusahaan'); if (!o.desc) miss.push('Description');
      if (miss.length) { toast('Lengkapi: ' + miss.join(', '), true); return; }
      ['lead', 'late'].forEach(function (k) { delete o[k]; }); // dihitung otomatis dari tanggal
      var y = +o.tiba.slice(0, 4), at = new Date().toISOString(), id = F.id || ('R' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)), dup = '';
      o = Object.keys(o).reduce(function (a, k) { if (o[k] !== '' && o[k] != null && k !== 'noManual' && k !== 'regManual') a[k] = o[k]; return a; }, {});
      loading('Menyimpan register…');
      try {
        if (F.id && F.y !== y) { // tahun berubah → pindah file
          await saveYear(F.y, function (D) { D.list = D.list.filter(function (x) { return x.id !== F.id; }); return D; }, 'Register receiving: pindah ' + regLabel(o) + ' ke ' + y + ' (' + me() + ')');
        }
        await saveYear(y, function (D) {
          if (!F.id || F.y !== y) { if (D.list.some(function (x) { return x.no === o.no && x.id !== id; })) { o.no = nextNo(D.list); dup = 'Nomor sudah dipakai — diganti ke No. ' + o.no; } }
          var rec = Object.assign({}, o, { id: id });
          if (F.id && F.y === y) {
            D.list = D.list.map(function (x) { return x.id === id ? Object.assign({ createdBy: x.createdBy, createdAt: x.createdAt, src: x.src }, rec, { updatedBy: me(), updatedAt: at }) : x; });
          } else D.list.push(Object.assign(rec, { createdBy: me(), createdAt: at }));
          return D;
        }, (F.id ? 'Register receiving: ubah ' : 'Register receiving: baru ') + regLabel(o) + ' (' + me() + ')');
        if (dup) toast(dup);
        var cb = F.onSaved, saved = find(y, id);
        G.form = null; ctx.closeDrawer();
        toast(F.id ? 'Register disimpan' : 'Register ' + regLabel(saved) + ' tersimpan');
        if (cb) cb(y, saved); else if (ctx.route() === 'terima-riwayat') { G.year = y; ctx.rerender(); }
      } catch (e) { toast('Gagal menyimpan register: ' + e.message, true); }
      finally { loading(false); }
    }
    async function remove(y, id) {
      var o = find(y, id); if (!o) return;
      var ln = links()[id];
      if (!confirm('Hapus register ' + regLabel(o) + ' (' + (o.vendor || '') + ')?' + (ln ? '\nRegister ini dipakai ' + ln.join(', ') + '.' : ''))) return;
      loading('Menghapus register…');
      try {
        await saveYear(y, function (D) { D.list = D.list.filter(function (x) { return x.id !== id; }); return D; }, 'Register receiving: hapus ' + regLabel(o) + ' ' + y + ' (' + me() + ')');
        toast('Register dihapus');
        if (ctx.audit) ctx.audit('Register Receiving', regLabel(o) + ' ' + y + ' · PO ' + (o.po || '') + ' · ' + (o.vendor || ''), o);
      } catch (e) { toast('Gagal menghapus: ' + e.message, true); }
      finally { loading(false); ctx.rerender(); }
    }

    // ================= Section Register di halaman Riwayat (atas) =================
    function filtered(list) {
      var q = G.q.trim().toLowerCase();
      return list.filter(function (o) {
        if (G.month && String(o.tiba || '').slice(5, 7) !== G.month) return false;
        if (q && [o.no, o.reg, o.po, o.gr103, o.gr105, o.vid, o.vendor, o.desc, o.pr, o.fungsi].join(' ').toLowerCase().indexOf(q) < 0) return false;
        return true;
      }).sort(function (a, b) { return (num(a.no) || 0) - (num(b.no) || 0); });
    }
    async function sectionHtml() {
      try { await loadIndex(); await loadYear(G.year); } catch (e) { return '<div class="card card-pad"><b>Register gagal dimuat</b><div class="small muted">' + esc(e.message) + '</div></div>'; }
      var all = G.years[G.year] || [], list = filtered(all), ln = links();
      var tot = list.reduce(function (a, o) { return a + (num(o.rp) || 0); }, 0), totUs = list.reduce(function (a, o) { return a + (num(o.us) || 0); }, 0);
      var nLate = list.filter(function (o) { return late(o) > 0; }).length, nNo = list.filter(function (o) { return o.src !== 'excel' && !ln[o.id]; }).length;
      var per = G.month ? BLN[+G.month - 1] + ' ' + G.year : 'Tahun ' + G.year;
      return '<div class="card reg-card" id="regSection"><div class="card-pad reg-head"><div><h3 class="reg-title">Register Receiving</h3><div class="small muted">Buku register barang masuk — diisi sebelum BASTB &amp; LHPB</div></div>' +
        '<div class="toolbar" style="margin-left:auto">' + (canCreate() ? '<button class="btn primary" data-rga="new">+ Register baru</button>' : '') + '</div></div>' +
        '<div class="card-pad toolbar reg-tools">' +
        '<select class="select" id="regYear">' + years().map(function (y) { return '<option' + (y === G.year ? ' selected' : '') + '>' + y + '</option>'; }).join('') + '</select>' +
        '<select class="select" id="regMonth"><option value="">Semua bulan</option>' + BLN.map(function (b, i) { var m = pad(i + 1); return '<option value="' + m + '"' + (G.month === m ? ' selected' : '') + '>' + b + '</option>'; }).join('') + '</select>' +
        '<input class="input" id="regQ" style="flex:1;min-width:200px" placeholder="Cari PO, GR, vendor, deskripsi, PR…" value="' + esc(G.q) + '">' +
        '<span class="reg-dl"><span class="small muted">Download Excel:</span>' +
        '<button class="btn sm" data-rga="xls-month"' + (G.month ? '' : ' disabled title="Pilih bulan dulu"') + '>Bulan</button>' +
        '<button class="btn sm" data-rga="xls-year">Tahun ' + G.year + '</button><button class="btn sm" data-rga="xls-all">Seluruh tahun</button></span></div>' +
        '<div class="card-pad kpis reg-kpis">' +
        kpi('Register ' + per, list.length, all.length !== list.length ? 'dari ' + all.length + ' di ' + G.year : '') + kpi('Nilai (Rp)', 'Rp ' + idr(tot), totUs ? 'US$ ' + idr(totUs) : '') +
        kpi('Terlambat', nLate, 'tiba > del. date PO') + kpi('Belum BASTB/LHPB', nNo, 'register input website tanpa dokumen') + '</div>' +
        (list.length ? '<div class="table-wrap reg-wrap"><table class="grid reg-table"><thead><tr>' +
          '<th>No.</th><th>Register</th><th>PO / RO</th><th>Del. Date PO</th><th>Tgl Barang Tiba</th><th>GR 103 / Tanggal</th><th>GR 105 / Tanggal</th><th class="num">Lead Time</th><th class="num">Telat</th>' +
          '<th>Vendor / Perusahaan</th><th>Description</th><th class="num">Qty</th><th class="num">Nilai (Rp)</th><th class="num">Denda (Rp)</th><th>PR</th><th>Cost Center</th><th>Fungsi</th><th>DT</th><th>Masa Simpan</th><th>BASTB / LHPB</th><th></th></tr></thead><tbody>' +
          list.map(function (o) { return rowHtml(o, ln); }).join('') +
          '</tbody><tfoot><tr><td colspan="12" class="num"><b>Total ' + esc(per) + '</b></td><td class="num"><b>' + idr(tot) + '</b>' + (totUs ? '<div class="small muted">US$ ' + idr(totUs) + '</div>' : '') + '</td><td colspan="8"></td></tr></tfoot></table></div>'
          : '<div class="empty" style="padding:24px"><h3>Belum ada register ' + esc(per) + '</h3>' + (canCreate() ? '<p><a href="#" data-rga="new">+ Buat register baru</a></p>' : '') + '</div>') + '</div>';
    }
    function kpi(k, v, s) { return '<div class="kpi"><div class="k">' + esc(k) + '</div><div class="v">' + esc(String(v)) + '</div><div class="s">' + esc(s || '') + '</div></div>'; }
    function rowHtml(o, ln) {
      var L = lead(o), T = late(o), docs = ln[o.id];
      var acts = (canEdit() ? '<button class="btn sm" data-rga="edit" data-id="' + esc(o.id) + '">Edit</button>' : '') +
        (!docs && canCreate() ? '<a class="btn sm primary" href="#/terima" data-rga="use" data-id="' + esc(o.id) + '">BASTB/LHPB</a>' : '') +
        (canDelete() ? '<button class="btn sm danger" data-rga="del" data-id="' + esc(o.id) + '">Hapus</button>' : '');
      return '<tr><td class="mono">' + esc(o.no != null ? o.no : '') + (o.bantek ? '<div class="small muted">B. ' + esc(o.bantek) + '</div>' : '') + '</td>' +
        '<td class="mono nowrap">' + esc(o.reg || '') + '</td><td class="mono">' + esc(o.po || '') + '</td><td class="nowrap">' + esc(dot(o.del)) + '</td><td class="nowrap">' + esc(dot(o.tiba)) + '</td>' +
        '<td class="mono">' + esc(o.gr103 || '') + '<div class="small muted">' + esc(dot(o.tgl103)) + '</div></td><td class="mono">' + esc(o.gr105 || '') + '<div class="small muted">' + esc(dot(o.tgl105)) + '</div></td>' +
        '<td class="num">' + (L === '' ? '' : L) + '</td><td class="num">' + (T > 0 ? '<span class="badge bad">' + T + '</span>' : T === '' ? '' : '0') + '</td>' +
        '<td class="reg-vendor"><span class="mono small muted">' + esc(o.vid || '') + '</span><div>' + esc(o.vendor || '') + '</div></td><td class="reg-desc"><div class="clamp2" title="' + esc(o.desc || '') + '">' + esc(o.desc || '') + '</div>' + (o.ket ? '<div class="small muted">' + esc(o.ket) + '</div>' : '') + '</td>' +
        '<td class="num">' + esc(o.qty != null ? o.qty : '') + '</td><td class="num">' + idr(o.rp) + (o.us ? '<div class="small muted">US$ ' + idr(o.us) + '</div>' : '') + '</td>' +
        '<td class="num">' + idr(o.drp) + (o.dus ? '<div class="small muted">US$ ' + idr(o.dus) + '</div>' : '') + '</td>' +
        '<td class="mono">' + esc(o.pr || '') + '</td><td>' + esc(o.cc || '') + '</td><td>' + esc(o.fungsi || '') + '</td><td>' + esc(o.dt || '') + '</td><td class="nowrap">' + esc(o.masa || '') + '</td>' +
        '<td>' + (docs ? docs.map(function (x) { return '<span class="badge ok mono">' + esc(x) + '</span>'; }).join(' ') : '<span class="small muted">—</span>') + '</td>' +
        '<td>' + (o.updatedBy ? '<div class="small muted nowrap" style="margin-bottom:4px">Last edit: ' + esc(o.updatedBy) + ' · ' + esc(fmtTime(o.updatedAt)) + '</div>' : '') + '<div class="fleet-acts">' + acts + '</div></td></tr>';
    }
    async function refreshSection() {
      var el = document.getElementById('regSection');
      if (!el) return;
      var html = await sectionHtml(), tmp = document.createElement('div'); tmp.innerHTML = html;
      var q = document.activeElement && document.activeElement.id === 'regQ';
      el.replaceWith(tmp.firstChild);
      if (q) { var qi = document.getElementById('regQ'); qi.focus(); qi.setSelectionRange(qi.value.length, qi.value.length); }
    }

    // ================= Pemilih register di form Penerimaan Barang =================
    // Register tahun ini & tahun lalu yang belum dipakai BASTB/LHPB
    async function candidates() {
      var cur = new Date().getFullYear(), out = [];
      await loadIndex();
      for (var y = cur; y >= cur - 1; y--) {
        try { await loadYear(y); } catch (e) { continue; }
        (G.years[y] || []).forEach(function (o) { out.push({ y: y, o: o }); });
      }
      var ln = links();
      return out.filter(function (x) { return !ln[x.o.id]; }).sort(function (a, b) { return b.y - a.y || (num(b.o.no) || 0) - (num(a.o.no) || 0); });
    }
    async function pickerHtml(q) {
      var list = await candidates();
      q = String(q || '').trim().toLowerCase();
      if (q) list = list.filter(function (x) { var o = x.o; return [o.no, o.reg, o.po, o.vendor, o.desc, o.gr105].join(' ').toLowerCase().indexOf(q) >= 0; });
      return list.length ? '<div class="table-wrap reg-pick"><table class="grid"><thead><tr><th>Register</th><th>PO / RO</th><th>Tgl Tiba</th><th>Perusahaan</th><th>Description</th><th class="num">Nilai (Rp)</th><th></th></tr></thead><tbody>' +
        list.slice(0, 60).map(function (x) {
          var o = x.o;
          return '<tr><td class="mono nowrap"><b>' + esc(regLabel(o)) + '</b><div class="small muted">' + x.y + '</div></td><td class="mono">' + esc(o.po || '') + '</td><td class="nowrap">' + esc(dot(o.tiba)) + '</td><td>' + esc(o.vendor || '') + '</td>' +
            '<td class="reg-desc">' + esc(o.desc || '') + '</td><td class="num">' + idr(o.rp) + '</td><td><button class="btn sm primary" data-rga="pick" data-y="' + x.y + '" data-id="' + esc(o.id) + '">Pilih</button></td></tr>';
        }).join('') + '</tbody></table></div>'
        : '<div class="muted small" style="padding:10px 2px">Tidak ada register yang belum dipakai' + (q ? ' untuk "' + esc(q) + '"' : '') + '. Buat register baru dulu.</div>';
    }
    function get(y, id) { return find(y, id); }

    // ================= Export Excel (format asli REGISTER_RECEIVING) =================
    async function template() {
      if (G.tpl) return G.tpl;
      var ExcelJS = await ctx.loadExcelJS(), wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await (await fetch('assets/terima/register-template.xlsx')).arrayBuffer());
      G.tpl = wb.getWorksheet('Template');
      return G.tpl;
    }
    function copyRow(T, ws, from, to, maxC) {
      var tr = T.getRow(from), r = ws.getRow(to);
      if (tr.height) r.height = tr.height;
      for (var c = 1; c <= maxC; c++) r.getCell(c).style = JSON.parse(JSON.stringify(tr.getCell(c).style || {}));
      return r;
    }
    function dateVal(s) { if (!isIso(s)) return s || ''; var p = s.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); }
    async function buildSheet(wb, T, y, rows, title, sheetName) {
      var NC = 25, ws = wb.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: 5 }],
        pageSetup: { paperSize: 8, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '3:5', margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } } });
      for (var c = 1; c <= NC; c++) { var w = T.getColumn(c).width; if (w) ws.getColumn(c).width = w; }
      for (var r = 1; r <= 5; r++) {
        var row = copyRow(T, ws, r, r, NC);
        for (var c2 = 1; c2 <= NC; c2++) { var v = T.getRow(r).getCell(c2).value; if (v != null) row.getCell(c2).value = v; }
      }
      (T.model.merges || []).forEach(function (m) { var rr = +/\d+/.exec(m.split(':')[0])[0]; if (rr <= 5) ws.mergeCells(m); });
      ws.getCell('A1').value = title;
      rows.forEach(function (o, i) {
        var rn = 6 + i, row = copyRow(T, ws, 6, rn, NC), L = lead(o), Lt = late(o);
        var vals = [o.no, o.bantek, o.reg, o.po, dateVal(o.del), dateVal(o.tiba), o.gr103, dateVal(o.tgl103), o.gr105, dateVal(o.tgl105), L, Lt, o.vid, o.vendor, o.desc, o.qty,
          num(o.rp), num(o.us), num(o.drp), num(o.dus), o.pr, o.cc, o.fungsi, o.dt, o.masa];
        vals.forEach(function (v, j) {
          var cell = row.getCell(j + 1);
          cell.value = v === '' || v == null ? null : v;
          if (v instanceof Date) cell.numFmt = 'dd.mm.yyyy';
        });
      });
      var end = 6 + rows.length, t1 = copyRow(T, ws, 7, end + 1, NC), t2 = copyRow(T, ws, 8, end + 2, NC);
      var sum = function (k) { return rows.reduce(function (a, o) { return a + (num(o[k]) || 0); }, 0); };
      t1.getCell(15).value = 'Total  ' + title.replace(/^Data\s+/, '') + '=';
      t1.getCell(17).value = rows.length ? { formula: 'SUM(Q6:Q' + (end - 1) + ')', result: sum('rp') } : 0;
      t1.getCell(18).value = rows.length ? { formula: 'SUM(R6:R' + (end - 1) + ')', result: sum('us') } : 0;
      t2.getCell(17).value = '( Rupiah )'; t2.getCell(18).value = '( US Dollar)';
      ws.pageSetup.printArea = 'A1:Y' + (end + 2);
      return ws;
    }
    async function exportXlsx(kind) {
      loading('Membuat Excel register…');
      try {
        var ExcelJS = await ctx.loadExcelJS(), T = await template(), wb = new ExcelJS.Workbook();
        await loadIndex();
        var ys = kind === 'all' ? years().slice().sort() : [G.year], name;
        for (var i = 0; i < ys.length; i++) {
          var y = ys[i], list = (await loadYear(y)).slice().sort(function (a, b) { return (num(a.no) || 0) - (num(b.no) || 0); });
          if (kind === 'month') {
            list = list.filter(function (o) { return String(o.tiba || '').slice(5, 7) === G.month && String(o.tiba).slice(0, 4) === String(y); });
            await buildSheet(wb, T, y, list, 'Data Bulan ' + BLN[+G.month - 1] + ' ' + y, 'Detail-' + y + '-' + G.month);
          } else if (list.length || kind !== 'all') await buildSheet(wb, T, y, list, 'Data Tahun ' + y, 'Detail-' + y);
        }
        name = kind === 'month' ? 'REGISTER_RECEIVING_' + y + '-' + G.month : kind === 'year' ? 'REGISTER_RECEIVING_' + G.year : 'REGISTER_RECEIVING_SEMUA_TAHUN';
        if (kind === 'all') wb.views = [{ x: 0, y: 0, width: 20000, height: 12000, firstSheet: 0, activeTab: wb.worksheets.length - 1, visibility: 'visible' }];
        var buf = await wb.xlsx.writeBuffer(), url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
        var a = document.createElement('a'); a.href = url; a.download = name + '.xlsx'; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      } catch (e) { toast('Gagal membuat Excel: ' + e.message, true); }
      finally { loading(false); }
    }

    // ---------- Event ----------
    document.addEventListener('click', function (e) {
      var a = e.target.closest('[data-rga]');
      if (!a) return;
      var act = a.getAttribute('data-rga'), id = a.getAttribute('data-id');
      if (act !== 'use') e.preventDefault();
      if (act === 'new') { if (ctx.route() === 'terima' && ctx.onPick) openForm(G.year, null, ctx.onPick); else openForm(G.year, null); }
      else if (act === 'edit' && canEdit()) openForm(G.year, id, ctx.route() === 'terima' && ctx.onPick ? ctx.onPick : null);
      else if (act === 'save') saveForm();
      else if (act === 'del' && canDelete()) remove(G.year, id);
      else if (act === 'use') { if (ctx.onPick) ctx.onPick(G.year, find(G.year, id), true); }
      else if (act === 'pick') { var y = +a.getAttribute('data-y'); if (ctx.onPick) ctx.onPick(y, find(y, id)); }
      else if (act === 'xls-month') { if (G.month) exportXlsx('month'); }
      else if (act === 'xls-year') exportXlsx('year');
      else if (act === 'xls-all') exportXlsx('all');
    });
    document.addEventListener('change', function (e) {
      var t = e.target;
      if (t.id === 'regYear') { G.year = +t.value; G.month = ''; refreshSection(); }
      else if (t.id === 'regMonth') { G.month = t.value; refreshSection(); }
    });
    var qTimer;
    document.addEventListener('input', function (e) {
      var t = e.target;
      if (t.id === 'regQ') { G.q = t.value; clearTimeout(qTimer); qTimer = setTimeout(refreshSection, 250); }
      else if (t.closest && t.closest('#regForm') && G.form) {
        syncForm();
        var o = G.form.o, k = t.getAttribute('data-rg');
        if (k === 'no') o.noManual = true; if (k === 'reg') o.regManual = true;
        if (k === 'vid' && !o.vendor) { var vn = vendorName(o.vid); if (vn) { o.vendor = vn; var ve = document.querySelector('#regForm [data-rg="vendor"]'); if (ve) ve.value = vn; } }
        var L = lead(o), T = late(o), l1 = document.getElementById('regLead'), l2 = document.getElementById('regLate');
        if (l1) l1.innerHTML = (L === '' ? '—' : L + ' hari') + ' <span class="small muted">(otomatis)</span>';
        if (l2) l2.innerHTML = (T === '' ? '—' : T + ' hari') + ' <span class="small muted">(otomatis)</span>';
        if (k === 'tiba' && !G.form.id && isIso(o.tiba)) { var ny = +o.tiba.slice(0, 4); if (ny !== G.form.y) { G.form.y = ny; drawForm(); } }
      }
    });

    function reset() { G.index = null; G.years = {}; G.tpl = null; }
    return { sectionHtml: sectionHtml, refreshSection: refreshSection, pickerHtml: pickerHtml, get: get, loadYear: loadYear, loadIndex: loadIndex,
      regLabel: regLabel, late: late, lead: lead, openForm: openForm, reset: reset, years: years, dot: dot };
  };
})(this);
