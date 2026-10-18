/*
 * Vault: login, enkripsi data SAP, dan versi data.
 *
 * - Data SAP dienkripsi AES-256-GCM dengan satu "kunci data" acak.
 * - Kunci data itu disimpan terbungkus (wrapped) untuk tiap pengguna memakai
 *   password-nya (PBKDF2-SHA256). Login berhasil = kunci data terbuka.
 * - File di repo (data/*.js) aman walau repo publik: tanpa login yang benar
 *   isinya tidak bisa dibaca.
 * - Setiap jenis data (stok, kontrak, pemakaian) disimpan maksimal 3 versi.
 * - Riwayat order & dokumen TKO (PDF) juga disimpan terenkripsi.
 *
 * Dipakai di browser dan Node (tools/init-data.js).
 */
(function (root) {
  'use strict';
  var ITER = 250000;
  var KEEP_VERSIONS = 3;
  var C = root.crypto || globalThis.crypto;
  var TYPES = ['stock', 'oa', 'mb51'];

  function toB64(u8) {
    var s = '', CH = 0x8000;
    for (var i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
    return btoa(s);
  }
  function fromB64(b64) {
    var s = atob(b64), u8 = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
    return u8;
  }
  function hex(buf) {
    return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  function streamBytes(u8, stream) {
    return new Response(new Blob([u8]).stream().pipeThrough(stream)).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }

  // ---------- Pengguna ----------
  function normUser(u) { return String(u || '').trim().toLowerCase(); }
  function hashUser(u) {
    return C.subtle.digest('SHA-256', new TextEncoder().encode('mw:' + normUser(u))).then(hex);
  }
  function kek(password, salt) {
    return C.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']).then(function (base) {
      return C.subtle.deriveKey({ name: 'PBKDF2', salt: salt, iterations: ITER, hash: 'SHA-256' },
        base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    });
  }
  function newDataKey() { return C.getRandomValues(new Uint8Array(32)); }

  // Bungkus kunci data dengan password pengguna -> entri users
  function makeUser(username, password, role, dataKey, displayName) {
    var salt = C.getRandomValues(new Uint8Array(16)), iv = C.getRandomValues(new Uint8Array(12));
    return Promise.all([hashUser(username), kek(password, salt)]).then(function (r) {
      return C.subtle.encrypt({ name: 'AES-GCM', iv: iv }, r[1], dataKey).then(function (wk) {
        return { id: r[0], name: displayName || username.trim(), role: role || 'viewer', salt: toB64(salt), iv: toB64(iv), wk: toB64(new Uint8Array(wk)) };
      });
    });
  }

  // Login: cari pengguna & buka kunci data. Gagal => Error
  function login(users, username, password) {
    return hashUser(username).then(function (h) {
      var u = (users || []).filter(function (x) { return x.id === h; })[0];
      if (!u) throw new Error('Username atau password salah');
      return kek(password, fromB64(u.salt)).then(function (k) {
        return C.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(u.iv) }, k, fromB64(u.wk));
      }).then(function (raw) {
        return { user: { id: u.id, name: u.name, role: u.role }, key: new Uint8Array(raw) };
      }, function () { throw new Error('Username atau password salah'); });
    });
  }

  // ---------- Enkripsi data ----------
  function aesKey(raw) { return C.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']); }
  function encrypt(raw, obj) {
    var iv = C.getRandomValues(new Uint8Array(12));
    return streamBytes(new TextEncoder().encode(JSON.stringify(obj)), new CompressionStream('gzip')).then(function (gz) {
      return aesKey(raw).then(function (k) { return C.subtle.encrypt({ name: 'AES-GCM', iv: iv }, k, gz); });
    }).then(function (ct) {
      var c = new Uint8Array(ct), out = new Uint8Array(12 + c.length);
      out.set(iv, 0); out.set(c, 12);
      return 'MWK1.' + toB64(out);
    });
  }
  function decrypt(raw, str) {
    if (String(str).slice(0, 5) !== 'MWK1.') return Promise.reject(new Error('Format data tidak dikenal'));
    var u8 = fromB64(str.slice(5));
    return aesKey(raw).then(function (k) {
      return C.subtle.decrypt({ name: 'AES-GCM', iv: u8.subarray(0, 12) }, k, u8.subarray(12));
    }).then(function (gz) {
      return streamBytes(new Uint8Array(gz), new DecompressionStream('gzip'));
    }).then(function (json) { return JSON.parse(new TextDecoder().decode(json)); });
  }

  // File biner (PDF) — tanpa gzip karena PDF sudah terkompres
  function encryptBytes(raw, u8) {
    var iv = C.getRandomValues(new Uint8Array(12));
    return aesKey(raw).then(function (k) { return C.subtle.encrypt({ name: 'AES-GCM', iv: iv }, k, u8); }).then(function (ct) {
      var c = new Uint8Array(ct), out = new Uint8Array(12 + c.length);
      out.set(iv, 0); out.set(c, 12);
      return 'MWB1.' + toB64(out);
    });
  }
  function decryptBytes(raw, str) {
    if (String(str).slice(0, 5) !== 'MWB1.') return Promise.reject(new Error('Format file tidak dikenal'));
    var u8 = fromB64(str.slice(5));
    return aesKey(raw).then(function (k) {
      return C.subtle.decrypt({ name: 'AES-GCM', iv: u8.subarray(0, 12) }, k, u8.subarray(12));
    }).then(function (b) { return new Uint8Array(b); });
  }

  // ---------- Isi file data/*.js ----------
  function usersFile(users) {
    return '/* Pengguna Material Warehouse. Hanya hash username & kunci terenkripsi — tidak ada password. */\n' +
      'window.MW_USERS = ' + JSON.stringify(users, null, 1) + ';\n';
  }
  function manifestFile(man) {
    return '/* Daftar versi data SAP (maks. ' + KEEP_VERSIONS + ' versi per jenis). Diperbarui ' + man.updatedAt + ' */\n' +
      'window.MW_MANIFEST = ' + JSON.stringify(man, null, 1) + ';\n';
  }
  function snapFile(id, payload) {
    return '/* Data SAP terenkripsi — ' + id + ' */\nwindow.MW_SNAP = window.MW_SNAP || {};\nwindow.MW_SNAP[' + JSON.stringify(id) + '] = ' + JSON.stringify(payload) + ';\n';
  }
  function snapPath(id) { return 'data/' + id + '.js'; }
  // Riwayat order & daftar dokumen: satu file terenkripsi masing-masing
  function listFile(varName, payload, note) {
    return '/* ' + note + ' — TERENKRIPSI */\nwindow.' + varName + ' = ' + JSON.stringify(payload) + ';\n';
  }
  function docPath(id) { return 'data/docs/' + id + '.js'; }
  function docFile(id, payload) {
    return '/* Dokumen terenkripsi — ' + id + ' */\nwindow.MW_FILE = window.MW_FILE || {};\nwindow.MW_FILE[' + JSON.stringify(id) + '] = ' + JSON.stringify(payload) + ';\n';
  }

  // Ringkasan (tidak rahasia) untuk daftar versi
  function summary(type, d) {
    if (type === 'stock') {
      var plants = Object.keys(d.plants);
      return { plants: plants.length, rows: plants.reduce(function (a, p) { return a + d.plants[p].rows.length; }, 0) };
    }
    if (type === 'oa') return { rows: d.rows.length };
    return { materials: Object.keys(d.agg).length, min: d.min, max: d.max };
  }

  /*
   * Tambah versi baru ke manifest.
   * - Tanggal sama dengan versi terbaru => versi terbaru diganti (bukan versi baru)
   * - Lebih dari KEEP_VERSIONS => versi paling lama dihapus
   * Hasil: { manifest, removed: [id] }
   */
  function addVersion(man, type, entry) {
    var list = (man.versions[type] || []).slice();
    var removed = [];
    if (list.length && list[0].date === entry.date) removed.push(list.shift().id);
    list.unshift(entry);
    while (list.length > KEEP_VERSIONS) removed.push(list.pop().id);
    man.versions[type] = list;
    return removed;
  }

  function emptyManifest() { return { v: 2, updatedAt: new Date().toISOString(), versions: { stock: [], oa: [], mb51: [] } }; }

  root.Vault = {
    TYPES: TYPES, KEEP_VERSIONS: KEEP_VERSIONS,
    newDataKey: newDataKey, makeUser: makeUser, login: login, hashUser: hashUser,
    encrypt: encrypt, decrypt: decrypt, encryptBytes: encryptBytes, decryptBytes: decryptBytes, toB64: toB64, fromB64: fromB64,
    usersFile: usersFile, manifestFile: manifestFile, snapFile: snapFile, snapPath: snapPath,
    listFile: listFile, docPath: docPath, docFile: docFile,
    summary: summary, addVersion: addVersion, emptyManifest: emptyManifest
  };
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
