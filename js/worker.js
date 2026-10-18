/* Web Worker: membaca file Excel di background supaya tampilan tidak macet */
importScripts('../vendor/xlsx.full.min.js', 'parser.js' + (self.location.search || ''));

self.onmessage = function (e) {
  try {
    var res = self.Parser.parseFile(self.XLSX, e.data.buf, e.data.name, e.data.lastModified);
    self.postMessage({ ok: true, res: res });
  } catch (err) {
    self.postMessage({ ok: false, error: String((err && err.message) || err) });
  }
};
