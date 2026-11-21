import type { Pnl } from '../../domain/reports';
import { contactBalance, displayBalance, receivableAging } from '../../domain/ledger';
import { GROUP_LABEL, PERSONNEL_TYPE_LABEL, type PnlGroup } from '../../domain/types';
import { todayISO } from '../../lib/dates';
import type { AppData } from '../../state/data';
import { accountName, contactName, moneyAccounts, receivableMethods } from '../../state/data';
import { KIND_META, moneyEffect, txnTitle } from '../txn/meta';

const MONEY = '#,##0.00 "₺"';
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const tl = (k: number) => Math.round(k) / 100;
const toDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

/** Builds an .xlsx with P&L, transactions, day closes and balances for the period. */
export async function buildWorkbook(d: AppData, from: string, to: string, pnl: Pnl): Promise<Blob> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Mama's Burger Muhasebe";
  wb.created = new Date();

  const header = (ws: import('exceljs').Worksheet) => {
    const r = ws.getRow(1);
    r.font = { bold: true };
    r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1EFEC' } };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  };

  // 1) Kâr-Zarar
  const s1 = wb.addWorksheet('Kâr-Zarar');
  s1.columns = [
    { header: 'Kalem', key: 'k', width: 38 },
    { header: 'Tutar', key: 'v', width: 18, style: { numFmt: MONEY } },
    { header: 'Ciroya oranı', key: 'p', width: 14, style: { numFmt: '0.0%' } },
  ];
  header(s1);
  const add = (label: string, v: number, bold = false) => {
    const row = s1.addRow({ k: label, v: tl(v), p: pnl.netSales ? v / pnl.netSales : null });
    if (bold) row.font = { bold: true };
  };
  const section = (g: PnlGroup) => {
    add(GROUP_LABEL[g], pnl.sections[g].total, true);
    for (const l of pnl.sections[g].lines) add('    ' + l.name, l.amount);
  };
  s1.addRow({ k: `Dönem: ${from} – ${to}` }).font = { italic: true };
  add('Brüt satışlar', pnl.grossSales);
  add('İadeler', -pnl.returns);
  add('Net satış', pnl.netSales, true);
  section('cogs');
  add('Brüt kâr', pnl.grossProfit, true);
  section('labor');
  add('Prime cost (malzeme + personel)', pnl.primeCost, true);
  section('operating');
  section('occupancy');
  section('fees');
  add('Faaliyet kârı', pnl.operatingProfit, true);
  section('tax');
  section('other_income');
  add('Kasa / hesap farkı', pnl.variance);
  add('Net kâr', pnl.netProfit, true);
  s1.addRow({});
  section('capex');

  // 2) Hareketler
  const s2 = wb.addWorksheet('Hareketler');
  s2.columns = [
    { header: 'Tarih', key: 'date', width: 12, style: { numFmt: 'dd.mm.yyyy' } },
    { header: 'Tür', key: 'kind', width: 20 },
    { header: 'Başlık', key: 'title', width: 40 },
    { header: 'Açıklama', key: 'desc', width: 40 },
    { header: 'Kategori', key: 'cat', width: 26 },
    { header: 'Kişi / firma', key: 'contact', width: 22 },
    { header: 'Hesap', key: 'acc', width: 18 },
    { header: 'Personel ödeme türü', key: 'ptype', width: 16 },
    { header: 'Tutar', key: 'amount', width: 16, style: { numFmt: MONEY } },
    { header: 'Paraya etkisi (+/−)', key: 'effect', width: 18, style: { numFmt: MONEY } },
  ];
  header(s2);
  const list = d.txns.filter((t) => t.date >= from && t.date <= to).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt));
  for (const t of list) {
    s2.addRow({
      date: toDate(t.date),
      kind: KIND_META[t.kind].label,
      title: txnTitle(d, t),
      desc: t.description,
      cat: accountName(d, t.categoryId),
      contact: contactName(d, t.contactId),
      acc: accountName(d, t.sourceAccountId ?? t.targetAccountId),
      ptype: t.personnelType ? PERSONNEL_TYPE_LABEL[t.personnelType] : '',
      amount: tl(t.amount),
      effect: tl(moneyEffect(d, t)),
    });
  }
  s2.autoFilter = { from: 'A1', to: 'J1' };

  // 3) Gün sonları
  const s3 = wb.addWorksheet('Gün sonları');
  const methods = d.methods;
  s3.columns = [
    { header: 'Tarih', key: 'date', width: 12, style: { numFmt: 'dd.mm.yyyy' } },
    ...methods.map((m) => ({ header: m.name, key: m.id, width: 16, style: { numFmt: MONEY } })),
    { header: 'İade', key: 'refund', width: 14, style: { numFmt: MONEY } },
    { header: 'Net ciro', key: 'net', width: 16, style: { numFmt: MONEY } },
    { header: 'Kasa farkı', key: 'variance', width: 14, style: { numFmt: MONEY } },
    { header: 'Durum', key: 'status', width: 12 },
    { header: 'Not', key: 'note', width: 50 },
  ];
  header(s3);
  for (const dc of [...d.dayCloses].filter((x) => x.date >= from && x.date <= to).sort((a, b) => (a.date < b.date ? -1 : 1))) {
    const gross = Object.values(dc.sales).reduce((s, v) => s + v, 0);
    const row: Record<string, unknown> = {
      date: toDate(dc.date),
      refund: tl(dc.refund || 0),
      net: tl(gross - (dc.refund || 0)),
      variance: dc.status === 'closed' ? tl(dc.variance ?? 0) : null,
      status: dc.status === 'closed' ? 'Kapandı' : 'Açık',
      note: dc.note,
    };
    for (const m of methods) row[m.id] = dc.sales[m.id] ? tl(dc.sales[m.id]) : null;
    s3.addRow(row);
  }

  // 4) Bakiyeler
  const s4 = wb.addWorksheet('Bakiyeler');
  s4.columns = [
    { header: 'Tür', key: 'type', width: 22 },
    { header: 'Ad', key: 'name', width: 32 },
    { header: 'Bakiye', key: 'bal', width: 18, style: { numFmt: MONEY } },
    { header: 'Açıklama', key: 'note', width: 40 },
  ];
  header(s4);
  s4.addRow({ type: `Tarih: ${todayISO()}` }).font = { italic: true };
  for (const a of moneyAccounts(d)) s4.addRow({ type: a.kind === 'card' ? 'Kredi kartı' : a.kind === 'cash' ? 'Kasa' : 'Banka', name: a.name, bal: tl(displayBalance(a.kind, d.balances.get(a.id) ?? 0)), note: a.kind === 'card' ? 'Borç' : '' });
  for (const c of d.contacts) {
    const b = contactBalance(d.txns, c);
    if (b) s4.addRow({ type: c.type === 'personnel' ? 'Personel' : c.type === 'owner' ? 'İşletme sahibi' : 'Tedarikçi', name: c.name, bal: tl(b), note: b > 0 ? 'Bizim borcumuz' : 'Bizim alacağımız' });
  }
  for (const m of receivableMethods(d, true)) {
    const a = receivableAging(d.txns, m, todayISO());
    if (a.balance) s4.addRow({ type: 'Yemek kartı alacağı', name: m.name, bal: tl(a.balance), note: a.overdue ? `Vadesi geçen ${tl(a.overdue)} ₺` : '' });
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: XLSX_TYPE });
}
