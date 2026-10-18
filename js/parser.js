/*
 * Parser file Excel SAP (MB52 / ZMB52, ME3N, MB51).
 * Dipakai di Web Worker (worker.js) maupun di halaman utama (fallback).
 * Jenis file dideteksi otomatis dari nama kolom, jadi urutan/nama sheet bebas.
 */
(function (root) {
  'use strict';

  // Movement type yang dihitung sebagai pemakaian (Goods Issue + reversal-nya)
  var GI_MVT = { 201: 1, 202: 1, 221: 1, 222: 1, 261: 1, 262: 1, 291: 1, 292: 1, 949: 1, 950: 1, 963: 1, 964: 1 };

  var SPECS = {
    mb51: {
      req: ['movement type', 'posting date', 'quantity', 'material', 'plant'],
      cols: {
        plant: ['plant'], material: ['material'], desc: ['material description'],
        mvt: ['movement type'], qty: ['quantity'], uom: ['base unit of measure', 'unit of entry'],
        date: ['posting date']
      }
    },
    me3n: {
      req: ['purchasing document', 'material', 'net price'],
      cols: {
        po: ['purchasing document'], item: ['item'], vs: ['validity per. start', 'validity period start'],
        ve: ['validity period end', 'validity per. end'], material: ['material'], desc: ['short text'],
        uom: ['order unit'], price: ['net price'], tgtHdr: ['target val. (header)', 'target value (header)'],
        cur: ['currency'], rel: ['released value'], open: ['open value'], openQty: ['open target quantity'],
        tgtQty: ['target quantity'], pg: ['purchasing group'], docDate: ['document date'],
        vendor: ['vendor/supplying plant', 'vendor', 'supplier'], totalOpen: ['total open value'], plant: ['plant']
      }
    },
    mb52: {
      req: ['plant', 'material', 'unrestricted'],
      cols: {
        plant: ['plant'], material: ['material'], desc: ['material description'], qty: ['unrestricted'],
        uom: ['base unit of measure'], sloc: ['storage location'], batch: ['batch'],
        value: ['value unrestricted'], cur: ['currency'], transit: ['stock in transit'], blocked: ['blocked']
      }
    }
  };
  var ORDER = ['mb51', 'me3n', 'mb52'];

  function normHead(h) {
    return String(h == null ? '' : h).toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function classifyRow(row) {
    if (!row || !row.length) return null;
    var heads = row.map(normHead);
    for (var i = 0; i < ORDER.length; i++) {
      var spec = SPECS[ORDER[i]];
      var ok = spec.req.every(function (r) { return heads.indexOf(r) >= 0; });
      if (!ok) continue;
      var map = {};
      Object.keys(spec.cols).forEach(function (k) {
        var names = spec.cols[k];
        for (var j = 0; j < names.length; j++) {
          var idx = heads.indexOf(names[j]);
          if (idx >= 0) { map[k] = idx; break; }
        }
      });
      return { type: ORDER[i], map: map };
    }
    return null;
  }

  function str(v) {
    if (v == null) return '';
    return String(v).trim();
  }

  function num(v) {
    if (v == null || v === '') return 0;
    if (typeof v === 'number') return v;
    var s = String(v).trim().replace(/\s/g, '');
    var neg = false;
    if (/-$/.test(s)) { neg = true; s = s.slice(0, -1); } // format SAP "15-"
    if (/^-?[\d.]+,\d+$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
    var n = parseFloat(s);
    if (isNaN(n)) return 0;
    return neg ? -n : n;
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  // Hasil: 'YYYY-MM-DD' atau null
  function xlDate(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') {
      var d = new Date(Math.round((v - 25569) * 86400000));
      return d.toISOString().slice(0, 10);
    }
    if (v instanceof Date) return v.getFullYear() + '-' + pad(v.getMonth() + 1) + '-' + pad(v.getDate());
    var s = String(v).trim(), m;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return m[1] + '-' + pad(+m[2]) + '-' + pad(+m[3]);
    if ((m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/))) return m[3] + '-' + pad(+m[2]) + '-' + pad(+m[1]);
    if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/))) return m[3] + '-' + pad(+m[1]) + '-' + pad(+m[2]);
    return null;
  }

  // Tebak tanggal data dari nama file, contoh "10.14_ZMB52" -> 14 Okt, "ME3N_100_10122026" -> 12 Okt 2026
  function guessDate(name, fallback) {
    var today = new Date();
    var y = today.getFullYear();
    var todayStr = today.toISOString().slice(0, 10);
    function valid(yy, mm, dd) {
      if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
      var s = yy + '-' + pad(mm) + '-' + pad(dd);
      return s <= todayStr ? s : null;
    }
    var base = String(name || '').replace(/\.[a-z]+$/i, '');
    var m = base.match(/(?:^|[^\d])(\d{2})(\d{2})(\d{4})(?!\d)/);
    if (m) {
      var a = valid(+m[3], +m[1], +m[2]) || valid(+m[3], +m[2], +m[1]);
      if (a) return a;
    }
    m = base.match(/(?:^|[^\d])(\d{1,2})[.\-](\d{1,2})(?![\d.])/);
    if (m) {
      var b = valid(y, +m[1], +m[2]) || valid(y, +m[2], +m[1]) || valid(y - 1, +m[1], +m[2]);
      if (b) return b;
    }
    return fallback || todayStr;
  }

  function vendorSplit(v) {
    var s = str(v);
    var m = s.match(/^(\S+)\s{2,}(.*)$/) || s.match(/^(\d+)\s+(.*)$/);
    return m ? { code: m[1], name: m[2].trim() } : { code: '', name: s };
  }

  function sheetRows(XLSX, ws) {
    return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false });
  }

  function extractMB52(rows, hr, c) {
    var out = [], plants = {};
    for (var i = hr + 1; i < rows.length; i++) {
      var r = rows[i];
      if (!r) continue;
      var plant = str(r[c.plant]), mat = str(r[c.material]);
      if (!plant || !mat) continue;
      plants[plant] = 1;
      out.push([
        plant, mat, str(r[c.desc]), str(r[c.sloc]), str(r[c.batch]),
        num(r[c.qty]), str(r[c.uom]),
        c.value != null ? num(r[c.value]) : null,
        c.cur != null ? str(r[c.cur]) : '',
        c.transit != null ? num(r[c.transit]) : 0
      ]);
    }
    return { type: 'mb52', plants: Object.keys(plants).sort(), rows: out, hasValue: c.value != null };
  }

  function extractME3N(rows, hr, c) {
    var out = [];
    for (var i = hr + 1; i < rows.length; i++) {
      var r = rows[i];
      if (!r) continue;
      var po = str(r[c.po]), mat = str(r[c.material]);
      if (!po || !mat) continue;
      var v = vendorSplit(r[c.vendor]);
      out.push({
        po: po, item: str(r[c.item]), vs: xlDate(r[c.vs]), ve: xlDate(r[c.ve]),
        m: mat, d: str(r[c.desc]), u: str(r[c.uom]), price: num(r[c.price]),
        cur: str(r[c.cur]) || 'IDR', tgtHdr: num(r[c.tgtHdr]), rel: num(r[c.rel]), open: num(r[c.open]),
        openQty: num(r[c.openQty]), tgtQty: num(r[c.tgtQty]), pg: str(r[c.pg]), docDate: xlDate(r[c.docDate]),
        vendor: v.name, vendorCode: v.code, totalOpen: num(r[c.totalOpen])
      });
    }
    return { type: 'me3n', rows: out };
  }

  function extractMB51(rows, hr, c) {
    var agg = {}, keys = {}, min = null, max = null, used = 0;
    for (var i = hr + 1; i < rows.length; i++) {
      var r = rows[i];
      if (!r) continue;
      var mvt = parseInt(r[c.mvt], 10);
      if (!GI_MVT[mvt]) continue;
      var plant = str(r[c.plant]), mat = str(r[c.material]);
      var date = xlDate(r[c.date]);
      if (!plant || !mat || !date) continue;
      var ym = date.slice(0, 7);
      if (!min || date < min) min = date;
      if (!max || date > max) max = date;
      keys[plant + '|' + ym] = 1;
      var a = agg[mat] || (agg[mat] = { d: str(r[c.desc]), u: str(r[c.uom]), p: {} });
      var p = a.p[plant] || (a.p[plant] = {});
      // Quantity GI bernilai negatif; pemakaian = -Quantity
      p[ym] = (p[ym] || 0) - num(r[c.qty]);
      used++;
    }
    return { type: 'mb51', agg: agg, keys: Object.keys(keys), min: min, max: max, rows: used };
  }

  function parseFile(XLSX, buf, name, lastModified) {
    var data = new Uint8Array(buf);
    var wb0 = XLSX.read(data, { type: 'array', sheetRows: 12 });
    var found = [];
    wb0.SheetNames.forEach(function (sn) {
      var rows = sheetRows(XLSX, wb0.Sheets[sn]);
      for (var r = 0; r < rows.length; r++) {
        var cls = classifyRow(rows[r]);
        if (cls) { found.push({ sheet: sn, type: cls.type, hr: r, map: cls.map }); break; }
      }
    });
    if (!found.length) {
      throw new Error('Format tidak dikenali. Pastikan file berisi export SAP MB52/ZMB52, ME3N, atau MB51 dengan baris judul kolom asli.');
    }
    var wb = XLSX.read(data, { type: 'array', sheets: found.map(function (f) { return f.sheet; }), dense: true });
    var fb = lastModified ? new Date(lastModified).toISOString().slice(0, 10) : null;
    var parts = found.map(function (f) {
      var rows = sheetRows(XLSX, wb.Sheets[f.sheet]);
      var res = f.type === 'mb52' ? extractMB52(rows, f.hr, f.map)
        : f.type === 'me3n' ? extractME3N(rows, f.hr, f.map)
          : extractMB51(rows, f.hr, f.map);
      res.sheet = f.sheet;
      return res;
    });
    return { name: name, date: guessDate(name, fb), parts: parts };
  }

  root.Parser = { parseFile: parseFile, guessDate: guessDate, xlDate: xlDate, num: num };
})(typeof self !== 'undefined' ? self : this);
