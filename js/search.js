/*
 * Mesin pencarian material.
 * - Ukuran: 3" / 3 IN / 3INCH dianggap sama; 3.1/2 = 3-1/2 = 3 1/2
 * - Rating: 150, 150LB, CL.150, #150 cocok satu sama lain
 * - Sinonim: FLG = FLANGE, VLV = VALVE, CS = CARBON STEEL, dst.
 * - Semua kata kunci harus cocok (AND); kata huruf boleh awalan (FLAN -> FLANGE)
 */
(function (root) {
  'use strict';

  var PHRASES = [
    [/CARBON\s+STEEL/g, ' CS '], [/STAINLESS\s+STEEL/g, ' SS '], [/STAINLESS/g, ' SS '],
    [/WELD(ING)?\s+NECK/g, ' WN '], [/SLIP\s+ON/g, ' SO '], [/SOCKET\s+WELD/g, ' SW '],
    [/RAISED\s+FACE/g, ' RF '], [/STUD\s*BOLT/g, ' STUD BOLT ']
  ];

  var SYN = {
    FLG: 'FLANGE', FLNG: 'FLANGE', FLANGES: 'FLANGE',
    VLV: 'VALVE', VALVES: 'VALVE', GSKT: 'GASKET', GASKETS: 'GASKET',
    ELL: 'ELBOW', ELB: 'ELBOW', ELBOWS: 'ELBOW', CPLG: 'COUPLING', CPL: 'COUPLING',
    NPL: 'NIPPLE', NIPP: 'NIPPLE', RDCR: 'REDUCER', REDUCING: 'REDUCER', BOLTS: 'BOLT',
    NUTS: 'NUT', PIPES: 'PIPE', TBG: 'TUBING', CSG: 'CASING', ADAPTOR: 'ADAPTER',
    INCH: 'IN', INCHES: 'IN', INCHI: 'IN', LBS: 'LB', CLASS: 'LB', CL: 'LB', SCHEDULE: 'SCH'
  };

  // Token pelengkap: tidak wajib cocok, hanya menambah skor
  var SOFT = { IN: 1, LB: 1, X: 1, PSI: 1 };

  function normText(s) {
    s = ' ' + String(s || '').toUpperCase() + ' ';
    s = s.replace(/[“”″]/g, '"').replace(/''/g, '"');
    s = s.replace(/(\d)\s*"/g, '$1 IN ');
    s = s.replace(/#\s*(\d)/g, ' LB $1').replace(/(\d)\s*#/g, '$1 LB ');
    s = s.replace(/(\d+)\.(\d+\/\d+)/g, '$1-$2');
    s = s.replace(/(\d+)\s+(\d+\/\d+)/g, '$1-$2');
    PHRASES.forEach(function (p) { s = s.replace(p[0], p[1]); });
    s = s.replace(/([A-Z])(\d)/g, '$1 $2').replace(/(\d)([A-Z])/g, '$1 $2');
    s = s.replace(/(^|[^\d])\./g, '$1 ').replace(/\.(?!\d)/g, ' ');
    s = s.replace(/(^|[^\d])-/g, '$1 ').replace(/-(?![\d])/g, ' ');
    s = s.replace(/[^A-Z0-9.\/\-]+/g, ' ');
    return s;
  }

  function canon(t) {
    if (/^\d+(\.\d+)?$/.test(t)) return String(parseFloat(t));
    t = SYN[t] || t;
    // ejaan huruf ganda disamakan: POTASSIUM = POTASIUM, COTTON = COTON
    if (t.length >= 4 && /^[A-Z]+$/.test(t)) t = t.replace(/([A-Z])\1+/g, '$1');
    return t;
  }

  function tokens(s) {
    var out = [];
    normText(s).split(' ').forEach(function (t) {
      if (!t) return;
      out.push(canon(t));
    });
    return out;
  }

  function isNumTok(t) { return /\d/.test(t); }

  // Siapkan index untuk satu material
  function prepare(code, desc) {
    var toks = tokens(desc);
    var set = {};
    toks.forEach(function (t) { set[t] = 1; });
    return { toks: toks, set: set, code: String(code).toUpperCase() };
  }

  function parseQuery(q) {
    var raw = String(q || '').trim();
    var all = tokens(raw);
    var hard = all.filter(function (t) { return !SOFT[t]; });
    var soft = all.filter(function (t) { return SOFT[t]; });
    var codeLike = /^[A-Z0-9]{5,}$/i.test(raw.replace(/\s/g, '')) && /\d/.test(raw) && raw.indexOf(' ') < 0;
    return { raw: raw.toUpperCase().replace(/\s+/g, ''), all: all, hard: hard, soft: soft, codeLike: codeLike };
  }

  function matchTok(qt, ix) {
    if (ix.set[qt]) return 3;
    if (!isNumTok(qt) && qt.length >= 2) {
      for (var i = 0; i < ix.toks.length; i++) {
        if (ix.toks[i].indexOf(qt) === 0) return 2;
      }
    }
    if (qt.length >= 4 && ix.code.indexOf(qt) >= 0) return 2;
    return 0;
  }

  // Kembalikan skor (>0 = cocok) ; missed = jumlah token wajib yang tidak cocok
  function score(pq, ix) {
    if (!pq.raw) return { s: 1, missed: 0 };
    var s = 0, missed = 0;
    if (pq.codeLike) {
      if (ix.code === pq.raw) return { s: 1000, missed: 0 };
      if (ix.code.indexOf(pq.raw) === 0) return { s: 500, missed: 0 };
      if (ix.code.indexOf(pq.raw) >= 0) return { s: 300, missed: 0 };
    }
    for (var i = 0; i < pq.hard.length; i++) {
      var m = matchTok(pq.hard[i], ix);
      if (!m) missed++;
      s += m;
    }
    if (!pq.hard.length && pq.soft.length) {
      // query hanya berisi token pelengkap
      for (var j = 0; j < pq.soft.length; j++) if (ix.set[pq.soft[j]]) s += 1;
      if (!s) missed = 1;
    }
    for (var k = 0; k < pq.soft.length; k++) if (ix.set[pq.soft[k]]) s += 0.5;
    // bonus: kata pertama query = kata benda pertama deskripsi
    if (pq.hard.length && ix.toks[0] === pq.hard[0]) s += 2;
    // bonus: urutan "angka IN" sama (contoh 3 IN)
    for (var a = 0; a < pq.all.length - 1; a++) {
      if (isNumTok(pq.all[a]) && pq.all[a + 1] === 'IN') {
        for (var b = 0; b < ix.toks.length - 1; b++) {
          if (ix.toks[b] === pq.all[a] && ix.toks[b + 1] === 'IN') { s += 2; break; }
        }
      }
    }
    return { s: s, missed: missed };
  }

  // ---------- Sinonim ----------
  var synGroups = [];
  // groups: [['KCL','POTASSIUM CHLORIDE',...], ...]
  function setSynonyms(groups) {
    synGroups = (groups || []).map(function (g) {
      var seen = {}, out = [];
      g.forEach(function (ph) {
        var tk = tokens(ph);
        var key = tk.join(' ');
        if (tk.length && !seen[key]) { seen[key] = 1; out.push({ text: String(ph).toUpperCase().trim(), tk: tk }); }
      });
      return out;
    }).filter(function (g) { return g.length > 1; });
  }
  function findSeq(hay, needle) {
    for (var i = 0; i + needle.length <= hay.length; i++) {
      var ok = true;
      for (var j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) { ok = false; break; }
      if (ok) return i;
    }
    return -1;
  }
  // Kembalikan query alternatif berdasarkan sinonim, mis. "kcl" -> ["POTASSIUM CHLORIDE", ...]
  function expand(q) {
    var base = tokens(q), alts = [], labels = [], seen = {};
    seen[base.join(' ')] = 1;
    if (!base.length) return { alts: alts, labels: labels };
    synGroups.forEach(function (g) {
      g.forEach(function (ph) {
        var at = findSeq(base, ph.tk);
        if (at < 0) return;
        g.forEach(function (other) {
          if (other === ph) return;
          var nt = base.slice(0, at).concat(other.tk, base.slice(at + ph.tk.length));
          var key = nt.join(' ');
          if (seen[key] || alts.length >= 12) return;
          seen[key] = 1;
          alts.push(key);
          if (labels.indexOf(other.text) < 0) labels.push(other.text);
        });
      });
    });
    return { alts: alts, labels: labels };
  }

  // Pelajari sinonim dari deskripsi SAP: "POTASSIUM CHLORIDE,KCL" / "HYDRO CHLORIC ACID (HCL)"
  var ELEM = { H: 1, B: 1, C: 1, N: 1, O: 1, F: 1, P: 1, S: 1, K: 1, I: 1, NA: 1, MG: 1, AL: 1, SI: 1, CL: 1, CA: 1, MN: 1, FE: 1, NI: 1, CU: 1, ZN: 1, BR: 1, BA: 1, PB: 1, SN: 1, LI: 1, CR: 1 };
  function isFormula(t) {
    if (!/^[A-Z][A-Z0-9]{2,7}$/.test(t)) return false;
    var parts = t.match(/[A-Z]+|\d+/g), syms = 0;
    for (var i = 0; i < parts.length; i++) {
      if (/^\d+$/.test(parts[i])) continue;
      var s = parts[i], ok = false;
      // pecah huruf menjadi simbol unsur (1-2 huruf)
      (function walk(k) {
        if (ok) return;
        if (k === s.length) { ok = true; return; }
        if (ELEM[s.substr(k, 2)] && s.length - k >= 2) { syms++; walk(k + 2); }
        if (!ok && ELEM[s[k]]) { syms++; walk(k + 1); }
      })(0);
      if (!ok) return false;
    }
    return syms >= 2;
  }
  function learn(descs) {
    var pairs = {};
    function add(code, phrase) {
      phrase = phrase.replace(/\s+/g, ' ').trim();
      if (!isFormula(code) || !/^[A-Z][A-Z ]+[A-Z]$/.test(phrase) || phrase.split(' ').length < 2) return;
      (pairs[code] = pairs[code] || {})[phrase] = 1;
    }
    descs.forEach(function (d) {
      d = String(d || '').toUpperCase();
      var segs = d.split(',').map(function (x) { return x.trim(); });
      for (var i = 1; i < segs.length; i++) add(segs[i], segs[i - 1]);
      segs.forEach(function (sg) {
        var m = sg.match(/^([A-Z][A-Z ]+[A-Z])\s+([A-Z][A-Z0-9]{2,7})$/);
        if (m) add(m[2], m[1]);
      });
      var re = /([A-Z][A-Z ]{4,}?)\s*\(([A-Z][A-Z0-9]{2,7})\)/g, m2;
      while ((m2 = re.exec(d))) add(m2[2], m2[1].replace(/^(CHEMICAL|ACID)\s+/, ''));
    });
    return Object.keys(pairs).map(function (k) { return [k].concat(Object.keys(pairs[k])); });
  }

  root.Search = { prepare: prepare, parseQuery: parseQuery, score: score, tokens: tokens, setSynonyms: setSynonyms, expand: expand, learn: learn };
})(typeof self !== 'undefined' ? self : this);
