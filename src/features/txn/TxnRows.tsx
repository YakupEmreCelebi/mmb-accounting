import { Fragment } from 'react';
import type { Txn } from '../../domain/types';
import { formatDate, weekday } from '../../lib/dates';
import { formatTL } from '../../lib/money';
import { useData } from '../../state/data';
import { useUI } from '../../state/ui';
import { Badge, cx } from '../../ui';
import { KIND_META, moneyEffect, txnSubtitle, txnTitle } from './meta';

export function TxnRow({ t, showDate }: { t: Txn; showDate?: boolean }) {
  const d = useData();
  const { openDetail } = useUI();
  const meta = KIND_META[t.kind];
  const eff = moneyEffect(d, t);
  return (
    <button onClick={() => openDetail(t.id)} className={cx('flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-ink-50 active:bg-ink-100', t.void && 'opacity-50')}>
      <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', meta.tint)}>
        <meta.icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cx('block truncate text-[15px] font-medium text-ink-900', t.void && 'line-through')}>{txnTitle(d, t)}</span>
        <span className="block truncate text-sm text-ink-500">
          {showDate && <>{formatDate(t.date, 'short')} · </>}
          {txnSubtitle(d, t) || meta.label}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className={cx('tabular text-[15px] font-semibold', eff > 0 ? 'text-emerald-700' : eff < 0 ? 'text-ink-900' : 'text-ink-500')}>
          {eff > 0 ? '+' : eff < 0 ? '−' : ''}
          {formatTL(Math.abs(eff || t.amount))}
        </span>
        {t.void ? <Badge tone="red">İptal</Badge> : t.payStatus === 'unpaid' ? <Badge tone="amber">Veresiye</Badge> : null}
      </span>
    </button>
  );
}

/** Transactions grouped under date headers. */
export function TxnGroups({ txns }: { txns: Txn[] }) {
  const groups: Array<{ date: string; items: Txn[] }> = [];
  for (const t of txns) {
    const g = groups[groups.length - 1];
    if (g && g.date === t.date) g.items.push(t);
    else groups.push({ date: t.date, items: [t] });
  }
  return (
    <div className="card overflow-hidden">
      {groups.map((g) => (
        <Fragment key={g.date}>
          <div className="sticky top-0 z-[1] border-y border-ink-100 bg-ink-50/95 px-4 py-2 text-sm font-semibold text-ink-600 backdrop-blur first:border-t-0">
            {formatDate(g.date)} <span className="font-normal text-ink-400">· {weekday(g.date)}</span>
          </div>
          <div className="divide-y divide-ink-100">
            {g.items.map((t) => (
              <TxnRow key={t.id} t={t} />
            ))}
          </div>
        </Fragment>
      ))}
    </div>
  );
}
