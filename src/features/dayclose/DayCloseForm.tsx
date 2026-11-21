import { useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeftRight, CheckCircle2, ChevronLeft, ChevronRight, Lock, Receipt, RotateCcw, ShieldCheck, UserRound } from 'lucide-react';
import { repo } from '../../db';
import { accountBalanceAt, buildDaySales } from '../../domain/ledger';
import { SYS, type PaymentMethod, type PaymentMethodType } from '../../domain/types';
import { addDays, formatDate, isValidISO, todayISO, weekday } from '../../lib/dates';
import { formatTL, type Kurus } from '../../lib/money';
import { useData } from '../../state/data';
import { useUI } from '../../state/ui';
import { Badge, Button, Card, CardTitle, DateInput, Field, MoneyInput, Notice, PageHeader, Segmented, TextArea, TextInput, cx } from '../../ui';
import { TxnRow } from '../txn/TxnRows';
import { prepareBackup, shareBackup, type PreparedBackup } from '../settings/backup';

export const VARIANCE_REASONS = ['Kasiyer hatası', 'Para üstü hatası', 'Sayım hatası', 'Girilmemiş masraf', 'Sebebi bilinmiyor'];

const GROUPS: Array<{ type: PaymentMethodType; title: string; hint?: string }> = [
  { type: 'pos', title: 'Banka POS', hint: 'POS cihazlarının gün sonu raporundaki toplamlar' },
  { type: 'cash', title: 'Nakit' },
  { type: 'meal_card', title: 'Yemek kartları', hint: 'Firmalar ödeyene kadar alacak olarak bekler' },
  { type: 'other', title: 'Diğer' },
];

export function DayCloseForm() {
  const { date: param } = useParams();
  const date = param === 'bugun' || !param ? todayISO() : param;
  if (!isValidISO(date)) return <Navigate to="/gun-sonu" replace />;
  return <DayCloseEditor key={date} date={date} />;
}

