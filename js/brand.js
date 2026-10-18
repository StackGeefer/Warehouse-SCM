/* Logo Pertamina (SVG) untuk sidebar, halaman login & favicon */
(function (root) {
  'use strict';
  var RED = 'M973 132H1400Q1500 132 1555 215L1790 578H1360Q1262 578 1207 495Z';
  var GREEN = 'M1360 690H1790L1555 1052Q1500 1135 1400 1135H973L1207 773Q1262 690 1360 690Z';
  var BLUE = 'M655 690H1110Q1050 735 1020 785L648 1362Q593 1447 495 1447H64L500 775Q555 690 655 690Z';

  // Simbol saja; cls dipakai untuk animasi tiap bagian
  function mark(cls) {
    cls = cls || '';
    return '<svg class="pm-mark ' + cls + '" viewBox="40 110 1780 1360" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Pertamina">' +
      '<path class="pm-red" fill="#ED1C2E" d="' + RED + '"/>' +
      '<path class="pm-green" fill="#ACC42A" d="' + GREEN + '"/>' +
      '<path class="pm-blue" fill="#006CB8" d="' + BLUE + '"/></svg>';
  }
  // Simbol + tulisan PERTAMINA
  function full(cls, textColor) {
    return '<svg class="pm-full ' + (cls || '') + '" viewBox="40 110 1840 1720" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Pertamina">' +
      '<path class="pm-red" fill="#ED1C2E" d="' + RED + '"/>' +
      '<path class="pm-green" fill="#ACC42A" d="' + GREEN + '"/>' +
      '<path class="pm-blue" fill="#006CB8" d="' + BLUE + '"/>' +
      '<text class="pm-word" x="960" y="1800" text-anchor="middle" textLength="1800" lengthAdjust="spacingAndGlyphs" ' +
      'font-family="\'Plus Jakarta Sans\', Arial, sans-serif" font-weight="800" font-size="300" fill="' + (textColor || '#000') + '">PERTAMINA</text></svg>';
  }
  function favicon() {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="40 110 1780 1360">' +
      '<path fill="#ED1C2E" d="' + RED + '"/><path fill="#ACC42A" d="' + GREEN + '"/><path fill="#006CB8" d="' + BLUE + '"/></svg>';
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
  }
  root.Brand = { mark: mark, full: full, favicon: favicon };
})(typeof self !== "undefined" ? self : this);
