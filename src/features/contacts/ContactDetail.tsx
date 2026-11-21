import { useMemo, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { HandCoins, Pencil, Phone, Receipt, UserRound } from 'lucide-react';
import { controlAccountFor, payableAging } from '../../domain/ledger';
import { CONTACT_TYPE_LABEL, PERSONNEL_TYPE_LABEL, type PersonnelPayType } from '../../domain/types';
import { addMonths, formatDate, formatMonth, monthKey, todayISO } from '../../lib/dates';
import { formatTL } from '../../lib/money';
import { useData } from '../../state/data';
import { useUI } from '../../state/ui';
import { Badge, Button, Card, CardTitle, PageHeader, Stat, cx } from '../../ui';
import { txnTitle } from '../txn/meta';
import { TxnRow } from '../txn/TxnRows';
import { ContactEditor } from './ContactEditor';

export function ContactDetail() {
  const { id } = useParams();
  const d = useData();
  const { openNew, openDetail } = useUI();
  const [editing, setEditing] = useState(false);
  const c = id ? d.contactById.get(id) : undefined;
  const today = todayISO();

  const related = useMemo(() => (c ? d.txns.filter((t) => t.contactId === c.id || t.postings.some((p) => p.contactId === c.id)) : []), [d.txns, c]);
  const aging = useMemo(() => (c ? payableAging(d.txns, c, today) : null), [d.txns, c, today]);

  const ledger = useMemo(() => {
    if (!c) return [];
    const control = controlAccountFor(c);
    const rows: Array<{ id: string; date: string; title: string; debt: number; paid: number; balance: number }> = [];
    let bal = 0;
    const asc = [...related].sort((a, b) => (a.date === b.date ? a.createdAt - b.createdAt : a.date < b.date ? -1 : 1));
    for (const t of asc) {
      const amt = t.postings.filter((p) => p.accountId === control && p.contactId === c.id).reduce((s, p) => s + p.amount, 0);
      if (!amt) continue;
      bal += -amt;
      rows.push({ id: t.id, date: t.date, title: txnTitle(d, t), debt: amt < 0 ? -amt : 0, paid: amt > 0 ? amt : 0, balance: bal });
    }
    return rows.reverse();
  }, [related, c, d]);

  const personnelMonths = useMemo(() => {
    if (!c || c.type !== 'personnel') return [];
    const cur = monthKey(today);
    return [0, 1, 2, 3, 4, 5].map((i) => {
      const m = addMonths(cur, -i);
      const items = related.filter((t) => t.kind === 'personnel' && monthKey(t.date) === m);
      const byType: Partial<Record<PersonnelPayType, number>> = {};
      for (const t of items) if (t.personnelType) byType[t.personnelType] = (byType[t.personnelType] ?? 0) + t.amount;
      return { m, total: items.reduce((s, t) => s + t.amount, 0), byType };
    });
  }, [c, related, today]);

  if (!c) return <Navigate to="/cariler" replace />;
  const isPersonnel = c.type === 'personnel';
  const isSupplier = c.type === 'supplier' || c.type === 'other';

  return (
    <>
      <PageHeader
        title={c.name}
        sub={
          <span className="flex flex-wrap items-center gap-2">
            <Badge>{CONTACT_TYPE_LABEL[c.type]}</Badge>
            {isPersonnel && <Badge tone={c.employment === 'permanent' ? 'blue' : 'neutral'}>{c.employment === 'permanent' ? 'Kalıcı' : 'Geçici / yevmiyeli'}</Badge>}
            {c.archived && <Badge tone="amber">Arşivde</Badge>}
            {c.phone && (
              <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 text-brand-700">
                <Phone className="h-4 w-4" />
                {c.phone}
              </a>
            )}
          </span>
        }
        actions={
          <>
            <Button icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(true)}>
              Düzenle
            </Button>
            {isSupplier && (
              <Button icon={<Receipt className="h-4 w-4" />} onClick={() => openNew('expense', { contactId: c.id, payStatus: 'unpaid' })}>
                Veresiye alım
              </Button>
            )}
            {isPersonnel ? (
              <Button variant="primary" icon={<UserRound className="h-4 w-4" />} onClick={() => openNew('personnel', { contactId: c.id })}>
                Ödeme yap
              </Button>
            ) : (
              <Button variant="primary" icon={<HandCoins className="h-4 w-4" />} onClick={() => openNew('contact_payment', { contactId: c.id, direction: 'pay' })}>
                Borç öde
              </Button>
            )}
          </>
        }
      />
      {c.note && <p className="mb-4 text-sm text-ink-600">{c.note}</p>}

      {isSupplier && aging && (
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <Stat label="Borcumuz" value={formatTL(aging.balance, 'auto')} />
          <Stat label="Vadesi geçen" value={formatTL(aging.overdue, 'auto')} tone={aging.overdue ? 'bad' : 'neutral'} sub={aging.oldestOverdue ? `En eski vade ${formatDate(aging.oldestOverdue, 'short')}` : undefined} />
          <Stat label="Bu ay alım" value={formatTL(related.filter((t) => t.kind === 'expense' && monthKey(t.date) === monthKey(today)).reduce((s, t) => s + t.amount, 0), 'auto')} />
        </div>
      )}

      {isPersonnel && (
        <Card className="mb-5">
          <CardTitle sub={c.monthlySalary ? `Aylık maaş ${formatTL(c.monthlySalary, 'auto')}` : 'Aylık maaş tanımlı değil'}>Aylara göre ödemeler</CardTitle>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {personnelMonths.map((pm) => (
              <div key={pm.m} className="rounded-xl bg-ink-50 px-4 py-3">
                <div className="text-sm text-ink-500">{formatMonth(pm.m)}</div>
                <div className="tabular text-lg font-semibold">{formatTL(pm.total, 'auto')}</div>
                <div className="text-sm text-ink-500">
                  {Object.entries(pm.byType)
                    .map(([k, v]) => `${PERSONNEL_TYPE_LABEL[k as PersonnelPayType]} ${formatTL(v ?? 0, 'auto')}`)
                    .join(' · ') || '—'}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {isSupplier && aging && aging.open.length > 0 && (
        <Card className="mb-5" padded={false}>
          <div className="px-5 pt-5">
            <CardTitle sub="Ödemeler en eski borçtan başlayarak düşülür">Açık borçlar</CardTitle>
          </div>
          <div className="divide-y divide-ink-100">
            {aging.open.map((o) => (
              <button key={o.txnId} onClick={() => openDetail(o.txnId)} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-ink-50">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] text-ink-900">{o.description || 'Alım'}</span>
                  <span className={cx('block text-sm', o.dueDate && o.dueDate < today ? 'font-medium text-red-700' : 'text-ink-500')}>
                    {formatDate(o.date, 'short')} · vade {formatDate(o.dueDate ?? o.date, 'short')}
                    {o.dueDate && o.dueDate < today ? ' · gecikti' : ''}
                  </span>
                </span>
                <span className="tabular font-semibold">{formatTL(o.remaining, 'auto')}</span>
              </button>
            ))}
          </div>
        </Card>
      )}

      {ledger.length > 0 && (
        <Card className="mb-5" padded={false}>
          <div className="px-5 pt-5">
            <CardTitle sub="Cari hesap ekstresi">Borç / ödeme hareketleri</CardTitle>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-ink-50 text-left text-ink-500">
                <tr>
                  <th className="px-5 py-2 font-medium">Tarih</th>
                  <th className="px-3 py-2 font-medium">Açıklama</th>
                  <th className="px-3 py-2 text-right font-medium">Borç</th>
                  <th className="px-3 py-2 text-right font-medium">Ödeme</th>
                  <th className="px-5 py-2 text-right font-medium">Bakiye</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {ledger.map((r) => (
                  <tr key={r.id} onClick={() => openDetail(r.id)} className="cursor-pointer hover:bg-ink-50">
                    <td className="whitespace-nowrap px-5 py-2.5">{formatDate(r.date, 'short')}</td>
                    <td className="px-3 py-2.5">{r.title}</td>
                    <td className="tabular px-3 py-2.5 text-right">{r.debt ? formatTL(r.debt) : ''}</td>
                    <td className="tabular px-3 py-2.5 text-right">{r.paid ? formatTL(r.paid) : ''}</td>
                    <td className="tabular px-5 py-2.5 text-right font-semibold">{formatTL(r.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-500">Tüm kayıtlar</h3>
      {related.length ? (
        <div className="card divide-y divide-ink-100 overflow-hidden">
          {related.map((t) => (
            <TxnRow key={t.id} t={t} showDate />
          ))}
        </div>
      ) : (
        <p className="text-sm text-ink-500">Henüz kayıt yok.</p>
      )}
      {editing && <ContactEditor contact={c} onClose={() => setEditing(false)} />}
    </>
  );
}
