/*
 * Export Call Order ke Excel, mengikuti template "Call Order - Field Rantau - To MIM":
 *   Sheet "Call <Bulan>" : No | Material | Material Description | Uom | Data SAP dd.mm | Stock Aktual |
 *                          History <tahun> | Call RO | Net Price | Total Harga | OA | Note | KIMAP (Ref OA)
 *   Sheet "BAU <Bulan>"  : daftar Bantuan Antar Unit per Field sumber
 * ExcelJS dimuat hanya saat tombol export ditekan.
 */
(function (root) {
  'use strict';

  var BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  var ACC = '_(* #,##0_);_(* \\(#,##0\\);_(* "-"??_);_(@_)';
  var ACC2 = '_(* #,##0.00_);_(* \\(#,##0.00\\);_(* "-"??_);_(@_)';
  var QTY = '#,##0.##;-#,##0.##;0';
  var THIN = { style: 'thin', color: { argb: 'FF000000' } };
  var BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };
  var HEAD_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBDD7EE' } };
  var GROUP_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
  var TOTAL_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };

  function loadExcelJS() {
    if (root.ExcelJS) return Promise.resolve(root.ExcelJS);
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'vendor/exceljs.min.js';
      s.onload = function () { resolve(root.ExcelJS); };
      s.onerror = function () { reject(new Error('Library ExcelJS gagal dimuat')); };
      document.head.appendChild(s);
    });
  }

  function ddmm(s) { return s ? s.slice(8, 10) + '.' + s.slice(5, 7) : ''; }

  function styleRow(row, from, to, opt) {
    for (var c = from; c <= to; c++) {
      var cell = row.getCell(c);
      cell.border = BORDER;
      cell.font = { name: 'Calibri', size: 11, bold: opt.bold !== false };
      if (opt.fill) cell.fill = opt.fill;
      cell.alignment = Object.assign({ vertical: 'middle' }, cell.alignment || {});
    }
  }

  function sheetCall(wb, co) {
    var name = ('Call ' + BULAN[co.meta.month]).slice(0, 31);
    var ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 2 }] });
    var widths = [4.55, 13.89, 46.66, 6.55, 13.33, 11, 15.55, 9.11, 14.55, 16.44, 13.66, 46, 13.89];
    ws.columns = widths.map(function (w) { return { width: w }; });

    ws.mergeCells('A1:L1');
    var t = ws.getCell('A1');
    t.value = co.title;
    t.font = { name: 'Calibri', size: 14, bold: true };
    t.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 24;

    var head = ws.getRow(2);
    head.values = ['No', 'Material', 'Material Description', 'Uom', 'Data SAP ' + ddmm(co.homeDate), 'Stock Aktual ',
      'History ' + co.histYear, 'Call RO', 'Net Price', 'Total Harga', 'OA', 'Note', 'KIMAP (Ref OA)'];
    styleRow(head, 1, 13, { fill: HEAD_FILL });
    for (var c = 1; c <= 13; c++) head.getCell(c).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    head.height = 30;

    var r = 3, no = 0, totalCells = {};
    co.roGroups.forEach(function (g) {
      var gr = ws.getRow(r);
      gr.getCell(1).value = g.letter;
      gr.getCell(3).value = g.title;
      styleRow(gr, 1, 13, { fill: GROUP_FILL });
      gr.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
      r++;
      g.items.forEach(function (x) {
        no++;
        var row = ws.getRow(r);
        var usd = x.cur && x.cur !== 'IDR';
        row.getCell(1).value = no;
        row.getCell(2).value = x.m;
        row.getCell(3).value = x.d;
        row.getCell(4).value = x.u;
        row.getCell(5).value = x.stock || 0;
        row.getCell(6).value = x.actual != null ? x.actual : null;
        row.getCell(7).value = x.hist || 0;
        row.getCell(8).value = x.qty != null ? x.qty : null;
        row.getCell(9).value = x.price != null ? x.price : null;
        var tot = x.qty > 0 && x.price != null ? x.qty * x.price : '';
        row.getCell(10).value = { formula: 'IF(OR($H' + r + '="",$I' + r + '=""),"",$H' + r + '*$I' + r + ')', result: tot };
        row.getCell(11).value = x.oa || '';
        row.getCell(12).value = (usd ? '[Harga ' + x.cur + '] ' : '') + (x.note || '');
        row.getCell(13).value = x.oaMat || x.m;
        styleRow(row, 1, 13, {});
        [1, 4, 5, 6, 7, 8, 11, 13].forEach(function (cc) { row.getCell(cc).alignment = { horizontal: 'center', vertical: 'middle' }; });
        row.getCell(3).alignment = { vertical: 'middle', wrapText: true };
        row.getCell(12).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
        [5, 6, 7, 8].forEach(function (cc) { row.getCell(cc).numFmt = QTY; });
        row.getCell(9).numFmt = usd ? ACC2 : ACC;
        row.getCell(10).numFmt = usd ? ACC2 : ACC;
        var cur = x.cur || 'IDR';
        (totalCells[cur] = totalCells[cur] || []).push('J' + r);
        r++;
      });
    });

    var curs = Object.keys(totalCells);
    if (!curs.length) curs = ['IDR'];
    curs.forEach(function (cur) {
      var row = ws.getRow(r);
      row.getCell(3).value = curs.length > 1 ? 'TOTAL (' + cur + ')' : 'TOTAL';
      var cells = totalCells[cur] || [];
      var sum = 0;
      co.roGroups.forEach(function (g) { g.items.forEach(function (x) { if ((x.cur || 'IDR') === cur && x.qty > 0 && x.price != null) sum += x.qty * x.price; }); });
      var formula = curs.length > 1 ? 'SUM(' + (cells.join(',') || '0') + ')' : 'SUM(J3:J' + (r - 1) + ')';
      row.getCell(10).value = { formula: formula, result: sum };
      styleRow(row, 1, 13, {});
      row.getCell(3).fill = TOTAL_FILL; row.getCell(10).fill = TOTAL_FILL;
      row.getCell(3).alignment = { horizontal: 'right', vertical: 'middle' };
      row.getCell(10).numFmt = cur === 'IDR' ? ACC : ACC2;
      r++;
    });
    ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  }

  function sheetBAU(wb, co) {
    var name = ('BAU ' + BULAN[co.meta.month]).slice(0, 31);
    var ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 2 }] });
    var widths = [4.55, 13.89, 46.66, 6.55, 13.33, 16, 11, 14, 10, 14.55, 16.44, 40];
    ws.columns = widths.map(function (w) { return { width: w }; });
    ws.mergeCells('A1:L1');
    var t = ws.getCell('A1');
    t.value = 'PLAN BANTUAN ANTAR UNIT (BAU) MATERIAL - FIELD ' + String(co.homeName).toUpperCase() + ' - ' + BULAN[co.meta.month].toUpperCase();
    t.font = { name: 'Calibri', size: 14, bold: true };
    t.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 24;
    var head = ws.getRow(2);
    head.values = ['No', 'Material', 'Material Description', 'Uom', 'Data SAP ' + co.homeName + ' ' + ddmm(co.homeDate), 'Dari Field',
      'Plant', 'Stok Field Asal', 'Qty BAU', 'Harga Satuan (Avg)', 'Total Nilai', 'Note'];
    styleRow(head, 1, 12, { fill: HEAD_FILL });
    for (var c = 1; c <= 12; c++) head.getCell(c).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    head.height = 30;

    var r = 3, no = 0;
    co.bauGroups.forEach(function (g) {
      var gr = ws.getRow(r);
      gr.getCell(1).value = g.letter;
      gr.getCell(3).value = g.title;
      styleRow(gr, 1, 12, { fill: GROUP_FILL });
      gr.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
      r++;
      g.items.forEach(function (x) {
        no++;
        var row = ws.getRow(r);
        row.values = [no, x.m, x.d, x.u, x.homeStock || 0, g.label, x.plants, x.srcStock || 0, x.qty, x.price != null ? Math.round(x.price) : null, null, x.note || ''];
        row.getCell(11).value = { formula: 'IF(OR($I' + r + '="",$J' + r + '=""),"",$I' + r + '*$J' + r + ')', result: x.price != null ? Math.round(x.price) * x.qty : '' };
        styleRow(row, 1, 12, {});
        [1, 4, 5, 6, 7, 8, 9].forEach(function (cc) { row.getCell(cc).alignment = { horizontal: 'center', vertical: 'middle' }; });
        row.getCell(3).alignment = { vertical: 'middle', wrapText: true };
        row.getCell(12).alignment = { vertical: 'middle', wrapText: true };
        [5, 8, 9].forEach(function (cc) { row.getCell(cc).numFmt = QTY; });
        row.getCell(10).numFmt = ACC; row.getCell(11).numFmt = ACC;
        r++;
      });
    });
    var tr = ws.getRow(r);
    tr.getCell(3).value = 'TOTAL';
    var sum = 0;
    co.bauGroups.forEach(function (g) { g.items.forEach(function (x) { if (x.price != null) sum += Math.round(x.price) * x.qty; }); });
    tr.getCell(11).value = { formula: 'SUM(K3:K' + (r - 1) + ')', result: sum };
    styleRow(tr, 1, 12, {});
    tr.getCell(3).fill = TOTAL_FILL; tr.getCell(11).fill = TOTAL_FILL;
    tr.getCell(3).alignment = { horizontal: 'right', vertical: 'middle' };
    tr.getCell(11).numFmt = ACC;
    ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  }

  function exportCallOrder(co) {
    return loadExcelJS().then(function (ExcelJS) {
      var wb = new ExcelJS.Workbook();
      wb.creator = 'Material Warehouse';
      wb.created = new Date();
      if (co.roGroups.length || !co.bauGroups.length) sheetCall(wb, co);
      if (co.bauGroups.length) sheetBAU(wb, co);
      return wb.xlsx.writeBuffer();
    }).then(function (buf) {
      var fn = 'Call Order - Field ' + co.homeName + ' - To MIM - ' + BULAN[co.meta.month] + ' ' + co.meta.year + '.xlsx';
      var blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fn;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
      return fn;
    });
  }

  root.Exporter = { exportCallOrder: exportCallOrder };
})(this);
