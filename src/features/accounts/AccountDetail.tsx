import { useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowLeftRight, ClipboardPaste, CreditCard, Flag, SlidersHorizontal } from 'lucide-react';
import { repo } from '../../db';
import { buildAdjustment, buildOpening, displayBalance } from '../../domain/ledger';
import { KIND_LABEL, SYS } from '../../domain/types';
import { formatDate, monthEnd, monthKey, monthStart, todayISO } from '../../lib/dates';
import { formatTL, type Kurus } from '../../lib/money';
import { useData } from '../../state/data';
import { useUI } from '../../state/ui';
import { Button, Card, DateInput, Field, Modal, MoneyInput, PageHeader, Stat, TextInput, Toggle, cx } from '../../ui';
import { MonthNav } from '../../ui/MonthNav';
import { txnTitle } from '../txn/meta';

export function AccountDetail() {
  const { id } = useParams();
  const d = useData();
  const { openNew, openDetail } = useUI();
  const a = id ? d.accountById.get(id) : undefined;
  const [month, setMonth] = useState(monthKey(todayISO()));
  const [allTime, setAllTime] = useState(false);
  const [dialog, setDialog] = useState<null | 'adjust' | 'opening'>(null);

  const rows = useMemo(() => {
    if (!a) return { list: [], opening: 0, inSum: 0, outSum: 0 };
    const from = allTime ? '0000-01-01' : monthStart(month);
    const to = allTime ? '9999-12-31' : monthEnd(month);
    const isLiab = a.kind === 'card';
    let opening = 0;
    const items: Array<{ id: string; date: string; title: string; inAmt: number; outAmt: number; balance: number; createdAt: number }> = [];
    const asc = [...d.txns].sort((x, y) => (x.date === y.date ? x.createdAt - y.createdAt : x.date < y.date ? -1 : 1));
    let bal = 0;
    let inSum = 0;
    let outSum = 0;
    for (const t of asc) {
      const amt = t.postings.filter((p) => p.accountId === a.id).reduce((s, p) => s + p.amount, 0);
      if (!amt) continue;
      const shown = isLiab ? -amt : amt;
      if (t.date < from) {
        opening += shown;
        bal += shown;
        continue;
      }
      if (t.date > to) continue;
      bal += shown;
      if (shown > 0) inSum += shown;
      else outSum -= shown;
      items.push({ id: t.id, date: t.date, title: txnTitle(d, t), inAmt: shown > 0 ? shown : 0, outAmt: shown < 0 ? -shown : 0, balance: bal, createdAt: t.createdAt });
    }
    return { list: items.reverse(), opening, inSum, outSum };
  }, [a, d, month, allTime]);

  if (!a || !['cash', 'bank', 'card'].includes(a.kind)) return <Navigate to="/hesaplar" replace />;
  const bal = displayBalance(a.kind, d.balances.get(a.id) ?? 0);
  const isCard = a.kind === 'card';
  const inLabel = isCard ? 'Harcama' : 'Giren';
  const outLabel = isCard ? 'Ödeme' : 'Çıkan';

  return (
    <>
      <PageHeader
        title={a.id === SYS.kasa ? 'Kasa (nakit)' : a.name}
        sub={KIND_LABEL[a.kind]}
        actions={
          <>
            {isCard && (
              <Link to={`/hesaplar/${a.id}/ekstre`}>
                <Button variant="primary" icon={<ClipboardPaste className="h-4 w-4" />}>
                  Ekstre ile doldur
                </Button>
              </Link>
            )}
            {isCard ? (
              <Button icon={<CreditCard className="h-4 w-4" />} onClick={() => openNew('transfer', { targetAccountId: a.id, sourceAccountId: d.accounts.find((x) => x.kind === 'bank' && !x.archived)?.id, description: 'Kredi kartı ekstre ödemesi' })}>
                Ekstre ödemesi
              </Button>
            ) : (
              <Button icon={<ArrowLeftRight className="h-4 w-4" />} onClick={() => openNew('transfer', { sourceAccountId: a.id })}>
                Transfer
              </Button>
            )}
            <Button icon={<SlidersHorizontal className="h-4 w-4" />} onClick={() => setDialog('adjust')}>
              Bakiye düzelt
            </Button>
            <Button icon={<Flag className="h-4 w-4" />} onClick={() => setDialog('opening')}>
              Açılış bakiyesi
            </Button>
          </>
        }
      />
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Stat label={isCard ? 'Güncel kart borcu' : 'Güncel bakiye'} value={formatTL(bal)} tone={!isCard && bal < 0 ? 'bad' : 'neutral'} />
        <Stat label={`${allTime ? 'Toplam' : 'Bu dönem'} ${inLabel.toLowerCase()}`} value={formatTL(rows.inSum, 'auto')} />
        <Stat label={`${allTime ? 'Toplam' : 'Bu dönem'} ${outLabel.toLowerCase()}`} value={formatTL(rows.outSum, 'auto')} />
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        {!allTime && <MonthNav value={month} onChange={setMonth} />}
        <Toggle checked={allTime} onChange={setAllTime} label="Tüm zamanlar" />
      </div>
      <Card padded={false} className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead className="bg-ink-50 text-left text-ink-500">
              <tr>
                <th className="px-5 py-2.5 font-medium">Tarih</th>
                <th className="px-3 py-2.5 font-medium">Açıklama</th>
                <th className="px-3 py-2.5 text-right font-medium">{inLabel}</th>
                <th className="px-3 py-2.5 text-right font-medium">{outLabel}</th>
                <th className="px-5 py-2.5 text-right font-medium">{isCard ? 'Borç' : 'Bakiye'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {rows.list.map((r) => (
                <tr key={r.id} onClick={() => openDetail(r.id)} className="cursor-pointer hover:bg-ink-50">
                  <td className="whitespace-nowrap px-5 py-2.5">{formatDate(r.date, 'short')}</td>
                  <td className="px-3 py-2.5">{r.title}</td>
                  <td className="tabular px-3 py-2.5 text-right text-emerald-700">{r.inAmt ? formatTL(r.inAmt) : ''}</td>
                  <td className="tabular px-3 py-2.5 text-right">{r.outAmt ? formatTL(r.outAmt) : ''}</td>
                  <td className={cx('tabular px-5 py-2.5 text-right font-semibold', !isCard && r.balance < 0 && 'text-red-700')}>{formatTL(r.balance)}</td>
                </tr>
              ))}
              {!allTime && (
                <tr className="bg-ink-50/60 text-ink-500">
                  <td className="px-5 py-2.5" colSpan={4}>
                    Dönem başı devreden
                  </td>
                  <td className="tabular px-5 py-2.5 text-right font-semibold">{formatTL(rows.opening)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {!rows.list.length && <p className="px-5 py-6 text-center text-sm text-ink-500">Bu dönemde hareket yok.</p>}
      </Card>
      {dialog && <BalanceDialog mode={dialog} accountId={a.id} onClose={() => setDialog(null)} />}
    </>
  );
}

function BalanceDialog({ mode, accountId, onClose }: { mode: 'adjust' | 'opening'; accountId: string; onClose: () => void }) {
  const d = useData();
  const { toast } = useUI();
  const a = d.accountById.get(accountId)!;
  const current = d.balances.get(a.id) ?? 0;
  const [value, setValue] = useState<Kurus | null>(null);
  const [date, setDate] = useState(todayISO());
  const [desc, setDesc] = useState('');
  const [error, setError] = useState('');
  const isCard = a.kind === 'card';
  const save = async () => {
    setError('');
    try {
      if (value === null) throw new Error('Tutar girin.');
      const draft =
        mode === 'adjust'
          ? buildAdjustment({ date, account: a, currentLedger: current, actualBalance: value, description: desc || undefined })
          : buildOpening({ date, account: a, balance: value, description: desc || undefined });
      await repo.addTxn(draft);
      toast(mode === 'adjust' ? 'Bakiye düzeltildi' : 'Açılış bakiyesi kaydedildi');
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={mode === 'adjust' ? 'Bakiye düzelt' : 'Açılış bakiyesi'}
      footer={
        <>
          {error && <p className="mr-auto text-sm font-medium text-red-700">{error}</p>}
          <Button onClick={onClose}>Vazgeç</Button>
          <Button variant="primary" onClick={save}>
            Kaydet
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-[15px] text-ink-600">
          {mode === 'adjust'
            ? `Uygulamadaki ${isCard ? 'borç' : 'bakiye'}: ${formatTL(displayBalance(a.kind, current))}. Bankanın/kasanın gösterdiği gerçek tutarı girin; aradaki fark “Kasa / hesap farkı” olarak yazılır.`
            : `Uygulamayı kullanmaya başlamadan önce ${isCard ? 'karttaki borcu' : 'hesaptaki parayı'} girin. Açılış bakiyesi kâr hesabını etkilemez.`}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={isCard ? 'Gerçek kart borcu' : 'Gerçek bakiye'} htmlFor="bd-v">
            <MoneyInput id="bd-v" value={value} onChange={setValue} allowNegative={!isCard} size="lg" autoFocus />
          </Field>
          <Field label="Tarih" htmlFor="bd-d">
            <DateInput id="bd-d" value={date} onChange={setDate} />
          </Field>
        </div>
        <Field label="Açıklama" htmlFor="bd-desc">
          <TextInput id="bd-desc" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={mode === 'adjust' ? 'örn. Banka uygulamasıyla eşitlendi' : 'Açılış bakiyesi'} />
        </Field>
      </div>
    </Modal>
  );
}
