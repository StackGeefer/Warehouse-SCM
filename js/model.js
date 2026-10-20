/*
 * Model data: menggabungkan MB52 (stok), ME3N (kontrak/OA) dan MB51 (pemakaian)
 * menjadi satu daftar material yang siap dicari.
 */
(function (root) {
  'use strict';

  // Field & plant sesuai tabel Regional/Zona. main = tampil sebagai kolom utama.
  function F(name, zone, plants, extra) { return Object.assign({ name: name, zone: zone, plants: plants, main: false }, extra || {}); }
  var DEFAULT_SETTINGS = {
    v: 2,
    fields: [
      F('Rantau', 'Zona 1', ['W101'], { home: true, main: true }),
      F('Lirik', 'Zona 1', ['W803'], { main: true }),
      F('Jambi', 'Zona 1', ['W802'], { main: true }),
      F('Pangsu', 'Zona 1', ['W102'], { main: true, full: 'Pangkalan Susu' }),
      F('Ramba', 'Zona 4', ['W811']),
      F('Prabumulih', 'Zona 4', ['W105']),
      F('Pendopo', 'Zona 4', ['W106']),
      F('Limau', 'Zona 4', ['W801']),
      F('Adera', 'Zona 4', ['W809']),
      F('Tambun', 'Zona 7', ['W204']),
      F('Subang', 'Zona 7', ['W201']),
      F('Jatibarang', 'Zona 7', ['W202']),
      F('Sanggata', 'Zona 9', ['W302']),
      F('Tanjung', 'Zona 9', ['W804']),
      F('Sanga-sanga', 'Zona 9', ['W807']),
      F('Tarakan', 'Zona 9', ['W808'], { full: 'Tarakan Maratua' }),
      F('Bunyu', 'Zona 10', ['W301']),
      F('Cepu', 'Zona 11', ['W203']),
      F('Sukowati', 'Zona 11', ['W402']),
      F('Poleng', 'Zona 11', ['W812']),
      F('Donggi Matindok', 'Zona 13', ['W401']),
      F('Papua', 'Zona 14', ['W303'])
    ],
    coverMonths: 3,
    historyYear: null
  };

  // Purchasing Group kontrak utama, urut prioritas (X07 = SCM PROC ZONA 1, X02 = REG1 PROC ZN 1&4).
  // PG lain (X03, X10, ...) hanya muncul sebagai pilihan "Other".
  var PG_MAIN = ['X07', 'X02'];
  function pgRank(pg) { var i = PG_MAIN.indexOf(String(pg || '').toUpperCase()); return i < 0 ? 99 : i; }

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
  // Plant yang terdaftar sebagai Field; plant lain (proyek selesai, kode lama) diabaikan
  function activePlantsOf(settings) {
    var act = {};
    (settings || DEFAULT_SETTINGS).fields.forEach(function (f) { f.plants.forEach(function (pl) { act[pl] = 1; }); });
    return act;
  }
  function homePlantsOf(settings) {
    var h = (settings || DEFAULT_SETTINGS).fields.filter(function (f) { return f.home; })[0];
    return h ? h.plants : [];
  }
  // Baris stok 0 di plant selain home tidak berguna (hanya "terdaftar" di plant itu)
  // dan bisa membuat jumlah material membengkak (export SAP tanpa "No zero stock lines").
  function keepStockRow(r, homePlants) { return r[5] !== 0 || homePlants.indexOf(r[0]) >= 0; }

  function ingest(ds, parsed, settings) {
    var notes = [], homePlants = homePlantsOf(settings), activePlants = activePlantsOf(settings);
    parsed.parts.forEach(function (p) {
      if (p.type === 'mb52') {
        ds.stock = ds.stock || { plants: {} };
        var byPlant = {}, zero = 0, inactive = {};
        p.rows.forEach(function (r) {
          if (!activePlants[r[0]]) { inactive[r[0]] = (inactive[r[0]] || 0) + 1; return; }
          if (!keepStockRow(r, homePlants)) { zero++; return; }
          (byPlant[r[0]] = byPlant[r[0]] || []).push(r);
        });
        var replaced = [], skipped = [];
        // bersihkan plant yang bukan Field aktif dari data lama
        Object.keys(ds.stock.plants).forEach(function (pl) { if (!activePlants[pl]) delete ds.stock.plants[pl]; });
        p.plants.forEach(function (pl) {
          if (!activePlants[pl]) return;
          var cur = ds.stock.plants[pl];
          if (cur && cur.date > parsed.date) { skipped.push(pl + ' (sudah ada data ' + cur.date + ')'); return; }
          ds.stock.plants[pl] = { date: parsed.date, file: parsed.name, hasValue: p.hasValue, rows: byPlant[pl] || [] };
          replaced.push(pl);
        });
        p.changed = replaced.length > 0;
        var inact = Object.keys(inactive).sort();
        if (p.deleted) notes.push(p.deleted.toLocaleString('id-ID') + ' baris bertanda hapus (DF stor. loc. level = X) diabaikan');
        if (inact.length) notes.push('Plant bukan Field aktif diabaikan: ' + inact.join(', '));
        var nIn = p.rows.length - inact.reduce(function (a, k) { return a + inactive[k]; }, 0);
        notes.push('Stok MB52: ' + (nIn - zero).toLocaleString('id-ID') + ' baris' +
          (zero ? ' (' + zero.toLocaleString('id-ID') + ' baris stok 0 di plant selain ' + homePlants.join('/') + ' diabaikan)' : '') + ', plant ' + (replaced.join(', ') || '-') +
          (skipped.length ? '. Dilewati (data lebih baru sudah ada): ' + skipped.join(', ') : ''));
      } else if (p.type === 'me3n') {
        ds.oa = { date: parsed.date, file: parsed.name, rows: p.rows };
        notes.push('Kontrak ME3N: ' + p.rows.length.toLocaleString('id-ID') + ' item kontrak');
      } else if (p.type === 'mb51') {
        var cur51 = ds.mb51 || { files: [], agg: {}, min: null, max: null };
        var inPlant = {};
        p.plants.forEach(function (pl) { inPlant[pl] = 1; });
        // Periode (tanggal min s/d max) + plant yang ada di file baru menggantikan data lama;
        // data di luar periode itu tetap dipakai -> MB51 cukup ditarik periode terbaru saja.
        function covered(k) {
          if (k.length === 10) return k >= p.min && k <= p.max;
          return k + '-01' >= p.min && k + '-31' <= p.max; // data lama per bulan
        }
        Object.keys(cur51.agg).forEach(function (m) {
          var a = cur51.agg[m];
          Object.keys(a.p).forEach(function (pl) {
            if (!inPlant[pl]) return;
            Object.keys(a.p[pl]).forEach(function (k) { if (covered(k)) delete a.p[pl][k]; });
          });
        });
        Object.keys(p.agg).forEach(function (m) {
          var src = p.agg[m];
          var dst = cur51.agg[m] || (cur51.agg[m] = { d: src.d, u: src.u, p: {} });
          Object.keys(src.p).forEach(function (pl) {
            var dp = dst.p[pl] || (dst.p[pl] = {});
            Object.keys(src.p[pl]).forEach(function (k) { dp[k] = (dp[k] || 0) + src.p[pl][k]; });
          });
        });
        cur51.files.push({ name: parsed.name, min: p.min, max: p.max, rows: p.rows });
        if (!cur51.min || p.min < cur51.min) cur51.min = p.min;
        if (!cur51.max || p.max > cur51.max) cur51.max = p.max;
        ds.mb51 = cur51;
        notes.push('Pemakaian MB51: ' + p.rows.toLocaleString('id-ID') + ' transaksi GI (' + p.min + ' s/d ' + p.max + ') digabung — total data ' + cur51.min + ' s/d ' + cur51.max);
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
      var activePl = activePlantsOf(settings);
      Object.keys(ds.stock.plants).forEach(function (pl) {
        if (!activePl[pl]) return;
        var P = ds.stock.plants[pl];
        plantsAll[pl] = 1; plantDates[pl] = P.date;
        P.rows.forEach(function (r) {
          if (!keepStockRow(r, homePlants)) return;
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
        line.pgRank = pgRank(l.pg); line.main = line.pgRank < 99;
        o.oa.push(line);
        var h = oaMap.get(l.po);
        if (!h) {
          h = { po: l.po, vendor: l.vendor, vendorCode: l.vendorCode, pg: l.pg, vs: l.vs, ve: l.ve, cur: l.cur,
            tgtHdr: l.tgtHdr, totalOpen: l.totalOpen, docDate: l.docDate, lines: [], active: line.active, main: line.main };
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

    // Klasifikasi aging — Pedoman Pengelolaan Logistik SHU A7-009/PHE52000/2023-S9:
    // Fast = dipakai >=1x dalam 1 tahun; Moderate = maks. 1x dalam 2 tahun;
    // Slow = maks. 1x dalam 5 tahun; Deadstock = >5 tahun tanpa pemakaian.
    function monthsBetween(a, b) { return (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7)); }
    var mb51Span = mb51Max && ds.mb51.min ? monthsBetween(ds.mb51.min.slice(0, 7), mb51Max) : 0;
    function agingOf(hu) {
      if (!mb51Max) return null;
      var last = Object.keys(hu).filter(function (ym) { return hu[ym] > 0; }).sort().pop();
      if (!last) return mb51Span >= 60 ? 'DS' : null;
      var age = monthsBetween(last, mb51Max);
      if (age < 12) return 'FM';
      if (age < 24) return 'MM';
      if (age < 60) return 'SM';
      return 'DS';
    }
    var fieldPlantIdx = {};
    settings.fields.forEach(function (f, i) { f.plants.forEach(function (p) { fieldPlantIdx[p] = i; }); });

    var list = [];
    root.Search.beginIndex();
    mats.forEach(function (o) {
      o.ix = root.Search.prepare(o.m, o.d);
      // stok per field
      o.fs = settings.fields.map(function (f) {
        var q = 0, has = false;
        f.plants.forEach(function (p) { if (o.st[p] != null || plantsAll[p]) { q += o.st[p] || 0; has = true; } });
        return has ? q : null;
      });
      // stok di luar kolom utama (field lain + plant tak terdaftar)
      o.other = 0; o.otherPlants = [];
      Object.keys(o.st).forEach(function (p) {
        var fi = fieldPlantIdx[p];
        if ((fi == null || !settings.fields[fi].main) && o.st[p] > 0) { o.other += o.st[p]; o.otherPlants.push(p); }
      });
      // pemakaian di field home
      var hu = {};
      homePlants.forEach(function (p) {
        var u = o.use[p]; if (!u) return;
        Object.keys(u).forEach(function (k) { var ym = k.slice(0, 7); hu[ym] = (hu[ym] || 0) + u[k]; });
      });
      o.homeUse = hu;
      o.useY = {};
      Object.keys(hu).forEach(function (ym) { var y = ym.slice(0, 4); o.useY[y] = (o.useY[y] || 0) + hu[ym]; });
      o.spark = last12.map(function (ym) { return hu[ym] || 0; });
      o.avg12 = o.spark.reduce(function (a, b) { return a + b; }, 0) / 12;
      o.hist = o.useY[histYear] || 0;
      o.aging = agingOf(hu);
      o.lastUse = Object.keys(hu).filter(function (ym) { return hu[ym] > 0; }).sort().pop() || null;
      o.ytd = o.useY[dataYear] || 0;
      // kontrak: aktif dulu, lalu PG prioritas (X07 > X02 > lainnya), lalu harga termurah
      o.oa.sort(function (a, b) {
        if (a.active !== b.active) return a.active ? -1 : 1;
        if (a.pgRank !== b.pgRank) return a.pgRank - b.pgRank;
        if (a.cur !== b.cur) return a.cur === 'IDR' ? -1 : 1;
        return a.price - b.price;
      });
      o.oaMain = o.oa.filter(function (l) { return l.main; });
      o.oaOther = o.oa.filter(function (l) { return !l.main; });
      // harga & kontrak yang ditampilkan hanya dari PG utama
      o.bestOA = o.oaMain.filter(function (l) { return l.active; })[0] || null;
      o.otherOA = o.oaOther.filter(function (l) { return l.active; })[0] || null;
      // harga rata-rata stok (MAP) dari nilai MB52
      var mq = 0, mv = 0;
      Object.keys(o.stv).forEach(function (p) { if (o.st[p] > 0) { mq += o.st[p]; mv += o.stv[p]; } });
      o.map = mq > 0 ? mv / mq : null;
      o.homeStock = o.fs[settings.fields.indexOf(home)] || 0;
      o.zoneStock = o.fs.reduce(function (a, b, i) { var f = settings.fields[i]; return a + (f === home || !f.main ? 0 : (b || 0)); }, 0);
      list.push(o);
    });

    return {
      mats: mats, list: list, oaMap: oaMap, plantsAll: Object.keys(plantsAll).sort(), plantDates: plantDates,
      home: home, homePlants: homePlants, homeDate: homePlants.map(function (p) { return plantDates[p]; }).filter(Boolean).sort().pop() || null,
      dataYear: dataYear, histYear: histYear, last12: last12, mb51Max: mb51Max, today: today,
      fieldOfPlant: function (p) { var i = fieldPlantIdx[p]; return i == null ? null : settings.fields[i]; }
    };
  }

  root.Model = { PG_MAIN: PG_MAIN, DEFAULT_SETTINGS: DEFAULT_SETTINGS, ingest: ingest, build: build, addMonths: addMonths };
})(this);
