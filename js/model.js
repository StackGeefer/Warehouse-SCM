/*
 * Model data: menggabungkan MB52 (stok), ME3N (kontrak/OA) dan MB51 (pemakaian)
 * menjadi satu daftar material yang siap dicari.
 */
(function (root) {
  'use strict';

  var DEFAULT_SETTINGS = {
    fields: [
      { name: 'Rantau', plants: ['W101'], home: true },
      { name: 'Lirik', plants: ['W803', 'W104'] },
      { name: 'Jambi', plants: ['W802'] },
      { name: 'Pangsu', plants: ['W102'] }
    ],
    coverMonths: 3,
    historyYear: null
  };

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function addMonths(ym, n) {
    var y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + n;
    y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    return y + '-' + String(m + 1).padStart(2, '0');
  }

  // ---------- Ingest hasil parser ke dataset tersimpan ----------
  function ingest(ds, parsed) {
    var notes = [];
    parsed.parts.forEach(function (p) {
      if (p.type === 'mb52') {
        ds.stock = ds.stock || { plants: {} };
        var byPlant = {};
        p.rows.forEach(function (r) { (byPlant[r[0]] = byPlant[r[0]] || []).push(r); });
        var replaced = [], skipped = [];
        p.plants.forEach(function (pl) {
          var cur = ds.stock.plants[pl];
          if (cur && cur.date > parsed.date) { skipped.push(pl + ' (sudah ada data ' + cur.date + ')'); return; }
          ds.stock.plants[pl] = { date: parsed.date, file: parsed.name, hasValue: p.hasValue, rows: byPlant[pl] || [] };
          replaced.push(pl);
        });
        notes.push('Stok MB52: ' + p.rows.length.toLocaleString('id-ID') + ' baris, plant ' + (replaced.join(', ') || '-') +
          (skipped.length ? '. Dilewati (data lebih baru sudah ada): ' + skipped.join(', ') : ''));
      } else if (p.type === 'me3n') {
        ds.oa = { date: parsed.date, file: parsed.name, rows: p.rows };
        notes.push('Kontrak ME3N: ' + p.rows.length.toLocaleString('id-ID') + ' item kontrak');
      } else if (p.type === 'mb51') {
        var cur51 = ds.mb51 || { files: [], agg: {}, min: null, max: null };
        var drop = {};
        p.keys.forEach(function (k) { drop[k] = 1; });
        // Bulan+plant yang ada di file baru menggantikan data lama
        Object.keys(cur51.agg).forEach(function (m) {
          var a = cur51.agg[m];
          Object.keys(a.p).forEach(function (pl) {
            Object.keys(a.p[pl]).forEach(function (ym) { if (drop[pl + '|' + ym]) delete a.p[pl][ym]; });
          });
        });
        Object.keys(p.agg).forEach(function (m) {
          var src = p.agg[m];
          var dst = cur51.agg[m] || (cur51.agg[m] = { d: src.d, u: src.u, p: {} });
          Object.keys(src.p).forEach(function (pl) {
            var dp = dst.p[pl] || (dst.p[pl] = {});
            Object.keys(src.p[pl]).forEach(function (ym) { dp[ym] = src.p[pl][ym]; });
          });
        });
        cur51.files.push({ name: parsed.name, min: p.min, max: p.max, rows: p.rows });
        if (!cur51.min || p.min < cur51.min) cur51.min = p.min;
        if (!cur51.max || p.max > cur51.max) cur51.max = p.max;
        ds.mb51 = cur51;
        notes.push('Pemakaian MB51: ' + p.rows.toLocaleString('id-ID') + ' transaksi GI (' + p.min + ' s/d ' + p.max + ')');
      }
    });
    return notes;
  }

  // ---------- Bangun index ----------
  function build(ds, settings) {
    var today = todayStr();
    var mats = new Map();
    function mat(code) {
      var o = mats.get(code);
      if (!o) {
        o = { m: code, d: '', u: '', st: {}, stv: {}, rows: [], oa: [], use: {} };
        mats.set(code, o);
      }
      return o;
    }
    var plantsAll = {}, plantDates = {};
    var home = settings.fields.filter(function (f) { return f.home; })[0] || settings.fields[0];
    var homePlants = home ? home.plants : [];

    if (ds.stock) {
      Object.keys(ds.stock.plants).forEach(function (pl) {
        var P = ds.stock.plants[pl];
        plantsAll[pl] = 1; plantDates[pl] = P.date;
        P.rows.forEach(function (r) {
          var o = mat(r[1]);
          // deskripsi mengikuti MB52 (utamakan plant home)
          if (!o.d || homePlants.indexOf(pl) >= 0) { o.d = r[2] || o.d; o.u = r[6] || o.u; }
          o.st[pl] = (o.st[pl] || 0) + r[5];
          if (r[7] != null) o.stv[pl] = (o.stv[pl] || 0) + r[7];
          o.rows.push({ plant: pl, sloc: r[3], batch: r[4], qty: r[5], uom: r[6], value: r[7], cur: r[8], transit: r[9] });
        });
      });
    }

    var oaMap = new Map();
    if (ds.oa) {
      ds.oa.rows.forEach(function (l) {
        var o = mat(l.m);
        if (!o.d) { o.d = l.d; o.u = l.u; }
        var line = Object.assign({ key: l.po + '/' + l.item, active: !l.ve || l.ve >= today }, l);
        o.oa.push(line);
        var h = oaMap.get(l.po);
        if (!h) {
          h = { po: l.po, vendor: l.vendor, vendorCode: l.vendorCode, pg: l.pg, vs: l.vs, ve: l.ve, cur: l.cur,
            tgtHdr: l.tgtHdr, totalOpen: l.totalOpen, docDate: l.docDate, lines: [], active: line.active };
          oaMap.set(l.po, h);
        }
        if (l.ve && (!h.ve || l.ve > h.ve)) { h.ve = l.ve; h.active = h.ve >= today; }
        h.lines.push(line);
      });
    }

    var mb51Max = ds.mb51 && ds.mb51.max ? ds.mb51.max.slice(0, 7) : null;
    if (ds.mb51) {
      Object.keys(ds.mb51.agg).forEach(function (m) {
        var a = ds.mb51.agg[m];
        var o = mat(m);
        if (!o.d) { o.d = a.d; o.u = a.u; }
        o.use = a.p;
      });
    }

    var dataYear = mb51Max ? +mb51Max.slice(0, 4) : new Date().getFullYear();
    var histYear = settings.historyYear || (dataYear - 1);
    var last12 = [];
    if (mb51Max) for (var i = 11; i >= 0; i--) last12.push(addMonths(mb51Max, -i));

    var fieldPlantIdx = {};
    settings.fields.forEach(function (f, i) { f.plants.forEach(function (p) { fieldPlantIdx[p] = i; }); });

    var list = [];
    mats.forEach(function (o) {
      o.ix = root.Search.prepare(o.m, o.d);
      // stok per field
      o.fs = settings.fields.map(function (f) {
        var q = 0, has = false;
        f.plants.forEach(function (p) { if (o.st[p] != null || plantsAll[p]) { q += o.st[p] || 0; has = true; } });
        return has ? q : null;
      });
      o.other = 0; o.otherPlants = [];
      Object.keys(o.st).forEach(function (p) {
        if (fieldPlantIdx[p] == null && o.st[p] > 0) { o.other += o.st[p]; o.otherPlants.push(p); }
      });
      // pemakaian di field home
      var hu = {};
      homePlants.forEach(function (p) {
        var u = o.use[p]; if (!u) return;
        Object.keys(u).forEach(function (ym) { hu[ym] = (hu[ym] || 0) + u[ym]; });
      });
      o.homeUse = hu;
      o.useY = {};
      Object.keys(hu).forEach(function (ym) { var y = ym.slice(0, 4); o.useY[y] = (o.useY[y] || 0) + hu[ym]; });
      o.spark = last12.map(function (ym) { return hu[ym] || 0; });
      o.avg12 = o.spark.reduce(function (a, b) { return a + b; }, 0) / 12;
      o.hist = o.useY[histYear] || 0;
      o.ytd = o.useY[dataYear] || 0;
      // kontrak: aktif dulu, lalu harga termurah
      o.oa.sort(function (a, b) {
        if (a.active !== b.active) return a.active ? -1 : 1;
        if (a.cur !== b.cur) return a.cur === 'IDR' ? -1 : 1;
        return a.price - b.price;
      });
      o.bestOA = o.oa.filter(function (l) { return l.active; })[0] || null;
      // harga rata-rata stok (MAP) dari nilai MB52
      var mq = 0, mv = 0;
      Object.keys(o.stv).forEach(function (p) { if (o.st[p] > 0) { mq += o.st[p]; mv += o.stv[p]; } });
      o.map = mq > 0 ? mv / mq : null;
      o.homeStock = o.fs[settings.fields.indexOf(home)] || 0;
      o.zoneStock = o.fs.reduce(function (a, b, i) { return a + (settings.fields[i] === home ? 0 : (b || 0)); }, 0);
      list.push(o);
    });

    return {
      mats: mats, list: list, oaMap: oaMap, plantsAll: Object.keys(plantsAll).sort(), plantDates: plantDates,
      home: home, homePlants: homePlants, homeDate: homePlants.map(function (p) { return plantDates[p]; }).filter(Boolean).sort().pop() || null,
      dataYear: dataYear, histYear: histYear, last12: last12, mb51Max: mb51Max, today: today,
      fieldOfPlant: function (p) { var i = fieldPlantIdx[p]; return i == null ? null : settings.fields[i]; }
    };
  }

  root.Model = { DEFAULT_SETTINGS: DEFAULT_SETTINGS, ingest: ingest, build: build, addMonths: addMonths };
})(this);
