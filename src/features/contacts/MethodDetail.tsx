import { useMemo } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Landmark, Settings } from 'lucide-react';
import { receivableAging } from '../../domain/ledger';
import { formatDate, todayISO } from '../../lib/dates';
import { formatPct, formatTL } from '../../lib/money';
import { useData } from '../../state/data';
import { useUI } from '../../state/ui';
import { Button, Card, CardTitle, PageHeader, Stat, cx } from '../../ui';
import { TxnRow } from '../txn/TxnRows';

export function MethodDetail() {
  const { id } = useParams();
  const d = useData();
  const { openNew, openDetail } = useUI();
  const m = id ? d.methodById.get(id) : undefined;
  const today = todayISO();
  const aging = useMemo(() => (m ? receivableAging(d.txns, m, today) : null), [d.txns, m, today]);
  const collections = useMemo(() => (m ? d.txns.filter((t) => t.kind === 'collection' && t.paymentMethodId === m.id) : []), [d.txns, m]);
  if (!m || !aging) return <Navigate to="/cariler?t=kart" replace />;
  const feeTotal = collections.reduce((s, t) => s + t.postings.filter((p) => d.accountById.get(p.accountId)?.group === 'fees').reduce((x, p) => x + p.amount, 0), 0);
  const grossCollected = collections.reduce((s, t) => s + t.postings.filter((p) => p.accountId === m.targetAccountId).reduce((x, p) => x - p.amount, 0), 0);

  return (
    <>
      <PageHeader
        title={m.name}
        sub="Yemek kartı alacağı"
        actions={
          <>
            <Link to="/ayarlar?b=odeme">
              <Button icon={<Settings className="h-4 w-4" />}>Komisyon ve vade</Button>
            </Link>
            <Button variant="primary" icon={<Landmark className="h-4 w-4" />} onClick={() => openNew('collection', { paymentMethodId: m.id })}>
              Tahsilat gir
            </Button>
          </>
        }
      />
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Bekleyen alacak" value={formatTL(aging.balance, 'auto')} />
        <Stat label="Vadesi geçen" value={formatTL(aging.overdue, 'auto')} tone={aging.overdue ? 'bad' : 'neutral'} sub={m.termDays ? `Vade ${m.termDays} gün` : 'Vade girilmedi'} />
        <Stat label="Tahsil edilen (brüt)" value={formatTL(grossCollected, 'auto')} />
        <Stat label="Kesilen komisyon" value={formatTL(feeTotal, 'auto')} sub={grossCollected ? `Gerçekleşen oran ${formatPct((feeTotal / grossCollected) * 100)}` : m.commissionRate ? `Tanımlı oran %${m.commissionRate}` : undefined} />
      </div>
      {aging.open.length > 0 && (
        <Card className="mb-5" padded={false}>
          <div className="px-5 pt-5">
            <CardTitle sub="Tahsilatlar en eski satıştan başlayarak düşülür">Tahsil edilmemiş satışlar</CardTitle>
          </div>
          <div className="divide-y divide-ink-100">
            {aging.open.map((o) => (
              <button key={o.txnId} onClick={() => openDetail(o.txnId)} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-ink-50">
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] text-ink-900">{formatDate(o.date)}</span>
                  {o.dueDate && <span className={cx('block text-sm', o.dueDate < today ? 'font-medium text-red-700' : 'text-ink-500')}>Beklenen ödeme {formatDate(o.dueDate, 'short')}{o.dueDate < today ? ' · gecikti' : ''}</span>}
                </span>
                <span className="tabular font-semibold">{formatTL(o.remaining, 'auto')}</span>
              </button>
            ))}
          </div>
        </Card>
      )}
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-500">Tahsilatlar</h3>
      {collections.length ? (
        <div className="card divide-y divide-ink-100 overflow-hidden">
          {collections.map((t) => (
            <TxnRow key={t.id} t={t} showDate />
          ))}
        </div>
      ) : (
        <p className="text-sm text-ink-500">Henüz tahsilat girilmedi. Firmanın ödemesi hesaba geçince “Tahsilat gir” ile kaydedin.</p>
      )}
    </>
  );
}
