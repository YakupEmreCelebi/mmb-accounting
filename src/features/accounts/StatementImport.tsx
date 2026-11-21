import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ClipboardPaste, Plus, Trash2 } from 'lucide-react';
import { repo } from '../../db';
import { buildContactPayment, buildExpense } from '../../domain/ledger';
import { findDuplicates, merchantKey, parseStatementText, suggestCategory, type StatementLine } from '../../domain/statement';
import { GROUP_LABEL, OWNER_CONTACT_ID, type PnlGroup, type TxnDraft } from '../../domain/types';
import { formatDate, todayISO } from '../../lib/dates';
import { newId } from '../../lib/id';
import { formatTL, type Kurus } from '../../lib/money';
import { expenseCategories, useData } from '../../state/data';
import { useUI } from '../../state/ui';
import { Badge, Button, Card, CardTitle, DateInput, MoneyInput, Notice, PageHeader, Select, TextArea, TextInput, cx } from '../../ui';

interface Row {
  key: string;
  date: string;
  description: string;
  amount: Kurus | null;
  categoryId: string;
  personal: boolean;
  include: boolean;
  duplicateOf?: string;
  credit?: boolean;
}

const GROUPS: PnlGroup[] = ['cogs', 'labor', 'operating', 'occupancy', 'fees', 'tax', 'capex'];

