/*
 * Penyimpanan lokal di browser.
 * - Data SAP (besar) -> IndexedDB
 * - Call Order & pengaturan (kecil) -> localStorage
 * Semua data tetap di komputer pengguna, tidak dikirim ke server mana pun.
 */
(function (root) {
  'use strict';
  var DB_NAME = 'call-order-rantau', STORE = 'datasets', mem = {};

  function open() {
    return new Promise(function (resolve, reject) {
      if (!root.indexedDB) return reject(new Error('IndexedDB tidak tersedia'));
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(STORE); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function tx(mode, fn) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(STORE, mode);
        var r = fn(t.objectStore(STORE));
        t.oncomplete = function () { resolve(r && r.result); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error); };
      });
    });
  }

  var Store = {
    get: function (key) {
      return tx('readonly', function (s) { return s.get(key); })
        .catch(function () { return mem[key]; });
    },
    set: function (key, val) {
      mem[key] = val;
      return tx('readwrite', function (s) { return s.put(val, key); })
        .catch(function (e) { console.warn('Simpan ke IndexedDB gagal, data hanya di memori', e); });
    },
    del: function (key) {
      delete mem[key];
      return tx('readwrite', function (s) { return s.delete(key); }).catch(function () {});
    },
    load: function (key, def) {
      try {
        var v = localStorage.getItem('cor:' + key);
        return v ? JSON.parse(v) : def;
      } catch (e) { return def; }
    },
    save: function (key, val) {
      try { localStorage.setItem('cor:' + key, JSON.stringify(val)); } catch (e) { /* abaikan */ }
    }
  };

  root.Store = Store;
})(this);
