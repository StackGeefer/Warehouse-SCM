/*
 * Angkutan Berat (Heavy Transport): Reservasi Armada & Riwayat Armada.
 *
 * - Hanya angkutan berat (Crane, Picker/TMC, Tronton, Trailer, Vacuum Truck), bukan KRP.
 * - Master armada/driver/helper: data/fleet/master.js (terenkripsi).
 * - Reservasi disimpan per bulan: data/fleet/YYYY-MM.js (terenkripsi), maks. 6 bulan terakhir;
 *   bulan ke-7 masuk => bulan paling lama dihapus otomatis. data/fleet/index.js = daftar bulan (tidak rahasia).
 * - Tulis data selalu membaca versi terbaru langsung dari GitHub lalu menggabungkan (beberapa pengguna
 *   bisa submit bersamaan tanpa saling menimpa).
 */
(function (root) {
  'use strict';
  var KEEP_MONTHS = 6;
  var DIR = 'data/fleet/';
  // Tanpa approval: reservasi langsung Terjadwal (diisi oleh peran Angkutan)
  var STATUS = ['Terjadwal', 'Selesai', 'Dibatalkan'];
  var STATUS_CLS = { 'Terjadwal': 'ok', 'Selesai': 'ro', 'Dibatalkan': '' };
  var OLD_STATUS = { 'Menunggu Approval': 'Terjadwal', 'Disetujui': 'Terjadwal', 'Ditolak': 'Dibatalkan' };
  var BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  var ACTIVE = { 'Terjadwal': 1, 'Selesai': 1 };
  var OTHER = '__other';
  function norm(list) { return (list || []).map(function (r) { return OLD_STATUS[r.status] ? Object.assign({}, r, { status: OLD_STATUS[r.status] }) : r; }); }

  root.FleetModule = function (ctx) {
    var S = ctx.S, esc = ctx.esc, toast = ctx.toast, loading = ctx.loading, Vault = ctx.Vault, gh = ctx.gh;
    var F = S.fleet = { master: null, index: null, months: {}, sel: null, filt: { jenis: '', status: '', q: '' }, date: today() };

    function $(s) { return document.querySelector(s); }
    function view() { return document.getElementById('view'); }
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    function today() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    function monthOf(date) { return String(date || '').slice(0, 7); }
    function monthName(m) { return m ? BULAN[+m.slice(5, 7) - 1] + ' ' + m.slice(0, 4) : '—'; }
    function fmtDate(s) { if (!s) return '—'; var p = s.split('-'); return +p[2] + ' ' + BULAN[+p[1] - 1].slice(0, 3) + ' ' + p[0]; }
    function fmtTime(iso) { if (!iso) return ''; var d = new Date(iso); return d.getDate() + ' ' + BULAN[d.getMonth()].slice(0, 3) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
    function nf(n) { return n == null || n === '' ? '—' : new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(n); }
    function me() { return S.user ? S.user.name : ''; }
    function isAdmin() { return ctx.canAdminFleet(); }
    function badge(st) { return '<span class="badge ' + (STATUS_CLS[st] || '') + '">' + esc(st) + '</span>'; }

    // ---------- Baca file dari GitHub (selalu terbaru) atau GitHub Pages ----------
    function b64text(b64) {
      var bin = atob(String(b64).replace(/\s/g, '')), u8 = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      return new TextDecoder().decode(u8);
    }
    function payloadOf(text) { var m = /"(MWK1\.[^"]+)"/.exec(text || ''); return m ? m[1] : null; }
    function indexOf(text) {
      var m = /=\s*(\{[\s\S]*\})\s*;?\s*$/.exec(text || '');
      try { return m ? JSON.parse(m[1]) : null; } catch (e) { return null; }
    }
    async function readText(path) {
      if (ctx.ghToken()) {
        try {
          var r = await gh('GET', '/contents/' + path + '?ref=' + ctx.branch + '&t=' + Date.now());
          return r && r.content != null ? b64text(r.content) : null;
        } catch (e) {
          if (/not found/i.test(e.message)) return null;
          throw e;
        }
      }
      var res = await fetch(path + '?t=' + Date.now(), { cache: 'no-store' });
      return res.ok ? res.text() : null;
    }
    async function loadMaster(force) {
      if (F.master && !force) return F.master;
      var p = payloadOf(await readText(DIR + 'master.js'));
      F.master = p ? await Vault.decrypt(S.key, p) : emptyMaster();
      return F.master;
    }
    async function loadIndex(force) {
      if (F.index && !force) return F.index;
      F.index = indexOf(await readText(DIR + 'index.js')) || { months: [], exported: {} };
      F.index.exported = F.index.exported || {};
      return F.index;
    }
    async function loadMonth(m, force) {
      if (F.months[m] && !force) return F.months[m];
      var p = payloadOf(await readText(DIR + m + '.js'));
      F.months[m] = p ? norm(await Vault.decrypt(S.key, p)) : [];
      return F.months[m];
    }
    function emptyMaster() { return { units: [], drivers: [], helpers: [], fungsi: ['WO', 'WS', 'PE', 'RAM', 'HSSE', 'SCM', 'Finance', 'LR'], types: [] }; }

    // ---------- Tulis (atomik: baca terbaru dari GitHub -> gabung -> commit; ulang bila bentrok) ----------
    function monthFile(m, payload) {
      return '/* Reservasi Angkutan Berat ' + m + ' — TERENKRIPSI */\nwindow.MW_FLEET_MONTH = window.MW_FLEET_MONTH || {};\nwindow.MW_FLEET_MONTH[' + JSON.stringify(m) + '] = ' + JSON.stringify(payload) + ';\n';
    }
    function masterFile(payload) { return '/* Master armada, driver & helper Angkutan Berat — TERENKRIPSI */\nwindow.MW_FLEET_MASTER = ' + JSON.stringify(payload) + ';\n'; }
    function indexFile(idx) { return '/* Daftar bulan data Angkutan Berat (maks. ' + KEEP_MONTHS + ' bulan) */\nwindow.MW_FLEET_INDEX = ' + JSON.stringify(idx) + ';\n'; }

    // ch = { months: { 'YYYY-MM': function (list) { return list } }, master: obj, exported: 'YYYY-MM' }
    async function commit(ch, message) {
      if (!ctx.ghToken()) throw new Error('Akun ini belum punya akses publikasi. Minta Owner Utama mengatur akses Anda.');
      for (var attempt = 0; attempt < 4; attempt++) {
        var ref = await gh('GET', '/git/ref/heads/' + ctx.branch);
        var base = ref.object.sha;
        var cm = await gh('GET', '/git/commits/' + base);
        var tree = await gh('GET', '/git/trees/' + cm.tree.sha + '?recursive=1');
        var sha = {};
        tree.tree.forEach(function (e) { sha[e.path] = e.sha; });
        var fresh = async function (path) {
          if (!sha[path]) return null;
          var b = await gh('GET', '/git/blobs/' + sha[path]);
          return b64text(b.content);
        };
        var idx = indexOf(await fresh(DIR + 'index.js')) || { months: [], exported: {} };
        idx.exported = idx.exported || {};
        var months = {};
        Object.keys(sha).forEach(function (p) { var mm = /^data\/fleet\/(\d{4}-\d{2})\.js$/.exec(p); if (mm) months[mm[1]] = 1; });
        var files = {}, lists = {};
        var mkeys = Object.keys(ch.months || {});
        for (var i = 0; i < mkeys.length; i++) {
          var m = mkeys[i], p = payloadOf(await fresh(DIR + m + '.js'));
          var list = p ? norm(await Vault.decrypt(S.key, p)) : [];
          list = ch.months[m](list.slice()) || list;
          lists[m] = list;
          files[DIR + m + '.js'] = monthFile(m, await Vault.encrypt(S.key, list));
          months[m] = 1;
        }
        if (ch.master) files[DIR + 'master.js'] = masterFile(await Vault.encrypt(S.key, ch.master));
        if (ch.exported) idx.exported[ch.exported] = { at: new Date().toISOString(), by: me() };
        // simpan maks. 6 bulan terakhir
        var all = Object.keys(months).sort().reverse(), keep = all.slice(0, KEEP_MONTHS), drop = all.slice(KEEP_MONTHS);
        drop.forEach(function (m) { delete idx.exported[m]; });
        idx.months = keep.slice().sort();
        idx.updatedAt = new Date().toISOString();
        files[DIR + 'index.js'] = indexFile(idx);
        var entries = [];
        for (var path in files) {
          var blob = await gh('POST', '/git/blobs', { content: files[path], encoding: 'utf-8' });
          entries.push({ path: path, mode: '100644', type: 'blob', sha: blob.sha });
        }
        drop.forEach(function (m) { if (sha[DIR + m + '.js']) entries.push({ path: DIR + m + '.js', mode: '100644', type: 'blob', sha: null }); });
        var nt = await gh('POST', '/git/trees', { base_tree: cm.tree.sha, tree: entries });
        var nc = await gh('POST', '/git/commits', { message: message, tree: nt.sha, parents: [base] });
        try {
          await gh('PATCH', '/git/refs/heads/' + ctx.branch, { sha: nc.sha });
        } catch (e) {
          if (/fast forward|422|conflict/i.test(e.message) && attempt < 3) continue; // ada commit lain, ulang dengan data terbaru
          throw e;
        }
        Object.keys(lists).forEach(function (m) { F.months[m] = lists[m]; });
        drop.forEach(function (m) { delete F.months[m]; });
        if (ch.master) F.master = ch.master;
        F.index = idx;
        if (ctx.refreshSide) ctx.refreshSide();
        return { dropped: drop };
      }
      throw new Error('Gagal menyimpan, coba lagi');
    }

    // ---------- Master data ----------
    function types() {
      var M = F.master, seen = {}, out = [];
      (M.types && M.types.length ? M.types : M.units.map(function (u) { return u.type; })).forEach(function (t) { if (t && !seen[t]) { seen[t] = 1; out.push(t); } });
      return out;
    }
    function unitById(id) { return (F.master.units || []).filter(function (u) { return u.id === id; })[0] || null; }
    function unitLabel(u) { return u ? [u.id, u.nopol, u.cap ? u.cap + ' T' : ''].filter(Boolean).join(' · ') : '—'; }
    function peopleOpts(list, type, sel, emptyLabel) {
      var a = list.filter(function (p) { return p.type === type; }), b = list.filter(function (p) { return p.type !== type; });
      var known = list.some(function (p) { return p.name === sel; }), isOther = sel === OTHER || (sel && !known);
      function o(p) { return '<option' + (p.name === sel ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }
      return '<option value="">' + esc(emptyLabel) + '</option>' +
        (a.length ? '<optgroup label="' + esc(type || 'Semua') + '">' + a.map(o).join('') + '</optgroup>' : '') +
        (b.length ? '<optgroup label="' + (a.length ? 'Jenis lain' : 'Semua') + '">' + b.map(o).join('') + '</optgroup>' : '') +
        '<option value="' + OTHER + '"' + (isOther ? ' selected' : '') + '>Other (ketik sendiri)…</option>';
    }
    // select + kotak ketik untuk pilihan Other
    function personField(name, list, type, sel, emptyLabel, required) {
      var known = list.some(function (p) { return p.name === sel; }), isOther = sel === OTHER || (sel && !known);
      return '<select class="select" name="' + name + '"' + (required ? ' required' : '') + ' data-other="' + name + 'Other">' + peopleOpts(list, type, sel, emptyLabel) + '</select>' +
        '<input class="input' + (isOther ? '' : ' hidden') + '" name="' + name + 'Other" placeholder="Ketik nama ' + (name === 'driver' ? 'driver' : 'helper') + '" value="' + esc(isOther && sel !== OTHER ? sel : '') + '">';
    }

    // ================= Section 1: Reservasi Armada =================
    async function renderForm() {
      var v = view();
      v.innerHTML = '<div class="card card-pad muted">Memuat data armada…</div>';
      try { await loadMaster(); await loadIndex(); await loadMonth(monthOf(F.date)); } catch (e) { v.innerHTML = errCard(e); return; }
      if (!document.getElementById('view') || ctx.route() !== 'angber') return;
      var M = F.master, d = F.draft || {};
      var tps = types();
      var jenis = d.jenis || tps[0] || '';
      var units = M.units.filter(function (u) { return u.type === jenis; });
      var busy = busyUnits(F.date, d.id);
      v.innerHTML =
        '<div class="fleet-grid">' +
        '<div class="card card-pad"><h4 class="section-title">Form Reservasi Armada</h4>' +
        '<div class="small muted" style="margin:-4px 0 12px">Khusus angkutan berat (' + esc(types().join(', ')) + ') — di luar KRP.</div>' +
        '<form id="fleetForm" class="fleet-form" autocomplete="off">' +
        fld('Tanggal pemakaian', '<input class="input" type="date" name="date" required value="' + esc(F.date) + '">') +
        fld('Armada (jenis)', '<select class="select" name="jenis" required>' + tps.map(function (t) { return '<option' + (t === jenis ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</select>') +
        fld('Unit', '<select class="select" name="unit" required><option value="">Pilih unit…</option>' + units.map(function (u) {
          var b = busy[u.id];
          return '<option value="' + esc(u.id) + '"' + (d.unit === u.id ? ' selected' : '') + '>' + esc(unitLabel(u)) + (b ? ' — terpakai (' + b + ')' : '') + '</option>';
        }).join('') + '</select>') +
        fld('Driver', personField('driver', M.drivers, jenis, d.driver, 'Pilih driver…', true)) +
        fld('Helper', personField('helper', M.helpers, jenis, d.helper, '— Tanpa helper —') +
          (M.helpers.some(function (h) { return h.type === jenis; }) ? '' : '<div class="small muted">' + esc(jenis) + ' tanpa helper</div>')) +
        fld('Fungsi', '<select class="select" name="fungsi" required><option value="">Pilih fungsi…</option>' + M.fungsi.map(function (f) { return '<option' + (d.fungsi === f ? ' selected' : '') + '>' + esc(f) + '</option>'; }).join('') + '</select>') +
        fld('Nama User', '<input class="input" name="user" required placeholder="Nama pengguna/pemohon" value="' + esc(d.user || '') + '">', true) +
        fld('Estimasi Tonase (ton)', '<input class="input" name="tonase" type="number" min="0" step="any" placeholder="mis. 8" value="' + esc(d.tonase == null ? '' : d.tonase) + '"><div class="small muted" id="capHint"></div>') +
        fld('Radius angkut / Boom (meter)', '<input class="input" name="boom" type="number" min="0" step="any" placeholder="mis. 12" value="' + esc(d.boom == null ? '' : d.boom) + '">') +
        fld('Barang yang dibawa', '<input class="input" name="barang" required placeholder="mis. Pipa 2-7/8&quot; 20 joint" value="' + esc(d.barang || '') + '">', true) +
        fld('Lokasi (muat)', '<input class="input" name="lokasi" required placeholder="mis. Gudang Rantau" value="' + esc(d.lokasi || '') + '">') +
        fld('Tujuan', '<input class="input" name="tujuan" required placeholder="mis. SP-XII / RIG RTU 01" value="' + esc(d.tujuan || '') + '">') +
        fld('Catatan (opsional)', '<input class="input" name="note" value="' + esc(d.note || '') + '">', true) +
        '<div class="fleet-actions"><button class="btn primary" type="submit">Simpan Reservasi</button><span class="small muted">Status: <b>Terjadwal</b></span></div>' +
        '</form></div>' +
        '<div class="fleet-side">' + dayCard(F.date) + mineCard() + '</div></div>';
      capHint();
    }
    function fld(label, input, wide) { return '<label class="fleet-fld' + (wide ? ' wide' : '') + '"><span>' + esc(label) + '</span>' + input + '</label>'; }
    function errCard(e) { return '<div class="card card-pad"><b>Gagal memuat data Angkutan Berat</b><div class="small muted">' + esc(e.message) + '</div><button class="btn sm" data-fa="reload" style="margin-top:8px">Coba lagi</button></div>'; }
    function busyUnits(date, exceptId) {
      var out = {};
      (F.months[monthOf(date)] || []).forEach(function (r) { if (r.date === date && ACTIVE[r.status] && r.id !== exceptId) out[r.unit] = r.no; });
      return out;
    }
    function dayCard(date) {
      var list = (F.months[monthOf(date)] || []).filter(function (r) { return r.date === date; });
      return '<div class="card card-pad"><h4 class="section-title">Jadwal armada ' + esc(fmtDate(date)) + '</h4>' +
        (list.length ? '<div class="fleet-day">' + list.map(function (r) {
          return '<div class="fleet-day-row"><div><b>' + esc(r.unit) + '</b> <span class="small muted">' + esc(r.jenis) + '</span><div class="small">' + esc(r.lokasi) + ' → ' + esc(r.tujuan) + ' · ' + esc(r.fungsi) + '</div></div>' + badge(r.status) + '</div>';
        }).join('') + '</div>' : '<div class="small muted">Belum ada reservasi di tanggal ini.</div>') + '</div>';
    }
    function mineCard() {
      var all = [];
      Object.keys(F.months).forEach(function (m) { (F.months[m] || []).forEach(function (r) { if (r.createdBy === me()) all.push(r); }); });
      all.sort(function (a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); });
      all = all.slice(0, 6);
      return '<div class="card card-pad"><h4 class="section-title">Reservasi saya</h4>' +
        (all.length ? all.map(function (r) {
          return '<div class="fleet-day-row"><div><b class="mono">' + esc(r.no) + '</b> <span class="small muted">' + esc(fmtDate(r.date)) + '</span><div class="small">' + esc(r.unit) + ' · ' + esc(r.barang) + '</div></div>' +
            '<div style="text-align:right">' + badge(r.status) + (r.status === 'Terjadwal' ? '<div><button class="btn sm" data-fa="cancel" data-id="' + esc(r.id) + '" data-m="' + esc(monthOf(r.date)) + '" style="margin-top:4px">Batalkan</button></div>' : '') + '</div></div>';
        }).join('') : '<div class="small muted">Belum ada.</div>') + '</div>';
    }
    function capHint() {
      var f = document.getElementById('fleetForm');
      if (!f) return;
      var u = unitById(f.unit.value), t = parseFloat(f.tonase.value), h = document.getElementById('capHint');
      if (!h) return;
      h.innerHTML = u && u.cap ? 'Kapasitas unit ' + esc(u.cap) + ' ton' + (t > +u.cap ? ' — <b style="color:var(--bad, #c0392b)">melebihi kapasitas!</b>' : '') : '';
    }
    function formData(f) {
      var o = {};
      ['date', 'jenis', 'unit', 'driver', 'helper', 'fungsi', 'user', 'tonase', 'boom', 'barang', 'lokasi', 'tujuan', 'note', 'status'].forEach(function (k) {
        if (f[k]) o[k] = String(f[k].value).trim();
      });
      ['driver', 'helper'].forEach(function (k) { if (o[k] === OTHER) o[k] = f[k + 'Other'] ? String(f[k + 'Other'].value).trim() : ''; });
      ['tonase', 'boom'].forEach(function (k) { o[k] = o[k] === '' || o[k] == null ? null : +o[k]; });
      return o;
    }
    function oldestAllowed() {
      var ms = (F.index && F.index.months) || [];
      return ms.length >= KEEP_MONTHS ? ms[0] : null;
    }
    async function submit(f) {
      var o = formData(f);
      if (!o.date || !o.unit || !o.driver || !o.fungsi || !o.user || !o.barang || !o.lokasi || !o.tujuan) { toast('Lengkapi semua kolom wajib' + (f.driver.value === OTHER && !o.driver ? ' (ketik nama driver)' : ''), true); return; }
      var m = monthOf(o.date), old = oldestAllowed();
      if (old && m < old) { toast('Tanggal di luar masa simpan 6 bulan (' + monthName(old) + ' paling lama)', true); return; }
      var busy = busyUnits(o.date);
      if (busy[o.unit] && !confirm('Unit ' + o.unit + ' sudah direservasi di tanggal ini (' + busy[o.unit] + '). Tetap submit?')) return;
      var u = unitById(o.unit);
      loading('Mengirim reservasi…');
      try {
        var rec;
        await commit({ months: (function () {
          var x = {};
          x[m] = function (list) {
            var n = list.reduce(function (a, r) { var k = +(String(r.no || '').split('-').pop()) || 0; return Math.max(a, k); }, 0) + 1;
            rec = Object.assign(o, {
              id: 'R' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
              no: 'AB-' + m.slice(2, 4) + m.slice(5, 7) + '-' + ('00' + n).slice(-3),
              nopol: u ? u.nopol : '', status: 'Terjadwal', createdBy: me(), createdAt: new Date().toISOString()
            });
            list.push(rec);
            return list;
          };
          return x;
        })() }, 'Angkutan berat: reservasi ' + o.unit + ' ' + o.date + ' (' + me() + ')');
        F.draft = null;
        toast('Reservasi ' + rec.no + ' tersimpan');
        renderForm();
      } catch (e) { toast('Gagal mengirim: ' + e.message, true); }
      finally { loading(false); }
    }

    // ================= Section 2: Riwayat Armada =================
    async function renderHistory(force) {
      var v = view();
      v.innerHTML = '<div class="card card-pad muted">Memuat riwayat…</div>';
      try {
        await loadMaster(force); await loadIndex(force);
        var ms = F.index.months.slice();
        var cur = monthOf(today());
        if (ms.indexOf(cur) < 0) ms.push(cur);
        ms.sort();
        if (!F.sel || ms.indexOf(F.sel) < 0) F.sel = ms.indexOf(cur) >= 0 ? cur : ms[ms.length - 1];
        await loadMonth(F.sel, force);
      } catch (e) { v.innerHTML = errCard(e); return; }
      if (ctx.route() !== 'angber-riwayat') return;
      var months = F.index.months.slice(), curM = monthOf(today());
      if (months.indexOf(curM) < 0) months.push(curM);
      months.sort().reverse();
      var list = filtered();
      var all = F.months[F.sel] || [];
      var act = all.filter(function (r) { return ACTIVE[r.status]; });
      var ton = act.reduce(function (a, r) { return a + (+r.tonase || 0); }, 0);
      var sched = all.filter(function (r) { return r.status === 'Terjadwal'; }).length;
      v.innerHTML = retentionCard() +
        '<div class="card card-pad toolbar" style="margin-bottom:14px">' +
        '<select class="select" id="fMonth">' + months.map(function (m) { return '<option value="' + m + '"' + (m === F.sel ? ' selected' : '') + '>' + monthName(m) + (F.index.exported[m] ? ' ✓' : '') + '</option>'; }).join('') + '</select>' +
        '<select class="select" id="fJenis"><option value="">Semua armada</option>' + types().map(function (t) { return '<option' + (F.filt.jenis === t ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</select>' +
        '<select class="select" id="fStatus"><option value="">Semua status</option>' + STATUS.map(function (t) { return '<option' + (F.filt.status === t ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</select>' +
        '<input class="input" id="fQ" style="flex:1;min-width:180px" placeholder="Cari unit, driver, user, barang, tujuan…" value="' + esc(F.filt.q) + '">' +
        '<button class="btn" data-fa="refresh">Muat ulang</button>' +
        '<button class="btn primary" data-fa="export">Export Excel ' + esc(monthName(F.sel)) + '</button></div>' +
        '<div class="kpis" style="margin-bottom:14px">' +
        kpi('Total reservasi', all.length, monthName(F.sel)) + kpi('Terjadwal', sched, '') +
        kpi('Selesai', all.filter(function (r) { return r.status === 'Selesai'; }).length, '') +
        kpi('Estimasi tonase', nf(ton) + ' t', 'reservasi aktif') + '</div>' +
        utilCard(act) +
        '<div class="card"><div class="table-wrap"><table class="grid fleet-table"><thead><tr><th>No / Tanggal</th><th>Armada</th><th>Driver / Helper</th><th>Fungsi / User</th><th class="num">Tonase / Boom</th><th>Barang</th><th>Lokasi → Tujuan</th><th>Status</th><th></th></tr></thead><tbody>' +
        (list.length ? list.map(rowHtml).join('') : '<tr><td colspan="9" class="muted" style="text-align:center;padding:24px">Tidak ada data</td></tr>') +
        '</tbody></table></div></div>';
    }
    function kpi(k, v, s) { return '<div class="kpi"><div class="k">' + esc(k) + '</div><div class="v">' + esc(String(v)) + '</div><div class="s">' + esc(s || '') + '</div></div>'; }
    function filtered() {
      var q = F.filt.q.trim().toLowerCase();
      return (F.months[F.sel] || []).filter(function (r) {
        if (F.filt.jenis && r.jenis !== F.filt.jenis) return false;
        if (F.filt.status && r.status !== F.filt.status) return false;
        if (q && [r.no, r.unit, r.nopol, r.driver, r.helper, r.user, r.fungsi, r.barang, r.lokasi, r.tujuan, r.note, r.createdBy].join(' ').toLowerCase().indexOf(q) < 0) return false;
        return true;
      }).sort(function (a, b) { return (b.date + b.createdAt).localeCompare(a.date + a.createdAt); });
    }
    function rowHtml(r) {
      var adm = isAdmin(), acts = [];
      if (adm && r.status === 'Terjadwal') acts.push('<button class="btn sm" data-fa="status" data-v="Selesai" data-id="' + esc(r.id) + '">Selesai</button>');
      if (adm) acts.push('<button class="btn sm" data-fa="edit" data-id="' + esc(r.id) + '">Edit</button>');
      return '<tr><td><b class="mono">' + esc(r.no) + '</b><div class="small">' + esc(fmtDate(r.date)) + '</div></td>' +
        '<td><b>' + esc(r.unit) + '</b><div class="small muted">' + esc(r.jenis) + (r.nopol ? ' · ' + esc(r.nopol) : '') + '</div></td>' +
        '<td>' + esc(r.driver) + '<div class="small muted">' + esc(r.helper || '—') + '</div></td>' +
        '<td><b>' + esc(r.fungsi) + '</b><div class="small muted">' + esc(r.user) + '</div></td>' +
        '<td class="num">' + nf(r.tonase) + (r.boom != null ? '<div class="small muted">boom ' + nf(r.boom) + ' m</div>' : '') + '</td>' +
        '<td>' + esc(r.barang) + (r.note ? '<div class="small muted">' + esc(r.note) + '</div>' : '') + '</td>' +
        '<td>' + esc(r.lokasi) + ' → ' + esc(r.tujuan) + '</td>' +
        '<td>' + badge(r.status) + '<div class="small muted" title="' + esc('Dibuat ' + fmtTime(r.createdAt) + (r.updatedBy ? ' · diubah ' + r.updatedBy + ' ' + fmtTime(r.updatedAt) : '')) + '">' + esc(r.createdBy || '') + '</div></td>' +
        '<td><div class="fleet-acts">' + acts.join('') + '</div></td></tr>';
    }
    function daysIn(m) { return new Date(+m.slice(0, 4), +m.slice(5, 7), 0).getDate(); }
    function utilCard(act) {
      var used = {};
      act.forEach(function (r) { (used[r.unit] = used[r.unit] || {})[r.date] = 1; });
      var units = F.master.units.filter(function (u) { return !F.filt.jenis || u.type === F.filt.jenis; });
      var nd = daysIn(F.sel);
      if (!units.length) return '';
      return '<details class="card card-pad fleet-util" style="margin-bottom:14px"><summary><b>Utilisasi armada ' + esc(monthName(F.sel)) + '</b> <span class="small muted">— hari terpakai per unit</span></summary><div class="fleet-util-grid">' +
        units.map(function (u) {
          var n = Object.keys(used[u.id] || {}).length, pct = Math.round(n / nd * 100);
          return '<div class="fleet-util-row"><span><b>' + esc(u.id) + '</b> <span class="small muted">' + esc(u.type) + '</span></span><div class="progress"><i style="width:' + pct + '%"></i></div><span class="small">' + n + '/' + nd + ' hari</span></div>';
        }).join('') + '</div></details>';
    }
    function retentionCard() {
      var ms = F.index.months || [], curM = monthOf(today());
      var notExp = ms.filter(function (m) { return m < curM && !F.index.exported[m]; });
      var full = ms.length >= KEEP_MONTHS - 1;
      if (!notExp.length && !full) return '';
      return '<div class="card card-pad remind-card"><b>Penyimpanan riwayat: ' + ms.length + '/' + KEEP_MONTHS + ' bulan</b><ul>' +
        (full ? '<li>Website hanya menyimpan <b>' + KEEP_MONTHS + ' bulan terakhir</b>. Data <b>' + esc(monthName(ms[0])) + '</b> akan terhapus otomatis saat data bulan baru masuk.</li>' : '') +
        (notExp.length ? '<li>Belum di-export: ' + notExp.map(function (m) { return '<a href="#" data-fa="pick" data-m="' + m + '">' + esc(monthName(m)) + '</a>'; }).join(', ') + '. Export ke Excel tiap bulan sebagai arsip.</li>' : '') +
        '</ul></div>';
    }

    // ---------- Edit (Admin / Owner) ----------
    function findRec(id) { return (F.months[F.sel] || []).filter(function (r) { return r.id === id; })[0]; }
    function openEdit(id) {
      var r = findRec(id);
      if (!r) return;
      var M = F.master, d = $('#drawer');
      var units = M.units.filter(function (u) { return u.type === r.jenis; });
      d.innerHTML = '<div class="drawer-head"><div style="flex:1"><div class="mono muted">' + esc(r.no) + '</div><h2>Edit reservasi</h2></div><button class="icon-btn" data-act="close-drawer">✕</button></div>' +
        '<div class="drawer-body"><form id="fleetEdit" class="fleet-form" data-id="' + esc(r.id) + '">' +
        fld('Tanggal pemakaian', '<input class="input" type="date" name="date" required value="' + esc(r.date) + '">') +
        fld('Armada (jenis)', '<select class="select" name="jenis">' + types().map(function (t) { return '<option' + (t === r.jenis ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</select>') +
        fld('Unit', '<select class="select" name="unit">' + units.map(function (u) { return '<option value="' + esc(u.id) + '"' + (u.id === r.unit ? ' selected' : '') + '>' + esc(unitLabel(u)) + '</option>'; }).join('') + '</select>') +
        fld('Driver', personField('driver', M.drivers, r.jenis, r.driver, '—')) +
        fld('Helper', personField('helper', M.helpers, r.jenis, r.helper, '— Tanpa helper —')) +
        fld('Fungsi', '<select class="select" name="fungsi">' + M.fungsi.map(function (f) { return '<option' + (f === r.fungsi ? ' selected' : '') + '>' + esc(f) + '</option>'; }).join('') + '</select>') +
        fld('Nama User', '<input class="input" name="user" value="' + esc(r.user) + '">', true) +
        fld('Estimasi Tonase (ton)', '<input class="input" name="tonase" type="number" min="0" step="any" value="' + esc(r.tonase == null ? '' : r.tonase) + '">') +
        fld('Radius angkut / Boom (meter)', '<input class="input" name="boom" type="number" min="0" step="any" value="' + esc(r.boom == null ? '' : r.boom) + '">') +
        fld('Barang yang dibawa', '<input class="input" name="barang" value="' + esc(r.barang) + '">', true) +
        fld('Lokasi (muat)', '<input class="input" name="lokasi" value="' + esc(r.lokasi) + '">') +
        fld('Tujuan', '<input class="input" name="tujuan" value="' + esc(r.tujuan) + '">') +
        fld('Catatan', '<input class="input" name="note" value="' + esc(r.note || '') + '">', true) +
        fld('Status', '<select class="select" name="status">' + STATUS.map(function (s) { return '<option' + (s === r.status ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') + '</select>') +
        '<div class="fleet-actions"><button class="btn primary" type="submit">Simpan perubahan</button><button class="btn danger" type="button" data-fa="delete" data-id="' + esc(r.id) + '">Hapus</button></div>' +
        '<div class="small muted wide">Dibuat oleh ' + esc(r.createdBy) + ' · ' + esc(fmtTime(r.createdAt)) + (r.updatedBy ? ' · terakhir diubah ' + esc(r.updatedBy) + ' ' + esc(fmtTime(r.updatedAt)) : '') + '</div>' +
        '</form></div>';
      d.classList.add('open'); d.setAttribute('aria-hidden', 'false');
      $('#scrim').classList.add('open');
    }
    async function saveEdit(f) {
      var id = f.getAttribute('data-id'), r = findRec(id), o = formData(f);
      if (!r) return;
      var from = F.sel, to = monthOf(o.date), old = oldestAllowed();
      if (old && to < old) { toast('Tanggal di luar masa simpan 6 bulan', true); return; }
      var u = unitById(o.unit);
      var patch = Object.assign({}, o, { nopol: u ? u.nopol : r.nopol, updatedBy: me(), updatedAt: new Date().toISOString() });
      var ms = {};
      if (from === to) ms[from] = function (list) { return list.map(function (x) { return x.id === id ? Object.assign({}, x, patch) : x; }); };
      else {
        var moved = null;
        ms[from] = function (list) { return list.filter(function (x) { if (x.id === id) { moved = Object.assign({}, x, patch); return false; } return true; }); };
        ms[to] = function (list) { if (moved) list.push(moved); return list; };
      }
      await doCommit({ months: ms }, 'Angkutan berat: ubah ' + r.no + ' (' + me() + ')', 'Perubahan ' + r.no + ' disimpan');
      ctx.closeDrawer();
    }
    async function setStatus(id, st) {
      var r = findRec(id);
      if (!r) return;
      var ms = {}, at = new Date().toISOString();
      ms[F.sel] = function (list) { return list.map(function (x) { return x.id === id ? Object.assign({}, x, { status: st, updatedBy: me(), updatedAt: at }) : x; }); };
      await doCommit({ months: ms }, 'Angkutan berat: ' + r.no + ' ' + st + ' (' + me() + ')', r.no + ' → ' + st);
    }
    async function cancel(id, m) {
      if (!confirm('Batalkan reservasi ini?')) return;
      var ms = {}, at = new Date().toISOString();
      ms[m] = function (list) { return list.map(function (x) { return x.id === id && x.status === 'Terjadwal' ? Object.assign({}, x, { status: 'Dibatalkan', updatedBy: me(), updatedAt: at }) : x; }); };
      await doCommit({ months: ms }, 'Angkutan berat: batal ' + id + ' (' + me() + ')', 'Reservasi dibatalkan');
    }
    async function del(id) {
      var r = findRec(id);
      if (!r || !confirm('Hapus permanen reservasi ' + r.no + '?')) return;
      var ms = {};
      ms[F.sel] = function (list) { return list.filter(function (x) { return x.id !== id; }); };
      await doCommit({ months: ms }, 'Angkutan berat: hapus ' + r.no + ' (' + me() + ')', r.no + ' dihapus');
      ctx.closeDrawer();
    }
    async function doCommit(ch, msg, ok) {
      loading('Menyimpan…');
      try { await commit(ch, msg); toast(ok); }
      catch (e) { toast('Gagal menyimpan: ' + e.message, true); }
      finally { loading(false); rerender(); }
    }
    function rerender() { if (ctx.route() === 'angber-riwayat') renderHistory(); else if (ctx.route() === 'angber') renderForm(); }

    // ---------- Export Excel per bulan ----------
    async function exportMonth() {
      var m = F.sel, list = (F.months[m] || []).slice().sort(function (a, b) { return (a.date + a.no).localeCompare(b.date + b.no); });
      loading('Membuat Excel…');
      try {
        var ExcelJS = await ctx.loadExcelJS();
        var wb = new ExcelJS.Workbook();
        var thin = { style: 'thin', color: { argb: 'FF000000' } }, border = { top: thin, left: thin, bottom: thin, right: thin };
        var head = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBDD7EE' } };
        var ws = wb.addWorksheet('Reservasi ' + monthName(m));
        var cols = [['No', 6], ['No. Reservasi', 15], ['Tanggal', 12], ['Jenis Armada', 15], ['Unit', 10], ['No. Polisi', 13], ['Driver', 22], ['Helper', 22], ['Fungsi', 9], ['Nama User', 20], ['Est. Tonase (ton)', 12], ['Radius / Boom (m)', 12], ['Barang yang dibawa', 32], ['Lokasi (muat)', 22], ['Tujuan', 22], ['Catatan', 22], ['Status', 14], ['Dibuat oleh', 16], ['Waktu dibuat', 17], ['Diubah oleh', 16], ['Waktu diubah', 17]];
        ws.columns = cols.map(function (c) { return { width: c[1] }; });
        ws.mergeCells(1, 1, 1, cols.length);
        ws.getCell(1, 1).value = 'RESERVASI ANGKUTAN BERAT — FIELD RANTAU ZONA 1';
        ws.getCell(1, 1).font = { bold: true, size: 14 };
        ws.mergeCells(2, 1, 2, cols.length);
        ws.getCell(2, 1).value = 'Periode: ' + monthName(m) + ' · Diekspor ' + new Date().toLocaleString('id-ID') + ' oleh ' + me();
        var hr = ws.getRow(4);
        cols.forEach(function (c, i) { var cell = hr.getCell(i + 1); cell.value = c[0]; cell.font = { bold: true }; cell.fill = head; cell.border = border; cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }; });
        list.forEach(function (r, i) {
          var row = ws.getRow(5 + i);
          [i + 1, r.no, r.date ? new Date(r.date + 'T00:00:00') : '', r.jenis, r.unit, r.nopol || '', r.driver, r.helper || '', r.fungsi, r.user, r.tonase == null ? '' : r.tonase, r.boom == null ? '' : r.boom, r.barang, r.lokasi, r.tujuan, r.note || '', r.status, r.createdBy || '', r.createdAt ? new Date(r.createdAt) : '', r.updatedBy || '', r.updatedAt ? new Date(r.updatedAt) : '']
            .forEach(function (v, j) { var c = row.getCell(j + 1); c.value = v; c.border = border; c.alignment = { vertical: 'top', wrapText: true }; });
          row.getCell(3).numFmt = 'dd/mm/yyyy'; row.getCell(19).numFmt = 'dd/mm/yyyy hh:mm'; row.getCell(21).numFmt = 'dd/mm/yyyy hh:mm';
        });
        ws.views = [{ state: 'frozen', ySplit: 4 }];
        ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + Math.max(list.length, 1), column: cols.length } };
        // Utilisasi per unit per hari (seperti form utilisasi kendaraan berat)
        var nd = daysIn(m), wu = wb.addWorksheet('Utilisasi ' + monthName(m));
        wu.getColumn(1).width = 10; wu.getColumn(2).width = 16; wu.getColumn(3).width = 12;
        for (var dd = 1; dd <= nd; dd++) wu.getColumn(3 + dd).width = 4.2;
        wu.getColumn(4 + nd).width = 10;
        wu.mergeCells(1, 1, 1, 4 + nd);
        wu.getCell(1, 1).value = 'UTILISASI KENDARAAN BERAT — ' + monthName(m).toUpperCase() + ' (W = dipakai)';
        wu.getCell(1, 1).font = { bold: true, size: 13 };
        var h2 = wu.getRow(3);
        ['Unit', 'Jenis', 'No. Polisi'].concat(Array.from({ length: nd }, function (_, k) { return k + 1; })).concat(['Hari kerja']).forEach(function (v, j) {
          var c = h2.getCell(j + 1); c.value = v; c.font = { bold: true }; c.fill = head; c.border = border; c.alignment = { horizontal: 'center' };
        });
        var act = list.filter(function (r) { return ACTIVE[r.status]; });
        F.master.units.forEach(function (u, i) {
          var row = wu.getRow(4 + i), days = {};
          act.forEach(function (r) { if (r.unit === u.id) days[+r.date.slice(8, 10)] = 1; });
          row.getCell(1).value = u.id; row.getCell(2).value = u.type; row.getCell(3).value = u.nopol;
          for (var k = 1; k <= nd; k++) { var c = row.getCell(3 + k); c.value = days[k] ? 'W' : ''; c.alignment = { horizontal: 'center' }; if (days[k]) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } }; }
          row.getCell(4 + nd).value = Object.keys(days).length;
          for (var j = 1; j <= 4 + nd; j++) row.getCell(j).border = border;
        });
        var buf = await wb.xlsx.writeBuffer();
        var a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
        a.download = 'Reservasi_Angkutan_Berat_' + m + '.xlsx';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
        // tandai sudah di-export (untuk pengingat arsip)
        if (m < monthOf(today()) && !F.index.exported[m] && ctx.ghToken()) {
          try { await commit({ exported: m }, 'Angkutan berat: export ' + m + ' (' + me() + ')'); } catch (e) { /* tidak penting */ }
        }
        toast('Excel ' + monthName(m) + ' di-download');
      } catch (e) { toast('Gagal export: ' + e.message, true); }
      finally { loading(false); if (ctx.route() === 'angber-riwayat') renderHistory(); }
    }

    // ---------- Master armada (Owner / Co-Owner / Admin Angkutan) ----------
    function masterCard() {
      if (!isAdmin()) return '';
      return '<div class="card card-pad" style="margin-top:16px" id="fleetMasterCard"><h4 class="section-title">Master Angkutan Berat</h4>' +
        '<p class="small muted" style="margin-top:0">Daftar armada, driver &amp; helper untuk pilihan di Reservasi Armada. Disimpan terenkripsi.</p>' +
        '<button class="btn sm" data-fa="master-open">Buka &amp; ubah master</button><div id="fleetMasterBody"></div></div>';
    }
    async function openMaster() {
      var box = document.getElementById('fleetMasterBody');
      box.innerHTML = '<div class="small muted">Memuat…</div>';
      var M = await loadMaster(true);
      function ta(id, rows, ph) { return '<textarea class="input mono" id="' + id + '" rows="' + Math.min(18, Math.max(5, rows.length + 1)) + '" style="width:100%;font-size:12.5px" placeholder="' + esc(ph) + '">' + esc(rows.join('\n')) + '</textarea>'; }
      box.innerHTML = '<div class="fleet-master">' +
        '<div><b>Armada</b> <span class="small muted">No. Lambung | No. Polisi | Jenis | Kapasitas (ton) | Kontraktor</span>' + ta('fmUnits', M.units.map(function (u) { return [u.id, u.nopol, u.type, u.cap, u.contractor].join(' | '); }), 'VT-01 | B 9766 UFV | Vacuum Truck | 12 | PT ...') + '</div>' +
        '<div><b>Driver / Operator</b> <span class="small muted">Nama | Jenis armada</span>' + ta('fmDrivers', M.drivers.map(function (p) { return p.name + ' | ' + p.type; }), 'Nama | Crane') + '</div>' +
        '<div><b>Helper</b> <span class="small muted">Nama | Jenis armada</span>' + ta('fmHelpers', M.helpers.map(function (p) { return p.name + ' | ' + p.type; }), 'Nama | Crane') + '</div>' +
        '<div><b>Fungsi</b> <span class="small muted">pisahkan dengan koma</span><input class="input" id="fmFungsi" value="' + esc(M.fungsi.join(', ')) + '"></div>' +
        '<div class="toolbar"><button class="btn sm primary" data-fa="master-save">Simpan master</button></div></div>';
    }
    async function saveMaster() {
      function lines(id) { return document.getElementById(id).value.split('\n').map(function (l) { return l.split('|').map(function (x) { return x.trim(); }); }).filter(function (p) { return p[0]; }); }
      var M = {
        units: lines('fmUnits').map(function (p) { return { id: p[0], nopol: p[1] || '', type: p[2] || 'Lainnya', cap: p[3] ? +p[3] || p[3] : '', contractor: p[4] || '' }; }),
        drivers: lines('fmDrivers').map(function (p) { return { name: p[0], type: p[1] || '' }; }),
        helpers: lines('fmHelpers').map(function (p) { return { name: p[0], type: p[1] || '' }; }),
        fungsi: document.getElementById('fmFungsi').value.split(',').map(function (x) { return x.trim(); }).filter(Boolean)
      };
      var seen = {}, typesL = [];
      (F.master && F.master.types || []).concat(M.units.map(function (u) { return u.type; })).forEach(function (t) { if (t && !seen[t] && M.units.some(function (u) { return u.type === t; })) { seen[t] = 1; typesL.push(t); } });
      M.types = typesL;
      await doCommit({ master: M }, 'Angkutan berat: master diperbarui (' + me() + ')', 'Master angkutan berat disimpan');
    }

    // ---------- Ringkasan untuk halaman Data SAP ----------
    function stats() {
      var m = monthOf(today()), list = F.months[m];
      if (!list) return null;
      var td = today();
      return { month: monthName(m), total: list.length, today: list.filter(function (r) { return r.date === td && r.status === 'Terjadwal'; }).length };
    }

    // ---------- Event ----------
    document.addEventListener('submit', function (e) {
      if (e.target.id === 'fleetForm') { e.preventDefault(); submit(e.target); }
      else if (e.target.id === 'fleetEdit') { e.preventDefault(); saveEdit(e.target); }
    });
    document.addEventListener('change', function (e) {
      var t = e.target, f = t.form;
      if (t.hasAttribute && t.hasAttribute('data-other') && f) {
        var oi = f[t.getAttribute('data-other')];
        if (oi) { oi.classList.toggle('hidden', t.value !== OTHER); if (t.value === OTHER) oi.focus(); }
      }
      if (f && f.id === 'fleetForm') {
        F.draft = formData(f);
        if (f.driver.value === OTHER) F.draft.driver = F.draft.driver || OTHER;
        if (f.helper.value === OTHER) F.draft.helper = F.draft.helper || OTHER;
        if (t.name === 'date') { F.date = t.value || today(); loadMonth(monthOf(F.date)).then(renderForm, function (er) { toast(er.message, true); }); }
        else if (t.name === 'jenis') { F.draft.unit = ''; renderForm(); }
        else if (t.name === 'unit' || t.name === 'tonase') capHint();
        return;
      } else if (f && f.id === 'fleetEdit' && t.name === 'jenis') {
        var us = F.master.units.filter(function (u) { return u.type === t.value; });
        f.unit.innerHTML = us.map(function (u) { return '<option value="' + esc(u.id) + '">' + esc(unitLabel(u)) + '</option>'; }).join('');
      } else if (t.id === 'fMonth') { F.sel = t.value; renderHistory(); }
      else if (t.id === 'fJenis') { F.filt.jenis = t.value; renderHistory(); }
      else if (t.id === 'fStatus') { F.filt.status = t.value; renderHistory(); }
    });
    var qTimer;
    document.addEventListener('input', function (e) {
      var t = e.target;
      if (t.id === 'fQ') {
        F.filt.q = t.value;
        clearTimeout(qTimer);
        qTimer = setTimeout(function () {
          var tb = document.querySelector('.fleet-table tbody');
          if (!tb) return;
          var list = filtered();
          tb.innerHTML = list.length ? list.map(rowHtml).join('') : '<tr><td colspan="9" class="muted" style="text-align:center;padding:24px">Tidak ada data</td></tr>';
        }, 150);
      } else if (t.form && t.form.id === 'fleetForm' && t.name === 'tonase') capHint();
    });
    document.addEventListener('click', function (e) {
      var a = e.target.closest('[data-fa]');
      if (!a) return;
      e.preventDefault();
      var act = a.getAttribute('data-fa'), id = a.getAttribute('data-id');
      if (act === 'reload') rerender();
      else if (act === 'refresh') { F.months = {}; renderHistory(true); }
      else if (act === 'export') exportMonth();
      else if (act === 'status') setStatus(id, a.getAttribute('data-v'));
      else if (act === 'edit') openEdit(id);
      else if (act === 'cancel') cancel(id, a.getAttribute('data-m'));
      else if (act === 'delete') del(id);
      else if (act === 'pick') { F.sel = a.getAttribute('data-m'); renderHistory(); }
      else if (act === 'master-open') openMaster().catch(function (er) { toast(er.message, true); });
      else if (act === 'master-save') saveMaster();
    });

    function reset() { F.master = null; F.index = null; F.months = {}; F.draft = null; F.sel = null; F.date = today(); }
    return { reset: reset, renderForm: renderForm, renderHistory: renderHistory, masterCard: masterCard, stats: stats, preload: function () { return loadMonth(monthOf(today())).catch(function () {}); } };
  };
})(this);
