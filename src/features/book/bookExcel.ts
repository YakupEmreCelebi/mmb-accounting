import type { Workbook, Worksheet, Row, Fill } from 'exceljs';
import { BOOK_GROUP_LABEL, bookColumns, groupSpans, type BookCol, type BookGroup, type CashBook, type CashBookFigures, type CashBookRow } from '../../domain/cashBook';
import { formatMonth, monthKey, weekday } from '../../lib/dates';

/**
 * Excel export of the cash book in the old workbook's layout:
 * "Günlük Kasa" (day by day, months with totals) and "Aylık Özet" (one row per month).
 */

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
/** Thousands + 2 decimals, negatives red, zeros left blank like the Excel's empty formulas. */
const NUM = '#,##0.00;[Red]-#,##0.00;';
const INT = '0;-0;';

const GROUP_FILL: Record<BookGroup, string> = {
  satis: 'FFDCEFFC',
  yemek: 'FFD9F5E6',
  ciro: 'FFFDF1CF',
  gider: 'FFFCE3E6',
  sonuc: 'FFEDE7FB',
  kasa: 'FFEEF0F3',
};
const COMPUTED_FILL = 'FFF2F2F2';
const TOTAL_FILL = 'FFFFF4DC';
const MONTH_FILL = 'FFE3E1DC';
const HEAD_FILL = 'FF2E2A27';
const BORDER = { style: 'thin' as const, color: { argb: 'FFD6D3CE' } };

const fill = (argb: string): Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const tl = (k: number) => Math.round(k) / 100;
const excelDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

function gridRow(row: Row, from: number, to: number) {
  for (let c = from; c <= to; c++) row.getCell(c).border = { top: BORDER, left: BORDER, bottom: BORDER, right: BORDER };
}

function titleRows(ws: Worksheet, lastCol: number, title: string, info: string) {
  ws.mergeCells(1, 1, 1, Math.min(lastCol, 12));
  const t = ws.getCell(1, 1);
  t.value = title;
  t.font = { bold: true, size: 14 };
  ws.mergeCells(2, 1, 2, Math.min(lastCol, 12));
  const i = ws.getCell(2, 1);
  i.value = info;
  i.font = { italic: true, size: 10, color: { argb: 'FF6B6560' } };
}

function groupHeaderRow(ws: Worksheet, rowNo: number, firstLabel: string, firstSpan: number, cols: BookCol[], trailing: Array<{ label: string; span: number; argb: string }>) {
  const row = ws.getRow(rowNo);
  row.height = 18;
  ws.mergeCells(rowNo, 1, rowNo, firstSpan);
  const a = ws.getCell(rowNo, 1);
  a.value = firstLabel;
  a.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
  a.fill = fill(HEAD_FILL);
  let col = firstSpan + 1;
  for (const g of groupSpans(cols)) {
    if (g.span > 1) ws.mergeCells(rowNo, col, rowNo, col + g.span - 1);
    const c = ws.getCell(rowNo, col);
    c.value = BOOK_GROUP_LABEL[g.group];
    c.font = { bold: true, size: 10 };
    c.alignment = { horizontal: 'center' };
    for (let k = col; k < col + g.span; k++) ws.getCell(rowNo, k).fill = fill(GROUP_FILL[g.group]);
    col += g.span;
  }
  for (const t of trailing) {
    if (t.span > 1) ws.mergeCells(rowNo, col, rowNo, col + t.span - 1);
    const c = ws.getCell(rowNo, col);
    c.value = t.label;
    c.font = { bold: true, size: 10 };
    for (let k = col; k < col + t.span; k++) ws.getCell(rowNo, k).fill = fill(t.argb);
    col += t.span;
  }
  gridRow(row, 1, col - 1);
}

