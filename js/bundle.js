/*
 * Data bawaan website (terenkripsi).
 * File data/sap-data.js berisi data SAP yang dikompres (gzip) lalu dienkripsi
 * AES-256-GCM dengan kunci dari password (PBKDF2-SHA256). Tanpa password,
 * isi file tidak bisa dibaca walaupun repo/website bersifat publik.
 * Dipakai di browser dan di Node (tools/build-data.js).
 */
(function (root) {
  'use strict';
  var MAGIC = 'MWD1';
  var ITER = 250000;
  var cryptoObj = root.crypto || (typeof globalThis !== 'undefined' && globalThis.crypto);

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
  function streamBytes(u8, stream) {
    return new Response(new Blob([u8]).stream().pipeThrough(stream)).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }
  function deriveKey(password, salt) {
    var enc = new TextEncoder();
    return cryptoObj.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']).then(function (base) {
      return cryptoObj.subtle.deriveKey({ name: 'PBKDF2', salt: salt, iterations: ITER, hash: 'SHA-256' },
        base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    });
  }

  // ds (objek) -> string terenkripsi
  function encrypt(ds, password) {
    var json = new TextEncoder().encode(JSON.stringify(ds));
    var salt = cryptoObj.getRandomValues(new Uint8Array(16));
    var iv = cryptoObj.getRandomValues(new Uint8Array(12));
    return streamBytes(json, new CompressionStream('gzip')).then(function (gz) {
      return deriveKey(password, salt).then(function (key) {
        return cryptoObj.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, gz);
      });
    }).then(function (ct) {
      var c = new Uint8Array(ct), out = new Uint8Array(28 + c.length);
      out.set(salt, 0); out.set(iv, 16); out.set(c, 28);
      return MAGIC + '.' + toB64(out);
    });
  }

  // string terenkripsi -> ds ; gagal (password salah) => Error
  function decrypt(payload, password) {
    if (String(payload).slice(0, 5) !== MAGIC + '.') return Promise.reject(new Error('Format data bawaan tidak dikenal'));
    var raw = fromB64(payload.slice(5));
    var salt = raw.subarray(0, 16), iv = raw.subarray(16, 28), ct = raw.subarray(28);
    return deriveKey(password, salt).then(function (key) {
      return cryptoObj.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, ct);
    }).catch(function () {
      throw new Error('Password salah');
    }).then(function (gz) {
      return streamBytes(new Uint8Array(gz), new DecompressionStream('gzip'));
    }).then(function (json) {
      return JSON.parse(new TextDecoder().decode(json));
    });
  }

  // Info ringkas (tidak rahasia) untuk ditampilkan sebelum password dimasukkan
  function info(ds) {
    var plants = ds.stock ? Object.keys(ds.stock.plants) : [];
    var dates = plants.map(function (p) { return ds.stock.plants[p].date; }).sort();
    return {
      stockPlants: plants.length, stockDate: dates.length ? dates[dates.length - 1] : null,
      oaDate: ds.oa ? ds.oa.date : null,
      mb51Min: ds.mb51 ? ds.mb51.min : null, mb51Max: ds.mb51 ? ds.mb51.max : null
    };
  }

  // Isi file data/sap-data.js
  function fileContent(ds, password) {
    return encrypt(ds, password).then(function (payload) {
      var obj = { v: 1, builtAt: new Date().toISOString(), info: info(ds), payload: payload };
      return '/* Data SAP bawaan Material Warehouse — TERENKRIPSI (AES-256-GCM). Dibuat ' + obj.builtAt + ' */\n' +
        'window.SAP_BUNDLE = ' + JSON.stringify(obj) + ';\n';
    });
  }

  // Gabungkan data bawaan ke data lokal: yang tanggalnya lebih baru menang
  function merge(ds, b) {
    var notes = [];
    if (b.stock) {
      ds.stock = ds.stock || { plants: {} };
      Object.keys(b.stock.plants).forEach(function (p) {
        var cur = ds.stock.plants[p], nb = b.stock.plants[p];
        if (!cur || cur.date <= nb.date) { ds.stock.plants[p] = nb; }
      });
      notes.push('stok');
    }
    if (b.oa && (!ds.oa || ds.oa.date <= b.oa.date)) { ds.oa = b.oa; notes.push('kontrak'); }
    if (b.mb51 && (!ds.mb51 || ds.mb51.max <= b.mb51.max)) { ds.mb51 = b.mb51; notes.push('pemakaian'); }
    return notes;
  }

  root.Bundle = { encrypt: encrypt, decrypt: decrypt, fileContent: fileContent, merge: merge, info: info };
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
