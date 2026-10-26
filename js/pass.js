/*
 * Pass Keluar Barang (material keluar dari Warehouse Field Rantau).
 *
 * Alur: Cari Material → centang OUT → Call Order bagian "Material Keluar" → isi jumlah, kendaraan, driver,
 * pemohon, penerima → Ajukan → Owner / Co-Owner approve (nama & tanda tangan penyetuju otomatis menjadi
 * "Pengirim") → PDF Pass Keluar Barang (A5 landscape, sama seperti format sistem pass keluar).
 *
 * Data: data/pass.js (daftar pass + nomor berikutnya) & data/signs.js (nama + tanda tangan penyetuju),
 * keduanya terenkripsi. Tulis data membaca versi terbaru dari GitHub dulu (aman bila beberapa orang bersamaan).
 */
(function (root) {
  'use strict';
  var ST = { pending: 'Menunggu Approval', ok: 'Disetujui', no: 'Ditolak', cancel: 'Dibatalkan' };
  var ST_CLS = { 'Menunggu Approval': 'warn', 'Disetujui': 'ok', 'Ditolak': 'bad', 'Dibatalkan': '' };
  var FIRST_SEQ = 5455; // nomor contoh terakhir: RTU-5454/EP0651/WH/2026
  var ROWS_PER_PAGE = 11; // tabel pass: 11 baris (baris berisi 13pt, baris kosong 16.1pt — sama seperti PDF sistem)

  root.PassModule = function (ctx) {
    var S = ctx.S, esc = ctx.esc, toast = ctx.toast, loading = ctx.loading, Vault = ctx.Vault, gh = ctx.gh;
    var P = S.pass = { data: null, signs: null, filt: 'Menunggu Approval', logo: null };

    function $(s) { return document.querySelector(s); }
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    function today() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    function dmy(s) { if (!s) return ''; var p = s.split('-'); return p[2] + '-' + p[1] + '-' + p[0]; }
    function fmtTime(iso) { if (!iso) return ''; var d = new Date(iso); return pad(d.getDate()) + '-' + pad(d.getMonth() + 1) + '-' + d.getFullYear() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
    function qty(n) { return n == null ? '' : new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 }).format(n); }
    function me() { return S.user ? S.user.name : ''; }
    function canApprove() { return ctx.isOwner(); }
    function badge(st) { return '<span class="badge ' + (ST_CLS[st] || '') + '">' + esc(st) + '</span>'; }
    function passNo(seq, date) { return 'RTU-' + seq + '/EP0651/WH/' + String(date || today()).slice(0, 4); }

    // ---------- baca / tulis file terenkripsi ----------
    function b64text(b64) {
      var bin = atob(String(b64).replace(/\s/g, '')), u8 = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      return new TextDecoder().decode(u8);
    }
    function payloadOf(text) { var m = /"(MWK1\.[^"]+)"/.exec(text || ''); return m ? m[1] : null; }
    async function readText(path) {
      if (ctx.ghToken()) {
        try {
          var r = await gh('GET', '/contents/' + path + '?ref=' + ctx.branch + '&t=' + Date.now());
          return r && r.content != null ? b64text(r.content) : null;
        } catch (e) { if (/not found/i.test(e.message)) return null; throw e; }
      }
      var res = await fetch(path + '?t=' + Date.now(), { cache: 'no-store' });
      return res.ok ? res.text() : null;
    }
    async function readJSON(path) { var p = payloadOf(await readText(path)); return p ? Vault.decrypt(S.key, p) : null; }
    function fileText(varName, note, payload) { return '/* ' + note + ' — TERENKRIPSI */\nwindow.' + varName + ' = ' + JSON.stringify(payload) + ';\n'; }
    // Ubah satu file: baca terbaru dari GitHub → mutate → commit; ulang bila ada commit lain di saat yang sama
    async function atomic(path, varName, note, mutate, message) {
      if (!ctx.ghToken() && ctx.ensureToken) await ctx.ensureToken();
      if (!ctx.ghToken()) throw new Error('Akun ini belum diberi akses simpan. Minta Owner Utama mengatur akses (Pengaturan → Pengguna: pilih peran + isi password), lalu coba lagi.');
      for (var attempt = 0; attempt < 4; attempt++) {
        var ref = await gh('GET', '/git/ref/heads/' + ctx.branch), base = ref.object.sha;
        var cm = await gh('GET', '/git/commits/' + base);
        var tree = await gh('GET', '/git/trees/' + cm.tree.sha + '?recursive=1');
        var ent = tree.tree.filter(function (e) { return e.path === path; })[0], cur = null;
        if (ent) { var b = await gh('GET', '/git/blobs/' + ent.sha), p = payloadOf(b64text(b.content)); cur = p ? await Vault.decrypt(S.key, p) : null; }
        var next = mutate(cur);
        var blob = await gh('POST', '/git/blobs', { content: fileText(varName, note, await Vault.encrypt(S.key, next)), encoding: 'utf-8' });
        var nt = await gh('POST', '/git/trees', { base_tree: cm.tree.sha, tree: [{ path: path, mode: '100644', type: 'blob', sha: blob.sha }] });
        var nc = await gh('POST', '/git/commits', { message: message, tree: nt.sha, parents: [base] });
        try { await gh('PATCH', '/git/refs/heads/' + ctx.branch, { sha: nc.sha }); }
        catch (e) { if (/fast forward|422|conflict/i.test(e.message) && attempt < 3) continue; throw e; }
        return next;
      }
      throw new Error('Gagal menyimpan, coba lagi');
    }
    function emptyData() { return { seq: FIRST_SEQ, list: [] }; }
    async function load(force) {
      if (!P.data || force) P.data = (await readJSON('data/pass.js')) || emptyData();
      if (!P.signs || force) P.signs = (await readJSON('data/signs.js')) || { users: {} };
      return P.data;
    }
    async function savePass(mutate, message) {
      P.data = await atomic('data/pass.js', 'MW_PASS', 'Pass Keluar Barang', function (cur) { return mutate(cur || emptyData()); }, message);
      if (ctx.refreshNav) ctx.refreshNav();
      return P.data;
    }

    // ---------- Ajukan dari Call Order ----------
    // head = { from, to, ref, date, vehicle, driver, requester, receiver }, items = [{ m, d, u, qty, note }]
    async function submit(head, items) {
      var id = 'P' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), rec;
      await savePass(function (D) {
        rec = Object.assign({ id: id, status: ST.pending, items: items, createdBy: me(), createdById: S.user.id, createdAt: new Date().toISOString() }, head);
        D.list.push(rec);
        return D;
      }, 'Pass keluar: pengajuan ' + items.length + ' material ke ' + head.to + ' (' + me() + ')');
      return rec;
    }

    // ================= Halaman Pass Keluar =================
    async function render(force) {
      var v = document.getElementById('view');
      v.innerHTML = '<div class="card card-pad muted">Memuat pass keluar…</div>';
      try { await load(force); } catch (e) { v.innerHTML = '<div class="card card-pad"><b>Gagal memuat</b><div class="small muted">' + esc(e.message) + '</div></div>'; return; }
      if (ctx.route() !== 'pass') return;
      var all = P.data.list.slice().sort(function (a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); });
      var cnt = {};
      all.forEach(function (r) { cnt[r.status] = (cnt[r.status] || 0) + 1; });
      var tabs = [ST.pending, ST.ok, ST.no, ST.cancel, 'Semua'];
      var list = P.filt === 'Semua' ? all : all.filter(function (r) { return r.status === P.filt; });
      var mySign = P.signs.users[S.user.id];
      v.innerHTML = manualCard() +
        (canApprove() && !mySign ? '<div class="card card-pad remind-card">Anda belum mengatur <b>nama &amp; tanda tangan</b> untuk Pass Keluar. Atur di <a href="#/pengaturan">Pengaturan → Tanda tangan Pass Keluar</a> sebelum approve.</div>' : '') +
        '<div class="card card-pad toolbar" style="margin-bottom:14px">' + tabs.map(function (t) {
          var n = t === 'Semua' ? all.length : (cnt[t] || 0);
          return '<span class="chip-toggle' + (P.filt === t ? ' on' : '') + '" data-pa="tab" data-v="' + esc(t) + '">' + esc(t) + ' <b>' + n + '</b></span>';
        }).join('') + '<span class="spacer"></span><button class="btn" data-pa="refresh">Muat ulang</button><a class="btn primary" href="#/call-order">+ Ajukan dari Call Order</a></div>' +
        (list.length ? '<div class="card"><div class="table-wrap"><table class="grid pass-table"><thead><tr><th>No. Pass / Tanggal</th><th>Dikirim ke</th><th>Material</th><th>Kendaraan / Driver</th><th>Pemohon → Penerima</th><th>Status</th><th></th></tr></thead><tbody>' +
          list.map(rowHtml).join('') + '</tbody></table></div></div>'
          : '<div class="card empty"><h3>Tidak ada pass ' + esc(P.filt === 'Semua' ? '' : P.filt.toLowerCase()) + '</h3><p>Pilih material di <b>Cari Material</b> → centang <b>OUT</b> → isi di <b>Call Order</b> bagian Material Keluar → Ajukan.</p></div>');
    }
    function rowHtml(r) {
      var acts = ['<button class="btn sm" data-pa="pdf" data-id="' + esc(r.id) + '">' + (r.status === ST.ok ? 'Download PDF' : 'Preview') + '</button>'];
      if (r.status === ST.pending && canApprove()) acts.unshift('<button class="btn sm primary" data-pa="approve" data-id="' + esc(r.id) + '">Approve</button><button class="btn sm" data-pa="reject" data-id="' + esc(r.id) + '">Tolak</button>');
      if (canEdit(r)) acts.push('<button class="btn sm" data-pa="edit" data-id="' + esc(r.id) + '">Edit</button>');
      if (r.status === ST.pending && (r.createdById === S.user.id || canApprove())) acts.push('<button class="btn sm" data-pa="cancel" data-id="' + esc(r.id) + '">Batalkan</button>');
      // Hapus pass yang sudah di-approve: khusus Owner Utama
      if (r.status === ST.ok && ctx.isMainOwner()) acts.push('<button class="btn sm danger" data-pa="delete" data-id="' + esc(r.id) + '" title="Hapus permanen (khusus Owner Utama)">Hapus</button>');
      var first = r.items[0] || {};
      return '<tr><td><b class="mono">' + esc(r.no || '—') + '</b><div class="small">' + esc(dmy(r.date)) + '</div></td>' +
        '<td>' + esc(r.to) + (r.ref ? '<div class="small muted">Ref: ' + esc(r.ref) + '</div>' : '') + '</td>' +
        '<td><b>' + r.items.length + '</b> item<div class="small muted">' + esc(qty(first.qty) + ' ' + (first.u || '') + ' ' + (first.d || '')) + (r.items.length > 1 ? ' …' : '') + '</div></td>' +
        '<td>' + esc(r.vehicle) + '<div class="small muted">' + esc(r.driver) + '</div></td>' +
        '<td>' + esc(r.requester) + ' → ' + esc(r.receiver) + '<div class="small muted">diajukan ' + esc(r.createdBy) + ' · ' + esc(fmtTime(r.createdAt)) + '</div></td>' +
        '<td>' + badge(r.status) + (r.status === ST.ok ? '<div class="small muted">' + esc(r.senderName) + ' · ' + esc(fmtTime(r.approvedAt)) + '</div>' : '') +
        (r.updatedBy ? '<div class="small muted">Last edit: ' + esc(r.updatedBy) + ' · ' + esc(fmtTime(r.updatedAt)) + '</div>' : '') +
        (r.status === ST.no ? '<div class="small muted">' + esc((r.rejectBy || '') + (r.rejectNote ? ': ' + r.rejectNote : '')) + '</div>' : '') + '</td>' +
        '<td><div class="fleet-acts">' + acts.join('') + '</div></td></tr>';
    }
    function find(id) { return P.data.list.filter(function (r) { return r.id === id; })[0]; }

    // ---------- Edit pass: Owner & Co-Owner (semua status); pengaju selama masih menunggu approval ----------
    function canEdit(r) { return canApprove() || (r.status === ST.pending && r.createdById === S.user.id); }
    var HEAD = [['from', 'Dari', 1], ['to', 'Dikirim ke', 1], ['ref', 'Referensi'], ['date', 'Tanggal', 1, 'date'], ['vehicle', 'Kendaraan (No. Polisi)', 1], ['driver', 'Driver', 1], ['requester', 'Pemohon', 1], ['receiver', 'Penerima', 1]];
    function openEdit(id) {
      var r = find(id);
      if (!r || !canEdit(r)) return;
      P.edit = JSON.parse(JSON.stringify(r));
      var d = $('#drawer');
      d.classList.add('open'); d.setAttribute('aria-hidden', 'false'); $('#scrim').classList.add('open');
      drawEdit();
    }
    function drawEdit() {
      var r = P.edit, d = $('#drawer');
      d.innerHTML = '<div class="drawer-head"><div style="flex:1"><div class="mono muted">Edit Pass Keluar · ' + esc(r.status) + '</div><h2>' + esc(r.no || r.to || '') + '</h2></div><button class="icon-btn" data-act="close-drawer">✕</button></div>' +
        '<div class="drawer-body" id="passEdit">' +
        (r.status === ST.ok ? '<label class="fleet-fld"><span>No. Pass</span><input class="input mono" data-pe="no" value="' + esc(r.no || '') + '"></label>' : '') +
        '<div class="pass-grid">' + HEAD.map(function (h) {
          return '<label class="fleet-fld"><span>' + esc(h[1]) + (h[2] ? ' *' : '') + '</span><input class="input" data-pe="' + h[0] + '"' + (h[3] ? ' type="' + h[3] + '"' : '') + ' value="' + esc(r[h[0]] || '') + '"></label>';
        }).join('') + '</div>' +
        '<table class="grid pass-edit-items" style="margin-top:12px"><thead><tr><th>No</th><th class="num">Jumlah</th><th>UOM</th><th>Deskripsi</th><th>Keterangan</th><th>No Material</th><th></th></tr></thead><tbody>' +
        r.items.map(function (x, i) {
          return '<tr><td class="c muted">' + (i + 1) + '</td>' +
            '<td><input class="input sm num" type="number" min="0" step="any" data-pi="' + i + '.qty" value="' + (x.qty == null ? '' : x.qty) + '"></td>' +
            '<td><input class="input sm" data-pi="' + i + '.u" value="' + esc(x.u || '') + '" style="width:64px"></td>' +
            '<td><input class="input sm" data-pi="' + i + '.d" value="' + esc(x.d || '') + '"></td>' +
            '<td><input class="input sm" data-pi="' + i + '.note" value="' + esc(x.note || '') + '"></td>' +
            '<td><input class="input sm mono" data-pi="' + i + '.m" value="' + esc(x.m || '') + '" style="width:120px"></td>' +
            '<td><button class="icon-btn" data-pa="edit-del" data-i="' + i + '" title="Hapus baris">✕</button></td></tr>';
        }).join('') + '</tbody></table>' +
        '<div class="toolbar" style="margin-top:8px"><button class="btn sm" data-pa="edit-add">+ Tambah baris</button></div>' +
        (r.status === ST.ok ? '<p class="small muted">Pass sudah disetujui — nama &amp; tanda tangan pengirim (' + esc(r.senderName || '') + ') tetap; PDF ikut berubah sesuai isian baru.</p>' : '') +
        '<div class="toolbar"><button class="btn primary" data-pa="edit-save">Simpan perubahan</button><button class="btn" data-pa="edit-pdf">Preview PDF</button><button class="btn" data-act="close-drawer">Batal</button></div></div>';
    }
    function syncEdit() {
      var r = P.edit; if (!r) return;
      Array.prototype.forEach.call(document.querySelectorAll('#passEdit [data-pe]'), function (el) { r[el.getAttribute('data-pe')] = el.value.trim(); });
      Array.prototype.forEach.call(document.querySelectorAll('#passEdit [data-pi]'), function (el) {
        var k = el.getAttribute('data-pi').split('.'), it = r.items[+k[0]];
        if (it) it[k[1]] = k[1] === 'qty' ? (el.value === '' ? null : +el.value) : k[1] === 'd' || k[1] === 'note' ? el.value : el.value.trim().toUpperCase();
      });
    }
    async function saveEdit() {
      syncEdit();
      var r = P.edit, miss = HEAD.filter(function (h) { return h[2] && !r[h[0]]; }).map(function (h) { return h[1]; });
      r.items = r.items.filter(function (x) { return x.d || x.m; });
      if (miss.length) { toast('Lengkapi: ' + miss.join(', '), true); return; }
      if (!r.items.length) { toast('Minimal 1 material', true); return; }
      if (r.items.some(function (x) { return !(x.qty > 0) || !x.u; })) { toast('Isi jumlah & UOM tiap material', true); return; }
      if (r.status === ST.ok && !r.no) { toast('Isi nomor pass', true); return; }
      var at = new Date().toISOString(), dup = false, gone = false, m = /^RTU-(\d+)\//.exec(r.no || '');
      loading('Menyimpan perubahan pass…');
      try {
        await savePass(function (D) {
          var cur = D.list.filter(function (x) { return x.id === r.id; })[0];
          if (!cur) { gone = true; return D; }
          dup = !!r.no && D.list.some(function (x) { return x.id !== r.id && x.no === r.no; });
          if (dup) return D;
          var patch = { items: r.items, updatedBy: me(), updatedAt: at };
          HEAD.forEach(function (h) { patch[h[0]] = r[h[0]]; });
          if (cur.status === ST.ok && r.no) { patch.no = r.no; if (m) D.seq = Math.max(D.seq || FIRST_SEQ, +m[1] + 1); }
          D.list = D.list.map(function (x) { return x.id === r.id ? Object.assign({}, x, patch) : x; });
          return D;
        }, 'Pass keluar: edit ' + (r.no || r.id) + ' (' + me() + ')');
        if (gone) { toast('Pass sudah dihapus orang lain', true); return; }
        if (dup) { toast('Nomor ' + r.no + ' sudah dipakai pass lain', true); return; }
        P.edit = null; ctx.closeDrawer(); toast('Perubahan pass disimpan');
      } catch (e) { toast('Gagal menyimpan: ' + e.message, true); }
      finally { loading(false); render(); }
    }

    // ---------- Material manual (Non Stock): KIMAP & deskripsi diketik sendiri → masuk Call Order ----------
    var UOMS = ['PCS', 'EA', 'SET', 'UNIT', 'KG', 'L', 'M', 'M2', 'M3', 'ROLL', 'BOX', 'PAA', 'JT', 'LOT', 'TIN', 'DRUM', 'BTL', 'LBR', 'BAG', 'CYL'];
    function manualCard() {
      var n = ctx.manualCount();
      return '<div class="card card-pad" id="manualOut" style="margin-bottom:14px"><h4 class="section-title">Tambah material manual (Non Stock)</h4>' +
        '<p class="small muted" style="margin-top:0">Untuk material yang tidak ada di data stok SAP. Setelah ditambahkan, material masuk ke <b>Call Order → Material Keluar</b> — lengkapi jumlah &amp; data pass seperti biasa, alur approval &amp; PDF sama.</p>' +
        '<div class="manual-grid">' +
        '<label class="fleet-fld"><span>KIMAP / No. Material</span><input class="input mono" id="mnM" placeholder="mis. K480900120 (kosongkan bila tidak ada)"></label>' +
        '<label class="fleet-fld"><span>Deskripsi material *</span><input class="input" id="mnD" placeholder="mis. PAINT, ALKYD ENAMEL, YELLOW, 5LTR"></label>' +
        '<label class="fleet-fld"><span>UOM *</span><input class="input" id="mnU" list="uomList" value="PCS"><datalist id="uomList">' + UOMS.map(function (u) { return '<option value="' + u + '">'; }).join('') + '</datalist></label>' +
        '<label class="fleet-fld"><span>Jumlah</span><input class="input" id="mnQ" type="number" min="0" step="any" placeholder="bisa diisi nanti"></label>' +
        '<div class="fleet-fld"><span>&nbsp;</span><button class="btn primary" data-pa="manual-add">+ Tambah ke Call Order</button></div></div>' +
        (n ? '<div class="small" style="margin-top:8px"><b>' + n + '</b> material non-stock sudah ada di Call Order. <a href="#/call-order">Buka Call Order →</a></div>' : '') + '</div>';
    }
    function addManual() {
      var m = ($('#mnM').value || '').trim().toUpperCase(), d = ($('#mnD').value || '').trim().toUpperCase(), u = ($('#mnU').value || '').trim().toUpperCase(), q = $('#mnQ').value;
      if (!d) { toast('Isi deskripsi material', true); $('#mnD').focus(); return; }
      if (!u) { toast('Isi UOM', true); return; }
      ctx.addManualOut({ m: m, d: d, u: u, qty: q === '' ? null : +q });
      toast('Ditambahkan ke Call Order: ' + d);
      ['mnM', 'mnD', 'mnQ'].forEach(function (id) { $('#' + id).value = ''; });
      var box = document.getElementById('manualOut');
      if (box) box.outerHTML = manualCard();
      var f = document.getElementById('mnD'); if (f) f.focus();
    }

    // ---------- Approve (Owner / Co-Owner) ----------
    function openApprove(id) {
      var r = find(id), sg = P.signs.users[S.user.id];
      if (!r) return;
      if (!sg) { toast('Atur nama & tanda tangan Anda dulu di Pengaturan', true); location.hash = '#/pengaturan'; return; }
      var d = $('#drawer');
      d.innerHTML = '<div class="drawer-head"><div style="flex:1"><div class="mono muted">Approval Pass Keluar</div><h2>' + esc(r.to) + '</h2></div><button class="icon-btn" data-act="close-drawer">✕</button></div>' +
        '<div class="drawer-body">' +
        '<div class="kv"><div><span>Tanggal</span><b>' + esc(dmy(r.date)) + '</b></div><div><span>Referensi</span><b>' + esc(r.ref || '—') + '</b></div><div><span>Kendaraan</span><b>' + esc(r.vehicle) + '</b></div><div><span>Driver</span><b>' + esc(r.driver) + '</b></div><div><span>Pemohon</span><b>' + esc(r.requester) + '</b></div><div><span>Penerima</span><b>' + esc(r.receiver) + '</b></div></div>' +
        '<table class="grid"><thead><tr><th>No</th><th class="num">Jumlah</th><th>UOM</th><th>Keterangan</th><th>No Material</th></tr></thead><tbody>' +
        r.items.map(function (x, i) { return '<tr><td>' + (i + 1) + '</td><td class="num">' + esc(qty(x.qty)) + '</td><td>' + esc(x.u) + '</td><td>' + esc(keterangan(x)) + '</td><td class="mono">' + esc(x.m) + '</td></tr>'; }).join('') + '</tbody></table>' +
        '<label class="fleet-fld"><span>No. Pass</span><input class="input mono" id="paNo" value="' + esc(passNo(P.data.seq || FIRST_SEQ, r.date)) + '"></label>' +
        '<div class="sign-preview"><div class="small muted">Pengirim (otomatis dari penyetuju)</div><img src="' + sg.img + '" alt="Tanda tangan"><b>' + esc(sg.name) + '</b></div>' +
        '<div class="toolbar"><button class="btn primary" data-pa="approve-do" data-id="' + esc(r.id) + '">Approve &amp; tempel tanda tangan</button><button class="btn" data-pa="pdf" data-id="' + esc(r.id) + '">Preview</button></div></div>';
      d.classList.add('open'); d.setAttribute('aria-hidden', 'false');
      $('#scrim').classList.add('open');
    }
    async function approve(id) {
      var no = ($('#paNo').value || '').trim(), sg = P.signs.users[S.user.id];
      if (!no) { toast('Isi nomor pass', true); return; }
      var m = /^RTU-(\d+)\//.exec(no), at = new Date().toISOString(), dup = false;
      loading('Menyimpan approval…');
      try {
        await savePass(function (D) {
          dup = D.list.some(function (x) { return x.no === no && x.id !== id; });
          if (dup) return D;
          D.list = D.list.map(function (x) {
            return x.id === id && x.status === ST.pending ? Object.assign({}, x, { status: ST.ok, no: no, approvedBy: me(), approvedById: S.user.id, approvedAt: at, senderName: sg.name, signerId: S.user.id }) : x;
          });
          if (m) D.seq = Math.max(D.seq || FIRST_SEQ, +m[1] + 1);
          return D;
        }, 'Pass keluar: approve ' + no + ' (' + me() + ')');
        if (dup) { toast('Nomor ' + no + ' sudah dipakai pass lain', true); return; }
        ctx.closeDrawer();
        toast('Pass ' + no + ' disetujui');
        var r = find(id);
        if (r) await downloadPdf(r);
      } catch (e) { toast('Gagal approve: ' + e.message, true); }
      finally { loading(false); render(); }
    }
    async function setStatus(id, st, extra, msg) {
      loading('Menyimpan…');
      try {
        await savePass(function (D) {
          D.list = D.list.map(function (x) { return x.id === id && x.status === ST.pending ? Object.assign({}, x, { status: st, updatedBy: me(), updatedAt: new Date().toISOString() }, extra || {}) : x; });
          return D;
        }, 'Pass keluar: ' + st.toLowerCase() + ' ' + id + ' (' + me() + ')');
        toast(msg);
      } catch (e) { toast('Gagal: ' + e.message, true); }
      finally { loading(false); render(); }
    }

    async function remove(r) {
      if (!ctx.isMainOwner() || r.status !== ST.ok) return;
      if (!confirm('Hapus permanen Pass Keluar ' + (r.no || '') + ' ke ' + r.to + '?\nData pass akan hilang dari daftar (nomor pass tidak dipakai ulang).')) return;
      loading('Menghapus pass…');
      try {
        await savePass(function (D) { D.list = D.list.filter(function (x) { return x.id !== r.id; }); return D; }, 'Pass keluar: hapus ' + (r.no || r.id) + ' (' + me() + ')');
        if (ctx.audit) ctx.audit('Pass Keluar', (r.no || r.id) + ' · ke ' + (r.to || '') + ' · ' + r.items.length + ' item', r);
        toast('Pass ' + (r.no || '') + ' dihapus');
      } catch (e) { toast('Gagal menghapus: ' + e.message, true); }
      finally { loading(false); render(); }
    }

    // ================= PDF (A5 landscape, sama seperti Pass Keluar Barang sistem) =================
    function loadJsPDF() {
      if (root.jspdf) return Promise.resolve(root.jspdf.jsPDF);
      return new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = 'vendor/jspdf.umd.min.js';
        s.onload = function () { resolve(root.jspdf.jsPDF); };
        s.onerror = function () { reject(new Error('Library PDF gagal dimuat')); };
        document.head.appendChild(s);
      });
    }
    async function logo() {
      if (P.logo) return P.logo;
      var b = await (await fetch('assets/pass/logo-pep.png')).blob();
      P.logo = await new Promise(function (res) { var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.readAsDataURL(b); });
      return P.logo;
    }
    function keterangan(x) { return String(x.d || '') + '/ (' + String(x.note || '') + ')'; }
    function stamp(d) {
      var h = d.getHours(), ap = h < 12 ? 'am' : 'pm', h12 = h % 12 || 12;
      return pad(d.getDate()) + '-' + pad(d.getMonth() + 1) + '-' + d.getFullYear() + ' ' + pad(h12) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + ' ' + ap;
    }
    async function buildPdf(r) {
      var JsPDF = await loadJsPDF(), lg = await logo();
      var sg = r.status === ST.ok && P.signs.users[r.signerId] ? P.signs.users[r.signerId] : null;
      var doc = new JsPDF({ orientation: 'landscape', unit: 'pt', format: 'a5' });
      var W = doc.internal.pageSize.getWidth(), L = 23.6, R = 572.7;
      var pages = Math.max(1, Math.ceil(r.items.length / ROWS_PER_PAGE)), printed = stamp(new Date());
      doc.setLineWidth(0.6);
      doc.setDrawColor(0);
      for (var pg = 0; pg < pages; pg++) {
        if (pg) doc.addPage('a5', 'landscape');
        doc.setTextColor(0);
        doc.addImage(lg, 'PNG', 25, 24.5, 56.7, 35.4);
        doc.setFont('times', 'bold'); doc.setFontSize(12.5);
        doc.text('PASS KELUAR BARANG', 327, 35, { align: 'center' });
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
        doc.text('No: ' + (r.no || '(menunggu approval)'), 327, 46, { align: 'center' });
        doc.setFontSize(8.5);
        [['DARI', r.from || 'WAREHOUSE FIELD RANTAU', 73], ['DIKIRIM KE', r.to, 87], ['REFERENSI', r.ref || '', 101]].forEach(function (x) {
          doc.text(x[0], 25, x[2]); doc.text(': ' + String(x[1] || '').toUpperCase(), 107, x[2]);
        });
        doc.text('TANGGAL', 298, 73); doc.text(': ' + dmy(r.date), 381, 73);
        // tabel material
        var top = 111, hh = 15.2, cx = [L, 54.3, 141.4, 174.7, 450.3, R];
        var pageItems = r.items.slice(pg * ROWS_PER_PAGE, (pg + 1) * ROWS_PER_PAGE), ys = [top + hh];
        for (var k = 0; k < ROWS_PER_PAGE; k++) ys.push(ys[k] + (k < pageItems.length ? 13 : 16.1));
        var bottom = ys[ys.length - 1];
        doc.rect(L, top, R - L, bottom - top);
        cx.slice(1, -1).forEach(function (x) { doc.line(x, top, x, bottom); });
        ys.forEach(function (y) { doc.line(L, y, R, y); });
        doc.setFontSize(10);
        ['NO', 'JUMLAH', 'UOM', 'KETERANGAN', 'NO MATERIAL'].forEach(function (t, i) { doc.text(t, (cx[i] + cx[i + 1]) / 2, top + 11, { align: 'center' }); });
        doc.setFontSize(7.2);
        pageItems.forEach(function (x, i) {
          var y = ys[i] + 9.3, n = pg * ROWS_PER_PAGE + i + 1;
          doc.text(String(n), (cx[0] + cx[1]) / 2, y, { align: 'center' });
          doc.text(qty(x.qty), (cx[1] + cx[2]) / 2, y, { align: 'center' });
          doc.text(String(x.u || '').toUpperCase(), (cx[2] + cx[3]) / 2, y, { align: 'center' });
          var ket = keterangan(x), fs = 7.2;
          while (doc.getStringUnitWidth(ket) * fs > cx[4] - cx[3] - 4 && fs > 5) fs -= 0.2;
          doc.setFontSize(fs);
          doc.text(doc.splitTextToSize(ket, cx[4] - cx[3] - 4)[0], cx[3] + 2, y);
          doc.setFontSize(7.2);
          doc.text(String(x.m || ''), (cx[4] + cx[5]) / 2, y, { align: 'center' });
        });
        // tanda tangan
        var st = 313.5, sx = [L, 160.4, 297.8, 435.3, R], sb = 373.5, hdr = 14.2;
        doc.rect(L, st, R - L, sb - st);
        sx.slice(1, -1).forEach(function (x) { doc.line(x, st, x, sb); });
        doc.line(L, st + hdr, R, st + hdr);
        doc.line(L, st + hdr + 16, sx[1], st + hdr + 16);
        doc.line(L, st + hdr + 30, sx[1], st + hdr + 30);
        doc.setFontSize(8.5);
        doc.text('Kendaraan', L + 2, st + 10);
        ['Pemohon', 'Pengirim', 'Penerima'].forEach(function (t, i) { doc.text(t, (sx[i + 1] + sx[i + 2]) / 2, st + 10, { align: 'center' }); });
        doc.text('Driver', L + 2, st + hdr + 26.5);
        doc.setFontSize(10);
        doc.text(String(r.vehicle || '').toUpperCase(), (sx[0] + sx[1]) / 2, st + hdr + 12.5, { align: 'center' });
        doc.text(String(r.driver || '').toUpperCase(), (sx[0] + sx[1]) / 2, sb - 4, { align: 'center' });
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8.6);
        doc.text(String(r.requester || '').toUpperCase(), (sx[1] + sx[2]) / 2, sb - 5, { align: 'center' });
        doc.text(String(r.receiver || '').toUpperCase(), (sx[3] + sx[4]) / 2, sb - 5, { align: 'center' });
        if (sg) {
          // tanda tangan proporsional (tidak ditarik/digencet), di tengah kolom, tepat di atas nama
          placeSign(doc, sg.img, (sx[2] + sx[3]) / 2, sb - 9, sx[3] - sx[2] - 30, sb - 9 - (st + hdr + 1.5));
          doc.text(String(sg.name || '').toUpperCase(), (sx[2] + sx[3]) / 2, sb - 5, { align: 'center' });
        }
        doc.setFont('times', 'normal'); doc.setFontSize(7.5);
        doc.text('Document printed is issued by PT.Pertamina EP -', 25, 383);
        doc.text('SCM Field Rantau', 25, 392);
        doc.text((pg + 1) + '/' + pages, 300, 387, { align: 'center' });
        doc.text(printed, 569, 387, { align: 'right' });
        if (r.status !== ST.ok) {
          doc.setTextColor(200, 40, 40); doc.setFont('helvetica', 'bold'); doc.setFontSize(30);
          doc.text(r.status === ST.pending ? 'DRAFT - MENUNGGU APPROVAL' : r.status.toUpperCase(), W / 2, 215, { align: 'center', angle: 12 });
          doc.setTextColor(0);
        }
      }
      return doc;
    }
    // Tempel tanda tangan: skala proporsional agar muat di kotak maxW x maxH, rata tengah (cx) & rata bawah (bottom)
    function placeSign(doc, img, cx, bottom, maxW, maxH) {
      var ip = doc.getImageProperties(img), k = Math.min(maxW / ip.width, maxH / ip.height);
      var w = ip.width * k, h = ip.height * k;
      doc.addImage(img, 'PNG', cx - w / 2, bottom - h, w, h);
    }
    function fileName(r) { return 'PassKeluar_' + String(r.no || ('DRAFT_' + r.id)).replace(/[\/\\]/g, '_') + '.pdf'; }
    async function downloadPdf(r) {
      loading('Membuat PDF…');
      try { (await buildPdf(r)).save(fileName(r)); }
      catch (e) { toast('Gagal membuat PDF: ' + e.message, true); }
      finally { loading(false); }
    }
    // Preview untuk Call Order (sebelum diajukan)
    async function previewDraft(head, items) {
      await load().catch(function () {});
      return downloadPdf(Object.assign({ id: 'draft', status: ST.pending, items: items }, head));
    }

    // ================= Tanda tangan (Owner / Co-Owner) =================
    function signCard() {
      if (!canApprove()) return '';
      return '<div class="card card-pad" style="margin-top:16px" id="signCard"><h4 class="section-title">Tanda tangan &amp; profil penyetuju</h4>' +
        '<p class="small muted" style="margin-top:0">Nama &amp; tanda tangan ini otomatis menjadi <b>Pengirim</b> di PDF Pass Keluar, dan tertempel di dokumen <b>Penerimaan Barang</b> (BASTB, SPB, LHPB, Form Denda) saat Anda meng-approve. Disimpan terenkripsi.</p><div id="signBody" class="small muted">Memuat…</div></div>';
    }
    async function fillSignCard() {
      var box = document.getElementById('signBody');
      if (!box) return;
      try { await load(); } catch (e) { box.textContent = 'Gagal memuat: ' + e.message; return; }
      var sg = P.signs.users[S.user.id] || {};
      box.className = '';
      box.innerHTML = '<div class="sign-grid"><div class="sign-preview">' + (sg.img ? '<img id="signImg" src="' + sg.img + '" alt="Tanda tangan">' : '<div class="muted" id="signImg">Belum ada tanda tangan</div>') + '<b>' + esc(sg.name || '') + '</b></div>' +
        '<div style="display:flex;flex-direction:column;gap:8px"><label class="fleet-fld"><span>Nama di Pass Keluar</span><input class="input" id="signName" value="' + esc(sg.name || '') + '" placeholder="mis. GERALD FREDERICK R. S."></label>' +
        '<div class="sign-prof"><label class="fleet-fld"><span>Nama lengkap (BASTB/LHPB/SPB/Denda)</span><input class="input" id="signFull" value="' + esc(sg.full || '') + '" placeholder="mis. Gerald Frederick Ryel Samosir"></label>' +
        '<label class="fleet-fld"><span>No. ID</span><input class="input mono" id="signNid" value="' + esc(sg.nid || '') + '"></label>' +
        '<label class="fleet-fld"><span>Jabatan</span><input class="input" id="signJab" value="' + esc(sg.jab || '') + '" placeholder="mis. Officer SCM Support &amp; Receiving Rantau"></label>' +
        '<label class="fleet-fld"><span>Fungsi / Sub Fungsi</span><input class="input" id="signFungsi" value="' + esc(sg.fungsi || '') + '" placeholder="SCM"></label></div>' +
        '<label class="fleet-fld"><span>Gambar tanda tangan (PNG/JPG — latar polos otomatis dibuat transparan)</span><input class="input" type="file" id="signFile" accept="image/*"></label>' +
        '<div class="toolbar"><button class="btn sm primary" data-pa="sign-save">Simpan tanda tangan</button></div></div></div>';
    }
    // Hapus latar (warna sudut gambar), potong ke goresan, perkecil
    function cleanSignature(file) {
      return new Promise(function (resolve, reject) {
        var img = new Image(), url = URL.createObjectURL(file);
        img.onload = function () {
          var c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
          var g = c.getContext('2d'); g.drawImage(img, 0, 0);
          var d = g.getImageData(0, 0, c.width, c.height), a = d.data;
          var bg = [a[0], a[1], a[2]], minX = c.width, minY = c.height, maxX = 0, maxY = 0;
          for (var i = 0; i < a.length; i += 4) {
            var dist = Math.abs(a[i] - bg[0]) + Math.abs(a[i + 1] - bg[1]) + Math.abs(a[i + 2] - bg[2]);
            if (a[i + 3] < 20 || dist < 90) a[i + 3] = 0;
            else {
              a[i + 3] = Math.min(255, Math.round((dist - 90) * 2.2));
              var p = i / 4, x = p % c.width, y = (p / c.width) | 0;
              if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
            }
          }
          if (maxX <= minX) { reject(new Error('Tanda tangan tidak terdeteksi')); return; }
          g.putImageData(d, 0, 0);
          var w = maxX - minX + 1, h = maxY - minY + 1, sc = Math.min(1, 600 / w);
          var o = document.createElement('canvas'); o.width = Math.round(w * sc); o.height = Math.round(h * sc);
          o.getContext('2d').drawImage(c, minX, minY, w, h, 0, 0, o.width, o.height);
          URL.revokeObjectURL(url);
          resolve(o.toDataURL('image/png'));
        };
        img.onerror = function () { reject(new Error('Gambar tidak bisa dibaca')); };
        img.src = url;
      });
    }
    async function saveSign() {
      var name = ($('#signName').value || '').trim(), f = $('#signFile').files[0], cur = (P.signs.users[S.user.id] || {});
      if (!name) { toast('Isi nama di Pass Keluar', true); return; }
      loading('Menyimpan tanda tangan…');
      try {
        var img = f ? await cleanSignature(f) : cur.img;
        if (!img) throw new Error('Pilih gambar tanda tangan');
        P.signs = await atomic('data/signs.js', 'MW_SIGNS', 'Nama & tanda tangan penyetuju Pass Keluar', function (D) {
          D = D || { users: {} };
          D.users[S.user.id] = { name: name, img: img, user: me(), at: new Date().toISOString(),
            full: ($('#signFull').value || '').trim(), nid: ($('#signNid').value || '').trim(), jab: ($('#signJab').value || '').trim(), fungsi: ($('#signFungsi').value || '').trim() };
          return D;
        }, 'Pass keluar: tanda tangan ' + me());
        toast('Tanda tangan disimpan');
        fillSignCard();
      } catch (e) { toast('Gagal: ' + e.message, true); }
      finally { loading(false); }
    }

    // ---------- Event ----------
    document.addEventListener('click', function (e) {
      var a = e.target.closest('[data-pa]');
      if (!a) return;
      e.preventDefault();
      var act = a.getAttribute('data-pa'), id = a.getAttribute('data-id'), r = id ? find(id) : null;
      if (act === 'tab') { P.filt = a.getAttribute('data-v'); render(); }
      else if (act === 'refresh') render(true);
      else if (act === 'pdf' && r) downloadPdf(r);
      else if (act === 'approve') openApprove(id);
      else if (act === 'approve-do') approve(id);
      else if (act === 'reject') { var why = prompt('Alasan menolak (opsional):', ''); if (why !== null) setStatus(id, ST.no, { rejectBy: me(), rejectNote: why }, 'Pass ditolak'); }
      else if (act === 'delete' && r) remove(r);
      else if (act === 'edit') openEdit(id);
      else if (act === 'edit-add' && P.edit) { syncEdit(); P.edit.items.push({ m: '', d: '', u: 'PCS', qty: null, note: '' }); drawEdit(); }
      else if (act === 'edit-del' && P.edit) { syncEdit(); P.edit.items.splice(+a.getAttribute('data-i'), 1); drawEdit(); }
      else if (act === 'edit-save') saveEdit();
      else if (act === 'edit-pdf' && P.edit) { syncEdit(); downloadPdf(P.edit); }
      else if (act === 'cancel') { if (confirm('Batalkan pengajuan pass ini?')) setStatus(id, ST.cancel, null, 'Pengajuan dibatalkan'); }
      else if (act === 'sign-save') saveSign();
      else if (act === 'manual-add') addManual();
    });

    function pendingCount() { return P.data ? P.data.list.filter(function (r) { return r.status === ST.pending; }).length : 0; }
    function reset() { P.data = null; P.signs = null; P.filt = ST.pending; }
    return { render: render, submit: submit, previewDraft: previewDraft, signCard: signCard, fillSignCard: fillSignCard, load: load, pendingCount: pendingCount, reset: reset,
      // dipakai modul Penerimaan Barang
      atomic: atomic, readJSON: readJSON, loadJsPDF: loadJsPDF, placeSign: placeSign, signs: function () { return P.signs; } };
  };
})(this);
