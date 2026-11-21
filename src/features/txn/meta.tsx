import { ArrowLeftRight, Flag, HandCoins, Landmark, Receipt, Scale, SlidersHorizontal, Store, TrendingUp, UserRound, type LucideIcon } from 'lucide-react';
import type { Txn, TxnKind } from '../../domain/types';
import { PERSONNEL_TYPE_LABEL, SYS } from '../../domain/types';
import type { AppData } from '../../state/data';
import { accountName, contactName } from '../../state/data';
import type { Kurus } from '../../lib/money';

export const KIND_META: Record<TxnKind, { label: string; icon: LucideIcon; tint: string }> = {
  day_sales: { label: 'Gün sonu satışları', icon: Store, tint: 'bg-sky-50 text-sky-700' },
  day_variance: { label: 'Kasa farkı', icon: Scale, tint: 'bg-amber-50 text-amber-700' },
  expense: { label: 'Gider', icon: Receipt, tint: 'bg-brand-50 text-brand-700' },
  personnel: { label: 'Personel ödemesi', icon: UserRound, tint: 'bg-violet-50 text-violet-700' },
  contact_payment: { label: 'Cari ödeme', icon: HandCoins, tint: 'bg-emerald-50 text-emerald-700' },
  collection: { label: 'Tahsilat', icon: Landmark, tint: 'bg-emerald-50 text-emerald-700' },
  transfer: { label: 'Transfer', icon: ArrowLeftRight, tint: 'bg-ink-100 text-ink-700' },
  income: { label: 'Diğer gelir', icon: TrendingUp, tint: 'bg-emerald-50 text-emerald-700' },
  opening: { label: 'Açılış bakiyesi', icon: Flag, tint: 'bg-ink-100 text-ink-700' },
  adjustment: { label: 'Bakiye düzeltme', icon: SlidersHorizontal, tint: 'bg-ink-100 text-ink-700' },
};

/** Human title for a transaction row. */
export function txnTitle(d: AppData, t: Txn): string {
  switch (t.kind) {
    case 'expense':
      return t.description || accountName(d, t.categoryId);
    case 'personnel':
      return `${contactName(d, t.contactId)} · ${t.personnelType ? PERSONNEL_TYPE_LABEL[t.personnelType] : 'Ödeme'}`;
    case 'contact_payment': {
      const c = t.contactId ? d.contactById.get(t.contactId) : undefined;
      if (c?.type === 'owner') return t.direction === 'pay' ? 'İşletme sahibine ödeme' : 'İşletme sahibi para koydu';
      return `${c?.name ?? 'Cari'} · ${t.direction === 'pay' ? 'ödeme' : 'tahsilat'}`;
    }
    case 'collection':
      return `${d.methodById.get(t.paymentMethodId ?? '')?.name ?? 'Tahsilat'} ödemesi`;
    case 'transfer':
      return `${accountName(d, t.sourceAccountId)} → ${accountName(d, t.targetAccountId)}`;
    case 'income':
      return t.description || accountName(d, t.categoryId);
    case 'opening':
      return `Açılış: ${t.contactId ? contactName(d, t.contactId) : accountName(d, t.sourceAccountId)}`;
    case 'adjustment':
      return `Bakiye düzeltme: ${accountName(d, t.sourceAccountId)}`;
    default:
      return t.description || KIND_META[t.kind].label;
  }
}

/** Secondary line: category, account, contact. */
export function txnSubtitle(d: AppData, t: Txn): string {
  const parts: string[] = [];
  if (t.kind === 'expense') {
    parts.push(accountName(d, t.categoryId));
    if (t.payStatus === 'unpaid') parts.push(`Veresiye · ${contactName(d, t.contactId)}`);
    else if (t.payStatus === 'out_of_pocket') parts.push(`Cepten · ${contactName(d, t.contactId)}`);
    else {
      parts.push(accountName(d, t.sourceAccountId));
      if (t.contactId) parts.push(contactName(d, t.contactId));
    }
  } else if (t.kind === 'personnel' || t.kind === 'contact_payment') {
    parts.push(accountName(d, t.sourceAccountId));
    if (t.description) parts.push(t.description);
  } else if (t.kind === 'collection') {
    parts.push(accountName(d, t.targetAccountId));
    if (t.description) parts.push(t.description);
  } else if (t.kind === 'income') {
    parts.push(accountName(d, t.categoryId), accountName(d, t.targetAccountId));
  } else if (t.kind === 'transfer' || t.kind === 'opening' || t.kind === 'adjustment') {
    if (t.description) parts.push(t.description);
  } else if (t.kind === 'day_sales') {
    parts.push('Satış − iade');
  }
  return parts.filter(Boolean).join(' · ');
}

/**
 * Effect on the business's money (kasa + banka − kart borcu), used for the +/− shown in lists.
 * Sales and income are +, expenses and payments are −, transfers are 0.
 */
export function moneyEffect(d: AppData, t: Txn): Kurus {
  let s = 0;
  for (const p of t.postings) {
    const k = d.accountById.get(p.accountId)?.kind;
    if (k === 'cash' || k === 'bank' || k === 'card' || k === 'receivable') s += p.amount;
  }
  if (t.kind === 'expense' && t.payStatus !== 'paid') return -t.amount;
  if (t.kind === 'day_sales' || t.kind === 'collection') return t.amount;
  return s;
}

export function isEditableKind(kind: TxnKind): boolean {
  return kind === 'expense' || kind === 'personnel' || kind === 'contact_payment' || kind === 'collection' || kind === 'transfer' || kind === 'income';
}

export const CASH_ID = SYS.kasa;
