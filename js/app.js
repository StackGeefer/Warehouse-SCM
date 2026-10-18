/*
 * Call Order Rantau — aplikasi utama (tampilan & interaksi)
 */
(function () {
  'use strict';

  // ================= Utilitas =================
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  var nf0 = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
  var nf2 = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });
  function fmtQ(n) { if (n == null) return '—'; return Math.abs(n % 1) > 0 ? nf2.format(n) : nf0.format(n); }
  function fmtMoney(n, cur) {
    if (n == null || isNaN(n)) return '—';
    if (cur && cur !== 'IDR') return cur + ' ' + nf2.format(n);
    return 'Rp ' + nf0.format(n);
  }
  function fmtBig(n, cur) {
    if (n == null) return '—';
    var p = cur && cur !== 'IDR' ? cur + ' ' : 'Rp ';
    var a = Math.abs(n);
    if (a >= 1e12) return p + nf2.format(n / 1e12) + ' T';
    if (a >= 1e9) return p + nf2.format(n / 1e9) + ' M';
    if (a >= 1e6) return p + nf2.format(n / 1e6) + ' jt';
    return p + nf2.format(n);
  }
  var BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  var BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  function fmtDate(s) { if (!s) return '—'; var p = s.split('-'); return p[2] + ' ' + BLN[+p[1] - 1] + ' ' + p[0]; }
  function ddmm(s) { return s ? s.slice(8, 10) + '.' + s.slice(5, 7) : '-'; }
  function daysLeft(s) { if (!s) return null; return Math.round((new Date(s + 'T00:00:00') - new Date(S.idx.today + 'T00:00:00')) / 86400000); }
  function numVal(v) { var n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? null : n; }

  var ICON = {
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg>',
    excel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M9 13l4 5M13 13l-4 5"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
    box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/></svg>',
    doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5h10M9 12h10M9 19h10"/><path d="m3 5 1.5 1.5L7 4M3 12l1.5 1.5L7 11M3 19l1.5 1.5L7 18"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'
  };

  // Repo GitHub tempat data website disimpan (bisa diganti di Pengaturan)
  var APP_VERSION = '20261018b'; // samakan dengan ?v= di index.html setiap rilis
  var DEFAULT_REPO = 'StackGeefer/Warehouse-SCM';
  var GH_BRANCH = 'main';
  var RECENT_MS = 15 * 60 * 1000;

  // ================= State =================
  var S = {
    ds: { stock: null, oa: null, mb51: null },
    idx: null,
    settings: (function () {
      var st = Store.load('settings', null);
      return st && st.v === Model.DEFAULT_SETTINGS.v ? st : clone(Model.DEFAULT_SETTINGS);
    })(),
    cart: Store.load('cart', { items: {}, meta: {}, groupTitles: {} }),
    q: '', filters: { home: false, zone: false, oa: false, used: false }, limit: 60,
    oaF: { q: '', active: true, pg: '', sort: 'rel' },
    oaD: { q: '', used: false, zero: false },
    drawerAll: false,
    lastLog: '',
    user: null, key: null, users: [], man: null, pending: null
  };
  S.cart.items = S.cart.items || {};
  S.cart.meta = S.cart.meta || {};
  S.cart.groupTitles = S.cart.groupTitles || {};

  var view = $('#view');

  function homeName() { return S.idx && S.idx.home ? S.idx.home.name : 'Home'; }
  function fields() { return S.settings.fields; }
  // Kolom utama (Rantau + 3 field Zona 1); simpan index asli untuk o.fs
  function mainFields() {
    return fields().map(function (f, i) { return { f: f, i: i }; }).filter(function (x) { return x.f.main || x.f.home; });
  }
  function fieldLabel(f) { return (f.full || f.name); }
  function hasData() { return !!(S.idx && S.idx.list.length); }

  // ================= Toast & loading =================
  function toast(msg, bad) {
    var t = document.createElement('div');
    t.className = 'toast' + (bad ? ' bad' : '');
    t.textContent = msg;
    var box = $('#toasts');
    while (box.children.length >= 2) box.firstChild.remove();
    box.appendChild(t);
    setTimeout(function () { t.remove(); }, bad ? 6000 : 2600);
  }
  function loading(msg) {
    if (msg === false) { $('#loading').classList.add('hidden'); return; }
    $('#loadingText').textContent = msg;
    $('#loading').classList.remove('hidden');
  }

  // ================= Keranjang (Call Order) =================
  function item(m, create) {
    var it = S.cart.items[m];
    if (!it && create) {
      it = S.cart.items[m] = { m: m, t: Date.now(), ro: { on: false, oa: null, qty: null, actual: null, note: '' }, bau: { on: false, alloc: {}, note: '' } };
    }
    return it;
  }
  function active(it) { return it && (it.ro.on || it.bau.on); }
  function saveCart() { Store.save('cart', S.cart); updateCartUI(); }
  function lineOf(o, key) {
    if (!o || !key) return null;
    for (var i = 0; i < o.oa.length; i++) if (o.oa[i].key === key) return o.oa[i];
    return null;
  }
  function setRO(m, on, key) {
    var it = item(m, true), o = S.idx.mats.get(m);
    it.ro.on = on;
    if (on) {
      if (key) it.ro.oa = key;
      if (!lineOf(o, it.ro.oa)) it.ro.oa = o && (o.bestOA || o.oa[0]) ? (o.bestOA || o.oa[0]).key : null;
    }
    saveCart();
  }
  function setBAU(m, on) {
    var it = item(m, true);
    it.bau.on = on;
    saveCart();
  }
  function cartStats() {
    var ro = 0, bau = 0;
    Object.keys(S.cart.items).forEach(function (k) {
      var it = S.cart.items[k];
      if (!S.idx || !S.idx.mats.has(k)) return;
      if (it.ro.on) ro++;
      if (it.bau.on) bau++;
    });
    var n = Object.keys(S.cart.items).filter(function (k) { return active(S.cart.items[k]) && S.idx && S.idx.mats.has(k); }).length;
    return { n: n, ro: ro, bau: bau };
  }
  function updateCartUI() {
    var st = cartStats();
    var nc = $('#navCount');
    nc.textContent = st.n;
    nc.classList.toggle('hidden', !st.n);
    var bar = $('#cartbar');
    var route = currentRoute().name;
    if (!st.n || route === 'call-order' || route === 'data' || route === 'pengaturan') { bar.classList.add('hidden'); return; }
    bar.classList.remove('hidden');
    bar.innerHTML = '<span><b>' + st.n + '</b> material dipilih</span>' +
      '<span class="badge ro">RO ' + st.ro + '</span><span class="badge bau">BAU ' + st.bau + '</span>' +
      '<a class="btn primary sm" href="#/call-order">Buka Call Order ' + ICON.arrow + '</a>';
  }

  // Catatan otomatis seperti template: "Stok alternatif Zona 1: Jambi (W802) 83"
  function autoNote(o) {
    var parts = [], others = [];
    fields().forEach(function (f) {
      if (f.home) return;
      f.plants.forEach(function (p) {
        if (o.st[p] > 0) (f.main ? parts : others).push(fieldLabel(f) + ' (' + p + ') ' + fmtQ(o.st[p]));
      });
    });
    var txt = parts.length ? 'Stok alternatif Zona 1: ' + parts.join(', ') : '';
    if (!parts.length && others.length) txt = 'Stok di field lain: ' + others.slice(0, 4).join(', ') + (others.length > 4 ? ', …' : '');
    return txt;
  }
  function suggestion(o) {
    var c = +S.settings.coverMonths || 3;
    return Math.max(0, Math.ceil(o.avg12 * c - o.homeStock));
  }

  // ================= Komponen kecil =================
  function qtyPill(v, home, title) {
    if (v == null) return '<span class="qty na" title="' + esc(title || 'Data plant belum diupload') + '">—</span>';
    return '<span class="qty ' + (v > 0 ? 'pos' : 'zero') + (home ? ' home' : '') + '" title="' + esc(title || '') + '">' + fmtQ(v) + '</span>';
  }
  function fieldTitle(o, f) {
    return f.plants.map(function (p) {
      if (o.st[p] != null) return p + ': ' + fmtQ(o.st[p]);
      return p + ': ' + (S.idx.plantDates[p] ? '0' : 'data plant belum diupload');
    }).join(' · ');
  }
  function spark(arr) {
    if (!arr || !arr.length) return '';
    var max = Math.max.apply(null, arr.concat([0]));
    if (max <= 0) return '<svg class="spark" width="84" height="16"><line x1="0" y1="15.5" x2="84" y2="15.5" stroke="#e2e8f0"/></svg>';
    var w = 84 / arr.length;
    var bars = arr.map(function (v, i) {
      var h = v > 0 ? Math.max(2, (v / max) * 15) : 0;
      return '<rect x="' + (i * w + 0.5).toFixed(1) + '" y="' + (16 - h).toFixed(1) + '" width="' + (w - 1.5).toFixed(1) + '" height="' + h.toFixed(1) + '" rx="1" fill="' + (i === arr.length - 1 ? '#0a5cc2' : '#93b9ec') + '"/>';
    }).join('');
    return '<svg class="spark" width="84" height="16" aria-hidden="true">' + bars + '</svg>';
  }
  function pick(kind, m, checked, disabled, title, extra) {
    return '<label class="pick ' + kind + '" title="' + esc(title || '') + '"><input type="checkbox" data-pick="' + kind + '" data-m="' + esc(m) + '"' +
      (extra || '') + (checked ? ' checked' : '') + (disabled ? ' disabled' : '') + '><span>' + kind.toUpperCase() + '</span></label>';
  }
  // Pedoman Pengelolaan Logistik SHU A7-009/PHE52000/2023-S9
  var AGING = {
    FM: ['Fast Moving', 'ok', 'Dipakai minimal 1 kali dalam 1 tahun terakhir'],
    MM: ['Moderate Moving', 'ro', 'Tidak dipakai 1 tahun terakhir; maks. 1 kali dalam 2 tahun'],
    SM: ['Slow Moving', 'warn', 'Tidak dipakai 2 tahun terakhir; maks. 1 kali dalam 5 tahun'],
    DS: ['Dead Stock', 'bad', 'Lebih dari 5 tahun tidak ada pemakaian']
  };
  function agingBadge(o) {
    if (!o.aging || !(o.homeStock > 0 || o.hist > 0 || o.ytd > 0)) return '';
    var a = AGING[o.aging];
    var last = o.lastUse ? 'Terakhir dipakai ' + BLN[+o.lastUse.slice(5, 7) - 1] + ' ' + o.lastUse.slice(0, 4) : 'Tidak ada pemakaian sejak ' + fmtDate(S.ds.mb51 && S.ds.mb51.min);
    return '<span class="badge ' + a[1] + ' aging" title="' + esc(a[0] + ': ' + a[2] + '. ' + last + ' (' + homeName() + '). Acuan: Pedoman Pengelolaan Logistik SHU A7-009/PHE52000/2023-S9') + '">' + a[0] + '</span>';
  }
  function priceCell(o) {
    var chips = o.oa.length ? '<div style="margin-top:4px">' + oaChips(o) + '</div>' : '';
    if (o.bestOA) return '<div class="price">' + fmtMoney(o.bestOA.price, o.bestOA.cur) + '</div>' + chips;
    if (o.oa.length) return '<div class="price muted">' + fmtMoney(o.oa[0].price, o.oa[0].cur) + '</div><div class="price-sub">OA sudah berakhir</div>' + chips;
    if (o.map) return '<div class="price">' + fmtMoney(o.map) + '</div><div class="price-sub">Harga rata-rata stok · tanpa OA</div>';
    return '<span class="muted">—</span><div class="price-sub">Tanpa OA</div>';
  }
  function oaChips(o, max) {
    max = max || 1;
    if (!o.oa.length) return '<span class="muted small">Tidak ada</span>';
    var seen = {}, out = [];
    o.oa.forEach(function (l) {
      if (seen[l.po]) return; seen[l.po] = 1;
      out.push('<a class="oa-chip' + (l.active ? '' : ' exp') + '" href="#/kontrak/' + esc(l.po) + '" title="' +
        esc(l.vendor + ' · ' + fmtMoney(l.price, l.cur) + ' · berlaku s/d ' + fmtDate(l.ve) + (l.active ? '' : ' (berakhir)')) + '">' + esc(l.po) + '</a>');
    });
    var more = out.length > max ? '<span class="muted small">+' + (out.length - max) + '</span>' : '';
    return '<div class="oa-chips">' + out.slice(0, max).join('') + more + '</div>';
  }
  function useCell(o) {
    return '<div class="use-cell"><b>' + fmtQ(o.hist) + '</b> <span class="muted small">' + S.idx.histYear + '</span> · <b>' +
      fmtQ(o.ytd) + '</b> <span class="muted small">' + S.idx.dataYear + '</span></div>' + spark(o.spark);
  }
  function emptyData() {
    if (!isOwner()) return '<div class="card empty"><div class="ico">' + ICON.upload + '</div><h3>Belum ada data SAP</h3><p>Owner belum meng-upload data SAP. Silakan hubungi Owner.</p></div>';
    return '<div class="card empty"><div class="ico">' + ICON.upload + '</div><h3>Belum ada data SAP</h3>' +
      '<p>Upload file export SAP (MB52/ZMB52 untuk stok, ME3N untuk kontrak, MB51 untuk pemakaian) di halaman Data. ' +
      'Data disimpan terenkripsi dan hanya bisa dibuka setelah login.</p><a class="btn primary" href="#/data">' + ICON.upload + ' Upload Data SAP</a></div>';
  }

  // ================= Routing =================
  function currentRoute() {
    var h = location.hash.replace(/^#\/?/, '') || 'cari';
    var parts = h.split('/');
    return { name: parts[0], arg: decodeURIComponent(parts[1] || '') };
  }
  var TITLES = {
    cari: ['Cari Material', 'Cari dengan KIMAP atau deskripsi, cek stok Zona 1, harga & kontrak sekaligus'],
    kontrak: ['Kontrak (OA / RO)', 'Daftar Outline Agreement dari ME3N — klik untuk melihat semua material yang bisa ditarik'],
    'call-order': ['Call Order ke MIM', 'Atur material RO & BAU, lalu export ke template Excel'],
    data: ['Data SAP', 'Versi data yang dipakai website · Owner dapat upload/update langsung di sini'],
    pengaturan: ['Pengaturan', 'Akun, pengguna, koneksi GitHub, Field & kode plant'],
    riwayat: ['Riwayat Order ke MIM', 'Semua Call Order yang sudah di-export, lengkap dengan tanggal & status'],
    tko: ['TKO & Referensi Warehouse', 'Tata Kerja, Pedoman & SOP — preview langsung atau download PDF']
  };
  function render() {
    if (!S.user) return;
    var r = currentRoute();
    if (!TITLES[r.name]) r.name = 'cari';
    $$('#nav a').forEach(function (a) { a.classList.toggle('active', a.getAttribute('data-route') === r.name); });
    var t = TITLES[r.name];
    $('#pageTitle').textContent = t[0];
    $('#pageSub').textContent = t[1];
    $('#pageActions').innerHTML = '';
    closeDrawer();
    if (r.name === 'cari') renderSearch();
    else if (r.name === 'kontrak') { if (r.arg) renderOADetail(r.arg); else renderOAList(); }
    else if (r.name === 'call-order') renderCO();
    else if (r.name === 'data') renderData();
    else if (r.name === 'pengaturan') renderSettings();
    else if (r.name === 'riwayat') renderOrders();
    else if (r.name === 'tko') renderDocs();
    updateCartUI();
    renderSide();
  }

  function renderSide() {
    var ds = S.ds, out = [];
    var hp = S.idx ? S.idx.homePlants : [];
    var homeDate = S.idx && S.idx.homeDate;
    var nPlants = ds.stock ? Object.keys(ds.stock.plants).length : 0;
    out.push('<div class="lbl">Status Data</div>');
    out.push('<div class="row"><span><i class="dot ' + (nPlants ? 'on' : '') + '"></i>Stok MB52</span><b>' + (nPlants ? (homeDate ? ddmm(homeDate) + ' · ' : '') + nPlants + ' plant' : '—') + '</b></div>');
    out.push('<div class="row"><span><i class="dot ' + (ds.oa ? 'on' : '') + '"></i>Kontrak ME3N</span><b>' + (ds.oa ? ddmm(ds.oa.date) : '—') + '</b></div>');
    out.push('<div class="row"><span><i class="dot ' + (ds.mb51 ? 'on' : '') + '"></i>Pemakaian MB51</span><b>' + (ds.mb51 ? 's/d ' + BLN[+ds.mb51.max.slice(5, 7) - 1] + ' ' + ds.mb51.max.slice(2, 4) : '—') + '</b></div>');
    if (hp.length) out.push('<div class="small">Home: Field ' + esc(homeName()) + ' (' + esc(hp.join('/')) + ')</div>');
    if (S.pending && isOwner()) out.push('<a class="side-warn" href="#/data">● ' + pendingCount() + ' perubahan belum dipublikasikan</a>');
    if (S.user) out.push('<div class="side-user"><div class="avatar">' + esc(S.user.name.charAt(0).toUpperCase()) + '</div><div style="min-width:0"><b>' + esc(S.user.name) + '</b><div class="small">' + (isOwner() ? 'Owner' : 'Viewer') + '</div></div>' +
      '<button class="icon-btn" data-act="logout" title="Keluar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4"/></svg></button></div>');
    $('#sideData').innerHTML = out.join('');
  }

  // ================= Halaman: Cari Material =================
  function renderSearch() {
    if (!hasData()) { view.innerHTML = emptyData(); return; }
    var f = S.filters;
    function chip(k, label) { return '<span class="chip-toggle' + (f[k] ? ' on' : '') + '" data-filter="' + k + '">' + esc(label) + '</span>'; }
    view.innerHTML =
      '<div class="search-hero">' +
      '<div class="searchbox">' + ICON.search + '<input id="q" autocomplete="off" spellcheck="false" placeholder="Cari KIMAP atau deskripsi — contoh: flange 3&quot; 150" value="' + esc(S.q) + '"><span class="kbd">/</span></div>' +
      '<div class="chips">' + chip('home', 'Ada stok ' + homeName()) + chip('zone', 'Ada stok Field lain (BAU)') + chip('oa', 'Ada kontrak aktif') + chip('used', 'Pernah dipakai ' + homeName()) +
      '<select class="select sm" id="agingSel" title="Klasifikasi aging — Pedoman Pengelolaan Logistik SHU A7-009"><option value="">Semua aging</option>' +
      Object.keys(AGING).map(function (k) { return '<option value="' + k + '"' + (S.aging === k ? ' selected' : '') + '>' + AGING[k][0] + '</option>'; }).join('') + '</select>' +
      '<span class="examples">Contoh: <a href="#" data-ex="flange 3&quot; 150">flange 3" 150</a><a href="#" data-ex="gate valve 2&quot; 600">gate valve 2" 600</a><a href="#" data-ex="stud bolt 5/8">stud bolt 5/8</a></span>' +
      '<span class="spacer"></span><span class="result-meta" id="resMeta"></span></div></div>' +
      '<div id="results"></div>';
    renderResults();
    var q = $('#q');
    if (!('ontouchstart' in window)) q.focus();
    q.setSelectionRange(q.value.length, q.value.length);
  }

  var searchTimer;
  function computeResults() {
    var pq = Search.parseQuery(S.q), f = S.filters, res = [], fuzzy = false;
    var hasQ = !!pq.raw;
    function pass(o) {
      if (f.home && !(o.homeStock > 0)) return false;
      if (f.zone && !(o.zoneStock > 0)) return false;
      if (f.oa && !o.bestOA) return false;
      if (f.used && !(o.hist > 0 || o.ytd > 0)) return false;
      if (S.aging && (o.aging !== S.aging || !(o.homeStock > 0 || o.hist > 0 || o.ytd > 0))) return false;
      return true;
    }
    var list = S.idx.list;
    // perluasan sinonim: kcl -> potassium chloride, majun -> cotton waste, ...
    var ex = hasQ && !pq.codeLike ? Search.expand(S.q) : { alts: [], labels: [] };
    var apqs = ex.alts.map(Search.parseQuery), viaSyn = 0;
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (!pass(o)) continue;
      if (!hasQ) { res.push({ o: o, s: 0 }); continue; }
      var r = Search.score(pq, o.ix), best = r.missed === 0 && r.s > 0 ? r.s : 0, syn = false;
      for (var a = 0; a < apqs.length; a++) {
        var ra = Search.score(apqs[a], o.ix);
        if (ra.missed === 0 && ra.s > 0 && ra.s * 0.95 > best) { best = ra.s * 0.95; syn = !(r.missed === 0 && r.s > 0); }
      }
      if (best > 0) { res.push({ o: o, s: best, syn: syn }); if (syn) viaSyn++; }
    }
    if (hasQ && !res.length && pq.hard.length > 1) {
      fuzzy = true;
      for (var j = 0; j < list.length; j++) {
        var o2 = list[j];
        if (!pass(o2)) continue;
        var r2 = Search.score(pq, o2.ix);
        if (r2.missed === 1 && r2.s > 0) res.push({ o: o2, s: r2.s });
      }
    }
    if (hasQ) {
      res.sort(function (a, b) {
        return b.s - a.s || (b.o.homeStock > 0) - (a.o.homeStock > 0) || (!!b.o.bestOA) - (!!a.o.bestOA) ||
          (b.o.hist + b.o.ytd) - (a.o.hist + a.o.ytd) || a.o.d.localeCompare(b.o.d);
      });
    } else {
      res.sort(function (a, b) { return (b.o.hist + b.o.ytd) - (a.o.hist + a.o.ytd) || b.o.homeStock - a.o.homeStock; });
    }
    return { res: res, fuzzy: fuzzy, pq: pq, hasQ: hasQ, syn: ex.labels, viaSyn: viaSyn };
  }

  function renderResults() {
    var box = $('#results');
    if (!box) return;
    var R = computeResults(), idx = S.idx;
    var meta = $('#resMeta');
    var banner = '';
    if (R.pq.codeLike && idx.oaMap.has(R.pq.raw)) {
      var h = idx.oaMap.get(R.pq.raw);
      banner = '<div class="card card-pad" style="margin-bottom:12px;display:flex;align-items:center;gap:12px">' + ICON.doc.replace('<svg', '<svg width="22" height="22"') +
        '<div><b>' + esc(h.po) + '</b> adalah nomor kontrak (OA) — ' + esc(h.vendor) + '</div><span class="spacer"></span><a class="btn primary sm" href="#/kontrak/' + esc(h.po) + '">Buka kontrak ' + ICON.arrow + '</a></div>';
    }
    if (meta) {
      meta.innerHTML = R.hasQ ? '<b>' + nf0.format(R.res.length) + '</b> material' + (R.fuzzy ? ' (hasil mirip — 1 kata kunci tidak cocok)' : '') +
        (R.syn.length ? '<div class="syn-line">Termasuk sinonim: ' + R.syn.slice(0, 6).map(function (x) { return '<span class="syn-chip">' + esc(x) + '</span>'; }).join('') + (R.viaSyn ? ' <span class="muted">(' + R.viaSyn + ' hasil dari sinonim)</span>' : '') + '</div>' : '')
        : '<b>' + nf0.format(R.res.length) + '</b> material · tanpa kata kunci: urut berdasarkan pemakaian ' + esc(homeName()) + ' terbanyak';
    }
    if (!R.res.length) {
      box.innerHTML = banner + '<div class="card empty"><div class="ico">' + ICON.search + '</div><h3>Material tidak ditemukan</h3><p>Coba kata kunci lain, misalnya hanya jenis material + ukuran (contoh: <b>valve 2</b>), atau cari dengan KIMAP.</p></div>';
      return;
    }
    var shown = R.res.slice(0, S.limit);
    var F = mainFields();
    var head = '<tr><th>Material</th><th>Harga &amp; Kontrak OA</th>' +
      F.map(function (x) { var f = x.f; return '<th class="num th-field">' + esc(f.name) + '<small>' + esc(f.plants.join('/')) + (f.home ? ' · ' + ddmm(idx.homeDate) : '') + '</small></th>'; }).join('') +
      '<th class="c th-field">Field lain<small>di luar kolom</small></th><th>Pemakaian ' + esc(homeName()) + '</th><th class="c pick-col">Pilih</th></tr>';
    var rows = shown.map(function (x) { return resultRow(x.o, x.syn); }).join('');
    var more = R.res.length > shown.length ? '<tr class="more-row"><td colspan="' + (F.length + 5) + '"><button class="btn" data-act="more">Tampilkan ' + Math.min(60, R.res.length - shown.length) + ' lagi (' + nf0.format(R.res.length - shown.length) + ' tersisa)</button></td></tr>' : '';
    box.innerHTML = banner + '<div class="table-wrap tall"><table class="grid" id="resTable"><thead>' + head + '</thead><tbody>' + rows + more + '</tbody></table></div>';
  }

  function resultRow(o, viaSyn) {
    var it = item(o.m), F = mainFields();
    var canBau = o.zoneStock > 0 || o.other > 0;
    return '<tr class="clickable' + (active(it) ? ' in-cart' : '') + '" data-m="' + esc(o.m) + '">' +
      '<td class="mat-cell"><div class="mat-desc">' + esc(o.d) + (o.u ? '<span class="uom">' + esc(o.u) + '</span>' : '') + '</div><div class="mat-code">' + esc(o.m) + ' ' + agingBadge(o) + (viaSyn ? ' <span class="badge syn" title="Ditemukan lewat sinonim">sinonim</span>' : '') + '</div></td>' +
      '<td>' + priceCell(o) + '</td>' +
      F.map(function (x) { return '<td class="num">' + qtyPill(o.fs[x.i], x.f.home, fieldTitle(o, x.f)) + '</td>'; }).join('') +
      '<td class="c">' + otherBtn(o) + '</td>' +
      '<td>' + useCell(o) + '</td>' +
      '<td class="c pick-col"><div class="picks">' +
      pick('ro', o.m, it && it.ro.on, !o.oa.length, o.oa.length ? 'Tarik lewat RO (kontrak)' : 'Tidak ada kontrak OA untuk material ini') +
      pick('bau', o.m, it && it.bau.on, !canBau && !(it && it.bau.on), canBau ? 'Bantuan Antar Unit dari Field lain' : 'Tidak ada stok di Field lain') +
      '</div></td></tr>';
  }

  // Tombol "Cek field lain": menonjol jika stok Zona 1 (selain home) kosong semua
  function otherBtn(o) {
    if (!(o.other > 0)) return '<span class="qty na">—</span>';
    var nF = {};
    o.otherPlants.forEach(function (p) { var f = S.idx.fieldOfPlant(p); nF[f ? f.name : p] = 1; });
    var n = Object.keys(nF).length;
    var strong = !(o.zoneStock > 0);
    return '<button class="other-btn' + (strong ? ' strong' : '') + '" data-act="other" data-m="' + esc(o.m) + '" title="Lihat stok di field lain">Cek ' + n + ' field</button>';
  }
  function otherRows(o) {
    return o.otherPlants.map(function (p) {
      var f = S.idx.fieldOfPlant(p);
      return { zone: f ? f.zone : '—', name: f ? fieldLabel(f) : 'Plant lain', plant: p, qty: o.st[p] };
    }).sort(function (a, b) { return a.zone.localeCompare(b.zone, 'id', { numeric: true }) || b.qty - a.qty; });
  }
  function showOther(btn, m) {
    var o = S.idx.mats.get(m), pop = $('#popover');
    var rows = otherRows(o).map(function (r) {
      return '<tr><td class="small muted">' + esc(r.zone) + '</td><td><b>' + esc(r.name) + '</b></td><td class="mono small">' + esc(r.plant) + '</td><td class="num">' + qtyPill(r.qty) + '</td></tr>';
    }).join('');
    pop.innerHTML = '<div class="toolbar" style="margin-bottom:8px"><b>Stok di field lain</b><span class="spacer"></span><button class="icon-btn" data-act="close-pop">' + ICON.close + '</button></div>' +
      '<div class="small muted" style="margin-bottom:8px">' + esc(o.d) + '</div>' +
      '<table class="grid"><thead><tr><th>Zona</th><th>Field</th><th>Plant</th><th class="num">Stok</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<div class="toolbar" style="margin-top:10px"><button class="btn sm" data-act="detail" data-m="' + esc(m) + '">Detail lengkap</button></div>';
    pop.classList.remove('hidden');
    var r = btn.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
    var left = Math.min(window.innerWidth - w - 12, Math.max(12, r.right - w));
    var top = r.bottom + 6 + h > window.innerHeight ? Math.max(12, r.top - h - 6) : r.bottom + 6;
    pop.style.left = left + 'px'; pop.style.top = top + 'px';
  }
  function closePop() { var p = $('#popover'); if (p) p.classList.add('hidden'); }

  // ================= Drawer detail material =================
  function openDrawer(m) {
    var o = S.idx.mats.get(m);
    if (!o) return;
    var d = $('#drawer'), idx = S.idx, it = item(m);
    var F = fields();
    // stok per plant
    var rows = o.rows.slice().filter(function (r) { return S.drawerAll || r.qty !== 0; });
    function rank(p) { var f = idx.fieldOfPlant(p); if (!f) return 999; return f.home ? 0 : (f.main ? 0 : 100) + F.indexOf(f) + 1; }
    rows.sort(function (a, b) { return rank(a.plant) - rank(b.plant) || a.plant.localeCompare(b.plant) || b.qty - a.qty; });
    var stockRows = rows.map(function (r) {
      var f = idx.fieldOfPlant(r.plant);
      return '<tr><td>' + (f ? '<b>' + esc(fieldLabel(f)) + '</b> <span class="small muted">' + esc(f.zone || '') + '</span>' : '<span class="muted">Plant lain</span>') + '</td><td class="mono">' + esc(r.plant) + '</td><td class="mono">' + esc(r.sloc) + '</td><td class="small">' + esc(r.batch || '-') + '</td><td class="num">' + qtyPill(r.qty, f && f.home) + '</td><td class="small muted">' + ddmm(idx.plantDates[r.plant]) + '</td></tr>';
    }).join('') || '<tr><td colspan="6" class="muted center">Tidak ada stok tercatat' + (S.drawerAll ? '' : ' (selain 0)') + '</td></tr>';

    // grafik pemakaian 24 bulan
    var months = [];
    if (idx.mb51Max) for (var i = 23; i >= 0; i--) months.push(Model.addMonths(idx.mb51Max, -i));
    var vals = months.map(function (ym) { return o.homeUse[ym] || 0; });
    var max = Math.max.apply(null, vals.concat([1]));
    var bars = months.map(function (ym, i) {
      var v = vals[i];
      return '<div class="b' + (i === months.length - 1 ? ' cur' : '') + '" style="height:' + (v > 0 ? Math.max(3, v / max * 100) : 0) + '%" title="' + BLN[+ym.slice(5, 7) - 1] + ' ' + ym.slice(0, 4) + ': ' + fmtQ(v) + ' ' + esc(o.u) + '">' + (v > 0 && v === max ? '<span class="t">' + fmtQ(v) + '</span>' : '') + '</div>';
    }).join('');
    var labels = months.map(function (ym, i) { return '<span>' + (i % 3 === 0 ? BLN[+ym.slice(5, 7) - 1] + '<br>' + ym.slice(2, 4) : '') + '</span>'; }).join('');

    var oaRows = o.oa.map(function (l) {
      var dl = daysLeft(l.ve);
      var sel = it && it.ro.on && it.ro.oa === l.key;
      return '<tr><td><a class="mono" href="#/kontrak/' + esc(l.po) + '">' + esc(l.po) + '</a><div class="small muted">item ' + esc(l.item) + '</div></td>' +
        '<td class="small">' + esc(l.vendor) + '</td><td class="num price">' + fmtMoney(l.price, l.cur) + '</td>' +
        '<td class="num small">' + (l.tgtQty > 0 ? fmtQ(l.openQty) + ' / ' + fmtQ(l.tgtQty) : '<span class="muted">nilai</span>') + '</td>' +
        '<td class="small nowrap">' + fmtDate(l.ve) + '<br>' + (l.active ? '<span class="badge ok">Aktif · ' + dl + ' hr</span>' : '<span class="badge bad">Berakhir</span>') + '</td>' +
        '<td><button class="btn sm' + (sel ? ' primary' : '') + '" data-act="use-oa" data-m="' + esc(o.m) + '" data-key="' + esc(l.key) + '">' + (sel ? 'Dipakai' : 'Pakai RO') + '</button></td></tr>';
    }).join('');

    var fieldKpis = F.filter(function (f) { return !f.home && f.main; }).map(function (f) {
      var i = F.indexOf(f);
      return '<div class="kpi"><div class="k">Stok ' + esc(fieldLabel(f)) + '</div><div class="v">' + fmtQ(o.fs[i]) + '</div><div class="s">' + esc(fieldTitle(o, f)) + '</div></div>';
    }).join('');

    d.innerHTML =
      '<div class="drawer-head"><div style="flex:1;min-width:0"><div class="mat-code">' + esc(o.m) + (o.u ? ' · ' + esc(o.u) : '') + ' ' + agingBadge(o) + '</div><h2>' + esc(o.d) + '</h2>' +
      '<div class="picks" style="margin-top:12px">' + pick('ro', o.m, it && it.ro.on, !o.oa.length) + pick('bau', o.m, it && it.bau.on, false) +
      '<button class="btn sm ghost" data-act="copy" data-text="' + esc(o.m) + '">Salin KIMAP</button></div></div>' +
      '<button class="icon-btn" data-act="close-drawer" aria-label="Tutup">' + ICON.close + '</button></div>' +
      '<div class="drawer-body">' +
      '<div class="kpis">' +
      '<div class="kpi"><div class="k">Stok ' + esc(homeName()) + '</div><div class="v" style="color:var(--ok)">' + fmtQ(o.homeStock) + '</div><div class="s">SAP ' + fmtDate(idx.homeDate) + '</div></div>' +
      fieldKpis +
      '<div class="kpi"><div class="k">Pemakaian ' + idx.histYear + '</div><div class="v">' + fmtQ(o.hist) + '</div><div class="s">' + idx.dataYear + ' YTD: ' + fmtQ(o.ytd) + '</div></div>' +
      '<div class="kpi"><div class="k">Rata-rata / bulan</div><div class="v">' + fmtQ(Math.round(o.avg12 * 10) / 10) + '</div><div class="s">12 bulan terakhir</div></div>' +
      '<div class="kpi"><div class="k">Harga</div><div class="v" style="font-size:17px">' + (o.bestOA ? fmtMoney(o.bestOA.price, o.bestOA.cur) : fmtMoney(o.map)) + '</div><div class="s">' + (o.bestOA ? 'OA ' + esc(o.bestOA.po) : (o.map ? 'Harga rata-rata stok' : 'Tidak ada')) + '</div></div>' +
      '</div>' +
      '<div><div class="toolbar"><h4 class="section-title" style="margin:0">Stok per plant</h4><span class="spacer"></span><label class="small"><input type="checkbox" data-act="drawer-all"' + (S.drawerAll ? ' checked' : '') + '> tampilkan stok 0</label></div>' +
      '<div class="table-wrap" style="margin-top:8px"><table class="grid"><thead><tr><th>Field</th><th>Plant</th><th>SLoc</th><th>Batch</th><th class="num">Qty</th><th>Data</th></tr></thead><tbody>' + stockRows + '</tbody></table></div></div>' +
      '<div><h4 class="section-title">Pemakaian ' + esc(homeName()) + ' (24 bulan, MB51)</h4>' +
      (idx.mb51Max ? '<div class="bars">' + bars + '</div><div class="bar-labels">' + labels + '</div>' : '<p class="muted">Data MB51 belum diupload.</p>') + '</div>' +
      orderHistHtml(o) +
      '<div><h4 class="section-title">Kontrak tersedia (ME3N)</h4>' +
      (o.oa.length ? '<div class="table-wrap"><table class="grid"><thead><tr><th>OA</th><th>Vendor</th><th class="num">Harga</th><th class="num">Sisa Qty</th><th>Berlaku s/d</th><th></th></tr></thead><tbody>' + oaRows + '</tbody></table></div>'
        : '<p class="muted">Tidak ada kontrak untuk material ini — pertimbangkan BAU dari Field lain.</p>') +
      '</div></div>';
    d.setAttribute('data-m', m);
    d.classList.add('open');
    d.setAttribute('aria-hidden', 'false');
    $('#scrim').classList.add('open');
  }
  function orderHistHtml(o) {
    var h = materialHistory(o.m);
    if (!h.length) return '';
    return '<div><h4 class="section-title">Riwayat order material ini</h4><div class="table-wrap"><table class="grid"><thead><tr><th>Tanggal</th><th>Order</th><th>Jenis</th><th class="num">Qty</th><th>Keterangan</th></tr></thead><tbody>' +
      h.slice(0, 10).map(function (x) {
        return '<tr><td class="small">' + fmtDateTime(x.r.createdAt) + '</td><td class="mono small"><a href="#/riwayat">' + esc(x.r.id) + '</a></td><td><span class="badge ' + (x.kind === 'RO' ? 'ro' : 'bau') + '">' + x.kind + '</span></td><td class="num">' + fmtQ(x.qty) + '</td><td class="small">' + esc(x.info) + ' · ' + esc(x.r.status) + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
  }
  function closeDrawer() {
    var d = $('#drawer');
    if (!d.classList.contains('open')) return;
    d.classList.remove('open');
    d.setAttribute('aria-hidden', 'true');
    $('#scrim').classList.remove('open');
  }

  // ================= Halaman: Daftar Kontrak =================
  function oaCategory(h) {
    var cnt = {};
    h.lines.forEach(function (l) {
      var w = (l.d || '').toUpperCase().split(/[\s,:;]+/)[0];
      if (w && w.length > 2) cnt[w] = (cnt[w] || 0) + 1;
    });
    var top = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; });
    return top.slice(0, 2).join(' & ');
  }
  function oaStats(h) {
    if (h._st) return h._st;
    var used = 0, zero = 0;
    h.lines.forEach(function (l) {
      var o = S.idx.mats.get(l.m);
      if (o && (o.hist > 0 || o.ytd > 0)) { used++; if (!(o.homeStock > 0)) zero++; }
    });
    h._st = { used: used, zero: zero, cat: oaCategory(h) };
    return h._st;
  }

  function renderOAList() {
    if (!S.idx || !S.idx.oaMap.size) { view.innerHTML = S.idx && hasData() ? '<div class="card empty"><div class="ico">' + ICON.doc + '</div><h3>Data ME3N belum ada</h3><p>Upload export ME3N untuk melihat kontrak.</p><a class="btn primary" href="#/data">Upload</a></div>' : emptyData(); return; }
    var pgs = {};
    S.idx.oaMap.forEach(function (h) { pgs[h.pg] = 1; });
    var F = S.oaF;
    view.innerHTML =
      '<div class="card card-pad toolbar" style="margin-bottom:14px">' +
      '<div class="searchbox" style="flex:1;min-width:240px">' + ICON.search.replace('<svg', '<svg style="left:12px;width:18px;height:18px"') + '<input id="oaq" class="input" style="height:40px;padding-left:38px;font-size:14px;border-radius:10px;box-shadow:none" placeholder="Cari nomor OA, vendor, atau jenis material…" value="' + esc(F.q) + '"></div>' +
      '<select class="select" id="oapg"><option value="">Semua Purch. Group</option>' + Object.keys(pgs).sort().map(function (p) { return '<option' + (F.pg === p ? ' selected' : '') + '>' + esc(p) + '</option>'; }).join('') + '</select>' +
      '<select class="select" id="oasort"><option value="rel"' + (F.sort === 'rel' ? ' selected' : '') + '>Urut: relevan untuk ' + esc(homeName()) + '</option><option value="end"' + (F.sort === 'end' ? ' selected' : '') + '>Urut: berakhir paling cepat</option><option value="val"' + (F.sort === 'val' ? ' selected' : '') + '>Urut: sisa nilai terbesar</option><option value="po"' + (F.sort === 'po' ? ' selected' : '') + '>Urut: nomor OA</option></select>' +
      '<span class="chip-toggle' + (F.active ? ' on' : '') + '" data-oafilter="active">Hanya kontrak aktif</span></div>' +
      '<div id="oaList"></div>';
    renderOACards();
  }
  function renderOACards() {
    var F = S.oaF, list = [];
    var q = F.q.trim().toUpperCase();
    S.idx.oaMap.forEach(function (h) {
      if (F.active && !h.active) return;
      if (F.pg && h.pg !== F.pg) return;
      var st = oaStats(h);
      if (q) {
        var hay = (h.po + ' ' + h.vendor + ' ' + st.cat).toUpperCase();
        if (hay.indexOf(q) < 0 && !h.lines.some(function (l) { return (l.d || '').toUpperCase().indexOf(q) >= 0 || l.m.toUpperCase() === q; })) return;
      }
      list.push(h);
    });
    list.sort(function (a, b) {
      if (F.sort === 'end') return (a.ve || '').localeCompare(b.ve || '');
      if (F.sort === 'val') return (b.cur === 'IDR' ? b.totalOpen : b.totalOpen * 16000) - (a.cur === 'IDR' ? a.totalOpen : a.totalOpen * 16000);
      if (F.sort === 'po') return a.po.localeCompare(b.po);
      return oaStats(b).used - oaStats(a).used || (b.active - a.active) || a.po.localeCompare(b.po);
    });
    var html = list.map(function (h) {
      var st = oaStats(h), dl = daysLeft(h.ve);
      var usedPct = h.tgtHdr > 0 ? Math.min(100, Math.max(0, (1 - h.totalOpen / h.tgtHdr) * 100)) : null;
      return '<a class="card oa-card" href="#/kontrak/' + esc(h.po) + '">' +
        '<div class="toolbar"><span class="po">' + esc(h.po) + '</span><span class="spacer"></span>' +
        (h.active ? '<span class="badge ' + (dl < 60 ? 'warn' : 'ok') + '">Aktif · ' + dl + ' hari</span>' : '<span class="badge bad">Berakhir</span>') + '</div>' +
        '<div class="vendor">' + esc(h.vendor) + '</div>' +
        (st.cat ? '<div class="cat">' + esc(st.cat) + '</div>' : '') +
        '<div class="meta"><span><b>' + h.lines.length + '</b> item</span><span><b>' + st.used + '</b> pernah dipakai ' + esc(homeName()) + '</span>' + (st.zero ? '<span style="color:var(--warn)"><b>' + st.zero + '</b> stok ' + esc(homeName()) + ' habis</span>' : '') + '</div>' +
        '<div class="meta"><span>s/d <b>' + fmtDate(h.ve) + '</b></span><span>PG <b>' + esc(h.pg) + '</b></span><span>Sisa nilai <b>' + fmtBig(h.totalOpen, h.cur) + '</b></span></div>' +
        (usedPct != null ? '<div class="progress" title="Terpakai ' + nf0.format(usedPct) + '% dari nilai kontrak"><i style="width:' + usedPct.toFixed(1) + '%"></i></div>' : '') +
        '</a>';
    }).join('');
    $('#oaList').innerHTML = list.length ? '<div class="result-meta" style="margin-bottom:10px"><b>' + list.length + '</b> kontrak</div><div class="oa-grid">' + html + '</div>'
      : '<div class="card empty"><h3>Tidak ada kontrak yang cocok</h3><p>Ubah kata kunci atau matikan filter "Hanya kontrak aktif".</p></div>';
  }

  // ================= Halaman: Detail Kontrak =================
  function renderOADetail(po) {
    if (!S.idx) { view.innerHTML = emptyData(); return; }
    var h = S.idx.oaMap.get(po);
    if (!h) { view.innerHTML = '<div class="card empty"><h3>Kontrak ' + esc(po) + ' tidak ditemukan</h3><p>Pastikan data ME3N terbaru sudah diupload.</p><a class="btn" href="#/kontrak">' + ICON.back + ' Kembali</a></div>'; return; }
    $('#pageTitle').textContent = 'Kontrak ' + po;
    $('#pageSub').textContent = h.vendor;
    var st = oaStats(h), dl = daysLeft(h.ve);
    view.innerHTML =
      '<div style="margin-bottom:12px"><a class="btn sm" href="#/kontrak">' + ICON.back + ' Semua kontrak</a></div>' +
      '<div class="card head-card"><div><div class="mono muted">Outline Agreement · PG ' + esc(h.pg) + ' · Vendor ' + esc(h.vendorCode) + '</div><h2>' + esc(h.vendor) + '</h2>' +
      '<div class="meta muted">' + esc(st.cat) + '</div></div>' +
      '<div>' + (h.active ? '<span class="badge ' + (dl < 60 ? 'warn' : 'ok') + '">Aktif · sisa ' + dl + ' hari</span>' : '<span class="badge bad">Kontrak berakhir</span>') + '</div></div>' +
      '<div class="kpis" style="margin:14px 0">' +
      '<div class="kpi"><div class="k">Masa berlaku</div><div class="v" style="font-size:16px">' + fmtDate(h.vs) + ' – ' + fmtDate(h.ve) + '</div></div>' +
      '<div class="kpi"><div class="k">Nilai kontrak</div><div class="v">' + fmtBig(h.tgtHdr, h.cur) + '</div></div>' +
      '<div class="kpi"><div class="k">Sisa nilai</div><div class="v" style="color:var(--brand)">' + fmtBig(h.totalOpen, h.cur) + '</div><div class="s">' + (h.tgtHdr > 0 ? nf0.format(h.totalOpen / h.tgtHdr * 100) + '% tersisa' : '') + '</div></div>' +
      '<div class="kpi"><div class="k">Item kontrak</div><div class="v">' + h.lines.length + '</div><div class="s">' + st.used + ' pernah dipakai ' + esc(homeName()) + '</div></div>' +
      '</div>' +
      '<div class="card card-pad toolbar" style="margin-bottom:12px">' +
      '<input id="oadq" class="input" style="flex:1;min-width:220px" placeholder="Filter item dalam kontrak ini…" value="' + esc(S.oaD.q) + '">' +
      '<span class="chip-toggle' + (S.oaD.used ? ' on' : '') + '" data-oad="used">Pernah dipakai ' + esc(homeName()) + '</span>' +
      '<span class="chip-toggle' + (S.oaD.zero ? ' on' : '') + '" data-oad="zero">Stok ' + esc(homeName()) + ' habis</span>' +
      '<button class="btn" data-act="check-all" data-po="' + esc(po) + '">Centang semua yang tampil</button>' +
      '<button class="btn" data-act="uncheck-all" data-po="' + esc(po) + '">Hapus centang</button></div>' +
      '<div id="oaItems" data-po="' + esc(po) + '"></div>';
    renderOAItems(po);
  }
  function oaVisibleLines(h) {
    var q = S.oaD.q.trim(), pq = Search.parseQuery(q);
    return h.lines.filter(function (l) {
      var o = S.idx.mats.get(l.m);
      if (S.oaD.used && !(o.hist > 0 || o.ytd > 0)) return false;
      if (S.oaD.zero && o.homeStock > 0) return false;
      if (q) { var r = Search.score(pq, o.ix); if (!(r.missed === 0 && r.s > 0)) return false; }
      return true;
    });
  }
  function renderOAItems(po) {
    var h = S.idx.oaMap.get(po), lines = oaVisibleLines(h);
    var F = fields().filter(function (f) { return !f.home && f.main; });
    var rows = lines.map(function (l) {
      var o = S.idx.mats.get(l.m), it = item(l.m);
      var sel = it && it.ro.on && it.ro.oa === l.key;
      var other = it && it.ro.on && it.ro.oa && it.ro.oa !== l.key;
      var sug = suggestion(o);
      return '<tr class="' + (sel ? 'in-cart' : '') + '" data-m="' + esc(l.m) + '">' +
        '<td class="c">' + pick('ro', l.m, sel, false, other ? 'Saat ini memakai OA ' + it.ro.oa : '', ' data-key="' + esc(l.key) + '"') + '</td>' +
        '<td class="mat-cell"><div class="mat-desc"><a href="#" data-act="detail" data-m="' + esc(l.m) + '" style="color:inherit">' + esc(o.d || l.d) + '</a><span class="uom">' + esc(l.u) + '</span></div><div class="mat-code">' + esc(l.m) + ' · item ' + esc(l.item) + (other ? ' · <span style="color:var(--warn)">RO via ' + esc(it.ro.oa.split('/')[0]) + '</span>' : '') + '</div></td>' +
        '<td class="num price">' + fmtMoney(l.price, l.cur) + '</td>' +
        '<td class="num small">' + (l.tgtQty > 0 ? fmtQ(l.openQty) + ' / ' + fmtQ(l.tgtQty) : '<span class="muted">—</span>') + '</td>' +
        '<td class="num">' + qtyPill(o.homeStock, true) + '</td>' +
        F.map(function (f) { return '<td class="num">' + qtyPill(o.fs[fields().indexOf(f)], false, fieldTitle(o, f)) + '</td>'; }).join('') +
        '<td class="num">' + fmtQ(o.hist) + '</td><td class="num">' + fmtQ(Math.round(o.avg12 * 10) / 10) + '</td>' +
        '<td class="num"><input class="input num sm" type="number" min="0" step="any" data-oaqty="' + esc(l.m) + '" data-key="' + esc(l.key) + '" value="' + (sel && it.ro.qty != null ? it.ro.qty : '') + '" placeholder="' + (sug || '') + '"></td></tr>';
    }).join('');
    $('#oaItems').innerHTML = '<div class="result-meta" style="margin-bottom:8px"><b>' + lines.length + '</b> dari ' + h.lines.length + ' item ditampilkan · centang <b>RO</b> untuk menarik material ke Call Order</div>' +
      '<div class="table-wrap tall"><table class="grid"><thead><tr><th class="c">Tarik</th><th>Material</th><th class="num">Net Price</th><th class="num">Sisa Qty</th><th class="num th-field">' + esc(homeName()) + '<small>' + ddmm(S.idx.homeDate) + '</small></th>' +
      F.map(function (f) { return '<th class="num th-field">' + esc(f.name) + '<small>' + esc(f.plants.join('/')) + '</small></th>'; }).join('') +
      '<th class="num">Pakai ' + S.idx.histYear + '</th><th class="num">Rata²/bln</th><th class="num">Qty Call</th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="12" class="center muted" style="padding:30px">Tidak ada item sesuai filter</td></tr>') + '</tbody></table></div>';
  }

  // ================= Halaman: Call Order =================
  function coMeta() {
    var m = S.cart.meta, now = new Date();
    if (m.month == null) m.month = now.getMonth();
    if (!m.year) m.year = now.getFullYear();
    return m;
  }
  function coTitle() {
    var m = coMeta();
    return m.title || ('PLAN CALL ORDER MATERIAL STOCK ZONA 1 - ' + BULAN[m.month].toUpperCase());
  }
  function groupTitle(po) {
    if (S.cart.groupTitles[po]) return S.cart.groupTitles[po];
    var h = S.idx.oaMap.get(po);
    if (!h) return 'Kontrak ' + po;
    var cat = oaStats(h).cat;
    return (cat ? cat + ' - ' : '') + 'Kontrak ' + po + ' (' + h.vendor + ')';
  }
  function bauSources(o) {
    var out = [];
    fields().forEach(function (f) {
      if (f.home) return;
      var q = 0, withStock = [];
      f.plants.forEach(function (p) { if (o.st[p] > 0) { q += o.st[p]; withStock.push(p); } });
      if (!f.main && !(q > 0)) return;
      out.push({ key: 'F:' + f.name, label: fieldLabel(f), zone: f.zone, plants: withStock.length ? withStock : f.plants, stock: q, field: true, main: !!f.main });
    });
    o.otherPlants.forEach(function (p) {
      if (S.idx.fieldOfPlant(p)) return;
      out.push({ key: 'P:' + p, label: p, plants: [p], stock: o.st[p], field: false, main: false });
    });
    return out;
  }
  function srcPrice(o, src) {
    var q = 0, v = 0;
    src.plants.forEach(function (p) { if (o.st[p] > 0 && o.stv[p] != null) { q += o.st[p]; v += o.stv[p]; } });
    return q > 0 ? v / q : (o.map || null);
  }

  // Susun data Call Order (dipakai halaman & export)
  function buildCO() {
    var idx = S.idx, ro = {}, roOrder = [], bau = {}, bauOrder = [];
    var items = Object.keys(S.cart.items).map(function (k) { return S.cart.items[k]; })
      .filter(function (it) { return idx.mats.has(it.m); })
      .sort(function (a, b) { return a.t - b.t; });
    items.forEach(function (it) {
      var o = idx.mats.get(it.m);
      if (it.ro.on) {
        var l = lineOf(o, it.ro.oa);
        var po = l ? l.po : '-';
        if (!ro[po]) { ro[po] = { po: po, items: [] }; roOrder.push(po); }
        ro[po].items.push({
          it: it, o: o, l: l, m: o.m, d: o.d, u: o.u || (l && l.u), stock: o.homeStock, actual: it.ro.actual, hist: o.hist,
          qty: it.ro.qty, price: l ? l.price : null, cur: l ? l.cur : 'IDR', oa: l ? l.po : '', oaMat: l ? l.m : '',
          note: it.ro.note || autoNote(o), sug: suggestion(o)
        });
      }
      if (it.bau.on) {
        bauSources(o).forEach(function (src) {
          var q = it.bau.alloc[src.key];
          if (!(q > 0)) return;
          if (!bau[src.key]) { bau[src.key] = { key: src.key, label: src.label, field: src.field, plants: {}, items: [] }; bauOrder.push(src.key); }
          src.plants.forEach(function (p) { bau[src.key].plants[p] = 1; });
          bau[src.key].items.push({ m: o.m, d: o.d, u: o.u, homeStock: o.homeStock, plants: src.plants.join('/'), srcStock: src.stock, qty: q, price: srcPrice(o, src), note: it.bau.note });
        });
      }
    });
    var letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    var roGroups = roOrder.map(function (po, i) { var g = ro[po]; g.letter = letters[i % 26]; g.title = po === '-' ? 'Tanpa kontrak (pilih OA)' : groupTitle(po); return g; });
    var bauGroups = bauOrder.map(function (k, i) {
      var g = bau[k]; g.letter = letters[i % 26];
      g.title = (g.field ? 'BAU dari Field ' + g.label : 'BAU dari Plant ' + g.label) + ' (' + Object.keys(g.plants).join('/') + ')';
      return g;
    });
    return {
      title: coTitle(), meta: coMeta(), homeName: homeName(), homeDate: idx.homeDate, histYear: idx.histYear,
      roGroups: roGroups, bauGroups: bauGroups, items: items
    };
  }

  function renderCO() {
    if (!hasData()) { view.innerHTML = emptyData(); return; }
    var co = buildCO(), meta = co.meta;
    var activeItems = co.items.filter(active);
    $('#pageActions').innerHTML = '<button class="btn danger" data-act="clear-co">' + ICON.trash + ' Kosongkan</button>' +
      '<button class="btn success" data-act="export"' + (activeItems.length ? '' : ' disabled') + '>' + ICON.excel + ' Export Excel (Template MIM)</button>';
    var head = '<div class="card card-pad" style="display:grid;grid-template-columns:1fr auto auto;gap:12px;align-items:end">' +
      '<label><div class="small muted" style="margin-bottom:4px;font-weight:700">Judul (baris 1 template)</div><input class="input" style="width:100%;font-weight:700" id="coTitle" value="' + esc(co.title) + '"></label>' +
      '<label><div class="small muted" style="margin-bottom:4px;font-weight:700">Bulan</div><select class="select" id="coMonth">' + BULAN.map(function (b, i) { return '<option value="' + i + '"' + (meta.month === i ? ' selected' : '') + '>' + b + '</option>'; }).join('') + '</select></label>' +
      '<label><div class="small muted" style="margin-bottom:4px;font-weight:700">Tahun</div><input class="input" style="width:90px" type="number" id="coYear" value="' + meta.year + '"></label></div>';
    if (!activeItems.length) {
      view.innerHTML = head + '<div class="card empty" style="margin-top:16px"><div class="ico">' + ICON.list + '</div><h3>Call Order masih kosong</h3><p>Cari material lalu centang <b>RO</b> (tarik via kontrak) atau <b>BAU</b> (Bantuan Antar Unit dari Field lain). Anda juga bisa membuka satu kontrak dan mencentang banyak item sekaligus.</p>' +
        '<div class="toolbar" style="justify-content:center"><a class="btn primary" href="#/cari">' + ICON.search + ' Cari Material</a><a class="btn" href="#/kontrak">Lihat Kontrak</a></div></div>';
      return;
    }
    var roCount = co.roGroups.reduce(function (a, g) { return a + g.items.length; }, 0);
    var totals = {};
    co.roGroups.forEach(function (g) { g.items.forEach(function (x) { if (x.qty > 0 && x.price != null) totals[x.cur] = (totals[x.cur] || 0) + x.qty * x.price; }); });
    var bauItems = activeItems.filter(function (it) { return it.bau.on; });
    var kpis = '<div class="kpis" style="margin:14px 0">' +
      '<div class="kpi"><div class="k">Item RO</div><div class="v" style="color:var(--ro)">' + roCount + '</div><div class="s">' + co.roGroups.length + ' kontrak</div></div>' +
      '<div class="kpi"><div class="k">Nilai RO</div><div class="v" id="kpiTotal">' + (Object.keys(totals).map(function (c) { return fmtBig(totals[c], c); }).join(' + ') || 'Rp 0') + '</div><div class="s">qty × net price</div></div>' +
      '<div class="kpi"><div class="k">Item BAU</div><div class="v" style="color:var(--bau)">' + bauItems.length + '</div><div class="s" id="kpiBauSrc">' + co.bauGroups.length + ' sumber field/plant</div></div>' +
      '<div class="kpi"><div class="k">Data SAP ' + esc(homeName()) + '</div><div class="v" style="font-size:18px">' + fmtDate(co.homeDate) + '</div><div class="s">History = pemakaian ' + co.histYear + '</div></div></div>';

    // ---- Tabel RO ----
    var no = 0;
    var roHtml = co.roGroups.map(function (g) {
      var rows = g.items.map(function (x) {
        no++;
        var opts = x.o.oa.map(function (l) {
          return '<option value="' + esc(l.key) + '"' + (x.l && x.l.key === l.key ? ' selected' : '') + '>' + esc(l.po) + ' · ' + fmtMoney(l.price, l.cur) + (l.active ? '' : ' · BERAKHIR') + '</option>';
        }).join('');
        var total = x.qty > 0 && x.price != null ? fmtMoney(x.qty * x.price, x.cur) : '—';
        return '<tr data-m="' + esc(x.m) + '">' +
          '<td class="c muted">' + no + '</td>' +
          '<td class="mat-cell"><div class="mat-desc"><a href="#" data-act="detail" data-m="' + esc(x.m) + '" style="color:inherit">' + esc(x.d) + '</a><span class="uom">' + esc(x.u) + '</span></div><div class="mat-code">' + esc(x.m) + (x.oaMat && x.oaMat !== x.m ? ' · KIMAP OA ' + esc(x.oaMat) : '') + '</div>' +
          '<input class="input sm note-input" style="margin-top:6px" data-f="note" value="' + esc(x.it.ro.note) + '" placeholder="' + esc('Note: ' + (autoNote(x.o) || 'catatan')) + '" title="Kolom Note di Excel. Kosong = catatan otomatis"></td>' +
          '<td class="num">' + qtyPill(x.stock, true) + '</td>' +
          '<td class="num"><input class="input num sm" type="number" min="0" step="any" data-f="actual" value="' + (x.actual != null ? x.actual : '') + '" placeholder="—"></td>' +
          '<td class="num">' + fmtQ(x.hist) + '</td>' +
          '<td class="num"><input class="input num sm" type="number" min="0" step="any" data-f="qty" value="' + (x.qty != null ? x.qty : '') + '" placeholder="0">' +
          (x.sug > 0 ? '<button class="hint-btn" data-act="sug" data-v="' + x.sug + '" title="Rata-rata pakai ' + S.settings.coverMonths + ' bulan dikurangi stok">saran ' + fmtQ(x.sug) + '</button>' : '') + '</td>' +
          '<td class="num price">' + fmtMoney(x.price, x.cur) + '</td>' +
          '<td class="num price" data-total>' + total + '</td>' +
          '<td><select class="select sm" data-f="oa" style="max-width:150px">' + opts + '</select></td>' +
          '<td class="pick-col"><div class="picks mode">' + pick('ro', x.m, true, false) + pick('bau', x.m, x.it.bau.on, false) +
          '<button class="icon-btn" data-act="remove" data-m="' + esc(x.m) + '" title="Hapus dari Call Order">' + ICON.trash + '</button></div></td></tr>';
      }).join('');
      return '<tr class="group"><td class="c"><span class="letter">' + g.letter + '</span></td><td colspan="9">' +
        (g.po === '-' ? '<span style="color:var(--bad)">' + esc(g.title) + '</span>' : '<input class="group-title" data-po="' + esc(g.po) + '" value="' + esc(g.title) + '">') + '</td></tr>' + rows;
    }).join('');
    var roTable = co.roGroups.length ? '<div class="table-wrap"><table class="grid" id="roTable"><thead><tr><th class="c">No</th><th>Material &amp; Note</th><th class="num th-field">Data SAP<small>' + ddmm(co.homeDate) + '</small></th><th class="num">Stok Aktual</th><th class="num th-field">History<small>' + co.histYear + '</small></th><th class="num">Call RO</th><th class="num">Net Price</th><th class="num">Total Harga</th><th>OA</th><th class="pick-col">Mode</th></tr></thead><tbody>' + roHtml + '</tbody></table></div>'
      : '<div class="card card-pad muted">Belum ada material RO.</div>';

    // ---- Tabel BAU ----
    var bauHtml = bauItems.map(function (it, i) {
      var o = S.idx.mats.get(it.m);
      var srcs = bauSources(o);
      var total = 0;
      function allocBox(s) {
        var v = it.bau.alloc[s.key];
        if (v > 0) total += v;
        var dis = !(s.stock > 0) && !(v > 0);
        return '<div class="alloc-item' + (v > 0 ? ' has' : '') + '"><div class="n">' + esc(s.label) + '<small>' + esc(s.plants.join('/')) + ' · stok ' + fmtQ(s.stock) + '</small></div>' +
          '<input class="input num sm" type="number" min="0" step="any" data-alloc="' + esc(s.key) + '" value="' + (v > 0 ? v : '') + '" placeholder="0"' + (dis ? ' disabled title="Tidak ada stok"' : '') + '></div>';
      }
      var main = srcs.filter(function (s) { return s.main; });
      var extra = srcs.filter(function (s) { return !s.main; });
      var extraUsed = extra.some(function (s) { return it.bau.alloc[s.key] > 0; });
      var alloc = main.map(allocBox).join('') +
        (extra.length ? '<details class="alloc-more"' + (extraUsed ? ' open' : '') + '><summary>+ Field lain (' + extra.length + ')</summary><div class="alloc">' + extra.map(allocBox).join('') + '</div></details>' : '');
      return '<tr data-m="' + esc(it.m) + '"><td class="c muted">' + (i + 1) + '</td>' +
        '<td class="mat-cell"><div class="mat-desc"><a href="#" data-act="detail" data-m="' + esc(it.m) + '" style="color:inherit">' + esc(o.d) + '</a><span class="uom">' + esc(o.u) + '</span></div><div class="mat-code">' + esc(o.m) + '</div></td>' +
        '<td class="num">' + qtyPill(o.homeStock, true) + '</td>' +
        '<td><div class="alloc">' + alloc + '</div></td>' +
        '<td class="num"><b data-bautotal>' + fmtQ(total) + '</b></td>' +
        '<td><input class="input sm note-input" data-f="baunote" value="' + esc(it.bau.note) + '" placeholder="Catatan BAU"></td>' +
        '<td class="pick-col"><div class="picks mode">' + pick('ro', it.m, it.ro.on, !o.oa.length) + pick('bau', it.m, true, false) +
        '<button class="icon-btn" data-act="remove" data-m="' + esc(it.m) + '" title="Hapus dari Call Order">' + ICON.trash + '</button></div></td></tr>';
    }).join('');
    var bauTable = bauItems.length ? '<div class="table-wrap"><table class="grid" id="bauTable"><thead><tr><th class="c">No</th><th>Material</th><th class="num th-field">Stok ' + esc(homeName()) + '<small>' + ddmm(co.homeDate) + '</small></th><th>Sumber BAU &amp; Qty diminta</th><th class="num">Total</th><th>Note</th><th class="pick-col">Mode</th></tr></thead><tbody>' + bauHtml + '</tbody></table></div>'
      : '<div class="card card-pad muted">Belum ada material BAU.</div>';

    view.innerHTML = head + kpis +
      '<div class="co-section"><div class="co-section-head"><span class="badge ro">RO</span><h3>Release Order via Kontrak</h3><span class="muted small">— dikelompokkan per OA seperti template "Call Order to MIM"</span></div>' + roTable + '</div>' +
      '<div class="co-section"><div class="co-section-head"><span class="badge bau">BAU</span><h3>Bantuan Antar Unit</h3><span class="muted small">— isi qty yang diminta dari tiap Field</span></div>' + bauTable + '</div>';
  }

  function refreshCOTotals() {
    var co = buildCO(), totals = {};
    co.roGroups.forEach(function (g) { g.items.forEach(function (x) { if (x.qty > 0 && x.price != null) totals[x.cur] = (totals[x.cur] || 0) + x.qty * x.price; }); });
    var kb = $('#kpiBauSrc');
    if (kb) kb.textContent = co.bauGroups.length + ' sumber field/plant';
    var k = $('#kpiTotal');
    if (k) k.textContent = Object.keys(totals).map(function (c) { return fmtBig(totals[c], c); }).join(' + ') || 'Rp 0';
  }

  // ================= Halaman: Riwayat Order =================
  var ORDER_STATUS = ['Dikirim ke MIM', 'Diproses MIM', 'Selesai', 'Dibatalkan'];
  function allOrders() {
    var local = (Store.load('localOrders', []) || []).map(function (o) { return Object.assign({ local: true }, o); });
    return (S.orders || []).concat(local).sort(function (a, b) { return b.createdAt < a.createdAt ? -1 : 1; });
  }
  function orderTotals(rec) {
    var t = {};
    rec.roGroups.forEach(function (g) { g.items.forEach(function (x) { if (x.qty > 0 && x.price != null) t[x.cur || 'IDR'] = (t[x.cur || 'IDR'] || 0) + x.qty * x.price; }); });
    return t;
  }
  function orderCounts(rec) {
    var ro = 0, bau = {};
    rec.roGroups.forEach(function (g) { ro += g.items.length; });
    rec.bauGroups.forEach(function (g) { g.items.forEach(function (x) { bau[x.m] = 1; }); });
    return { ro: ro, bau: Object.keys(bau).length };
  }
  function recToCo(rec) {
    return { title: rec.title, meta: { month: rec.month, year: rec.year }, homeName: rec.homeName, homeDate: rec.homeDate, histYear: rec.histYear, roGroups: rec.roGroups, bauGroups: rec.bauGroups };
  }
  async function recordOrder(co) {
    var rec = {
      id: 'CO-' + Date.now().toString(36).toUpperCase(), createdAt: new Date().toISOString(), by: S.user.name,
      title: co.title, month: co.meta.month, year: co.meta.year, homeName: co.homeName, homeDate: co.homeDate, histYear: co.histYear,
      status: ORDER_STATUS[0],
      roGroups: co.roGroups.map(function (g) {
        return { po: g.po, letter: g.letter, title: g.title, items: g.items.map(function (x) {
          return { m: x.m, d: x.d, u: x.u, stock: x.stock, actual: x.actual, hist: x.hist, qty: x.qty, price: x.price, cur: x.cur, oa: x.oa, oaMat: x.oaMat, note: x.note };
        }) };
      }),
      bauGroups: co.bauGroups.map(function (g) {
        return { key: g.key, letter: g.letter, title: g.title, label: g.label, items: g.items.map(function (x) { return Object.assign({}, x); }) };
      })
    };
    if (isOwner()) await saveOrders([rec].concat(S.orders || []), 'riwayat order ' + rec.id);
    else { var lo = Store.load('localOrders', []) || []; lo.unshift(rec); Store.save('localOrders', lo); }
    return rec;
  }
  async function saveOrders(orders, msg) {
    S.orders = orders;
    var payload = await Vault.encrypt(S.key, orders);
    await queuePending({ files: { 'data/orders.js': Vault.listFile('MW_ORDERS', payload, 'Riwayat Call Order') }, deletes: [] }, [msg], null, null, { orders: orders });
    if (Store.load('ghToken')) await publish();
  }
  function renderOrders() {
    var list = allOrders(), q = (S.ordQ || '').trim().toUpperCase(), stF = S.ordStatus || '';
    var shown = list.filter(function (r) {
      if (stF && r.status !== stF) return false;
      if (!q) return true;
      var hay = [r.id, r.title, r.by, BULAN[r.month], r.year].join(' ');
      r.roGroups.forEach(function (g) { g.items.forEach(function (x) { hay += ' ' + x.m + ' ' + x.d + ' ' + x.oa; }); });
      r.bauGroups.forEach(function (g) { g.items.forEach(function (x) { hay += ' ' + x.m + ' ' + x.d; }); });
      return hay.toUpperCase().indexOf(q) >= 0;
    });
    var yr = new Date().getFullYear(), sumYear = 0, nMonth = 0, now = new Date();
    list.forEach(function (r) {
      var d = new Date(r.createdAt);
      if (d.getFullYear() === yr) sumYear += orderTotals(r).IDR || 0;
      if (d.getFullYear() === yr && d.getMonth() === now.getMonth()) nMonth++;
    });
    var cards = shown.map(function (r) {
      var c = orderCounts(r), t = orderTotals(r), open = S.ordOpen === r.id;
      var statusCtl = isOwner() && !r.local
        ? '<select class="select sm" data-ordstatus="' + esc(r.id) + '">' + ORDER_STATUS.map(function (s) { return '<option' + (s === r.status ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>'
        : '<span class="badge ' + (r.status === 'Selesai' ? 'ok' : r.status === 'Dibatalkan' ? 'bad' : 'ro') + '">' + esc(r.status) + '</span>';
      var detail = '';
      if (open) {
        var rows = [];
        r.roGroups.forEach(function (g) {
          rows.push('<tr class="group"><td colspan="7">' + esc(g.letter + '. ' + g.title) + '</td></tr>');
          g.items.forEach(function (x) {
            rows.push('<tr><td><span class="badge ro">RO</span></td><td class="mono small">' + esc(x.m) + '</td><td>' + esc(x.d) + '</td><td class="num">' + fmtQ(x.qty) + ' ' + esc(x.u || '') + '</td><td class="num">' + fmtMoney(x.price, x.cur) + '</td><td class="num">' + (x.qty > 0 && x.price != null ? fmtMoney(x.qty * x.price, x.cur) : '—') + '</td><td class="mono small">' + esc(x.oa) + '</td></tr>');
          });
        });
        r.bauGroups.forEach(function (g) {
          rows.push('<tr class="group"><td colspan="7">' + esc(g.letter + '. ' + g.title) + '</td></tr>');
          g.items.forEach(function (x) {
            rows.push('<tr><td><span class="badge bau">BAU</span></td><td class="mono small">' + esc(x.m) + '</td><td>' + esc(x.d) + '</td><td class="num">' + fmtQ(x.qty) + ' ' + esc(x.u || '') + '</td><td class="num">' + fmtMoney(x.price) + '</td><td class="num">' + (x.price != null ? fmtMoney(x.qty * x.price) : '—') + '</td><td class="small">' + esc(g.label + ' ' + x.plants) + '</td></tr>');
          });
        });
        detail = '<div class="table-wrap" style="margin-top:12px"><table class="grid"><thead><tr><th>Jenis</th><th>Material</th><th>Deskripsi</th><th class="num">Qty</th><th class="num">Harga</th><th class="num">Total</th><th>OA / Sumber</th></tr></thead><tbody>' + rows.join('') + '</tbody></table></div>';
      }
      return '<div class="card card-pad order-card">' +
        '<div class="toolbar"><span class="mono" style="font-weight:700;color:var(--brand)">' + esc(r.id) + '</span>' + statusCtl +
        (r.local ? '<span class="badge warn" title="Dibuat oleh Viewer — hanya tersimpan di perangkat ini">Lokal</span>' : '') +
        '<span class="spacer"></span><span class="muted small">' + fmtDateTime(r.createdAt) + ' · ' + esc(r.by) + '</span></div>' +
        '<div style="font-weight:700;font-size:15px;margin:8px 0 6px">' + esc(r.title) + '</div>' +
        '<div class="meta muted small" style="display:flex;gap:16px;flex-wrap:wrap"><span>Periode <b>' + BULAN[r.month] + ' ' + r.year + '</b></span><span>Data SAP <b>' + fmtDate(r.homeDate) + '</b></span>' +
        '<span><b>' + c.ro + '</b> item RO</span><span><b>' + c.bau + '</b> item BAU</span><span>Nilai RO <b>' + (Object.keys(t).map(function (k) { return fmtMoney(t[k], k); }).join(' + ') || 'Rp 0') + '</b></span></div>' +
        '<div class="toolbar" style="margin-top:10px"><button class="btn sm" data-act="ord-toggle" data-id="' + esc(r.id) + '">' + (open ? 'Tutup detail' : 'Lihat detail') + '</button>' +
        '<button class="btn sm success" data-act="ord-excel" data-id="' + esc(r.id) + '">' + ICON.excel + ' Download Excel</button>' +
        '<button class="btn sm" data-act="ord-copy" data-id="' + esc(r.id) + '">Salin ke Call Order</button>' +
        ((isOwner() && !r.local) || r.local ? '<button class="btn sm danger" data-act="ord-del" data-id="' + esc(r.id) + '">' + ICON.trash + '</button>' : '') + '</div>' +
        detail + '</div>';
    }).join('');
    view.innerHTML = pendingBanner() +
      '<div class="kpis" style="margin-bottom:14px"><div class="kpi"><div class="k">Total order</div><div class="v">' + list.length + '</div></div>' +
      '<div class="kpi"><div class="k">Order bulan ini</div><div class="v">' + nMonth + '</div></div>' +
      '<div class="kpi"><div class="k">Nilai RO ' + yr + '</div><div class="v">' + fmtBig(sumYear) + '</div></div></div>' +
      '<div class="card card-pad toolbar" style="margin-bottom:14px"><input class="input" id="ordQ" style="flex:1;min-width:220px" placeholder="Cari nomor order, KIMAP, material, OA…" value="' + esc(S.ordQ || '') + '">' +
      '<select class="select" id="ordStatus"><option value="">Semua status</option>' + ORDER_STATUS.map(function (s) { return '<option' + (s === stF ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></div>' +
      (cards || '<div class="card empty"><div class="ico">' + ICON.list + '</div><h3>Belum ada riwayat</h3><p>Setiap kali Anda klik <b>Export Excel</b> di halaman Call Order, order otomatis tercatat di sini lengkap dengan tanggalnya.</p><a class="btn primary" href="#/call-order">Buka Call Order</a></div>');
  }
  function materialHistory(m) {
    var out = [];
    allOrders().forEach(function (r) {
      r.roGroups.forEach(function (g) { g.items.forEach(function (x) { if (x.m === m) out.push({ r: r, kind: 'RO', qty: x.qty, info: 'OA ' + x.oa }); }); });
      r.bauGroups.forEach(function (g) { g.items.forEach(function (x) { if (x.m === m) out.push({ r: r, kind: 'BAU', qty: x.qty, info: g.label }); }); });
    });
    return out;
  }
  function copyOrderToCart(rec) {
    var n = 0;
    rec.roGroups.forEach(function (g) {
      g.items.forEach(function (x) {
        var o = S.idx.mats.get(x.m); if (!o) return;
        var l = o.oa.filter(function (y) { return y.po === x.oa; })[0];
        var it = item(x.m, true);
        it.ro.on = true; it.ro.oa = l ? l.key : (o.bestOA ? o.bestOA.key : null); it.ro.qty = x.qty; it.ro.note = x.note || ''; n++;
      });
    });
    rec.bauGroups.forEach(function (g) {
      g.items.forEach(function (x) {
        if (!S.idx.mats.get(x.m)) return;
        var it = item(x.m, true);
        it.bau.on = true; it.bau.alloc[g.key] = x.qty; n++;
      });
    });
    saveCart();
    return n;
  }

  // ================= Halaman: TKO & Referensi =================
  var DOC_CATS = ['TKO', 'TKI', 'TKPA', 'Pedoman', 'SOP', 'Form', 'Lainnya'];
  function fmtSize(b) { return b > 1048576 ? nf2.format(b / 1048576) + ' MB' : nf0.format(b / 1024) + ' KB'; }
  function renderDocs() {
    var q = (S.docQ || '').trim().toUpperCase(), cat = S.docCat || '';
    var docs = (S.docs || []).filter(function (d) {
      if (cat && d.cat !== cat) return false;
      return !q || [d.title, d.no, d.cat, d.desc, d.fileName, (d.points || []).join(' ')].join(' ').toUpperCase().indexOf(q) >= 0;
    }).sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
    var counts = {};
    (S.docs || []).forEach(function (d) { counts[d.cat] = (counts[d.cat] || 0) + 1; });
    var form = !isOwner() ? '' :
      '<details class="card card-pad" style="margin-bottom:14px"' + ((S.docs || []).length ? '' : ' open') + '><summary style="cursor:pointer;font-weight:700">+ Tambah dokumen (PDF)</summary>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-top:14px">' +
      '<label><div class="small muted" style="font-weight:700;margin-bottom:4px">File PDF</div><input type="file" id="docFile" accept="application/pdf,.pdf" class="input" style="width:100%"></label>' +
      '<label><div class="small muted" style="font-weight:700;margin-bottom:4px">Judul</div><input class="input" id="docTitle" style="width:100%" placeholder="mis. TKO Penerimaan Material"></label>' +
      '<label><div class="small muted" style="font-weight:700;margin-bottom:4px">Nomor dokumen</div><input class="input" id="docNo" style="width:100%" placeholder="mis. B-001/PEP…"></label>' +
      '<label><div class="small muted" style="font-weight:700;margin-bottom:4px">Kategori</div><select class="select" id="docCat" style="width:100%">' + DOC_CATS.map(function (c) { return '<option>' + c + '</option>'; }).join('') + '</select></label>' +
      '<label><div class="small muted" style="font-weight:700;margin-bottom:4px">Tanggal berlaku</div><input class="input" type="date" id="docDate" style="width:100%"></label>' +
      '<label><div class="small muted" style="font-weight:700;margin-bottom:4px">Keterangan</div><input class="input" id="docDesc" style="width:100%" placeholder="Ringkasan isi / lingkup"></label></div>' +
      '<div class="toolbar" style="margin-top:12px"><button class="btn primary" data-act="doc-upload">' + ICON.upload + ' Upload dokumen</button><span class="small muted">Dokumen disimpan terenkripsi — hanya bisa dibuka setelah login.</span></div></details>';
    var cards = docs.map(function (d) {
      return '<div class="card doc-card"><div class="doc-ico">PDF</div><div style="min-width:0;flex:1">' +
        '<div class="toolbar" style="gap:6px"><span class="badge ro">' + esc(d.cat) + '</span>' + (d.no ? '<span class="mono small muted">' + esc(d.no) + '</span>' : '') + '</div>' +
        '<div class="doc-title">' + esc(d.title) + '</div>' +
        (d.desc ? '<div class="small muted" style="margin-bottom:4px">' + esc(d.desc) + '</div>' : '') +
        (d.points && d.points.length ? '<details class="doc-points"><summary>Poin penting (' + d.points.length + ')</summary><ul>' + d.points.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></details>' : '') +
        '<div class="small muted">' + (d.date ? 'Berlaku ' + fmtDate(d.date) + ' · ' : '') + fmtSize(d.size) + ' · upload ' + fmtDateTime(d.uploadedAt) + '</div>' +
        '<div class="toolbar" style="margin-top:10px"><button class="btn sm primary" data-act="doc-view" data-id="' + esc(d.id) + '">Preview</button>' +
        '<button class="btn sm" data-act="doc-dl" data-id="' + esc(d.id) + '">Download</button>' +
        (isOwner() ? '<button class="btn sm danger" data-act="doc-del" data-id="' + esc(d.id) + '">' + ICON.trash + '</button>' : '') + '</div></div></div>';
    }).join('');
    view.innerHTML = pendingBanner() + form +
      '<div class="card card-pad toolbar" style="margin-bottom:14px"><input class="input" id="docQ" style="flex:1;min-width:220px" placeholder="Cari judul, nomor, isi…" value="' + esc(S.docQ || '') + '">' +
      '<div class="chips"><span class="chip-toggle' + (!cat ? ' on' : '') + '" data-doccat="">Semua (' + (S.docs || []).length + ')</span>' +
      DOC_CATS.filter(function (c) { return counts[c]; }).map(function (c) { return '<span class="chip-toggle' + (cat === c ? ' on' : '') + '" data-doccat="' + c + '">' + c + ' (' + counts[c] + ')</span>'; }).join('') + '</div></div>' +
      (cards ? '<div class="doc-grid">' + cards + '</div>' : '<div class="card empty"><div class="ico">' + ICON.doc + '</div><h3>' + ((S.docs || []).length ? 'Tidak ada dokumen yang cocok' : 'Belum ada dokumen') + '</h3><p>' + (isOwner() ? 'Upload TKO, TKI, Pedoman, atau SOP Warehouse lewat form di atas.' : 'Owner belum meng-upload dokumen referensi.') + '</p></div>');
  }
  async function docBlob(id) {
    S.docCache = S.docCache || {};
    if (S.docCache[id]) return S.docCache[id];
    var path = Vault.docPath(id);
    var payload = localPayload(path);
    if (!payload) {
      await loadScript(path + '?v=' + encodeURIComponent(id));
      payload = window.MW_FILE && window.MW_FILE[id];
      if (window.MW_FILE) delete window.MW_FILE[id];
    }
    if (!payload) throw new Error('File dokumen tidak ditemukan (mungkin belum terpublikasi)');
    var bytes = await Vault.decryptBytes(S.key, payload);
    var url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    S.docCache[id] = url;
    return url;
  }
  async function saveDocs(docs, changes, msg) {
    S.docs = docs;
    var idxPayload = await Vault.encrypt(S.key, docs);
    changes.files['data/docs.js'] = Vault.listFile('MW_DOCS', idxPayload, 'Daftar dokumen TKO & referensi');
    await queuePending(changes, [msg], null, null, { docs: docs });
    if (Store.load('ghToken')) await publish();
    else render();
  }
  async function uploadDoc() {
    var f = $('#docFile').files[0];
    if (!f) { toast('Pilih file PDF dulu', true); return; }
    if (!/pdf$/i.test(f.name) && f.type !== 'application/pdf') { toast('File harus PDF', true); return; }
    if (f.size > 40 * 1048576) { toast('Ukuran maksimal 40 MB', true); return; }
    var title = $('#docTitle').value.trim() || f.name.replace(/\.pdf$/i, '');
    loading('Mengenkripsi & menyimpan dokumen…');
    try {
      var id = 'doc-' + Date.now().toString(36);
      var payload = await Vault.encryptBytes(S.key, new Uint8Array(await f.arrayBuffer()));
      var meta = { id: id, title: title, no: $('#docNo').value.trim(), cat: $('#docCat').value, date: $('#docDate').value || null,
        desc: $('#docDesc').value.trim(), fileName: f.name, size: f.size, uploadedAt: new Date().toISOString(), by: S.user.name };
      S.docCache = S.docCache || {};
      S.docCache[id] = URL.createObjectURL(new Blob([f], { type: 'application/pdf' }));
      var changes = { files: {}, deletes: [], payloads: {} };
      changes.files[Vault.docPath(id)] = Vault.docFile(id, payload);
      changes.payloads[Vault.docPath(id)] = payload;
      await saveDocs([meta].concat(S.docs || []), changes, 'dokumen ' + title);
      toast('Dokumen ditambahkan: ' + title);
    } catch (e) {
      toast('Gagal upload dokumen: ' + e.message, true);
    } finally { loading(false); render(); }
  }
  function openViewer(d, url) {
    var v = $('#viewer');
    v.innerHTML = '<div class="viewer-bar"><div style="min-width:0"><b>' + esc(d.title) + '</b><div class="small" style="opacity:.75">' + esc([d.cat, d.no].filter(Boolean).join(' · ')) + '</div></div><span class="spacer"></span>' +
      '<a class="btn sm" href="' + url + '" download="' + esc(d.fileName || (d.title + '.pdf')) + '">Download</a>' +
      '<a class="btn sm" href="' + url + '" target="_blank" rel="noopener">Buka di tab baru</a>' +
      '<button class="btn sm" data-act="viewer-close">' + ICON.close + ' Tutup</button></div>' +
      '<div class="pdf-pages" id="pdfPages"><div class="pdf-msg">Memuat dokumen…</div></div>';
    v.classList.remove('hidden');
    renderPdf($('#pdfPages'), url).catch(function (e) {
      console.error(e);
      var box = $('#pdfPages');
      if (box) box.innerHTML = '<iframe src="' + url + '" title="' + esc(d.title) + '"></iframe>';
    });
  }
  // Render PDF dengan PDF.js agar preview jalan di semua browser (termasuk HP)
  function loadPdfJs() {
    if (window.pdfjsLib) return Promise.resolve();
    return loadScript('vendor/pdf.min.js').then(function () {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
    });
  }
  async function renderPdf(box, url) {
    await loadPdfJs();
    var pdf = await window.pdfjsLib.getDocument({ url: url }).promise;
    if (!box.isConnected) return;
    box.innerHTML = '';
    var width = Math.min(box.clientWidth - 24, 1000), dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (var i = 1; i <= pdf.numPages; i++) {
      if (!box.isConnected) return;
      var page = await pdf.getPage(i);
      var vp = page.getViewport({ scale: 1 });
      var scale = width / vp.width;
      var view2 = page.getViewport({ scale: scale * dpr });
      var c = document.createElement('canvas');
      c.width = view2.width; c.height = view2.height;
      c.style.width = width + 'px'; c.style.height = (vp.height * scale) + 'px';
      box.appendChild(c);
      await page.render({ canvasContext: c.getContext('2d'), viewport: view2 }).promise;
    }
    var end = document.createElement('div');
    end.className = 'pdf-msg';
    end.textContent = pdf.numPages + ' halaman';
    box.appendChild(end);
  }

  // ================= Halaman: Data =================
  var TYPE_LABEL = { stock: 'Stok — MB52 / ZMB52', oa: 'Kontrak — ME3N', mb51: 'Pemakaian — MB51' };
  var TYPE_SHORT = { stock: 'stok', oa: 'kontrak ME3N', mb51: 'pemakaian MB51' };
  function isOwner() { return !!(S.user && S.user.role === 'owner'); }
  function fmtDateTime(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    return d.getDate() + ' ' + BLN[d.getMonth()] + ' ' + d.getFullYear() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function pendingCount() {
    if (!S.pending) return 0;
    return Object.keys(S.pending.files).length + S.pending.deletes.length;
  }
  function pendingBanner() {
    if (!isOwner() || !S.pending) return '';
    var hasTok = !!Store.load('ghToken');
    return '<div class="card card-pad pending-banner"><div><b>Ada perubahan yang belum dipublikasikan</b> (' + esc((S.pending.msgs || []).join(', ')) + ').<div class="small muted">Saat ini perubahan hanya ada di browser ini. Publikasikan agar semua pengguna melihat data terbaru.</div></div>' +
      (hasTok ? '<button class="btn primary" data-act="publish">Publikasikan sekarang</button>'
        : '<a class="btn primary" href="#/pengaturan">Hubungkan GitHub dulu</a>') + '</div>';
  }
  function versionsCard(type) {
    var list = S.man.versions[type] || [];
    var rows = list.map(function (v, i) {
      var info = v.info || {};
      var det = type === 'stock' ? info.plants + ' plant · ' + nf0.format(info.rows || 0) + ' baris'
        : type === 'oa' ? nf0.format(info.rows || 0) + ' item kontrak'
          : nf0.format(info.materials || 0) + ' material · ' + fmtDate(info.min) + ' – ' + fmtDate(info.max);
      var unpub = S.pending && S.pending.files[Vault.snapPath(v.id)];
      return '<div class="ver' + (i === 0 ? ' active' : '') + '"><div class="toolbar" style="gap:6px"><b>Data ' + fmtDate(v.date) + '</b>' +
        (i === 0 ? '<span class="badge ok">Aktif dipakai</span>' : '<span class="badge">Versi sebelumnya</span>') +
        (unpub ? '<span class="badge warn">Belum dipublikasikan</span>' : '') + '</div>' +
        '<div class="small">' + esc(det) + '</div>' +
        '<div class="small muted">Upload ' + fmtDateTime(v.uploadedAt) + (v.by ? ' · ' + esc(v.by) : '') + '</div>' +
        '<div class="small mono muted" style="word-break:break-all">' + esc((v.files || []).join(', ')) + '</div></div>';
    }).join('') || '<div class="muted">Belum ada data</div>';
    return '<div class="card ds-card"><h4><i class="dot ' + (list.length ? 'on' : '') + '"></i>' + TYPE_LABEL[type] +
      '<span class="spacer"></span><span class="badge">' + list.length + '/' + Vault.KEEP_VERSIONS + ' versi</span></h4>' + rows + '</div>';
  }
  function renderData() {
    var owner = isOwner();
    view.innerHTML = pendingBanner() +
      (owner
        ? '<div class="dropzone" id="dropzone">' + ICON.upload + '<h3>Upload / update data SAP</h3><div class="muted">Tarik &amp; lepas file Excel di sini atau klik untuk memilih — boleh beberapa file sekaligus (ZMB52/MB52, ME3N, MB51). Jenis file dikenali otomatis, tanggal dibaca dari nama file (contoh <span class="mono">10.15_ZMB52.xlsx</span> = 15 Okt).</div></div>'
        : '<div class="card card-pad muted">Hanya <b>Owner</b> yang dapat meng-upload data SAP. Di bawah ini versi data yang sedang dipakai website.</div>') +
      (S.lastLog ? '<div class="log" style="margin-top:14px">' + esc(S.lastLog) + '</div>' : '') +
      '<div class="ds-grid" style="margin-top:18px">' + Vault.TYPES.map(versionsCard).join('') + '</div>' +
      '<div class="card card-pad" style="margin-top:18px"><h4 class="section-title">Aturan penyimpanan versi</h4><ol class="steps">' +
      '<li>Setiap jenis data (stok, kontrak, pemakaian) disimpan <b>maksimal ' + Vault.KEEP_VERSIONS + ' versi</b>. Contoh: upload 15.10 → 16.10 → 17.10 (ketiganya disimpan) → upload 18.10 → versi 15.10 dihapus otomatis.</li>' +
      '<li>Website selalu memakai versi <b>terbaru</b>; versi sebelumnya disimpan sebagai cadangan.</li>' +
      '<li>Upload ulang dengan <b>tanggal yang sama</b> akan menggantikan versi tanggal itu (tidak menambah versi).</li>' +
      '<li><b>Stok</b>: cukup upload <b>ZMB52 All Field</b> → stok semua plant langsung terbaru. <b>ME3N</b>: upload file terbaru → kontrak diganti seluruhnya.</li>' +
      '<li><b>MB51</b>: cukup tarik periode terbaru saja (mis. 01.09 – 15.10). Data di periode itu diganti, data sebelumnya tetap → riwayat pemakaian otomatis tersambung.</li>' +
      '<li>Data tersimpan <b>terenkripsi</b> di repo GitHub dan hanya terbuka setelah login.</li></ol>' +
      (owner ? '<h4 class="section-title" style="margin-top:16px">Cara menyiapkan file dari SAP</h4><ol class="steps">' +
        '<li><b>Stok</b>: <span class="mono">ZMB52</span>/<span class="mono">MB52</span> plant Zona 1 (W101, W102, W802, W803, W104, …) → export Excel.</li>' +
        '<li><b>Kontrak</b>: <span class="mono">ME3N</span> (Purch. Org 2021) → export Excel.</li>' +
        '<li><b>Pemakaian</b>: <span class="mono">MB51</span> movement GI → export (file berisi pivot juga bisa).</li></ol>' : '') +
      '</div>';
  }

  // ================= Halaman: Pengaturan =================
  function renderSettings() {
    var st = S.settings, owner = isOwner();
    var years = [];
    var y0 = S.idx ? S.idx.dataYear : new Date().getFullYear();
    for (var y = y0; y >= y0 - 5; y--) years.push(y);
    var rows = st.fields.map(function (f, i) {
      return '<tr' + (f.main || f.home ? ' class="in-cart"' : '') + '><td class="c"><input type="radio" name="home" data-home="' + i + '"' + (f.home ? ' checked' : '') + '></td>' +
        '<td class="c"><input type="checkbox" data-fmain="' + i + '"' + (f.main || f.home ? ' checked' : '') + (f.home ? ' disabled' : '') + '></td>' +
        '<td><input class="input sm" style="width:90px" data-fzone="' + i + '" value="' + esc(f.zone || '') + '"></td>' +
        '<td><input class="input sm" data-fname="' + i + '" value="' + esc(f.name) + '"></td>' +
        '<td><input class="input sm mono" style="width:100%" data-fplants="' + i + '" value="' + esc(f.plants.join(', ')) + '"></td>' +
        '<td><button class="icon-btn" data-act="del-field" data-i="' + i + '">' + ICON.trash + '</button></td></tr>';
    }).join('');
    var known = S.idx ? S.idx.plantsAll.join(', ') : '-';
    var userRows = S.users.map(function (u) {
      var me = u.id === S.user.id;
      return '<tr><td><b>' + esc(u.name) + '</b>' + (me ? ' <span class="badge ro">Anda</span>' : '') + '</td><td>' + (u.role === 'owner' ? '<span class="badge ok">Owner</span>' : '<span class="badge">Viewer</span>') + '</td>' +
        '<td class="right">' + (me ? '' : '<button class="btn sm danger" data-act="del-user" data-id="' + esc(u.id) + '">' + ICON.trash + ' Hapus</button>') + '</td></tr>';
    }).join('');
    var tok = Store.load('ghToken');
    var ownerHtml = !owner ? '' :
      '<div class="card card-pad" style="margin-top:16px"><h4 class="section-title">Pengguna &amp; Login</h4>' +
      '<div class="table-wrap"><table class="grid"><thead><tr><th>Username</th><th>Peran</th><th></th></tr></thead><tbody>' + userRows + '</tbody></table></div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:18px;margin-top:14px">' +
      '<div><div style="font-weight:700;margin-bottom:6px">Tambah pengguna</div><div class="toolbar">' +
      '<input class="input sm" id="nuName" placeholder="Username" autocomplete="off">' +
      '<input class="input sm" id="nuPw" type="password" placeholder="Password" autocomplete="new-password">' +
      '<select class="select sm" id="nuRole"><option value="viewer">Viewer (lihat & buat Call Order)</option><option value="owner">Owner (bisa upload data)</option></select>' +
      '<button class="btn sm primary" data-act="add-user">Tambah</button></div></div>' +
      '<div><div style="font-weight:700;margin-bottom:6px">Ganti password saya</div><div class="toolbar">' +
      '<input class="input sm" id="cpPw" type="password" placeholder="Password baru" autocomplete="new-password">' +
      '<input class="input sm" id="cpPw2" type="password" placeholder="Ulangi password baru" autocomplete="new-password">' +
      '<button class="btn sm primary" data-act="change-pw">Simpan</button></div></div></div>' +
      '<div class="small muted" style="margin-top:10px">Perubahan pengguna/password ikut dipublikasikan ke website (perlu koneksi GitHub di bawah).</div></div>' +
      '<div class="card card-pad" style="margin-top:16px"><h4 class="section-title">Koneksi GitHub (agar upload langsung tampil untuk semua pengguna)</h4>' +
      '<div class="toolbar" style="margin-bottom:10px"><span>Status:</span>' + (tok ? '<span class="badge ok">Terhubung ke ' + esc(ghRepo()) + '</span>' : '<span class="badge warn">Belum terhubung</span>') + '</div>' +
      '<ol class="steps small"><li>Buka <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">GitHub › Fine-grained token baru</a> (login sebagai pemilik repo).</li>' +
      '<li>Isi <b>Token name</b> bebas (mis. "Material Warehouse"), <b>Expiration</b> sesuai kebutuhan (mis. 1 tahun).</li>' +
      '<li><b>Repository access</b> → <i>Only select repositories</i> → pilih <b>' + esc(ghRepo().split('/')[1]) + '</b>.</li>' +
      '<li><b>Permissions › Repository permissions › Contents</b> → <b>Read and write</b>.</li>' +
      '<li>Klik <b>Generate token</b>, salin token (diawali <span class="mono">github_pat_</span>), tempel di bawah lalu klik <b>Simpan &amp; Tes</b>.</li></ol>' +
      '<div class="toolbar" style="margin-top:8px"><input class="input sm mono" id="ghRepo" style="width:240px" value="' + esc(ghRepo()) + '" title="owner/nama-repo">' +
      '<input class="input sm mono masked" id="ghTok" type="text" name="gh-token-' + Date.now() + '" style="flex:1;min-width:260px" placeholder="' + (tok ? 'Token tersimpan — isi untuk mengganti' : 'github_pat_…') + '" autocomplete="off" autocapitalize="off" spellcheck="false" data-lpignore="true" data-1p-ignore>' +
      '<button class="btn sm primary" data-act="gh-save">Simpan &amp; Tes</button>' + (tok ? '<button class="btn sm danger" data-act="gh-remove">Putuskan</button>' : '') + '</div>' +
      '<div class="small muted" style="margin-top:8px">Token hanya disimpan di browser ini dan hanya punya akses ke repo tersebut.</div></div>';
    view.innerHTML =
      '<div class="card card-pad toolbar"><div><div class="small muted">Masuk sebagai</div><b style="font-size:16px">' + esc(S.user.name) + '</b> ' + (owner ? '<span class="badge ok">Owner</span>' : '<span class="badge">Viewer</span>') + '</div><span class="spacer"></span><button class="btn" data-act="logout">Keluar</button></div>' +
      ownerHtml + synCard() +
      '<div class="card card-pad" style="margin-top:16px"><h4 class="section-title">Field &amp; Kode Plant</h4>' +
      '<p class="muted small" style="margin-top:0">Field "Home" = field Anda (stok utama & pemakaian). Centang "Kolom utama" agar field tampil sebagai kolom di Cari Material (default: Lirik, Jambi, Pangkalan Susu). Field lain dicek lewat tombol <b>Cek field lain</b>. Satu field boleh punya beberapa plant, pisahkan dengan koma. Pengaturan ini berlaku di browser ini.</p>' +
      '<div class="table-wrap"><table class="grid"><thead><tr><th class="c">Home</th><th class="c">Kolom utama</th><th>Zona</th><th>Nama Field</th><th>Kode Plant</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<div class="toolbar" style="margin-top:10px"><button class="btn sm" data-act="add-field">+ Tambah Field</button><span class="small muted">Plant di data saat ini: <span class="mono">' + esc(known) + '</span></span></div></div>' +
      '<div class="card card-pad" style="margin-top:16px;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px">' +
      '<label><div class="small muted" style="font-weight:700;margin-bottom:4px">Saran qty: cover berapa bulan?</div><input class="input" type="number" min="1" max="24" id="setCover" value="' + esc(st.coverMonths) + '"><div class="small muted" style="margin-top:4px">Saran = rata-rata pemakaian/bulan × cover − stok ' + esc(homeName()) + '</div></label>' +
      '<label><div class="small muted" style="font-weight:700;margin-bottom:4px">Tahun kolom "History"</div><select class="select" id="setHist"><option value="">Otomatis (tahun lalu)</option>' + years.map(function (y) { return '<option' + (+st.historyYear === y ? ' selected' : '') + '>' + y + '</option>'; }).join('') + '</select></label></div>' +
      '<div class="toolbar" style="margin-top:16px"><button class="btn primary" data-act="save-settings">Simpan Pengaturan</button><button class="btn" data-act="reset-settings">Kembalikan default</button><span class="spacer"></span><button class="btn danger" data-act="wipe">' + ICON.trash + ' Kosongkan Call Order &amp; cache browser</button></div>';
  }
  function synCard() {
    var custom = customSynonyms(), learned = S.learnedSyn || [], builtin = window.MW_SYNONYMS_BUILTIN || [];
    var txt = custom.map(function (g) { return g.join(' = '); }).join('\n');
    return '<div class="card card-pad" style="margin-top:16px"><h4 class="section-title">Sinonim pencarian</h4>' +
      '<p class="muted small" style="margin-top:0">Saat mencari, istilah dalam satu kelompok dianggap sama — contoh mencari <b>KCL</b> juga menampilkan <b>POTASSIUM CHLORIDE</b>, mencari <b>majun</b> juga menampilkan <b>COTTON WASTE</b> &amp; <b>WIPING RAG</b>. ' +
      'Sudah ada <b>' + builtin.length + '</b> kelompok bawaan (Indonesia ↔ Inggris ↔ rumus kimia) dan <b>' + learned.length + '</b> kelompok yang dipelajari otomatis dari deskripsi SAP' +
      (learned.length ? ' (mis. ' + esc(learned.slice(0, 3).map(function (g) { return g[0] + ' = ' + g[1]; }).join('; ')) + ')' : '') + '.</p>' +
      (isOwner()
        ? '<div style="font-weight:700;margin-bottom:6px">Sinonim tambahan (berlaku untuk semua pengguna)</div>' +
          '<textarea class="input mono" id="synText" rows="6" style="width:100%;font-size:13px" placeholder="Satu kelompok per baris, pisahkan dengan =&#10;contoh:&#10;MAJUN = KAIN LAP = COTTON WASTE&#10;KCL = POTASSIUM CHLORIDE">' + esc(txt) + '</textarea>' +
          '<div class="toolbar" style="margin-top:8px"><button class="btn sm primary" data-act="save-syn">Simpan sinonim</button><span class="small muted">Satu baris = satu kelompok. Pisahkan istilah dengan tanda <span class="mono">=</span></span></div>'
        : (custom.length ? '<div class="small"><b>Sinonim tambahan dari Owner:</b><br>' + custom.map(function (g) { return esc(g.join(' = ')); }).join('<br>') + '</div>' : '')) +
      '<details style="margin-top:10px"><summary class="small" style="cursor:pointer;font-weight:700;color:var(--brand)">Lihat daftar sinonim bawaan &amp; otomatis</summary><div class="small mono" style="margin-top:8px;line-height:1.7;max-height:260px;overflow:auto">' +
      builtin.concat(learned).map(function (g) { return esc(g.join(' = ')); }).join('<br>') + '</div></details></div>';
  }
  function readSettingsForm() {
    var st = clone(S.settings);
    st.fields.forEach(function (f, i) {
      var n = $('[data-fname="' + i + '"]'), p = $('[data-fplants="' + i + '"]'), h = $('[data-home="' + i + '"]');
      var mn = $('[data-fmain="' + i + '"]'), z = $('[data-fzone="' + i + '"]');
      if (mn) f.main = mn.checked;
      if (z) f.zone = z.value.trim();
      if (n) f.name = n.value.trim() || f.name;
      if (p) f.plants = p.value.toUpperCase().split(/[\s,;\/]+/).filter(Boolean);
      if (h) f.home = h.checked;
    });
    var c = $('#setCover'); if (c) st.coverMonths = Math.max(1, +c.value || 3);
    var hy = $('#setHist'); if (hy) st.historyYear = hy.value ? +hy.value : null;
    return st;
  }

  // ================= Data: load, upload, rebuild =================
  function rebuild() {
    S.idx = Model.build(S.ds, S.settings);
    S.learnedSyn = Search.learn(S.idx.list.map(function (o) { return o.d; }));
    Search.setSynonyms((window.MW_SYNONYMS_BUILTIN || []).concat(customSynonyms(), S.learnedSyn));
  }
  function customSynonyms() { return localVal('synonyms') || window.MW_SYNONYMS || []; }
  function parseSynText(txt) {
    return String(txt || '').split('\n').map(function (line) {
      return line.split(/[=;|]/).map(function (x) { return x.trim().toUpperCase(); }).filter(Boolean);
    }).filter(function (g) { return g.length > 1; });
  }
  async function saveSynonyms(groups) {
    window.MW_SYNONYMS = groups;
    var file = '/* Sinonim pencarian tambahan (diisi Owner). Satu kelompok = istilah yang dianggap sama. */\nwindow.MW_SYNONYMS = ' + JSON.stringify(groups, null, 1) + ';\n';
    await queuePending({ files: { 'data/synonyms.js': file }, deletes: [] }, ['sinonim pencarian'], null, null, { synonyms: groups });
    rebuild();
    if (Store.load('ghToken')) await publish();
    else { toast('Sinonim disimpan di browser ini — publikasikan setelah GitHub terhubung'); render(); }
  }
  function parseInWorker(buf, name, lm) {
    function main() {
      return new Promise(function (resolve, reject) {
        setTimeout(function () {
          try { resolve(Parser.parseFile(XLSX, buf, name, lm)); } catch (e) { reject(e); }
        }, 60);
      });
    }
    if (location.protocol === 'file:' || typeof Worker === 'undefined') return main();
    return new Promise(function (resolve, reject) {
      var w;
      try { w = new Worker('js/worker.js?v=' + APP_VERSION); } catch (e) { main().then(resolve, reject); return; }
      w.onmessage = function (e) { w.terminate(); if (e.data.ok) resolve(e.data.res); else reject(new Error(e.data.error)); };
      w.onerror = function (e) { e.preventDefault(); w.terminate(); main().then(resolve, reject); };
      w.postMessage({ buf: buf, name: name, lastModified: lm });
    });
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = function () { s.remove(); resolve(); };
      s.onerror = function () { s.remove(); reject(new Error('Gagal memuat ' + src)); };
      document.head.appendChild(s);
    });
  }

  // Owner: upload Excel -> versi baru (terenkripsi) -> publikasi
  async function handleFiles(files) {
    files = Array.prototype.slice.call(files || []);
    if (!files.length) return;
    if (!isOwner()) { toast('Hanya Owner yang dapat meng-upload data', true); return; }
    var parsed = [], log = [];
    try {
      for (var i = 0; i < files.length; i++) {
        var f = files[i];
        loading('Membaca ' + f.name + ' (' + (i + 1) + '/' + files.length + ')… file MB51 besar bisa ±10–20 detik');
        try {
          var buf = await f.arrayBuffer();
          parsed.push(await parseInWorker(buf, f.name, f.lastModified));
        } catch (e) {
          log.push('✗ ' + f.name + ': ' + e.message);
        }
      }
      if (!parsed.length) { S.lastLog = log.join('\n'); return; }
      parsed.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
      var ds = clone(S.ds), touched = {};
      parsed.forEach(function (p) {
        var notes = Model.ingest(ds, p);
        log.push('✓ ' + p.name + ' (tanggal data ' + p.date + ')\n   ' + notes.join('\n   '));
        p.parts.forEach(function (pt) {
          var t = pt.type === 'me3n' ? 'oa' : pt.type === 'mb52' ? 'stock' : 'mb51';
          var x = touched[t] || (touched[t] = { date: p.date, files: [] });
          if (p.date > x.date) x.date = p.date;
          if (x.files.indexOf(p.name) < 0) x.files.push(p.name);
        });
      });
      loading('Mengenkripsi & menyimpan versi data…');
      var man = clone(S.man), changes = { files: {}, deletes: [], payloads: {} }, msgs = [];
      man.updatedAt = new Date().toISOString();
      for (var t in touched) {
        if (!ds[t]) continue;
        var id = t + '-' + touched[t].date + '-' + Date.now().toString(36);
        var payload = await Vault.encrypt(S.key, ds[t]);
        var removed = Vault.addVersion(man, t, {
          id: id, date: touched[t].date, uploadedAt: new Date().toISOString(), by: S.user.name,
          files: touched[t].files, info: Vault.summary(t, ds[t])
        });
        changes.files[Vault.snapPath(id)] = Vault.snapFile(id, payload);
        changes.payloads[Vault.snapPath(id)] = payload;
        removed.forEach(function (rid) {
          changes.deletes.push(Vault.snapPath(rid));
          log.push('   ↳ versi lama dihapus: ' + rid);
        });
        await Store.set('ds-' + t, { id: id, data: ds[t] });
        msgs.push(TYPE_SHORT[t] + ' ' + ddmm(touched[t].date));
      }
      changes.files['data/manifest.js'] = Vault.manifestFile(man);
      S.man = man; S.ds = ds;
      rebuild();
      await queuePending(changes, msgs, man);
      S.lastLog = log.join('\n');
      if (Store.load('ghToken')) await publish();
      else toast('Data tersimpan di browser ini. Hubungkan GitHub di Pengaturan agar tampil untuk semua pengguna.');
    } catch (e) {
      console.error(e);
      toast('Gagal memproses: ' + e.message, true);
    } finally {
      loading(false);
      render();
    }
  }

  // Perubahan yang belum/baru saja dipublikasikan (GitHub Pages perlu ±1–2 menit untuk tayang)
  function localPayload(path) {
    return (S.pending && S.pending.payloads[path]) || (S.recent && S.recent.payloads && S.recent.payloads[path]) || null;
  }
  function localVal(key) {
    if (S.pending && S.pending[key]) return S.pending[key];
    if (S.recent && S.recent[key]) return S.recent[key];
    return null;
  }
  async function rememberPublished(P) {
    var R = (await Store.get('recent')) || null;
    var merged = { at: Date.now(), payloads: Object.assign({}, R && Date.now() - R.at < RECENT_MS ? R.payloads : {}, P.payloads) };
    ['man', 'users', 'orders', 'docs', 'synonyms'].forEach(function (k) {
      if (P[k]) merged[k] = P[k];
      else if (R && Date.now() - R.at < RECENT_MS && R[k]) merged[k] = R[k];
    });
    S.recent = merged;
    await Store.set('recent', merged);
  }
  async function queuePending(changes, msgs, man, users, extra) {
    var P = S.pending || { files: {}, deletes: [], payloads: {}, msgs: [] };
    Object.keys(changes.files).forEach(function (path) {
      P.files[path] = changes.files[path];
      P.deletes = P.deletes.filter(function (d) { return d !== path; });
    });
    changes.deletes.forEach(function (path) {
      if (P.files[path]) delete P.files[path];
      else if (P.deletes.indexOf(path) < 0) P.deletes.push(path);
    });
    Object.assign(P.payloads, changes.payloads || {});
    Object.keys(P.payloads).forEach(function (path) { if (!P.files[path]) delete P.payloads[path]; });
    if (man) P.man = man;
    if (users) P.users = users;
    if (extra) Object.assign(P, extra);
    msgs.forEach(function (m) { if (P.msgs.indexOf(m) < 0) P.msgs.push(m); });
    S.pending = P;
    await Store.set('pending', P);
  }

  // ---------- GitHub ----------
  function ghRepo() {
    var saved = Store.load('ghRepo');
    if (saved) return saved;
    var h = location.hostname;
    if (/\.github\.io$/.test(h)) {
      var seg = location.pathname.split('/').filter(Boolean)[0];
      if (seg) return h.split('.')[0] + '/' + seg;
    }
    return DEFAULT_REPO;
  }
  async function gh(method, path, body, token) {
    var res = await fetch('https://api.github.com/repos/' + ghRepo() + path, {
      method: method,
      headers: { Authorization: 'Bearer ' + (token || Store.load('ghToken')), Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      body: body ? JSON.stringify(body) : undefined
    });
    var data = res.status === 204 ? null : await res.json().catch(function () { return null; });
    if (!res.ok) throw new Error((data && data.message) || ('HTTP ' + res.status));
    return data;
  }
  // Satu commit berisi semua file baru/diubah + file yang dihapus
  async function ghCommit(files, deletes, message) {
    var ref = await gh('GET', '/git/ref/heads/' + GH_BRANCH);
    var base = ref.object.sha;
    var commit = await gh('GET', '/git/commits/' + base);
    var tree = await gh('GET', '/git/trees/' + commit.tree.sha + '?recursive=1');
    var exists = {};
    tree.tree.forEach(function (e) { exists[e.path] = 1; });
    var entries = [];
    for (var path in files) {
      var blob = await gh('POST', '/git/blobs', { content: files[path], encoding: 'utf-8' });
      entries.push({ path: path, mode: '100644', type: 'blob', sha: blob.sha });
    }
    deletes.forEach(function (p) { if (exists[p]) entries.push({ path: p, mode: '100644', type: 'blob', sha: null }); });
    var nt = await gh('POST', '/git/trees', { base_tree: commit.tree.sha, tree: entries });
    var nc = await gh('POST', '/git/commits', { message: message, tree: nt.sha, parents: [base] });
    await gh('PATCH', '/git/refs/heads/' + GH_BRANCH, { sha: nc.sha });
  }
  async function publish() {
    if (!S.pending) return;
    if (!Store.load('ghToken')) { toast('Hubungkan GitHub dulu di Pengaturan', true); location.hash = '#/pengaturan'; return; }
    loading('Mempublikasikan ke website (GitHub)…');
    try {
      await ghCommit(S.pending.files, S.pending.deletes, 'Update data: ' + (S.pending.msgs || []).join(', '));
      await rememberPublished(S.pending);
      S.pending = null;
      await Store.del('pending');
      toast('Berhasil dipublikasikan. Website ter-update untuk semua pengguna ±1–2 menit lagi.');
    } catch (e) {
      toast('Gagal publikasi: ' + e.message + ' — perubahan tetap tersimpan, coba lagi nanti.', true);
    } finally {
      loading(false);
      render();
    }
  }

  // ---------- Pengguna ----------
  async function saveUsers(users, msg) {
    S.users = users;
    await queuePending({ files: { 'data/users.js': Vault.usersFile(users) }, deletes: [] }, [msg], null, users);
    if (Store.load('ghToken')) await publish();
    else { toast(msg + ' — tersimpan di browser ini, publikasikan setelah GitHub terhubung'); render(); }
  }

  // ---------- Login / sesi ----------
  function sessionGet() {
    try { var v = sessionStorage.getItem('mw:session') || localStorage.getItem('mw:session'); return v ? JSON.parse(v) : null; }
    catch (e) { return null; }
  }
  function sessionSet(sess, remember) {
    try { (remember ? localStorage : sessionStorage).setItem('mw:session', JSON.stringify(sess)); } catch (e) { /* abaikan */ }
  }
  function sessionClear() {
    try { sessionStorage.removeItem('mw:session'); localStorage.removeItem('mw:session'); } catch (e) { /* abaikan */ }
  }
  async function loadRepoMeta() {
    var t = Date.now();
    await loadScript('data/users.js?t=' + t).catch(function () {});
    await loadScript('data/manifest.js?t=' + t).catch(function () {});
    await loadScript('data/synonyms.js?t=' + t).catch(function () {});
    S.pending = (await Store.get('pending')) || null;
    var R = (await Store.get('recent')) || null;
    S.recent = R && Date.now() - R.at < RECENT_MS ? R : null;
    var repoMan = window.MW_MANIFEST || null, locMan = localVal('man');
    S.man = locMan && (!repoMan || locMan.updatedAt > repoMan.updatedAt) ? locMan : (repoMan || Vault.emptyManifest());
    S.users = (S.pending && S.pending.users) || (S.recent && S.recent.users) || window.MW_USERS || [];
  }
  async function loadData() {
    var ds = { stock: null, oa: null, mb51: null };
    for (var i = 0; i < Vault.TYPES.length; i++) {
      var type = Vault.TYPES[i], v = (S.man.versions[type] || [])[0];
      if (!v) continue;
      try {
        var cached = await Store.get('ds-' + type);
        if (cached && cached.id === v.id) { ds[type] = cached.data; continue; }
        loading('Memuat data ' + TYPE_SHORT[type] + ' ' + fmtDate(v.date) + '…');
        var payload = localPayload(Vault.snapPath(v.id));
        if (!payload) {
          await loadScript(Vault.snapPath(v.id) + '?v=' + encodeURIComponent(v.id));
          payload = window.MW_SNAP && window.MW_SNAP[v.id];
        }
        if (!payload) throw new Error('file data tidak ditemukan');
        ds[type] = await Vault.decrypt(S.key, payload);
        if (window.MW_SNAP) delete window.MW_SNAP[v.id];
        await Store.set('ds-' + type, { id: v.id, data: ds[type] });
      } catch (e) {
        console.error(e);
        toast('Gagal memuat data ' + TYPE_SHORT[type] + ': ' + e.message, true);
      }
    }
    S.ds = ds;
    S.orders = await loadList('orders', 'data/orders.js', 'MW_ORDERS');
    S.docs = await loadList('docs', 'data/docs.js', 'MW_DOCS');
    rebuild();
  }
  async function loadList(key, path, varName) {
    var loc = localVal(key);
    if (loc) return loc;
    try {
      window[varName] = null;
      await loadScript(path + '?t=' + Date.now());
      return window[varName] ? await Vault.decrypt(S.key, window[varName]) : [];
    } catch (e) { return []; }
  }
  function showLogin(err) {
    var el = $('#login');
    var icUser = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>';
    var icLock = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
    var icEye = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
    var feats = [
      [ICON.search, 'Pencarian pintar', 'KIMAP, deskripsi & sinonim — <i>kcl</i> = <i>potassium chloride</i>'],
      [ICON.box, 'Stok SAP per Field', 'Rantau, Lirik, Jambi, Pangsu &amp; field lain'],
      [ICON.doc, 'Kontrak OA / RO', 'Harga, sisa kontrak, tarik banyak item sekaligus'],
      [ICON.excel, 'Call Order ke MIM', 'RO &amp; BAU langsung jadi template Excel']
    ];
    el.innerHTML =
      '<div class="login-hero">' +
      '<div class="lg-bg" aria-hidden="true"><span class="blob b1"></span><span class="blob b2"></span><span class="blob b3"></span><span class="lg-grid"></span>' +
      '<span class="slash s1"></span><span class="slash s2"></span><span class="slash s3"></span></div>' +
      '<div class="lg-hero-inner">' +
      '<div class="lg-logo">' + Brand.full('anim', '#ffffff') + '</div>' +
      '<div class="lg-copy"><div class="lg-eyebrow">Supply Chain Management · Warehouse &amp; Distribution</div>' +
      '<h1>Material <span class="lg-grad">Warehouse</span></h1>' +
      '<p>Cari material, cek stok Zona 1, dan buat Call Order ke MIM — di satu tempat.</p></div>' +
      '<ul class="login-feats">' + feats.map(function (f, i) {
        return '<li style="animation-delay:' + (1.1 + i * 0.12).toFixed(2) + 's"><span class="fi">' + f[0] + '</span><span><b>' + f[1] + '</b><small>' + f[2] + '</small></span></li>';
      }).join('') + '</ul></div></div>' +
      '<div class="login-side"><form class="login-card" id="loginForm" autocomplete="on">' +
      '<div class="lc-logo">' + Brand.mark() + '</div>' +
      '<h2>Selamat datang</h2><p class="muted">Masuk dengan akun yang diberikan Owner.</p>' +
      '<label class="lbl" for="lgUser">Username</label>' +
      '<div class="field">' + icUser + '<input class="input" id="lgUser" name="username" autocomplete="username" placeholder="nama.pengguna" required></div>' +
      '<label class="lbl" for="lgPw">Password</label>' +
      '<div class="field">' + icLock + '<input class="input" id="lgPw" name="password" type="password" autocomplete="current-password" placeholder="••••••••" required>' +
      '<button type="button" class="eye" data-act="toggle-pw" title="Tampilkan password">' + icEye + '</button></div>' +
      '<label class="small remember"><input type="checkbox" id="lgRemember" checked> Ingat saya di perangkat ini</label>' +
      '<div class="lock-err" id="lgErr">' + esc(err || '') + '</div>' +
      '<button class="btn primary lg-btn" type="submit"><span>Masuk</span>' + ICON.arrow + '</button>' +
      (S.users.length ? '' : '<div class="small" style="color:var(--bad);margin-top:10px">Data pengguna belum tersedia (data/users.js).</div>') +
      '<div class="lc-foot"><span class="dot3"><i></i><i></i><i></i></span> Internal use only · Data terenkripsi</div>' +
      '</form></div>';
    el.classList.remove('hidden');
    setTimeout(function () { var i = $('#lgUser'); if (i) i.focus(); }, 50);
  }
  async function doLogin() {
    var u = $('#lgUser').value, p = $('#lgPw').value;
    $('#lgErr').textContent = '';
    loading('Memeriksa akun…');
    try {
      var r = await Vault.login(S.users, u, p);
      S.user = r.user; S.key = r.key;
      sessionSet({ user: r.user, key: Vault.toB64(r.key) }, $('#lgRemember').checked);
      $('#login').classList.add('hidden');
      $('#login').innerHTML = '';
      await startApp();
      toast('Selamat datang, ' + r.user.name);
    } catch (e) {
      loading(false);
      $('#lgErr').textContent = e.message;
    }
  }
  async function logout() {
    sessionClear();
    for (var i = 0; i < Vault.TYPES.length; i++) await Store.del('ds-' + Vault.TYPES[i]);
    S.user = null; S.key = null; S.ds = { stock: null, oa: null, mb51: null }; S.idx = null;
    closeDrawer();
    view.innerHTML = '';
    $('#cartbar').classList.add('hidden');
    showLogin();
  }
  async function startApp() {
    await loadData();
    loading(false);
    render();
  }

  // ================= Event handlers =================
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t.id === 'q') {
      S.q = t.value; S.limit = 60;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(renderResults, 120);
    } else if (t.id === 'oaq') {
      S.oaF.q = t.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(renderOACards, 150);
    } else if (t.id === 'oadq') {
      S.oaD.q = t.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () { renderOAItems($('#oaItems').getAttribute('data-po')); }, 150);
    } else if (t.id === 'ordQ') {
      S.ordQ = t.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () { renderOrders(); var i = $('#ordQ'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250);
    } else if (t.id === 'docQ') {
      S.docQ = t.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () { renderDocs(); var i = $('#docQ'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250);
    } else if (t.id === 'coTitle') {
      S.cart.meta.title = t.value; saveCart();
    } else if (t.id === 'coYear') {
      S.cart.meta.year = +t.value || new Date().getFullYear(); saveCart();
    } else if (t.classList.contains('group-title')) {
      S.cart.groupTitles[t.getAttribute('data-po')] = t.value; saveCart();
    } else if (t.hasAttribute('data-oaqty')) {
      var m = t.getAttribute('data-oaqty'), key = t.getAttribute('data-key');
      var it = item(m, true), v = numVal(t.value);
      if (v > 0 && !(it.ro.on && it.ro.oa === key)) {
        setRO(m, true, key);
        var cb = t.closest('tr').querySelector('[data-pick="ro"]'); if (cb) cb.checked = true;
        t.closest('tr').classList.add('in-cart');
      }
      if (it.ro.oa === key) { it.ro.qty = v; saveCart(); }
    } else {
      var tr = t.closest('#roTable tr[data-m], #bauTable tr[data-m]');
      if (!tr) return;
      var it2 = item(tr.getAttribute('data-m'));
      if (!it2) return;
      var f = t.getAttribute('data-f');
      if (f === 'qty') {
        it2.ro.qty = numVal(t.value);
        var o = S.idx.mats.get(it2.m), l = lineOf(o, it2.ro.oa);
        var cell = tr.querySelector('[data-total]');
        if (cell) cell.textContent = it2.ro.qty > 0 && l ? fmtMoney(it2.ro.qty * l.price, l.cur) : '—';
        saveCart(); refreshCOTotals();
      } else if (f === 'actual') { it2.ro.actual = numVal(t.value); saveCart(); }
      else if (f === 'note') { it2.ro.note = t.value; saveCart(); }
      else if (f === 'baunote') { it2.bau.note = t.value; saveCart(); }
      else if (t.hasAttribute('data-alloc')) {
        var v2 = numVal(t.value);
        if (v2 > 0) it2.bau.alloc[t.getAttribute('data-alloc')] = v2; else delete it2.bau.alloc[t.getAttribute('data-alloc')];
        var sum = 0; Object.keys(it2.bau.alloc).forEach(function (k) { sum += it2.bau.alloc[k]; });
        var tt = tr.querySelector('[data-bautotal]'); if (tt) tt.textContent = fmtQ(sum);
        t.closest('.alloc-item').classList.toggle('has', v2 > 0);
        saveCart(); refreshCOTotals();
      }
    }
  });

  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.hasAttribute('data-pick')) {
      var m = t.getAttribute('data-m'), kind = t.getAttribute('data-pick');
      if (kind === 'ro') setRO(m, t.checked, t.getAttribute('data-key'));
      else setBAU(m, t.checked);
      var r = currentRoute().name;
      // sinkronkan tampilan
      $$('[data-pick="' + kind + '"][data-m="' + CSS.escape(m) + '"]').forEach(function (cb) {
        if (cb !== t && !cb.hasAttribute('data-key')) cb.checked = t.checked;
      });
      var row = t.closest('tr');
      if (row && r === 'cari') row.classList.toggle('in-cart', active(item(m)));
      if (r === 'kontrak' && $('#oaItems')) renderOAItems($('#oaItems').getAttribute('data-po'));
      if (r === 'call-order') renderCO();
      if ($('#drawer').classList.contains('open') && $('#drawer').getAttribute('data-m') === m && !t.closest('#drawer')) openDrawer(m);
      if (t.checked) toast((kind === 'ro' ? 'RO' : 'BAU') + ' ditambahkan: ' + (S.idx.mats.get(m).d || m));
    } else if (t.getAttribute('data-f') === 'oa') {
      var tr = t.closest('tr'), it = item(tr.getAttribute('data-m'));
      it.ro.oa = t.value; saveCart(); renderCO();
    } else if (t.id === 'coMonth') {
      S.cart.meta.month = +t.value;
      if (S.cart.meta.title && /ZONA 1 - [A-Z]+$/.test(S.cart.meta.title)) S.cart.meta.title = null;
      saveCart(); renderCO();
    } else if (t.id === 'agingSel') { S.aging = t.value; S.limit = 60; renderResults(); }
    else if (t.id === 'ordStatus') { S.ordStatus = t.value; renderOrders(); }
    else if (t.hasAttribute('data-ordstatus')) {
      var oid = t.getAttribute('data-ordstatus');
      var nl = (S.orders || []).map(function (r) { return r.id === oid ? Object.assign({}, r, { status: t.value }) : r; });
      saveOrders(nl, 'status ' + oid + ': ' + t.value).then(function () { toast('Status ' + oid + ' → ' + t.value); });
    }
    else if (t.id === 'docFile' && t.files[0] && !$('#docTitle').value) { $('#docTitle').value = t.files[0].name.replace(/\.pdf$/i, '').replace(/[_]+/g, ' '); }
    else if (t.id === 'oapg') { S.oaF.pg = t.value; renderOACards(); }
    else if (t.id === 'oasort') { S.oaF.sort = t.value; renderOACards(); }
    else if (t.getAttribute('data-act') === 'drawer-all') { S.drawerAll = t.checked; openDrawer($('#drawer').getAttribute('data-m')); }
    else if (t.id === 'fileInput') { handleFiles(t.files); t.value = ''; }
  });

  document.addEventListener('click', function (e) {
    var t = e.target;
    var chip = t.closest('[data-filter]');
    if (chip) { var k = chip.getAttribute('data-filter'); S.filters[k] = !S.filters[k]; chip.classList.toggle('on', S.filters[k]); S.limit = 60; renderResults(); return; }
    var oaf = t.closest('[data-oafilter]');
    if (oaf) { S.oaF.active = !S.oaF.active; oaf.classList.toggle('on', S.oaF.active); renderOACards(); return; }
    var oad = t.closest('[data-oad]');
    if (oad) { var k2 = oad.getAttribute('data-oad'); S.oaD[k2] = !S.oaD[k2]; oad.classList.toggle('on', S.oaD[k2]); renderOAItems($('#oaItems').getAttribute('data-po')); return; }
    var ex = t.closest('[data-ex]');
    if (ex) { e.preventDefault(); S.q = ex.getAttribute('data-ex'); $('#q').value = S.q; renderResults(); return; }
    if (t.closest('#dropzone')) { $('#fileInput').click(); return; }
    if (!t.closest('#popover') && !t.closest('[data-act="other"]')) closePop();
    var dc = t.closest('[data-doccat]');
    if (dc) { S.docCat = dc.getAttribute('data-doccat'); renderDocs(); return; }
    if (t.closest('#scrim')) { closeDrawer(); return; }

    var a = t.closest('[data-act]');
    if (a) {
      var act = a.getAttribute('data-act');
      if (act === 'more') { S.limit += 60; renderResults(); }
      else if (act === 'close-drawer') closeDrawer();
      else if (act === 'detail') { e.preventDefault(); openDrawer(a.getAttribute('data-m')); }
      else if (act === 'copy') { navigator.clipboard && navigator.clipboard.writeText(a.getAttribute('data-text')).then(function () { toast('KIMAP disalin'); }); }
      else if (act === 'use-oa') {
        var mm = a.getAttribute('data-m');
        setRO(mm, true, a.getAttribute('data-key'));
        openDrawer(mm);
        toast('RO memakai OA ' + a.getAttribute('data-key').split('/')[0]);
        if (currentRoute().name === 'cari') renderResults();
        if (currentRoute().name === 'call-order') renderCO();
      }
      else if (act === 'check-all' || act === 'uncheck-all') {
        var h = S.idx.oaMap.get(a.getAttribute('data-po'));
        var lines = oaVisibleLines(h), n = 0;
        lines.forEach(function (l) {
          var it = item(l.m);
          if (act === 'check-all') { if (!(it && it.ro.on && it.ro.oa === l.key)) { setRO(l.m, true, l.key); n++; } }
          else if (it && it.ro.on && it.ro.oa === l.key) { setRO(l.m, false); n++; }
        });
        renderOAItems(h.po);
        toast(n + ' item ' + (act === 'check-all' ? 'ditambahkan ke' : 'dihapus dari') + ' RO');
      }
      else if (act === 'sug') {
        var inp = a.parentNode.querySelector('input');
        inp.value = a.getAttribute('data-v');
        inp.dispatchEvent(new Event('input', { bubbles: true }));
      }
      else if (act === 'remove') { delete S.cart.items[a.getAttribute('data-m')]; saveCart(); renderCO(); }
      else if (act === 'clear-co') {
        if (confirm('Kosongkan semua material di Call Order?')) { S.cart.items = {}; saveCart(); renderCO(); }
      }
      else if (act === 'export') {
        var co = buildCO();
        loading('Menyiapkan file Excel…');
        Exporter.exportCallOrder(co).then(function (fn) {
          return recordOrder(co).then(function (rec) { toast('File dibuat: ' + fn + ' — tercatat di Riwayat Order (' + rec.id + ')'); });
        })
          .catch(function (err) { console.error(err); toast('Gagal export: ' + err.message, true); })
          .then(function () { loading(false); });
      }
      else if (act === 'add-field') { S.settings = readSettingsForm(); S.settings.fields.push({ name: 'Field baru', zone: '', plants: [], main: false }); renderSettings(); }
      else if (act === 'del-field') { S.settings = readSettingsForm(); S.settings.fields.splice(+a.getAttribute('data-i'), 1); renderSettings(); }
      else if (act === 'save-settings') {
        var st = readSettingsForm();
        if (!st.fields.some(function (f) { return f.home; }) && st.fields.length) st.fields[0].home = true;
        S.settings = st; Store.save('settings', st); rebuild(); toast('Pengaturan disimpan'); render();
      }
      else if (act === 'reset-settings') { S.settings = clone(Model.DEFAULT_SETTINGS); Store.save('settings', S.settings); rebuild(); render(); toast('Pengaturan dikembalikan ke default'); }
      else if (act === 'logout') { logout(); }
      else if (act === 'toggle-pw') { var pw = $('#lgPw'); pw.type = pw.type === 'password' ? 'text' : 'password'; a.classList.toggle('on', pw.type === 'text'); }
      else if (act === 'save-syn') {
        var groups = parseSynText($('#synText').value);
        loading('Menyimpan sinonim…');
        saveSynonyms(groups).then(function () { toast(groups.length + ' kelompok sinonim tersimpan'); })
          .catch(function (err) { toast(err.message, true); }).then(function () { loading(false); });
      }
      else if (act === 'other') { e.stopPropagation(); showOther(a, a.getAttribute('data-m')); }
      else if (act === 'close-pop') closePop();
      else if (act === 'ord-toggle') { S.ordOpen = S.ordOpen === a.getAttribute('data-id') ? null : a.getAttribute('data-id'); renderOrders(); }
      else if (act === 'ord-excel' || act === 'ord-copy' || act === 'ord-del') {
        var rid = a.getAttribute('data-id');
        var rec = allOrders().filter(function (r) { return r.id === rid; })[0];
        if (!rec) return;
        if (act === 'ord-excel') {
          loading('Menyiapkan file Excel…');
          Exporter.exportCallOrder(recToCo(rec)).then(function (fn) { toast('File dibuat: ' + fn); })
            .catch(function (err) { toast('Gagal export: ' + err.message, true); }).then(function () { loading(false); });
        } else if (act === 'ord-copy') {
          if (!confirm('Salin ' + rid + ' ke Call Order? Isi Call Order yang sama akan ditimpa.')) return;
          var nn = copyOrderToCart(rec);
          toast(nn + ' baris disalin ke Call Order');
          location.hash = '#/call-order';
        } else {
          if (!confirm('Hapus ' + rid + ' dari riwayat?')) return;
          if (rec.local) { Store.save('localOrders', (Store.load('localOrders', []) || []).filter(function (r) { return r.id !== rid; })); renderOrders(); }
          else saveOrders(S.orders.filter(function (r) { return r.id !== rid; }), 'hapus order ' + rid).then(renderOrders);
        }
      }
      else if (act === 'doc-upload') { uploadDoc(); }
      else if (act === 'doc-view' || act === 'doc-dl') {
        var did0 = a.getAttribute('data-id'), dmeta = (S.docs || []).filter(function (x) { return x.id === did0; })[0];
        loading('Membuka dokumen…');
        docBlob(did0).then(function (url) {
          if (act === 'doc-view') openViewer(dmeta, url);
          else { var dl = document.createElement('a'); dl.href = url; dl.download = dmeta.fileName || (dmeta.title + '.pdf'); document.body.appendChild(dl); dl.click(); dl.remove(); }
        }).catch(function (err) { toast(err.message, true); }).then(function () { loading(false); });
      }
      else if (act === 'doc-del') {
        var did1 = a.getAttribute('data-id'), dm = (S.docs || []).filter(function (x) { return x.id === did1; })[0];
        if (!dm || !confirm('Hapus dokumen "' + dm.title + '"?')) return;
        loading('Menghapus dokumen…');
        saveDocs(S.docs.filter(function (x) { return x.id !== did1; }), { files: {}, deletes: [Vault.docPath(did1)], payloads: {} }, 'hapus dokumen ' + dm.title)
          .then(function () { toast('Dokumen dihapus'); }).catch(function (err) { toast(err.message, true); }).then(function () { loading(false); render(); });
      }
      else if (act === 'viewer-close') { $('#viewer').classList.add('hidden'); $('#viewer').innerHTML = ''; }
      else if (act === 'publish') { publish(); }
      else if (act === 'gh-save') {
        var repo = $('#ghRepo').value.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, '');
        var tokIn = $('#ghTok').value.trim() || Store.load('ghToken');
        if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) { toast('Format repo harus owner/nama-repo', true); return; }
        if (!tokIn) { toast('Tempel token GitHub dulu', true); return; }
        Store.save('ghRepo', repo);
        loading('Mengecek koneksi GitHub…');
        gh('GET', '', null, tokIn).then(function (info) {
          if (!info.permissions || !info.permissions.push) throw new Error('Token tidak punya izin menulis (Contents: Read and write)');
          Store.save('ghToken', tokIn);
          toast('GitHub terhubung: ' + info.full_name);
          if (S.pending) return publish();
        }).catch(function (err) { toast('Koneksi gagal: ' + err.message, true); })
          .then(function () { loading(false); render(); });
      }
      else if (act === 'gh-remove') { Store.save('ghToken', null); toast('Koneksi GitHub diputus di browser ini'); render(); }
      else if (act === 'add-user') {
        var nu = $('#nuName').value.trim(), np = $('#nuPw').value, nr = $('#nuRole').value;
        if (nu.length < 3 || np.length < 6) { toast('Username min. 3 karakter, password min. 6 karakter', true); return; }
        loading('Menambah pengguna…');
        Vault.hashUser(nu).then(function (h) {
          if (S.users.some(function (x) { return x.id === h; })) throw new Error('Username sudah ada');
          return Vault.makeUser(nu, np, nr, S.key);
        }).then(function (entry) {
          loading(false);
          return saveUsers(S.users.concat([entry]), 'pengguna ' + entry.name + ' ditambahkan');
        }).catch(function (err) { loading(false); toast(err.message, true); });
      }
      else if (act === 'del-user') {
        var did = a.getAttribute('data-id');
        var du = S.users.filter(function (x) { return x.id === did; })[0];
        if (!du || !confirm('Hapus pengguna ' + du.name + '?')) return;
        saveUsers(S.users.filter(function (x) { return x.id !== did; }), 'pengguna ' + du.name + ' dihapus');
      }
      else if (act === 'change-pw') {
        var c1 = $('#cpPw').value, c2 = $('#cpPw2').value;
        if (c1.length < 6) { toast('Password minimal 6 karakter', true); return; }
        if (c1 !== c2) { toast('Konfirmasi password tidak sama', true); return; }
        var me = S.users.filter(function (x) { return x.id === S.user.id; })[0];
        loading('Menyimpan password…');
        Vault.makeUser(me.name, c1, me.role, S.key).then(function (entry) {
          loading(false);
          return saveUsers(S.users.map(function (x) { return x.id === me.id ? entry : x; }), 'password ' + me.name + ' diganti');
        }).catch(function (err) { loading(false); toast(err.message, true); });
      }
      else if (act === 'wipe') {
        if (!confirm('Kosongkan Call Order dan muat ulang data dari website?')) return;
        S.cart = { items: {}, meta: {}, groupTitles: {} }; saveCart();
        Promise.all(Vault.TYPES.map(function (k3) { return Store.del('ds-' + k3); })).then(function () {
          loading('Memuat ulang data…'); return startApp();
        });
      }
      return;
    }

    // klik baris hasil pencarian -> detail
    var row = t.closest('#resTable tbody tr.clickable');
    if (row && !t.closest('a, label, input, button')) openDrawer(row.getAttribute('data-m'));
  });

  // drag & drop
  document.addEventListener('dragover', function (e) {
    var dz = $('#dropzone');
    e.preventDefault();
    if (dz) dz.classList.add('drag');
  });
  document.addEventListener('dragleave', function (e) {
    var dz = $('#dropzone');
    if (dz && !e.relatedTarget) dz.classList.remove('drag');
  });
  document.addEventListener('submit', function (e) {
    if (e.target.id === 'loginForm') { e.preventDefault(); doLogin(); }
  });
  document.addEventListener('drop', function (e) {
    e.preventDefault();
    if (!isOwner()) return;
    var dz = $('#dropzone'); if (dz) dz.classList.remove('drag');
    if (e.dataTransfer && e.dataTransfer.files.length) {
      if (currentRoute().name !== 'data') location.hash = '#/data';
      handleFiles(e.dataTransfer.files);
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeDrawer(); closePop(); var vw = $('#viewer'); if (!vw.classList.contains('hidden')) { vw.classList.add('hidden'); vw.innerHTML = ''; } }
    if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) {
      e.preventDefault();
      if (currentRoute().name !== 'cari') location.hash = '#/cari';
      setTimeout(function () { var q = $('#q'); if (q) q.focus(); }, 30);
    }
  });

  window.addEventListener('hashchange', render);

  // ================= Start =================
  (async function init() {
    loading('Memuat…');
    ['stock', 'oa', 'mb51'].forEach(function (k) { Store.del(k); }); // sisa versi lama
    await loadRepoMeta();
    var sess = sessionGet();
    if (sess && sess.user) {
      var u = S.users.filter(function (x) { return x.id === sess.user.id; })[0];
      if (u) { S.user = { id: u.id, name: u.name, role: u.role }; S.key = Vault.fromB64(sess.key); }
      else sessionClear();
    }
    if (!S.user) { loading(false); showLogin(); return; }
    await startApp();
  })();
})();
