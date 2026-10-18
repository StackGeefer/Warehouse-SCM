#!/usr/bin/env node
/*
 * Membuat data/sap-data.js (data bawaan terenkripsi) dari file Excel SAP.
 * Alternatif tanpa Node: di website, menu Data & Upload > "Buat file data bawaan".
 *
 * Pemakaian:
 *   SAP_PASSWORD="password-anda" node tools/build-data.js file1.xlsx file2.xlsx ...
 */
'use strict';
const fs = require('fs');
const path = require('path');

global.self = global;
global.XLSX = require('../vendor/xlsx.full.min.js');
require('../js/parser.js');
require('../js/search.js');
const Model = require('../js/model.js').Model || self.Model;
require('../js/bundle.js');

(async () => {
  const pw = process.env.SAP_PASSWORD;
  const files = process.argv.slice(2);
  if (!pw || !files.length) {
    console.error('Pemakaian: SAP_PASSWORD="..." node tools/build-data.js <file.xlsx> ...');
    process.exit(1);
  }
  const parsed = files.map((f) => {
    const st = fs.statSync(f);
    return self.Parser.parseFile(XLSX, fs.readFileSync(f), path.basename(f), st.mtimeMs);
  });
  parsed.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const ds = { stock: null, oa: null, mb51: null };
  parsed.forEach((p) => {
    console.log('✓ ' + p.name + ' (' + p.date + ')');
    Model.ingest(ds, p).forEach((n) => console.log('   ' + n));
  });
  const out = path.join(__dirname, '..', 'data', 'sap-data.js');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, await self.Bundle.fileContent(ds, pw));
  console.log('Ditulis: ' + out + ' (' + (fs.statSync(out).size / 1024).toFixed(0) + ' KB)');
})();
