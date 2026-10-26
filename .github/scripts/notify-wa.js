// Membaca pesan commit dari website lalu mengirim notifikasi WhatsApp lewat Fonnte.
// Isi pesan sengaja umum (tanpa PO, vendor, harga) — detail dilihat di website setelah login.
'use strict';
const token = process.env.FONNTE_TOKEN, owners = process.env.WA_OWNERS, seto = process.env.WA_SETO, site = process.env.SITE;
if (!token || !owners) { console.log('FONNTE_TOKEN / WA_OWNERS belum diisi — notifikasi dilewati'); process.exit(0); }
const commits = JSON.parse(process.env.COMMITS || '[]');
const who = (m) => { const x = /\(([^()]+)\)\s*$/.exec(m); return x ? x[1] : 'pengguna'; };
const jobs = [];
for (const c of commits) {
  const m = String(c.message || '').split('\n')[0];
  if (/^Pass keluar: pengajuan/i.test(m)) {
    jobs.push([owners, '🔔 *Pass Keluar Barang* baru menunggu approval.\nDiajukan oleh: ' + who(m) + '\n\nBuka: ' + site + '#/pass']);
  } else if (/^Penerimaan barang: pengajuan/i.test(m)) {
    jobs.push([owners, '🔔 *Penerimaan Barang* (BASTB/LHPB) baru menunggu approval.\nDiajukan oleh: ' + who(m) + '\n\nBuka: ' + site + '#/terima-riwayat']);
  } else if (seto && /^Penerimaan barang: approve/i.test(m) && /\[BASTB menunggu\]/.test(m)) {
    jobs.push([seto, '📄 Penerimaan barang sudah di-approve ' + who(m) + '. *BASTB menunggu approval Anda.*\n\nBuka: ' + site + '#/terima-riwayat']);
  }
}
(async () => {
  for (const [target, message] of jobs) {
    const body = new URLSearchParams({ target, message, countryCode: '62' });
    const r = await fetch('https://api.fonnte.com/send', { method: 'POST', headers: { Authorization: token }, body });
    const t = await r.text();
    console.log('kirim:', message.split('\n')[0], '→', r.status, t.replace(/\d{8,}/g, '***').slice(0, 200));
  }
  if (!jobs.length) console.log('Tidak ada pengajuan baru.');
})().catch((e) => { console.error('Gagal kirim WA:', e.message); process.exit(1); });
