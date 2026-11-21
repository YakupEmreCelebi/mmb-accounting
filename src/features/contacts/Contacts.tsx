import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowDownLeft, ArrowUpRight, ChevronRight, Landmark, Plus, Truck, UserRound } from 'lucide-react';
import { contactBalance, payableAging, receivableAging } from '../../domain/ledger';
import { OWNER_CONTACT_ID, PERSONNEL_TYPE_LABEL, type PersonnelPayType } from '../../domain/types';
import { formatDate, monthKey, todayISO } from '../../lib/dates';
import { formatTL } from '../../lib/money';
import { contactsOfType, receivableMethods, useData } from '../../state/data';
import { useUI } from '../../state/ui';
import { Badge, Button, Card, EmptyState, PageHeader, Tabs, cx } from '../../ui';
import { TxnRow } from '../txn/TxnRows';
import { ContactEditor } from './ContactEditor';

type Tab = 'tedarikci' | 'personel' | 'kart' | 'sahip';

export function Contacts() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('t') as Tab) || 'tedarikci';
  const [editor, setEditor] = useState<null | 'supplier' | 'personnel'>(null);
  const setTab = (t: Tab) => setParams({ t }, { replace: true });
  return (
    <>
      <PageHeader
        title="Cariler"
        sub="Kime ne borcumuz var, kimden ne alacağımız var"
        actions={
          tab === 'tedarikci' ? (
            <Button variant="primary" icon={<Plus className="h-5 w-5" />} onClick={() => setEditor('supplier')}>
              Yeni tedarikçi
            </Button>
          ) : tab === 'personel' ? (
            <Button variant="primary" icon={<Plus className="h-5 w-5" />} onClick={() => setEditor('personnel')}>
              Yeni personel
            </Button>
          ) : null
        }
      />
      <Tabs<Tab>
        className="mb-4"
        value={tab}
        onChange={setTab}
        items={[
          { key: 'tedarikci', label: 'Tedarikçiler' },
          { key: 'personel', label: 'Personel' },
          { key: 'kart', label: 'Yemek kartları' },
          { key: 'sahip', label: 'İşletme sahibi' },
        ]}
      />
      {tab === 'tedarikci' && <Suppliers />}
      {tab === 'personel' && <Personnel />}
      {tab === 'kart' && <MealCards />}
      {tab === 'sahip' && <Owner />}
      {editor && <ContactEditor type={editor} onClose={() => setEditor(null)} />}
    </>
  );
}