export function StatementImport() {
  const { id } = useParams();
  const d = useData();
  const navigate = useNavigate();
  const { toast, openDetail } = useUI();
  const card = id ? d.accountById.get(id) : undefined;
  const [text, setText] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const cats = expenseCategories(d);
  const learned = (d.settings.learnedMerchants as Record<string, string>) ?? {};

  const toRows = (lines: StatementLine[]): Row[] => {
    const dups = card ? findDuplicates(lines, d.txns, card.id) : new Map<number, string>();
    return lines.map((l, i) => ({
      key: newId('r'),
      date: l.date,
      description: l.description,
      amount: Math.abs(l.amount),
      categoryId: l.amount > 0 ? suggestCategory(l.description, learned) ?? '' : '',
      personal: false,
      include: l.amount > 0 && !dups.has(i),
      duplicateOf: dups.get(i),
      credit: l.amount < 0,
    }));
  };

  const summary = useMemo(() => {
    const r = rows ?? [];
    const inc = r.filter((x) => x.include && x.amount);
    return {
      count: inc.length,
      business: inc.filter((x) => !x.personal).reduce((s, x) => s + (x.amount ?? 0), 0),
      personal: inc.filter((x) => x.personal).reduce((s, x) => s + (x.amount ?? 0), 0),
      missingCat: inc.filter((x) => !x.personal && !x.categoryId).length,
      dups: r.filter((x) => x.duplicateOf).length,
    };
  }, [rows]);

  if (!card || card.kind !== 'card') return <Navigate to="/hesaplar" replace />;

  const update = (key: string, patch: Partial<Row>) => setRows((rs) => (rs ?? []).map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const save = async () => {
    if (!rows) return;
    const owner = d.contactById.get(OWNER_CONTACT_ID);
    const batch = newId('stmt');
    const drafts: TxnDraft[] = [];
    const nextLearned = { ...learned };
    for (const r of rows) {
      if (!r.include || !r.amount) continue;
      if (r.personal) {
        if (!owner) throw new Error('İşletme sahibi kaydı bulunamadı.');
        drafts.push({ ...buildContactPayment({ date: r.date, amount: r.amount, contact: owner, direction: 'pay', accountId: card.id, description: `Şahsi harcama (kart): ${r.description}` }), statementBatchId: batch });
      } else {
        if (!r.categoryId) throw new Error(`“${r.description}” satırı için kategori seçin.`);
        drafts.push(buildExpense({ date: r.date, amount: r.amount, categoryId: r.categoryId, description: r.description, payStatus: 'paid', sourceAccountId: card.id, statementBatchId: batch }));
        const k = merchantKey(r.description);
        if (k) nextLearned[k] = r.categoryId;
      }
    }
    if (!drafts.length) throw new Error('Eklenecek satır seçilmedi.');
    await repo.addTxns(drafts);
    await repo.setSetting('learnedMerchants', nextLearned);
    toast(`${drafts.length} satır karta işlendi`);
    navigate(`/hesaplar/${card.id}`);
  };

  return (
    <>
      <PageHeader
        title="Ekstre ile doldur"
        sub={`${card.name} · Ekstredeki harcamaları kategorileriyle birlikte tek seferde girin`}
        actions={
          <Link to={`/hesaplar/${card.id}`}>
            <Button icon={<ArrowLeft className="h-4 w-4" />}>Karta dön</Button>
          </Link>
        }
      />

      {!rows ? (
        <Card>
          <CardTitle sub="Banka uygulamasındaki veya PDF ekstredeki satırları seçip kopyalayın, buraya yapıştırın.">1. Ekstreyi yapıştırın</CardTitle>
          <TextArea
            className="min-h-[220px] font-mono text-sm"
            placeholder={'03.11.2026  METRO GROSMARKET BAYRAMPAŞA   4.512,40 TL\n04.11.2026  OPET ESENLER   2.000,00 TL\n…'}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-500">Tarihle başlayan ve tutarla biten satırlar okunur. Kopyalayamıyorsanız satırları elle ekleyebilirsiniz.</p>
            <div className="flex gap-2">
              <Button
                icon={<Plus className="h-4 w-4" />}
                onClick={() => setRows([{ key: newId('r'), date: todayISO(), description: '', amount: null, categoryId: '', personal: false, include: true }])}
              >
                Elle gir
              </Button>
              <Button
                variant="primary"
                icon={<ClipboardPaste className="h-4 w-4" />}
                disabled={!text.trim()}
                onClick={() => {
                  const { lines, skipped: sk } = parseStatementText(text);
                  if (!lines.length) {
                    toast('Okunabilir satır bulunamadı. Tarih ve tutar içeren satırları yapıştırın.', 'error');
                    return;
                  }
                  setRows(toRows(lines));
                  setSkipped(sk);
                }}
              >
                Satırları oku
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <>
          <div className="mb-4 space-y-3">
            {summary.dups > 0 && (
              <Notice tone="info">
                {summary.dups} satır daha önce elle girilmiş harcamalarla eşleşti (aynı tutar, en fazla 3 gün fark). Bunlar varsayılan olarak eklenmez; iki kez sayılmasın diye.
              </Notice>
            )}
            {rows.some((r) => r.credit) && <Notice tone="info">Eksi tutarlı satırlar (kart ödemesi, iade) eklenmez. Ekstre ödemesini “Ekstre ödemesi” ile transfer olarak girin.</Notice>}
          </div>
          <div className="card overflow-hidden">
            <div className="hidden grid-cols-[32px_140px_1fr_128px_200px_64px_40px] gap-2 border-b border-ink-100 bg-ink-50 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-500 lg:grid">
              <span />
              <span>Tarih</span>
              <span>Açıklama</span>
              <span className="text-right">Tutar</span>
              <span>Kategori</span>
              <span className="text-center">Şahsi</span>
              <span />
            </div>
            <div className="divide-y divide-ink-100">
              {rows.map((r) => {
                const dup = r.duplicateOf ? d.allTxns.find((t) => t.id === r.duplicateOf) : undefined;
                return (
                  <div key={r.key} className={cx('grid grid-cols-[40px_1fr] items-center gap-2 px-3 py-2.5 lg:grid-cols-[32px_140px_1fr_128px_200px_64px_40px]', !r.include && 'bg-ink-50/70')}>
                    <input
                      type="checkbox"
                      aria-label="Ekle"
                      className="h-5 w-5 accent-brand-700"
                      checked={r.include}
                      disabled={r.credit}
                      onChange={(e) => update(r.key, { include: e.target.checked })}
                    />
                    <div className="grid grid-cols-2 gap-2 lg:contents">
                      <DateInput value={r.date} onChange={(v) => update(r.key, { date: v })} />
                      <div className="col-span-2 min-w-0 lg:col-span-1">
                        <TextInput value={r.description} onChange={(e) => update(r.key, { description: e.target.value })} placeholder="Açıklama" />
                        {dup && (
                          <button onClick={() => openDetail(dup.id)} className="mt-1 text-left">
                            <Badge tone="blue">Zaten kayıtlı · {formatDate(dup.date, 'short')} · {dup.description || 'gider'}</Badge>
                          </button>
                        )}
                        {r.credit && <Badge tone="neutral" className="mt-1">Ödeme / iade satırı</Badge>}
                      </div>
                      <MoneyInput value={r.amount} onChange={(v) => update(r.key, { amount: v })} />
                      <Select value={r.categoryId} disabled={r.personal} onChange={(e) => update(r.key, { categoryId: e.target.value })} aria-label="Kategori">
                        <option value="">{r.personal ? '— şahsi —' : 'Kategori seçin…'}</option>
                        {GROUPS.map((g) => (
                          <optgroup key={g} label={GROUP_LABEL[g]}>
                            {cats
                              .filter((c) => c.group === g)
                              .map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                          </optgroup>
                        ))}
                      </Select>
                      <label className="flex items-center justify-center gap-2 text-sm text-ink-700">
                        <input type="checkbox" className="h-5 w-5 accent-brand-700" checked={r.personal} onChange={(e) => update(r.key, { personal: e.target.checked })} />
                        <span className="lg:hidden">Şahsi</span>
                      </label>
                      <button aria-label="Satırı sil" onClick={() => setRows((rs) => (rs ?? []).filter((x) => x.key !== r.key))} className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-400 hover:bg-ink-100 hover:text-red-600">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="border-t border-ink-100 p-3">
              <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setRows((rs) => [...(rs ?? []), { key: newId('r'), date: rs?.[rs.length - 1]?.date ?? todayISO(), description: '', amount: null, categoryId: '', personal: false, include: true }])}>
                Satır ekle
              </Button>
            </div>
          </div>

          {skipped.length > 0 && (
            <details className="mt-3 text-sm text-ink-500">
              <summary className="cursor-pointer">Okunmayan {skipped.length} satır (başlıklar, toplamlar…)</summary>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-xl bg-ink-100 p-3 text-xs">{skipped.join('\n')}</pre>
            </details>
          )}

          <div className="sticky bottom-0 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ink-200 bg-white/95 p-4 shadow-lg backdrop-blur">
            <div className="text-sm text-ink-600">
              <b className="text-ink-900">{summary.count}</b> satır · İşletme gideri <b className="tabular text-ink-900">{formatTL(summary.business)}</b>
              {summary.personal > 0 && (
                <>
                  {' '}
                  · Şahsi <b className="tabular text-ink-900">{formatTL(summary.personal)}</b>
                </>
              )}
              {summary.missingCat > 0 && <span className="ml-2 font-medium text-red-700">{summary.missingCat} satırda kategori yok</span>}
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setRows(null)}>Baştan başla</Button>
              <Button
                variant="primary"
                disabled={busy || !summary.count || summary.missingCat > 0}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await save();
                  } catch (e) {
                    toast((e as Error).message, 'error');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {summary.count} satırı kaydet
              </Button>
            </div>
          </div>
          <p className="mt-3 text-sm text-ink-500">Şahsi işaretlenen harcamalar gider sayılmaz; işletme sahibinin cari hesabına yazılır. Seçtiğiniz kategoriler hatırlanır ve bir dahaki ekstrede otomatik önerilir.</p>
        </>
      )}
    </>
  );
}