function columnHeaderRow(ws: Worksheet, rowNo: number, leading: string[], cols: BookCol[], trailing: string[], labelFor: (c: BookCol) => string = (c) => c.label) {
  const row = ws.getRow(rowNo);
  row.height = 32;
  const labels = [...leading, ...cols.map(labelFor), ...trailing];
  labels.forEach((l, i) => {
    const c = row.getCell(i + 1);
    c.value = l;
    c.font = { bold: true, size: 10 };
    c.alignment = { vertical: 'bottom', horizontal: i < leading.length || i >= leading.length + cols.length ? 'left' : 'right', wrapText: true };
    const col = cols[i - leading.length];
    if (col?.computed) c.fill = fill(COMPUTED_FILL);
  });
  gridRow(row, 1, labels.length);
}

function figureCells(row: Row, startCol: number, cols: BookCol[], f: CashBookFigures, opts: { bold?: boolean; argb?: string } = {}) {
  cols.forEach((c, i) => {
    const cell = row.getCell(startCol + i);
    cell.value = tl(c.get(f));
    cell.numFmt = NUM;
    if (opts.bold) cell.font = { bold: true };
    if (opts.argb) cell.fill = fill(opts.argb);
    else if (c.computed) cell.fill = fill(COMPUTED_FILL);
  });
}

// ---------------------------------------------------------------- Günlük Kasa (detailed)
function dailySheet(wb: Workbook, book: CashBook, opts: { month?: string; showEmpty: boolean; today: string; businessName: string; createdAt: string }) {
  const cols = bookColumns(book.columns);
  const lastCol = 2 + cols.length + 1;
  const ws = wb.addWorksheet('Günlük Kasa', { views: [{ state: 'frozen', xSplit: 2, ySplit: 6 }] });
  ws.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  titleRows(ws, lastCol, `${opts.businessName.toLocaleUpperCase('tr-TR')} — GÜNLÜK KASA DEFTERİ`, `Uygulamadan aktarıldı: ${opts.createdAt}. Gri sütunlar otomatik hesaplanır. Kasa dışı ödenen gider: kart, banka, veresiye veya cepten ödenen kısım.`);

  const months = opts.month ? book.months.filter((m) => m.month === opts.month) : book.months;
  const top = opts.month ? months[0] : book.months.find((m) => m.month === monthKey(opts.today));
  const summary = (rowNo: number, label: string, f: CashBookFigures, note: string) => {
    const row = ws.getRow(rowNo);
    ws.mergeCells(rowNo, 1, rowNo, 2);
    row.getCell(1).value = label;
    row.getCell(1).font = { bold: true };
    figureCells(row, 3, cols, f, { bold: true, argb: TOTAL_FILL });
    row.getCell(1).fill = fill(TOTAL_FILL);
    row.getCell(lastCol).value = note;
    row.getCell(lastCol).font = { italic: true, size: 10, color: { argb: 'FF6B6560' } };
    gridRow(row, 1, lastCol);
  };
  if (top) summary(3, opts.month ? formatMonth(top.month).toLocaleUpperCase('tr-TR') : 'BU AY', top.total, `${top.total.salesDays} satış günü`);
  summary(4, 'GENEL TOPLAM', book.grand, '← tüm ayların toplamı · Kasadaki nakit: şu an kasada olması gereken tutar');
  groupHeaderRow(ws, 5, 'TARİH', 2, cols, [{ label: 'AÇIKLAMA', span: 1, argb: 'FFEEF0F3' }]);
  columnHeaderRow(ws, 6, ['Tarih', 'Gün'], cols, ['Açıklama (ne alındı, notlar)']);

  let r = 7;
  for (const m of months) {
    ws.mergeCells(r, 1, r, lastCol);
    const h = ws.getCell(r, 1);
    h.value = formatMonth(m.month).toLocaleUpperCase('tr-TR');
    h.font = { bold: true };
    h.fill = fill(MONTH_FILL);
    r++;
    for (const day of m.rows) {
      if (!opts.showEmpty && !day.hasData) continue;
      writeDay(ws.getRow(r), day, cols, lastCol);
      r++;
    }
    const tr = ws.getRow(r);
    ws.mergeCells(r, 1, r, 2);
    tr.getCell(1).value = `${formatMonth(m.month)} toplamı`;
    tr.getCell(1).font = { bold: true };
    tr.getCell(1).fill = fill(TOTAL_FILL);
    figureCells(tr, 3, cols, m.total, { bold: true, argb: TOTAL_FILL });
    tr.getCell(lastCol).value = `${m.total.salesDays} satış günü · Kasadaki nakit = ay sonundaki tutar`;
    tr.getCell(lastCol).font = { italic: true, size: 10, color: { argb: 'FF6B6560' } };
    gridRow(tr, 1, lastCol);
    r++;
  }

  ws.getColumn(1).width = 12;
  ws.getColumn(2).width = 6;
  for (let i = 0; i < cols.length; i++) ws.getColumn(3 + i).width = 14;
  ws.getColumn(lastCol).width = 80;
}

