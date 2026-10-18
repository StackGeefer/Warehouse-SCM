/*
 * Ilustrasi halaman login (vektor orisinal): langit siang, kilang dengan cerobong
 * merah-putih, tangki kubah & pipe rack, serta pekerja ber-coverall merah-biru.
 */
(function (root) {
  'use strict';
  var RED = '#E3262D', RED_D = '#B71C22', BLUE = '#1D5CAB', BLUE_D = '#164A8C', TAPE = '#EEF3F8';

  function patch(x, y, s) {
    return '<g transform="translate(' + x + ' ' + y + ') scale(' + s + ')">' +
      '<rect x="-2" y="-2" width="24" height="18" rx="3" fill="#fff"/>' +
      '<path d="M10 0h5l5 6h-5z" fill="#ED1C2E"/><path d="M15 8h5l-4 6h-5z" fill="#ACC42A"/><path d="M6 8h5l-5 6H1z" fill="#006CB8"/></g>';
  }

  function arm(x, y, len, rot, hand) {
    return '<g transform="rotate(' + rot + ' ' + (x + 9) + ' ' + (y + 6) + ')">' +
      '<rect x="' + x + '" y="' + y + '" width="18" height="' + len + '" rx="9" fill="' + BLUE + '"/>' +
      '<rect x="' + x + '" y="' + y + '" width="18" height="18" rx="9" fill="' + RED + '"/>' +
      '<rect x="' + x + '" y="' + (y + len * 0.55) + '" width="18" height="5" fill="' + TAPE + '"/>' +
      (hand ? '<circle cx="' + (x + 9) + '" cy="' + (y + len + 3) + '" r="7.5" fill="' + hand + '"/>' : '') + '</g>';
  }

  // Pekerja. pose: 'radio' | 'paper' | 'point'
  function worker(cx, base, o) {
    var t = base - 236, sk = o.skin;
    var g = '<g class="wk" style="animation-delay:' + (o.delay || 0) + 's">';
    g += '<ellipse cx="' + cx + '" cy="' + (base + 3) + '" rx="44" ry="7" fill="#0b2a52" opacity=".22"/>';
    [-26, 4].forEach(function (dx) {
      g += '<rect x="' + (cx + dx) + '" y="' + (t + 146) + '" width="22" height="84" rx="9" fill="' + BLUE_D + '"/>';
      g += '<rect x="' + (cx + dx) + '" y="' + (t + 200) + '" width="22" height="6" fill="' + TAPE + '"/>';
    });
    g += '<path d="M' + (cx - 30) + ' ' + (base - 6) + 'h28v10h-34q0-10 6-10z" fill="#23262d"/>';
    g += '<path d="M' + (cx + 2) + ' ' + (base - 6) + 'h28q6 0 6 10h-34z" fill="#23262d"/>';
    // badan: atas merah, bawah biru, reflective putih
    g += '<rect x="' + (cx - 35) + '" y="' + (t + 64) + '" width="70" height="98" rx="20" fill="' + BLUE + '"/>';
    g += '<path d="M' + (cx - 35) + ' ' + (t + 112) + 'v-28q0-20 20-20h30q20 0 20 20v28z" fill="' + RED + '"/>';
    g += '<rect x="' + (cx - 35) + '" y="' + (t + 110) + '" width="70" height="7" fill="' + TAPE + '"/>';
    g += '<rect x="' + (cx - 35) + '" y="' + (t + 136) + '" width="70" height="5" fill="' + TAPE + '" opacity=".85"/>';
    g += '<rect x="' + (cx - 1.5) + '" y="' + (t + 68) + '" width="3" height="88" fill="#0d3a73" opacity=".5"/>';
    g += '<path d="M' + (cx - 13) + ' ' + (t + 64) + 'l13 15 13-15z" fill="' + RED_D + '"/>';
    var px = cx + 7;
    if (o.pose === 'radio') {
      g += arm(cx - 48, t + 70, 62, 12, sk);
      g += '<g class="radio">' + arm(cx + 26, t + 70, 52, 158, null) +
        '<rect x="' + (cx + 14) + '" y="' + (t + 14) + '" width="11" height="26" rx="3" fill="#1b1d22"/>' +
        '<rect x="' + (cx + 18) + '" y="' + t + '" width="3" height="16" fill="#1b1d22"/>' +
        '<circle class="led" cx="' + (cx + 19.5) + '" cy="' + (t + 20) + '" r="2" fill="#5bf27a"/>' +
        '<circle cx="' + (cx + 22) + '" cy="' + (t + 42) + '" r="8" fill="' + RED + '"/></g>';
      px = cx - 27;
    } else if (o.pose === 'paper') {
      g += arm(cx - 46, t + 70, 56, -34, sk);
      g += arm(cx + 28, t + 70, 56, 34, sk);
      g += '<g class="paper"><path d="M' + (cx - 46) + ' ' + (t + 108) + 'l92-10 6 54-92 10z" fill="#fbfdff"/>' +
        '<path d="M' + (cx - 34) + ' ' + (t + 120) + 'l66-7M' + (cx - 32) + ' ' + (t + 132) + 'l48-5M' + (cx - 30) + ' ' + (t + 144) + 'l58-6" stroke="#8fb4dd" stroke-width="2.5" stroke-linecap="round"/></g>';
      px = null;
    } else {
      g += arm(cx - 48, t + 70, 64, 10, sk);
      g += '<g class="arm-point">' + arm(cx + 26, t + 70, 66, -122, sk) + '</g>';
    }
    if (px !== null) g += patch(px, t + 76, 0.72);
    // kepala
    g += '<rect x="' + (cx - 8) + '" y="' + (t + 52) + '" width="16" height="16" rx="5" fill="' + sk + '"/>';
    if (o.hijab) {
      g += '<path d="M' + (cx - 25) + ' ' + (t + 30) + 'q0 32 25 40q25-8 25-40z" fill="' + o.hijab + '"/>';
      g += '<circle cx="' + cx + '" cy="' + (t + 36) + '" r="19" fill="' + o.hijab + '"/>';
      g += '<ellipse cx="' + (cx + 2) + '" cy="' + (t + 39) + '" rx="13" ry="15" fill="' + sk + '"/>';
    } else {
      g += '<circle cx="' + cx + '" cy="' + (t + 36) + '" r="22" fill="' + sk + '"/>';
    }
    if (o.glasses) g += '<rect x="' + (cx - 2) + '" y="' + (t + 31) + '" width="20" height="8" rx="4" fill="#20242c"/>';
    else g += '<circle cx="' + (cx + 8) + '" cy="' + (t + 35) + '" r="2.2" fill="#2b1d14"/>';
    g += '<path d="M' + (cx + 4) + ' ' + (t + 46) + 'q5 3 10 0" stroke="#2b1d14" stroke-width="2" fill="none" stroke-linecap="round"/>';
    if (o.muff) g += '<rect x="' + (cx - 26) + '" y="' + (t + 28) + '" width="10" height="16" rx="5" fill="#ffb81c"/>';
    // helm putih strip merah
    g += '<path d="M' + (cx - 26) + ' ' + (t + 30) + 'q0-30 26-30t26 30z" fill="#fdfdfd"/>';
    g += '<path d="M' + (cx - 18) + ' ' + (t + 14) + 'q18-10 36 0v6q-18-9-36 0z" fill="' + RED + '"/>';
    g += '<rect x="' + (cx - 31) + '" y="' + (t + 26) + '" width="63" height="7" rx="3.5" fill="#eceff3"/>';
    g += '</g>';
    return g;
  }

  // Cerobong bergaris merah-putih
  function stack(x, top, w, h) {
    var s = '<g>', bands = 9, bh = h / bands;
    for (var i = 0; i < bands; i++) {
      s += '<rect x="' + x + '" y="' + (top + i * bh) + '" width="' + w + '" height="' + (bh + 0.5) + '" fill="' + (i % 2 ? '#ffffff' : '#E3262D') + '"/>';
    }
    s += '<rect x="' + (x - 3) + '" y="' + (top - 6) + '" width="' + (w + 6) + '" height="8" rx="2" fill="#c9d2dd"/>';
    s += '<rect x="' + x + '" y="' + top + '" width="' + (w * 0.3) + '" height="' + h + '" fill="#000" opacity=".06"/>';
    return s + '</g>';
  }

  function scene() {
    var W = 900, H = 560;
    var defs = '<defs>' +
      '<linearGradient id="mwDome" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3c8be0"/><stop offset="1" stop-color="#0d4f9e"/></linearGradient>' +
      '<linearGradient id="mwCol" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#f4f7fb"/><stop offset=".6" stop-color="#d4dde8"/><stop offset="1" stop-color="#b5c2d2"/></linearGradient>' +
      '<linearGradient id="mwGround" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9e6f2"/><stop offset="1" stop-color="#eef4fa"/></linearGradient>' +
      '<radialGradient id="mwFlame"><stop offset="0" stop-color="#fff3b0"/><stop offset=".5" stop-color="#ffb21c"/><stop offset="1" stop-color="#ff5a1f" stop-opacity="0"/></radialGradient>' +
      '</defs>';
    var far = '<g opacity=".45" fill="#9fb6cf">' +
      '<rect x="40" y="300" width="26" height="140"/><rect x="74" y="330" width="18" height="110"/><rect x="560" y="290" width="22" height="150"/>' +
      '<rect x="760" y="300" width="20" height="140"/><rect x="840" y="340" width="60" height="100"/>' +
      '<path d="M110 440h120v-40h-120z"/><path d="M700 440h80v-60h-80z"/></g>';
    var mid = '<g>' +
      '<path d="M300 440a110 110 0 0 1 220 0z" fill="url(#mwDome)"/>' +
      '<path d="M322 440a88 88 0 0 1 60-83" stroke="#ffffff" stroke-opacity=".25" stroke-width="6" fill="none"/>' +
      '<rect x="640" y="230" width="44" height="210" rx="6" fill="url(#mwCol)"/>' +
      '<rect x="634" y="276" width="56" height="5" fill="#9aabbf"/><rect x="634" y="336" width="56" height="5" fill="#9aabbf"/><rect x="634" y="396" width="56" height="5" fill="#9aabbf"/>' +
      '<rect x="700" y="290" width="30" height="150" rx="5" fill="url(#mwCol)"/>' +
      '<rect x="150" y="270" width="36" height="170" rx="6" fill="url(#mwCol)"/>' +
      '<rect x="145" y="316" width="46" height="4" fill="#9aabbf"/><rect x="145" y="376" width="46" height="4" fill="#9aabbf"/>' +
      '<circle class="lamp" cx="660" cy="270" r="3" fill="#ffd34d"/><circle class="lamp l2" cx="712" cy="320" r="3" fill="#ffd34d"/><circle class="lamp l3" cx="168" cy="300" r="3" fill="#ffd34d"/>' +
      '<rect x="806" y="170" width="8" height="270" fill="#b9c5d3"/><ellipse class="flame" cx="810" cy="160" rx="12" ry="20" fill="url(#mwFlame)"/>' +
      '</g>';
    var stacks = stack(450, 70, 34, 300) + '<rect x="440" y="370" width="54" height="70" fill="#d7dfe8"/>';
    var rack = '<g>' +
      '<rect x="0" y="392" width="' + W + '" height="7" fill="#c3cfdc"/>' +
      [60, 200, 340, 480, 620, 760].map(function (x) { return '<rect x="' + x + '" y="392" width="8" height="70" fill="#b3c1d1"/>'; }).join('') +
      '<rect x="0" y="404" width="' + W + '" height="12" rx="6" fill="#f3f6fa"/>' +
      '<rect x="0" y="420" width="' + W + '" height="12" rx="6" fill="#E3262D"/>' +
      '<rect x="0" y="436" width="' + W + '" height="10" rx="5" fill="#e6ecf2"/>' +
      '<rect x="0" y="406" width="' + W + '" height="3" fill="#fff" opacity=".8"/></g>';
    var ground = '<rect x="0" y="446" width="' + W + '" height="' + (H - 446) + '" fill="url(#mwGround)"/>';
    var people =
      worker(250, 548, { skin: '#d7a07a', pose: 'radio', glasses: true, delay: 0 }) +
      worker(430, 552, { skin: '#e7b892', pose: 'paper', hijab: '#f1f3f7', delay: 0.5 }) +
      worker(610, 548, { skin: '#c48a62', pose: 'point', muff: true, delay: 1 });
    return '<svg class="lg-scene" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      defs + far + mid + stacks + rack + ground + people + '</svg>';
  }

  root.Scene = { html: scene };
})(typeof self !== 'undefined' ? self : this);
