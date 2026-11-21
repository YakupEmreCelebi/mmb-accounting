import { useMemo, useState } from 'react';
import { ListOrdered, Plus, Search } from 'lucide-react';
import type { TxnKind } from '../../domain/types';
import { monthKey, todayISO } from '../../lib/dates';
import { formatTL } from '../../lib/money';
import { includesTR } from '../../lib/text';
import { expenseCategories, moneyAccounts, useData } from '../../state/data';
import { useUI } from '../../state/ui';
import { Button, EmptyState, PageHeader, Select, TextInput, Toggle } from '../../ui';
import { MonthNav } from '../../ui/MonthNav';
import { KIND_META, moneyEffect, txnSubtitle, txnTitle } from './meta';
import { TxnGroups } from './TxnRows';

export function TxnList() {
  const d = useData();
  const { openMenu } = useUI();
  const [month, setMonth] = useState(monthKey(todayISO()));
  const [allTime, setAllTime] = useState(false);
  const [kind, setKind] = useState<'' | TxnKind>('');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [contactId, setContactId] = useState('');
  const [q, setQ] = useState('');
  const [showVoid, setShowVoid] = useState(false);

  const list = useMemo(() => {
    const src = showVoid ? [...d.allTxns].sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1)) : d.txns;
    return src.filter((t) => {
      if (!allTime && monthKey(t.date) !== month) return false;
      if (kind && t.kind !== kind) return false;
      if (accountId && !t.postings.some((p) => p.accountId === accountId)) return false;
      if (categoryId && t.categoryId !== categoryId) return false;
      if (contactId && t.contactId !== contactId && !t.postings.some((p) => p.contactId === contactId)) return false;
      if (q && !includesTR(`${t.description} ${txnTitle(d, t)} ${txnSubtitle(d, t)}`, q)) return false;
      return true;
    });
  }, [d, month, allTime, kind, accountId, categoryId, contactId, q, showVoid]);

  const totals = useMemo(() => {
    let inflow = 0;
    let outflow = 0;
    for (const t of list) {
      if (t.void) continue;
      const e = moneyEffect(d, t);
      if (e > 0) inflow += e;
      else outflow -= e;
    }
    return { inflow, outflow };
  }, [list, d]);

  return (
    <>
      <PageHeader
        title="Hareketler"
        sub="Bütün kayıtlar. Bir kayda dokunarak ayrıntısını görün, düzenleyin veya iptal edin."
        actions={
          <Button variant="primary" icon={<Plus className="h-5 w-5" />} onClick={() => openMenu()}>
            Yeni işlem
          </Button>
        }
      />
      <div className="card mb-4 space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-3">
          {!allTime && <MonthNav value={month} onChange={setMonth} />}
          <Toggle checked={allTime} onChange={setAllTime} label="Tüm zamanlar" />
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400" />
            <TextInput className="pl-10" placeholder="Ara: açıklama, firma, kategori…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select value={kind} onChange={(e) => setKind(e.target.value as TxnKind | '')} aria-label="İşlem türü">
            <option value="">Tüm işlem türleri</option>
            {(Object.keys(KIND_META) as TxnKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_META[k].label}
              </option>
            ))}
          </Select>
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)} aria-label="Hesap">
            <option value="">Tüm hesaplar</option>
            {moneyAccounts(d, { includeArchived: true }).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Kategori">
            <option value="">Tüm kategoriler</option>
            {expenseCategories(d, true).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select value={contactId} onChange={(e) => setContactId(e.target.value)} aria-label="Kişi / firma">
            <option value="">Tüm kişi ve firmalar</option>
            {d.contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-ink-600">
          <span>
            {list.length} kayıt · Giren <b className="tabular text-emerald-700">{formatTL(totals.inflow, 'auto')}</b> · Çıkan{' '}
            <b className="tabular text-ink-900">{formatTL(totals.outflow, 'auto')}</b>
          </span>
          <Toggle checked={showVoid} onChange={setShowVoid} label="İptal edilenleri göster" />
        </div>
      </div>
      {list.length ? (
        <TxnGroups txns={list} />
      ) : (
        <div className="card">
          <EmptyState icon={<ListOrdered className="h-10 w-10" />} title="Kayıt yok" text="Bu filtrelere uyan kayıt bulunamadı." />
        </div>
      )}
    </>
  );
}
