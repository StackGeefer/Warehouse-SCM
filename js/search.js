/*
 * Mesin pencarian material.
 * - Ukuran: 3" / 3 IN / 3INCH dianggap sama; 3.1/2 = 3-1/2 = 3 1/2
 * - Rating: 150, 150LB, CL.150, #150 cocok satu sama lain
 * - Singkatan SAP: PCKR = PACKER, TBG = TUBING, BRG = BEARING, dst.
 *   (daftar disusun dari pola singkatan di deskripsi material SAP)
 * - Semua kata kunci harus cocok (AND); kata huruf boleh awalan (FLAN -> FLANGE)
 * - Kata yang tidak ada di data: ditebak sebagai singkatan (pkr -> PACKER)
 *   atau salah ketik (pakcer -> PACKER)
 * - Peringkat: kata yang cocok di nama barang (sebelum koma pertama) lebih tinggi
 */
(function (root) {
  'use strict';

  var PHRASES = [
    [/CARBON\s+STEEL/g, ' CS '], [/STAINLESS\s+STEEL/g, ' SS '], [/STAINLESS/g, ' SS '],
    [/WELD(ING)?\s+NECK/g, ' WN '], [/SLIP\s+ON/g, ' SO '], [/SOCKET\s+WELD/g, ' SW '],
    [/RAISED\s+FACE/g, ' RF '], [/STUD\s*BOLT/g, ' STUD BOLT '],
    [/([^A-Z])(X\s*-?\s*OVER|CROSS\s*-?\s*OVER|XOVER)(?=[^A-Z])/g, '$1 CROSSOVER '],
    [/([^A-Z])RKIT(?=[^A-Z])/g, '$1 REDRESS KIT '], [/REPAIR\s*KIT/g, ' REDRESS KIT '],
    [/PUP\s*-?\s*JOINT/g, ' PUP JOINT '], [/WELL\s*-?\s*HEAD/g, ' WELLHEAD '],
    [/([^A-Z])O\s*-?\s*RINGS?(?=[^A-Z])/g, '$1 ORING '], [/SUCKER\s*-?\s*ROD/g, ' SUCKER ROD '],
    [/SET\s*-?\s*SCREW/g, ' SETSCREW '], [/CAP\s*-?\s*SCREW/g, ' CAPSCREW ']
  ];

  // Singkatan / ejaan lain -> bentuk baku. Dipakai di deskripsi DAN kata kunci.
  // Disusun dari pasangan singkatan yang ditemukan di ±17 ribu deskripsi SAP.
  var SYN = {};
  [
    ['FLANGE', 'FLG FLNG FLANGES FLENS FLANS'],
    ['VALVE', 'VLV VALVES'], ['GASKET', 'GSKT GASKETS GASKT'],
    ['ELBOW', 'ELL ELB ELBOWS ELBO'], ['COUPLING', 'CPLG CPL COUPLINGS CUPLING'],
    ['NIPPLE', 'NPL NIPP NIPPLES NIPEL NEPEL'], ['REDUCER', 'RDCR REDUCING REDUCERS'],
    ['BOLT', 'BOLTS'], ['NUT', 'NUTS'], ['PIPE', 'PIPES'],
    ['TUBING', 'TBG TUBINGS'], ['CASING', 'CSG CASINGS'],
    ['PACKER', 'PCKR PKR PACKERS PAKER'], ['PACKING', 'PKG PCKG PACKNG PACKINGS'],
    ['ADAPTER', 'ADAPTOR ADPTR ADPT ADAPTERS ADAPTORS'], ['CROSSOVER', 'XO'],
    ['ASSEMBLY', 'ASSY ASY ASSEM ASM ASSEMBLIES'], ['BEARING', 'BRG BEARINGS BRGS'],
    ['HANGER', 'HGR HANGERS'], ['LINER', 'LNR LINERS'], ['CYLINDER', 'CYL CYLINDERS SILINDER'],
    ['STEEL', 'STL STELL'], ['MECHANICAL', 'MECH'], ['HYDRAULIC', 'HYD HIDROLIK'],
    ['EXHAUST', 'EXH EXHST'], ['PLUNGER', 'PLGR PLUNGERS'], ['STUFFING', 'STFG STFFG'],
    ['HOUSING', 'HSG HOUSINGS'], ['THREAD', 'THRD THD THREADS'], ['THREADED', 'THRDD'],
    ['BUSHING', 'BSHG BUSHINGS BUSING'], ['RUBBER', 'RBR RBBR RUBB KARET'],
    ['BRACKET', 'BRKT BRACKETS'], ['SPRING', 'SPRG SPRINGS'], ['PISTON', 'PSTN PISTONS'],
    ['COVER', 'CVR COVERS'], ['RETAINER', 'RTNR RETAINERS'], ['CLAMP', 'CLP CLAMPS KLEM'],
    ['SPACER', 'SPCR SPACERS'], ['FILTER', 'FLTR FILTERS'], ['WATER', 'WTR'],
    ['BOTTOM', 'BTM BTTM'], ['LOWER', 'LWR'], ['UPPER', 'UPR'], ['HEAVY', 'HVY'],
    ['SAFETY', 'SFTY'], ['OUTLET', 'OTLT'], ['LENGTH', 'LGTH'], ['LEVEL', 'LVL'],
    ['MANIFOLD', 'MNFLD MANIFLD'], ['CONTROL', 'CNTRL CONTROLS'], ['GOVERNOR', 'GOV'],
    ['TEMPERATURE', 'TEMP TEMPERATUR'], ['AUXILIARY', 'AUX AUXILARY'],
    ['DISCHARGE', 'DISCH'], ['SUCTION', 'SUCT'], ['STRAIGHT', 'STRHT STRAIGHTS'],
    ['SHUTDOWN', 'SHTDN'], ['FLYWHEEL', 'FLYWHL'], ['PLASTIC', 'PLSTC'],
    ['LUFKIN', 'LFKN'], ['FLUORESCENT', 'FLRCNT FLRST FLOURESCENT'],
    ['GALVANIZED', 'GALV GALVANISED GALVANIS'], ['CEMENTING', 'CMTG CMTING'], ['CEMENT', 'CMT SEMEN'],
    ['SCREW', 'SCR SCRW SCREWS SEKRUP'], ['SECTION', 'SCTN SECTIONS'], ['CONNECTOR', 'CONNCTR CONNECTORS KONEKTOR'],
    ['COMPRESSOR', 'COMPR COMPRESSORS KOMPRESOR'], ['BATTERY', 'BATT BATTERIES BATERAI'],
    ['IGNITION', 'IGN'], ['INSTRUMENT', 'INSTR INSTRUMENTS'], ['POWER', 'PWR'], ['POWDER', 'PDR'],
    ['GROUP', 'GRP'], ['ROUND', 'RND'], ['CARBURETOR', 'CARBURATOR CARBURETTOR'],
    ['THERMOSTAT', 'TERMOSTAT'], ['EXTENSION', 'EXTENTION'], ['OVERHAUL', 'OVERHOUL'],
    ['CAPACITOR', 'CAPASITOR KAPASITOR'], ['CYLINDRICAL', 'CYLINDERICAL'], ['EQUALIZER', 'EQUALYZER'],
    ['EXPLOSION', 'EXPLOTION'], ['REGULATOR', 'REFULATOR REGULATORS'], ['CARTRIDGE', 'CATRIDGE'],
    ['CENTRALIZER', 'CENTRALISER CENTRALIZERS'], ['STABILIZER', 'STABILISER'],
    ['CONNECTING', 'CONECTING'], ['SEPARATOR', 'SEPARATORS SEPARATER'], ['ACCESSORIES', 'ACCESSORY'],
    ['GLOVE', 'GLOVES'], ['GLASS', 'GLASSES'], ['WASHER', 'WASHERS'], ['RING', 'RINGS'],
    ['SEAL', 'SEALS'], ['PLUG', 'PLUGS'], ['VALVE', 'VALVES'], ['HOSE', 'HOSES'], ['TEE', 'TEES'],
    ['ORING', 'ORINGS'], ['SHOE', 'SHOES'], ['CAP', 'CAPS'], ['ROD', 'RODS'], ['PIN', 'PINS'],
    ['WHITE', 'PUTIH'], ['BLACK', 'HITAM'], ['RED', 'MERAH'], ['BLUE', 'BIRU'], ['GREEN', 'HIJAU'],
    ['YELLOW', 'KUNING'], ['GREY', 'GRAY ABU'], ['BRASS', 'KUNINGAN'], ['COPPER', 'TEMBAGA'],
    ['ALUMINUM', 'ALUMINIUM ALUMUNIUM'], ['SULFATE', 'SULPHATE SULFAT'], ['SULFURIC', 'SULPHURIC'],
    ['SULFUR', 'SULPHUR BELERANG'],
    ['IN', 'INCH INCHES INCHI'], ['LB', 'LBS CLASS CL'], ['SCH', 'SCHEDULE']
  ].forEach(function (g) { g[1].split(' ').forEach(function (a) { SYN[a] = g[0]; }); });

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

  // ---------- Kosakata data (untuk tebak singkatan & salah ketik) ----------
  var vocab = {}, vocabN = 0, guessCache = {}, synTok = {};
  function beginIndex() { vocab = {}; vocabN = 0; guessCache = {}; }
  var VOWEL = /[AEIOU]/g;
  function isAlpha(t) { return /^[A-Z]+$/.test(t); }
  // a singkatan dari w? (PKR -> PACKER: huruf pertama & terakhir sama, sisanya berurutan)
  function isAbbrOf(a, w) {
    if (a.length < 3 || w.length < a.length + 2 || a[0] !== w[0] || a[a.length - 1] !== w[w.length - 1]) return false;
    if ((a.slice(1).match(VOWEL) || []).length > 1) return false;
    for (var i = 1, j = 1; i < a.length; i++) {
      while (j < w.length && w[j] !== a[i]) j++;
      if (j++ >= w.length) return false;
    }
    return true;
  }
  // jarak ketik (Damerau-Levenshtein) dengan batas maks
  function editDist(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    var d = [], i, j;
    for (i = 0; i <= a.length; i++) { d[i] = [i]; }
    for (j = 0; j <= b.length; j++) d[0][j] = j;
    for (i = 1; i <= a.length; i++) {
      var rowMin = max + 1;
      for (j = 1; j <= b.length; j++) {
        var c = a[i - 1] === b[j - 1] ? 0 : 1;
        var v = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2][j - 2] + 1);
        d[i][j] = v;
        if (v < rowMin) rowMin = v;
      }
      if (rowMin > max) return max + 1;
    }
    return d[a.length][b.length];
  }
  // Kata kunci yang tidak ada di data -> cari padanan di kosakata
  function guess(t) {
    if (!(t in guessCache)) guessCache[t] = guess0(t);
    return guessCache[t];
  }
  function guess0(t) {
    if (!vocabN || vocab[t] || synTok[t] || !isAlpha(t) || t.length < 3) return null;
    var words = Object.keys(vocab), i;
    for (i = 0; i < words.length; i++) if (words[i].indexOf(t) === 0) return null; // awalan kata yang ada
    var ab = words.filter(function (w) { return isAbbrOf(t, w) && vocab[w] >= 2; })
      .sort(function (x, y) { return vocab[y] - vocab[x]; }).slice(0, 4);
    if (ab.length) return { kind: 'abbr', w: 0.85, alts: ab };
    if (t.length < 4) return null;
    var max = t.length >= 7 ? 2 : 1, best = [], bd = max + 1;
    for (i = 0; i < words.length; i++) {
      var w = words[i];
      if (w[0] !== t[0] && w[1] !== t[1]) continue;
      var dd = editDist(t, w, max);
      if (dd < bd) { bd = dd; best = [w]; } else if (dd === bd && dd <= max) best.push(w);
    }
    if (bd > max) return null;
    best.sort(function (x, y) { return vocab[y] - vocab[x]; });
    return { kind: 'typo', w: 0.8, alts: best.slice(0, 3) };
  }

  // Siapkan index untuk satu material
  function prepare(code, desc) {
    var toks = tokens(desc);
    var set = {};
    toks.forEach(function (t, i) {
      if (set[t] == null) set[t] = i;
      if (isAlpha(t) && t.length >= 2) { if (!vocab[t]) { vocab[t] = 0; vocabN++; } vocab[t]++; }
    });
    // nama barang = bagian sebelum koma pertama (PCKR,MSG,7 -> PCKR);
    // gaya SAP "VALVE,BALL" -> kata benda + jenis (2 bagian pertama)
    var segs = String(desc || '').split(/[,:;]/), noun = tokens(segs[0]).length || 1;
    if (noun === 1 && segs.length > 1 && /[A-Z]/i.test(segs[1]) && !/\d/.test(segs[1])) noun += tokens(segs[1]).length;
    noun = Math.min(4, noun);
    return { toks: toks, set: set, noun: noun, code: String(code).toUpperCase() };
  }

  function parseQuery(q) {
    var raw = String(q || '').trim();
    var all = tokens(raw);
    var hard = all.filter(function (t) { return !SOFT[t]; });
    var soft = all.filter(function (t) { return SOFT[t]; });
    var codeLike = /^[A-Z0-9]{5,}$/i.test(raw.replace(/\s/g, '')) && /\d/.test(raw) && raw.indexOf(' ') < 0;
    var alt = {}, fixes = [], nAlpha = 0;
    if (!codeLike) hard.forEach(function (t) {
      if (!isNumTok(t)) nAlpha++;
      var g = guess(t);
      if (g) { alt[t] = g; fixes.push({ from: t, to: g.alts, kind: g.kind }); }
    });
    return { raw: raw.toUpperCase().replace(/\s+/g, ''), all: all, hard: hard, soft: soft, codeLike: codeLike, alt: alt, fixes: fixes, nAlpha: nAlpha };
  }

  // -> { s: skor, at: posisi token yang cocok }
  function matchOne(qt, ix) {
    var at = ix.set[qt];
    if (at != null) return { s: 3, at: at };
    if (!isNumTok(qt) && qt.length >= 2) {
      for (var i = 0; i < ix.toks.length; i++) {
        if (ix.toks[i].indexOf(qt) === 0) return { s: 2, at: i };
      }
    }
    if (qt.length >= 4 && ix.code.indexOf(qt) >= 0) return { s: 2, at: 99 };
    return null;
  }
  function matchTok(qt, ix, pq) {
    var m = matchOne(qt, ix);
    if (m || !pq || !pq.alt[qt]) return m;
    var g = pq.alt[qt], best = null;
    for (var i = 0; i < g.alts.length; i++) {
      var at = ix.set[g.alts[i]];
      if (at != null && (!best || at < best.at)) best = { s: 3 * g.w, at: at };
    }
    return best;
  }

  // Kembalikan skor (>0 = cocok) ; missed = jumlah token wajib yang tidak cocok
  function score(pq, ix) {
    if (!pq.raw) return { s: 1, missed: 0 };
    var s = 0, missed = 0, alphaHit = 0;
    if (pq.codeLike) {
      if (ix.code === pq.raw) return { s: 1000, missed: 0 };
      if (ix.code.indexOf(pq.raw) === 0) return { s: 500, missed: 0 };
      if (ix.code.indexOf(pq.raw) >= 0) return { s: 300, missed: 0 };
    }
    for (var i = 0; i < pq.hard.length; i++) {
      var qt = pq.hard[i], m = matchTok(qt, ix, pq);
      if (!m) { missed++; continue; }
      s += m.s;
      if (!isNumTok(qt)) {
        alphaHit++;
        // kata huruf lebih menentukan daripada angka; cocok di nama barang lebih kuat
        s += 1;
        if (m.at < ix.noun) s += 2;
      }
    }
    if (!pq.hard.length && pq.soft.length) {
      // query hanya berisi token pelengkap
      for (var j = 0; j < pq.soft.length; j++) if (ix.set[pq.soft[j]] != null) s += 1;
      if (!s) missed = 1;
    }
    for (var k = 0; k < pq.soft.length; k++) if (ix.set[pq.soft[k]] != null) s += 0.5;
    // bonus: kata pertama deskripsi (kata benda) disebut di query — "ball valve" = VALVE,BALL
    var f0 = ix.toks[0];
    for (var h = 0; h < pq.hard.length; h++) {
      var f = pq.hard[h];
      if (f0 === f || (pq.alt[f] && pq.alt[f].alts.indexOf(f0) >= 0)) { s += 2; break; }
    }
    // bonus: urutan "angka IN" sama (contoh 3 IN)
    for (var a = 0; a < pq.all.length - 1; a++) {
      if (isNumTok(pq.all[a]) && pq.all[a + 1] === 'IN') {
        for (var b = 0; b < ix.toks.length - 1; b++) {
          if (ix.toks[b] === pq.all[a] && ix.toks[b + 1] === 'IN') { s += 2; break; }
        }
      }
    }
    // deskripsi ringkas sedikit diutamakan
    s -= Math.min(ix.toks.length, 30) * 0.01;
    return { s: s, missed: missed, alphaHit: alphaHit };
  }

  // ---------- Sinonim ----------
  var synGroups = [];
  // groups: [['KCL','POTASSIUM CHLORIDE',...], ...]
  function setSynonyms(groups) {
    synTok = {}; guessCache = {};
    synGroups = (groups || []).map(function (g) {
      var seen = {}, out = [];
      g.forEach(function (ph) {
        var tk = tokens(ph);
        var key = tk.join(' ');
        if (tk.length && !seen[key]) { seen[key] = 1; out.push({ text: String(ph).toUpperCase().trim(), tk: tk }); }
        tk.forEach(function (t) { synTok[t] = 1; });
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
  // Bisa 2 penggantian sekaligus: "majun putih" -> "COTTON WASTE WHITE"
  function expand(q) {
    var base = tokens(q), alts = [], w = [], labels = [], seen = {}, queue = [{ tk: base, used: {}, w: 1, depth: 0 }];
    seen[base.join(' ')] = 1;
    if (!base.length) return { alts: alts, w: w, labels: labels };
    for (var qi = 0; qi < queue.length && alts.length < 16; qi++) {
      var cur = queue[qi];
      if (cur.depth >= 2) continue;
      synGroups.forEach(function (g, gi) {
        if (cur.used[gi]) return;
        g.forEach(function (ph) {
          var at = findSeq(cur.tk, ph.tk);
          if (at < 0) return;
          g.forEach(function (other, oi) {
            if (other === ph) return;
            var nt = cur.tk.slice(0, at).concat(other.tk, cur.tk.slice(at + ph.tk.length));
            var key = nt.join(' ');
            if (seen[key] || alts.length >= 16) return;
            seen[key] = 1;
            // istilah yang ditulis lebih awal di kelompok = padanan paling dekat
            var wt = cur.w * (0.95 - 0.01 * Math.min(oi, 5));
            var used = Object.assign({}, cur.used); used[gi] = 1;
            alts.push(key); w.push(wt);
            queue.push({ tk: nt, used: used, w: wt, depth: cur.depth + 1 });
            if (!cur.depth && labels.indexOf(other.text) < 0) labels.push(other.text);
          });
        });
      });
    }
    return { alts: alts, w: w, labels: labels };
  }

  // Pelajari sinonim dari deskripsi SAP: "POTASSIUM CHLORIDE,KCL" / "HYDRO CHLORIC ACID (HCL)"
  var ELEM = { H: 1, B: 1, C: 1, N: 1, O: 1, F: 1, P: 1, S: 1, K: 1, I: 1, NA: 1, MG: 1, AL: 1, SI: 1, CL: 1, CA: 1, MN: 1, FE: 1, NI: 1, CU: 1, ZN: 1, BR: 1, BA: 1, PB: 1, SN: 1, LI: 1, CR: 1 };
  function isFormula(t) {
    if (!/^[A-Z][A-Z0-9]{2,7}$/.test(t)) return false;
    var parts = t.match(/[A-Z]+|\d+/g), syms = 0;
    for (var i = 0; i < parts.length; i++) {
      if (/^\d+$/.test(parts[i])) { if (parts[i].length > 2) return false; continue; }
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
      // hanya nama senyawa kimia (…IDE / …ATE / …ITE / ACID), bukan singkatan biasa seperti PIN, CAP
      if (!/(IDE|ATE|ITE|ACID)$/.test(phrase) || phrase.split(' ').length > 3) return;
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

  // Cari di daftar material: kata kunci + sinonim + singkatan; pass(o) = filter tambahan
  function run(q, list, pass) {
    var pq = parseQuery(q), res = [], viaSyn = 0, fuzzy = false;
    var ex = pq.codeLike ? { alts: [], w: [], labels: [] } : expand(q);
    var apqs = ex.alts.map(parseQuery);
    // sinonim yang lebih panjang tidak boleh menang hanya karena jumlah katanya lebih banyak
    var aw = apqs.map(function (a, i) { return ex.w[i] * Math.min(1, (pq.hard.length || 1) / (a.hard.length || 1)); });
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (pass && !pass(o)) continue;
      var r = score(pq, o.ix), best = r.missed === 0 && r.s > 0 ? r.s : 0, syn = false;
      for (var a = 0; a < apqs.length; a++) {
        var ra = score(apqs[a], o.ix);
        if (ra.missed === 0 && ra.s > 0 && ra.s * aw[a] > best) { best = ra.s * aw[a]; syn = !(r.missed === 0 && r.s > 0); }
      }
      if (best > 0) { res.push({ o: o, s: best, syn: syn }); if (syn) viaSyn++; }
    }
    // tidak ada yang cocok semua: tampilkan yang meleset 1 kata (minimal 1 kata huruf cocok)
    if (!res.length && pq.hard.length > 1) {
      fuzzy = true;
      for (var j = 0; j < list.length; j++) {
        var o2 = list[j];
        if (pass && !pass(o2)) continue;
        var r2 = score(pq, o2.ix);
        if (r2.missed === 1 && r2.s > 0 && (r2.alphaHit > 0 || !pq.nAlpha)) res.push({ o: o2, s: r2.s });
      }
    }
    res.sort(function (a, b) {
      return b.s - a.s || (b.o.homeStock > 0) - (a.o.homeStock > 0) || (!!b.o.bestOA) - (!!a.o.bestOA) ||
        ((b.o.hist || 0) + (b.o.ytd || 0)) - ((a.o.hist || 0) + (a.o.ytd || 0)) || String(a.o.d).localeCompare(String(b.o.d));
    });
    return { res: res, fuzzy: fuzzy, pq: pq, syn: ex.labels, viaSyn: viaSyn };
  }

  root.Search = { run: run, beginIndex: beginIndex, prepare: prepare, parseQuery: parseQuery, score: score, tokens: tokens, setSynonyms: setSynonyms, expand: expand, learn: learn };
})(typeof self !== 'undefined' ? self : this);