function writeDay(row: Row, day: CashBookRow, cols: BookCol[], lastCol: number) {
  const d = row.getCell(1);
  d.value = excelDate(day.date);
  d.numFmt = 'dd.mm.yyyy';
  row.getCell(2).value = weekday(day.date, true);
  if (day.hasData) figureCells(row, 3, cols, day);
  else cols.forEach((c, i) => c.computed && (row.getCell(3 + i).fill = fill(COMPUTED_FILL)));
  row.getCell(lastCol).value = day.note || null;
  gridRow(row, 1, lastCol);
}

// ---------------------------------------------------------------- Aylık Özet (summary)
function monthlySheet(wb: Workbook, book: CashBook, opts: { businessName: string; createdAt: string }) {
  const cols = bookColumns(book.columns);
  const lastCol = 2 + cols.length + 1;
  const ws = wb.addWorksheet('Aylık Özet', { views: [{ state: 'frozen', xSplit: 1, ySplit: 5 }] });
  ws.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  titleRows(ws, lastCol, `${opts.businessName} — Aylık Özet`, `Uygulamadan aktarıldı: ${opts.createdAt}. Kasa defterindeki ay toplamlarının alt alta karşılaştırması.`);
  groupHeaderRow(ws, 4, 'AY', 2, cols, [{ label: 'ORTALAMA', span: 1, argb: 'FFEDE7FB' }]);
  columnHeaderRow(ws, 5, ['Ay', 'Satış günü'], cols, ['Ort. günlük ciro'], (c) => (c.key === 'cashBalance' ? 'Ay sonu kasadaki nakit' : c.label));

  const line = (rowNo: number, label: string, f: CashBookFigures & { salesDays: number }, bold: boolean) => {
    const row = ws.getRow(rowNo);
    row.getCell(1).value = label;
    row.getCell(2).value = f.salesDays;
    row.getCell(2).numFmt = INT;
    figureCells(row, 3, cols, f, bold ? { bold: true, argb: TOTAL_FILL } : {});
    const avg = row.getCell(lastCol);
    avg.value = f.salesDays ? tl(f.netSales) / f.salesDays : 0;
    avg.numFmt = NUM;
    if (bold) {
      for (const c of [1, 2, lastCol]) {
        row.getCell(c).font = { bold: true };
        row.getCell(c).fill = fill(TOTAL_FILL);
      }
    }
    gridRow(row, 1, lastCol);
  };
  let r = 6;
  for (const m of book.months) line(r++, formatMonth(m.month), m.total, false);
  line(r, 'GENEL TOPLAM', book.grand, true);

  ws.getColumn(1).width = 16;
  ws.getColumn(2).width = 10;
  for (let i = 0; i < cols.length; i++) ws.getColumn(3 + i).width = 14;
  ws.getColumn(lastCol).width = 16;
}

export async function buildBookWorkbook(
  book: CashBook,
  opts: { kind: 'detailed' | 'summary'; month?: string; showEmpty: boolean; today: string; businessName: string; now?: Date },
): Promise<Blob> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Mama's Burger Muhasebe";
  wb.created = opts.now ?? new Date();
  const createdAt = (opts.now ?? new Date()).toLocaleString('tr-TR', { dateStyle: 'long', timeStyle: 'short' });
  if (opts.kind === 'detailed') dailySheet(wb, book, { ...opts, createdAt });
  monthlySheet(wb, book, { businessName: opts.businessName, createdAt });
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: XLSX_TYPE });
}
