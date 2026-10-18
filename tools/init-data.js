#!/usr/bin/env node
/*
 * Membuat data awal website: akun Owner + versi data SAP terenkripsi.
 * Biasanya TIDAK perlu dijalankan lagi — update data cukup lewat website (login Owner).
 *
 * Pemakaian:
 *   OWNER_USER="Nama.user" OWNER_PASSWORD="..." node tools/init-data.js file1.xlsx file2.xlsx ...
 * Versi data SAP dibuat ulang; pengguna, riwayat order & dokumen dipertahankan.
 */
'use strict';
const fs = require('fs');
const path = require('path');

global.self = global;
global.XLSX = require('../vendor/xlsx.full.min.js');
require('../js/parser.js');
const Model = require('../js/model.js').Model || self.Model;
require('../js/vault.js');
const Vault = self.Vault;

(async () => {
  const user = process.env.OWNER_USER, pw = process.env.OWNER_PASSWORD;
  const files = process.argv.slice(2);
  if (!user || !pw) {
    console.error('Pemakaian: OWNER_USER="..." OWNER_PASSWORD="..." node tools/init-data.js <file.xlsx> ...');
    process.exit(1);
  }
  const dir = path.join(__dirname, '..', 'data');
  fs.mkdirSync(dir, { recursive: true });

  // Pakai kunci & daftar pengguna yang sudah ada bila login Owner cocok (riwayat & dokumen tetap terbaca)
  let key, users;
  const usersPath = path.join(dir, 'users.js');
  if (fs.existsSync(usersPath)) {
    global.window = global;
    eval(fs.readFileSync(usersPath, 'utf8'));
    try {
      key = (await Vault.login(window.MW_USERS, user, pw)).key;
      users = window.MW_USERS;
      console.log('Kunci data lama dipakai (' + users.length + ' pengguna).');
    } catch (e) {
      console.error('Login Owner tidak cocok dengan data/users.js — batal agar data lama tidak rusak.');
      process.exit(1);
    }
  } else {
    key = Vault.newDataKey();
    users = [await Vault.makeUser(user, pw, 'owner', key, user)];
  }
  const keep = { 'users.js': 1, 'orders.js': 1, 'docs.js': 1 };
  fs.readdirSync(dir).filter((f) => f.endsWith('.js') && !keep[f]).forEach((f) => fs.unlinkSync(path.join(dir, f)));
  fs.writeFileSync(usersPath, Vault.usersFile(users));

  const parsed = files.map((f) => self.Parser.parseFile(XLSX, fs.readFileSync(f), path.basename(f), fs.statSync(f).mtimeMs));
  parsed.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const ds = { stock: null, oa: null, mb51: null };
  const man = Vault.emptyManifest();
  let seq = 0;
  for (const p of parsed) {
    console.log('✓ ' + p.name + ' (' + p.date + ')');
    Model.ingest(ds, p).forEach((n) => console.log('   ' + n));
    const types = [...new Set(p.parts.map((pt) => (pt.type === 'me3n' ? 'oa' : pt.type === 'mb52' ? 'stock' : 'mb51')))];
    for (const t of types) {
      const id = t + '-' + p.date + '-' + (Date.now() + seq++).toString(36);
      const removed = Vault.addVersion(man, t, {
        id, date: p.date, uploadedAt: new Date().toISOString(), by: user, files: [p.name], info: Vault.summary(t, ds[t])
      });
      removed.forEach((rid) => { try { fs.unlinkSync(path.join(dir, rid + '.js')); } catch (e) { /* belum ada */ } });
      fs.writeFileSync(path.join(dir, id + '.js'), Vault.snapFile(id, await Vault.encrypt(key, ds[t])));
      console.log('   → versi ' + id);
    }
  }
  fs.writeFileSync(path.join(dir, 'manifest.js'), Vault.manifestFile(man));
  console.log('Selesai. File di folder data/:');
  fs.readdirSync(dir).forEach((f) => console.log('  ' + f + ' (' + (fs.statSync(path.join(dir, f)).size / 1024).toFixed(0) + ' KB)'));
})();