function DayCloseEditor({ date }: { date: string }) {
  const d = useData();
  const navigate = useNavigate();
  const { toast, confirm, openNew } = useUI();
  const dc = d.dayCloseByDate.get(date);
  const closed = dc?.status === 'closed';
  const refundAccountId = dc?.refundAccountId ?? (d.settings.refundAccountId as string) ?? SYS.kasa;

  const visibleMethods = d.methods.filter((m) => !m.archived || (dc?.sales[m.id] ?? 0) !== 0);
  const [sales, setSales] = useState<Record<string, Kurus | null>>(() => Object.fromEntries(visibleMethods.map((m) => [m.id, dc?.sales[m.id] ?? null])));
  const [refund, setRefund] = useState<Kurus | null>(dc?.refund || null);
  const [note, setNote] = useState(dc?.note ?? '');
  const [mode, setMode] = useState<'count' | 'direct'>(dc?.varianceMode ?? 'count');
  const [counted, setCounted] = useState<Kurus | null>(null);
  const [directVar, setDirectVar] = useState<Kurus | null>(null);
  const [varianceNote, setVarianceNote] = useState(dc?.varianceNote ?? '');
  const [busy, setBusy] = useState(false);
  const [backup, setBackup] = useState<PreparedBackup | null>(null);

  const cleanSales = useMemo(() => Object.fromEntries(Object.entries(sales).filter(([, v]) => v)) as Record<string, Kurus>, [sales]);
  const gross = Object.values(cleanSales).reduce((s, v) => s + v, 0);
  const net = gross - (refund ?? 0);
  const norm = (o: Record<string, Kurus>) => JSON.stringify(Object.entries(o).filter(([, v]) => v).sort(([a], [b]) => (a < b ? -1 : 1)));
  const dirty =
    norm(cleanSales) !== norm(dc?.sales ?? {}) ||
    (refund ?? 0) !== (dc?.refund ?? 0) ||
    note !== (dc?.note ?? '');

  // Live cash expectation: previous balance + today's other cash moves + this form's cash effect.
  const cash = useMemo(() => {
    const prev = accountBalanceAt(d.txns, SYS.kasa, addDays(date, -1));
    let out = 0;
    let inn = 0;
    const dayTxns = d.txns.filter((t) => t.date === date);
    for (const t of dayTxns) {
      if (t.kind === 'day_sales' || t.kind === 'day_variance') continue;
      for (const p of t.postings) if (p.accountId === SYS.kasa) (p.amount < 0 ? (out -= p.amount) : (inn += p.amount));
    }
    let salesCash = 0;
    let refundCash = 0;
    try {
      const draft = buildDaySales({ date, sales: cleanSales, refund: refund ?? 0, refundAccountId, methods: d.methods, dayCloseId: 'x' });
      for (const p of draft?.postings ?? []) {
        if (p.accountId !== SYS.kasa) continue;
        if (p.amount > 0) salesCash += p.amount;
        else refundCash -= p.amount;
      }
    } catch {
      /* invalid input is shown on the field */
    }
    const expected = prev + salesCash - refundCash + inn - out;
    const cashTxns = dayTxns.filter((t) => t.kind !== 'day_sales' && t.kind !== 'day_variance' && t.postings.some((p) => p.accountId === SYS.kasa));
    return { prev, salesCash, refundCash, inn, out, expected, cashTxns };
  }, [d.txns, d.methods, date, cleanSales, refund, refundAccountId]);

  const variance = mode === 'count' ? (counted === null ? null : counted - cash.expected) : directVar;
  const otherDayTxns = d.txns.filter((t) => t.date === date && t.kind !== 'day_sales' && t.kind !== 'day_variance' && !cash.cashTxns.includes(t));

  const save = async (silent = false) => {
    await repo.saveDaySales({ date, sales: cleanSales, refund: refund ?? 0, note });
    if (!silent) toast('Satışlar kaydedildi');
  };

  const onSave = async () => {
    setBusy(true);
    try {
      await save();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const onClose = async () => {
    if (mode === 'count' && counted === null) {
      toast('Kasada saydığınız nakdi girin (ya da “Farkı doğrudan gir” seçin).', 'error');
      return;
    }
    if (!gross && !dc) {
      const ok = await confirm({ title: 'Satış girilmedi', message: 'Bu gün için hiç satış girilmedi. Yine de günü kapatmak istiyor musunuz? (Örneğin dükkân kapalıydı.)', confirmText: 'Kapat' });
      if (!ok) return;
    }
    setBusy(true);
    try {
      if (dirty || !dc) await save(true);
      await repo.closeDay({ date, mode, value: mode === 'count' ? counted : directVar ?? 0, note, varianceNote });
      toast('Gün kapatıldı');
      setBackup(await prepareBackup());
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const onReopen = async () => {
    const ok = await confirm({
      title: 'Gün yeniden açılsın mı?',
      message: 'Kasa farkı kaydı iptal edilir ve o günün kasa hareketleri yeniden düzenlenebilir hale gelir. Değişiklik geçmişe yazılır.',
      confirmText: 'Yeniden aç',
    });
    if (!ok) return;
    await repo.reopenDay(date);
    toast('Gün yeniden açıldı');
  };

  const methodsByGroup = (type: PaymentMethodType): PaymentMethod[] => visibleMethods.filter((m) => m.type === type);
  const isFuture = date > todayISO();

  return (
    <>
      <PageHeader
        title="Gün sonu"
        sub={
          <span className="flex items-center gap-2">
            {formatDate(date)} · {weekday(date)}
            {closed ? <Badge tone="green">Kapandı</Badge> : dc ? <Badge tone="amber">Açık</Badge> : <Badge>Girilmedi</Badge>}
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <Button aria-label="Önceki gün" onClick={() => navigate(`/gun-sonu/${addDays(date, -1)}`)} icon={<ChevronLeft className="h-5 w-5" />} />
            <div className="w-44">
              <DateInput value={date} onChange={(v) => navigate(`/gun-sonu/${v}`)} />
            </div>
            <Button aria-label="Sonraki gün" onClick={() => navigate(`/gun-sonu/${addDays(date, 1)}`)} icon={<ChevronRight className="h-5 w-5" />} />
          </div>
        }
      />

      {isFuture && <div className="mb-4"><Notice tone="warn">Bu tarih ileride. Yanlış günü seçmediğinizden emin olun.</Notice></div>}
      {closed && (
        <div className="mb-4">
          <Notice tone="success" action={<Button size="sm" icon={<RotateCcw className="h-4 w-4" />} onClick={onReopen}>Yeniden aç</Button>}>
            Bu gün kapatıldı. Satışlar ve kasa hareketleri kilitli.
          </Notice>
        </div>
      )}
      {backup && (
        <div className="mb-4">
          <Notice
            tone="info"
            action={
              <Button
                variant="primary"
                size="sm"
                icon={<ShieldCheck className="h-4 w-4" />}
                onClick={async () => {
                  if (await shareBackup(backup)) {
                    toast('Yedek kaydedildi');
                    setBackup(null);
                  }
                }}
              >
                Yedeği kaydet
              </Button>
            }
          >
            Gün kapandı. Şimdi yedeği iCloud Drive’a kaydedin: “Dosyalara Kaydet”i seçin.
          </Notice>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        {/* Sales */}
        <div className="space-y-5">
          <Card>
            <CardTitle sub="Z raporu ve POS gün sonu fişlerinden">Satışlar</CardTitle>
            <div className="space-y-5">
              {GROUPS.map((g) => {
                const ms = methodsByGroup(g.type);
                if (!ms.length) return null;
                return (
                  <div key={g.type}>
                    <div className="mb-2 flex items-baseline justify-between gap-2">
                      <h4 className="text-sm font-semibold uppercase tracking-wide text-ink-500">{g.title}</h4>
                      {g.hint && <span className="hidden text-xs text-ink-400 sm:inline">{g.hint}</span>}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {ms.map((m) => (
                        <Field key={m.id} label={m.name} htmlFor={`s-${m.id}`}>
                          <MoneyInput id={`s-${m.id}`} disabled={closed} value={sales[m.id] ?? null} onChange={(v) => setSales((s) => ({ ...s, [m.id]: v }))} />
                        </Field>
                      ))}
                    </div>
                  </div>
                );
              })}
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="İade / düzeltme (kasadan)" htmlFor="s-refund" hint="POS denemesi, iade edilen tutar">
                  <MoneyInput id="s-refund" disabled={closed} value={refund} onChange={setRefund} />
                </Field>
                <Field label="Not" htmlFor="s-note">
                  <TextArea id="s-note" disabled={closed} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Raporla ilgili notlar" className="min-h-[48px]" />
                </Field>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-ink-50 px-4 py-3">
              <div className="text-sm text-ink-600">
                Brüt <b className="tabular text-ink-900">{formatTL(gross)}</b>
                {refund ? (
                  <>
                    {' '}
                    − iade <b className="tabular text-ink-900">{formatTL(refund)}</b>
                  </>
                ) : null}
                <span className="mx-2 text-ink-300">|</span>
                Net ciro <b className="tabular text-lg text-ink-900">{formatTL(net)}</b>
              </div>
              {!closed && (
                <Button variant={dirty ? 'primary' : 'secondary'} onClick={onSave} disabled={busy || !dirty}>
                  {dirty ? 'Satışları kaydet' : 'Kaydedildi'}
                </Button>
              )}
            </div>
          </Card>

          <Card padded={false}>
            <div className="p-4 pb-2 sm:p-5 sm:pb-2">
              <CardTitle
                sub="Kasadan ödenen masraflar, personel ödemeleri, bankaya yatırılan para"
                action={
                  !closed && (
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button size="sm" icon={<Receipt className="h-4 w-4" />} onClick={() => openNew('expense', { date, sourceAccountId: SYS.kasa })}>
                        Gider
                      </Button>
                      <Button size="sm" icon={<UserRound className="h-4 w-4" />} onClick={() => openNew('personnel', { date, sourceAccountId: SYS.kasa })}>
                        Personel
                      </Button>
                      <Button size="sm" icon={<ArrowLeftRight className="h-4 w-4" />} onClick={() => openNew('transfer', { date, sourceAccountId: SYS.kasa })}>
                        Transfer
                      </Button>
                    </div>
                  )
                }
              >
                Günün kasa hareketleri
              </CardTitle>
            </div>
            {cash.cashTxns.length ? (
              <div className="divide-y divide-ink-100 border-t border-ink-100">
                {cash.cashTxns.map((t) => (
                  <TxnRow key={t.id} t={t} />
                ))}
              </div>
            ) : (
              <p className="px-5 pb-5 text-sm text-ink-500">Bu gün kasadan çıkan/giren başka para yok.</p>
            )}
            {otherDayTxns.length > 0 && (
              <>
                <div className="border-t border-ink-100 px-5 pb-1 pt-3 text-sm font-semibold text-ink-500">Bu günün diğer kayıtları (kasa dışı)</div>
                <div className="divide-y divide-ink-100">
                  {otherDayTxns.map((t) => (
                    <TxnRow key={t.id} t={t} />
                  ))}
                </div>
              </>
            )}
          </Card>
        </div>

        {/* Cash count */}
        <div className="space-y-5 lg:sticky lg:top-4 lg:self-start">
          <Card>
            <CardTitle sub="Gün sonunda kasadaki parayı sayın">Kasa sayımı</CardTitle>
            <dl className="tabular space-y-1.5 text-[15px]">
              <CashLine label="Önceki günden devreden" value={cash.prev} />
              <CashLine label="Nakit satış" value={cash.salesCash} sign="+" />
              {cash.refundCash > 0 && <CashLine label="İade (kasadan)" value={cash.refundCash} sign="−" />}
              {cash.out > 0 && <CashLine label="Kasadan ödenenler" value={cash.out} sign="−" />}
              {cash.inn > 0 && <CashLine label="Kasaya giren diğer" value={cash.inn} sign="+" />}
              <div className="flex items-center justify-between border-t border-ink-200 pt-2 font-semibold">
                <dt>Kasada olması gereken</dt>
                <dd className="whitespace-nowrap text-lg">{formatTL(cash.expected)}</dd>
              </div>
            </dl>

            {closed ? (
              <div className="mt-4 space-y-1.5 rounded-xl bg-ink-50 p-4 text-[15px]">
                <div className="flex justify-between">
                  <span className="text-ink-600">Sayılan</span>
                  <b className="tabular">{formatTL(dc?.countedCash ?? 0)}</b>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-600">Fark</span>
                  <VarianceText v={dc?.variance ?? 0} />
                </div>
                {dc?.variance && dc.varianceNote ? (
                  <div className="flex justify-between gap-4">
                    <span className="text-ink-600">Açıklama</span>
                    <span className="text-right text-ink-900">{dc.varianceNote}</span>
                  </div>
                ) : null}
                <div className="flex items-center gap-1.5 pt-1 text-sm text-ink-500">
                  <Lock className="h-4 w-4" /> {dc?.closedAt ? new Date(dc.closedAt).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }) : ''} tarihinde kapatıldı
                </div>
                {backup && (
                  <Button
                    variant="primary"
                    block
                    className="mt-3"
                    icon={<ShieldCheck className="h-5 w-5" />}
                    onClick={async () => {
                      if (await shareBackup(backup)) {
                        toast('Yedek kaydedildi');
                        setBackup(null);
                      }
                    }}
                  >
                    Yedeği kaydet
                  </Button>
                )}
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                <Segmented
                  size="sm"
                  value={mode}
                  onChange={setMode}
                  options={[
                    { value: 'count', label: 'Kasayı saydım' },
                    { value: 'direct', label: 'Farkı doğrudan gir' },
                  ]}
                />
                {mode === 'count' ? (
                  <Field label="Kasada sayılan nakit" htmlFor="cash-counted" hint="Sabit kasa parası (örn. 700 ₺) dahil, kasadaki bütün nakit">
                    <MoneyInput id="cash-counted" value={counted} onChange={setCounted} size="lg" />
                  </Field>
                ) : (
                  <Field label="Kasa farkı (fazla +, eksik −)" htmlFor="cash-direct" hint="Raporda yazan kasa fazlası/eksiği. Örnek: -250">
                    <MoneyInput id="cash-direct" value={directVar} onChange={setDirectVar} allowNegative size="lg" />
                  </Field>
                )}
                <div className={cx('rounded-xl px-4 py-3 text-[15px] font-semibold', variance === null ? 'bg-ink-50 text-ink-500' : variance === 0 ? 'bg-emerald-50 text-emerald-800' : variance > 0 ? 'bg-sky-50 text-sky-900' : 'bg-red-50 text-red-800')}>
                  {variance === null ? (
                    'Sayımı girince fark burada görünür.'
                  ) : variance === 0 ? (
                    <span className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5" /> Kasa tuttu
                    </span>
                  ) : (
                    <span className="tabular">
                      {variance > 0 ? 'Kasa fazlası' : 'Kasa eksiği'} {formatTL(Math.abs(variance))}
                    </span>
                  )}
                </div>
                {(mode === 'direct' || (variance !== null && variance !== 0)) && (
                  <Field label="Farkın açıklaması" htmlFor="var-note" hint="Neden fark çıktı? Kasa defterinde ve raporlarda görünür.">
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {VARIANCE_REASONS.map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setVarianceNote(r)}
                          className={cx(
                            'h-9 rounded-full px-3 text-sm font-medium ring-1 ring-inset transition',
                            varianceNote === r ? 'bg-brand-700 text-white ring-brand-700' : 'bg-white text-ink-700 ring-ink-200 hover:bg-ink-50',
                          )}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                    <TextInput id="var-note" value={varianceNote} onChange={(e) => setVarianceNote(e.target.value)} placeholder="örn. Kasiyer para üstünü fazla verdi" />
                  </Field>
                )}
                <Button variant="primary" size="lg" block onClick={onClose} disabled={busy} icon={<Lock className="h-5 w-5" />}>
                  Günü kapat
                </Button>
                <p className="text-sm text-ink-500">Kapatınca satışlar kaydedilir, kasa farkı yazılır ve o günün kasa hareketleri kilitlenir.</p>
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function CashLine({ label, value, sign }: { label: string; value: Kurus; sign?: '+' | '−' }) {
  return (
    <div className="flex items-center justify-between gap-3 text-ink-700">
      <dt className="min-w-0">{label}</dt>
      <dd className="whitespace-nowrap">
        {sign ? `${sign} ` : ''}
        {formatTL(value)}
      </dd>
    </div>
  );
}

export function VarianceText({ v }: { v: Kurus }) {
  if (!v) return <span className="font-semibold text-emerald-700">Tuttu</span>;
  return <b className={cx('tabular', v > 0 ? 'text-sky-800' : 'text-red-700')}>{v > 0 ? '+' : '−'}{formatTL(Math.abs(v))}</b>;
}