function Suppliers() {
  const d = useData();
  const today = todayISO();
  const rows = useMemo(
    () =>
      contactsOfType(d, ['supplier', 'other'])
        .map((c) => {
          const aging = payableAging(d.txns, c, today);
          const last = d.txns.find((t) => t.contactId === c.id || t.postings.some((p) => p.contactId === c.id));
          return { c, aging, last };
        })
        .sort((a, b) => b.aging.balance - a.aging.balance || a.c.name.localeCompare(b.c.name, 'tr')),
    [d, today],
  );
  const total = rows.reduce((s, r) => s + r.aging.balance, 0);
  if (!rows.length)
    return (
      <Card>
        <EmptyState icon={<Truck className="h-10 w-10" />} title="Henüz tedarikçi yok" text="Veresiye çalıştığınız firmaları ekleyin; gider girerken de “+ Yeni tedarikçi” ile eklenebilir." />
      </Card>
    );
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-ink-100 bg-ink-50 px-4 py-3 text-sm">
        <span className="font-semibold text-ink-600">{rows.length} tedarikçi</span>
        <span className="text-ink-600">
          Toplam borcumuz <b className="tabular text-ink-900">{formatTL(total, 'auto')}</b>
        </span>
      </div>
      <div className="divide-y divide-ink-100">
        {rows.map(({ c, aging, last }) => (
          <Link key={c.id} to={`/cariler/kisi/${c.id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-ink-50">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-100 text-ink-600">
              <Truck className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-ink-900">{c.name}</span>
              <span className="block text-sm text-ink-500">{last ? `Son hareket ${formatDate(last.date, 'short')}` : 'Hareket yok'}</span>
            </span>
            <span className="text-right">
              <span className={cx('tabular block font-semibold', aging.balance > 0 ? 'text-ink-900' : 'text-ink-400')}>{aging.balance ? formatTL(aging.balance, 'auto') : 'Borç yok'}</span>
              {aging.overdue > 0 && <Badge tone="red">Vadesi geçen {formatTL(aging.overdue, 'auto')}</Badge>}
            </span>
            <ChevronRight className="h-5 w-5 text-ink-300" />
          </Link>
        ))}
      </div>
    </div>
  );
}

function Personnel() {
  const d = useData();
  const month = monthKey(todayISO());
  const rows = useMemo(
    () =>
      contactsOfType(d, 'personnel').map((c) => {
        const paid = d.txns.filter((t) => t.kind === 'personnel' && t.contactId === c.id && monthKey(t.date) === month);
        const byType: Partial<Record<PersonnelPayType, number>> = {};
        for (const t of paid) if (t.personnelType) byType[t.personnelType] = (byType[t.personnelType] ?? 0) + t.amount;
        return { c, total: paid.reduce((s, t) => s + t.amount, 0), byType, owed: contactBalance(d.txns, c) };
      }),
    [d, month],
  );
  if (!rows.length)
    return (
      <Card>
        <EmptyState icon={<UserRound className="h-10 w-10" />} title="Henüz personel yok" text="Kalıcı ve geçici (yevmiyeli) çalışanları ekleyin." />
      </Card>
    );
  const total = rows.reduce((s, r) => s + r.total, 0);
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-ink-100 bg-ink-50 px-4 py-3 text-sm">
        <span className="font-semibold text-ink-600">{rows.length} kişi</span>
        <span className="text-ink-600">
          Bu ay ödenen <b className="tabular text-ink-900">{formatTL(total, 'auto')}</b>
        </span>
      </div>
      <div className="divide-y divide-ink-100">
        {rows.map(({ c, total: t, byType, owed }) => (
          <Link key={c.id} to={`/cariler/kisi/${c.id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-ink-50">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
              <UserRound className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate font-medium text-ink-900">{c.name}</span>
                <Badge tone={c.employment === 'permanent' ? 'blue' : 'neutral'}>{c.employment === 'permanent' ? 'Kalıcı' : 'Geçici'}</Badge>
              </span>
              <span className="block truncate text-sm text-ink-500">
                {Object.entries(byType)
                  .map(([k, v]) => `${PERSONNEL_TYPE_LABEL[k as PersonnelPayType]} ${formatTL(v ?? 0, 'auto')}`)
                  .join(' · ') || 'Bu ay ödeme yok'}
                {owed > 0 && ` · cepten harcama alacağı ${formatTL(owed, 'auto')}`}
              </span>
            </span>
            <span className="tabular text-right font-semibold text-ink-900">
              {formatTL(t, 'auto')}
              {c.monthlySalary ? <span className="block text-sm font-normal text-ink-500">/ {formatTL(c.monthlySalary, 'auto')}</span> : null}
            </span>
            <ChevronRight className="h-5 w-5 text-ink-300" />
          </Link>
        ))}
      </div>
    </div>
  );
}

function MealCards() {
  const d = useData();
  const { openNew } = useUI();
  const today = todayISO();
  const rows = receivableMethods(d, true)
    .map((m) => ({ m, aging: receivableAging(d.txns, m, today) }))
    .filter((r) => !r.m.archived || r.aging.balance !== 0);
  const total = rows.reduce((s, r) => s + r.aging.balance, 0);
  return (
    <div className="space-y-4">
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 bg-ink-50 px-4 py-3 text-sm">
          <span className="text-ink-600">
            Toplam bekleyen alacak <b className="tabular text-ink-900">{formatTL(total, 'auto')}</b>
          </span>
          <Button size="sm" variant="primary" icon={<Landmark className="h-4 w-4" />} onClick={() => openNew('collection')}>
            Tahsilat gir
          </Button>
        </div>
        <div className="divide-y divide-ink-100">
          {rows.map(({ m, aging }) => (
            <Link key={m.id} to={`/cariler/odeme-tipi/${m.id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-ink-50">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-ink-900">{m.name}</span>
                <span className="block text-sm text-ink-500">
                  Komisyon {m.commissionRate ? `%${m.commissionRate}` : 'girilmedi'} · Vade {m.termDays ? `${m.termDays} gün` : 'girilmedi'}
                </span>
              </span>
              <span className="text-right">
                <span className={cx('tabular block font-semibold', aging.balance ? 'text-ink-900' : 'text-ink-400')}>{aging.balance ? formatTL(aging.balance, 'auto') : 'Alacak yok'}</span>
                {aging.overdue > 0 && <Badge tone="red">Vadesi geçen {formatTL(aging.overdue, 'auto')}</Badge>}
              </span>
              <ChevronRight className="h-5 w-5 text-ink-300" />
            </Link>
          ))}
        </div>
      </div>
      <p className="text-sm text-ink-500">
        Yemek kartı satışları firma ödeyene kadar alacak olarak bekler. Firmalar ödemeyi, işletmenin kestiği faturaya göre yapar (yasal üst sınır: faturadan itibaren 30 gün, komisyon en fazla %6). Komisyon ve vadeyi Ayarlar → Ödeme tipleri’nden girebilirsiniz.
      </p>
    </div>
  );
}

function Owner() {
  const d = useData();
  const { openNew } = useUI();
  const owner = d.contactById.get(OWNER_CONTACT_ID);
  if (!owner) return null;
  const bal = contactBalance(d.txns, owner);
  const txns = d.txns.filter((t) => t.contactId === owner.id || t.postings.some((p) => p.contactId === owner.id));
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-ink-500">{bal > 0 ? 'İşletmenin sahibe borcu' : bal < 0 ? 'Sahibin işletmeden çektiği (net)' : 'Bakiye'}</div>
            <div className="tabular mt-1 text-3xl font-semibold">{formatTL(Math.abs(bal), 'auto')}</div>
            <p className="mt-2 max-w-xl text-sm text-ink-500">
              Sahibin cebinden ödediği giderler borç olarak yazılır. İşletmeden sahibe verilen para ve kartla yapılan şahsi harcamalar bunu azaltır. Bunlar kâr hesabına girmez.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button icon={<ArrowUpRight className="h-4 w-4" />} onClick={() => openNew('contact_payment', { contactId: owner.id, direction: 'pay' })}>
              Sahibe ödeme
            </Button>
            <Button icon={<ArrowDownLeft className="h-4 w-4" />} onClick={() => openNew('contact_payment', { contactId: owner.id, direction: 'receive' })}>
              Sahip para koydu
            </Button>
          </div>
        </div>
      </Card>
      {txns.length > 0 && (
        <div className="card divide-y divide-ink-100 overflow-hidden">
          {txns.map((t) => (
            <TxnRow key={t.id} t={t} showDate />
          ))}
        </div>
      )}
    </div>
  );
}
