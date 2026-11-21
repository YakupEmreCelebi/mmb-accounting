import { useMemo, useState, type ReactNode } from 'react';
import { repo } from '../../db';
import {
  buildCollection,
  buildContactPayment,
  buildExpense,
  buildIncome,
  buildPersonnelPayment,
  buildTransfer,
  contactBalance,
  displayBalance,
  receivableAging,
} from '../../domain/ledger';
import { PERSONNEL_TYPE_LABEL, SYS, type PayStatus, type PersonnelPayType, type Txn, type TxnDraft } from '../../domain/types';
import { addDays, formatDate, monthKey, todayISO } from '../../lib/dates';
import { formatPct, formatTL, type Kurus } from '../../lib/money';
import { receivableMethods, useData } from '../../state/data';
import { useUI, type TxnPreset } from '../../state/ui';
import { Button, DateInput, Field, Modal, MoneyInput, Notice, Segmented, Select, TextInput } from '../../ui';
import { CategorySelect, ContactSelect, MoneyAccountSelect } from './pickers';

interface FormProps {
  preset?: TxnPreset;
  editing?: Txn;
  onClose: () => void;
}

/** Shared modal frame with save handling and inline errors. */
function FormFrame({
  title,
  onClose,
  onSave,
  children,
  saveLabel = 'Kaydet',
  canSave = true,
}: {
  title: string;
  onClose: () => void;
  onSave: () => Promise<void>;
  children: ReactNode;
  saveLabel?: string;
  canSave?: boolean;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setError('');
    setBusy(true);
    try {
      await onSave();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      footer={
        <>
          {error && <p className="mr-auto max-w-md text-sm font-medium text-red-700">{error}</p>}
          <Button onClick={onClose}>Vazgeç</Button>
          <Button variant="primary" onClick={submit} disabled={busy || !canSave}>
            {saveLabel}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {children}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

function useSave(editing: Txn | undefined, onClose: () => void, successNew: string) {
  const { toast } = useUI();
  return async (draft: TxnDraft) => {
    if (editing) {
      await repo.updateTxn(editing.id, draft);
      toast('Kayıt güncellendi');
    } else {
      await repo.addTxn(draft);
      toast(successNew);
    }
    onClose();
  };
}

function TwoCol({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}

// ------------------------------------------------------------------ Gider
export function ExpenseForm({ preset, editing, onClose }: FormProps) {
  const d = useData();
  const e = editing;
  const [date, setDate] = useState(e?.date ?? preset?.date ?? todayISO());
  const [amount, setAmount] = useState<Kurus | null>(e?.amount ?? preset?.amount ?? null);
  const [categoryId, setCategoryId] = useState(e?.categoryId ?? preset?.categoryId ?? '');
  const [description, setDescription] = useState(e?.description ?? preset?.description ?? '');
  const [payStatus, setPayStatus] = useState<PayStatus>(e?.payStatus ?? preset?.payStatus ?? 'paid');
  const [sourceAccountId, setSource] = useState(e?.sourceAccountId ?? preset?.sourceAccountId ?? SYS.kasa);
  const [supplierId, setSupplierId] = useState(e && e.payStatus !== 'out_of_pocket' ? e.contactId ?? '' : preset?.payStatus !== 'out_of_pocket' ? preset?.contactId ?? '' : '');
  const [personId, setPersonId] = useState(e?.payStatus === 'out_of_pocket' ? e.contactId ?? '' : preset?.payStatus === 'out_of_pocket' ? preset?.contactId ?? '' : '');
  const [dueDate, setDueDate] = useState(e?.dueDate ?? preset?.dueDate ?? addDays(todayISO(), 7));
  const save = useSave(editing, onClose, 'Gider kaydedildi');
  const cat = d.accountById.get(categoryId);

  return (
    <FormFrame
      title={editing ? 'Gideri düzenle' : 'Yeni gider'}
      onClose={onClose}
      onSave={async () => {
        const contactId = payStatus === 'out_of_pocket' ? personId : supplierId;
        await save(
          buildExpense({
            date,
            amount: amount ?? 0,
            categoryId,
            description,
            payStatus,
            sourceAccountId,
            contact: contactId ? d.contactById.get(contactId) : undefined,
            dueDate,
            recurringId: e?.recurringId ?? preset?.recurringId,
            recurringPeriod: e?.recurringPeriod ?? preset?.recurringPeriod,
            statementBatchId: e?.statementBatchId,
          }),
        );
      }}
    >
      <TwoCol>
        <Field label="Tutar" htmlFor="exp-amount" hint="Birden fazla kalemi toplayabilirsiniz: 400+150">
          <MoneyInput id="exp-amount" value={amount} onChange={setAmount} size="lg" autoFocus={!editing} />
        </Field>
        <Field label="Tarih" htmlFor="exp-date">
          <DateInput id="exp-date" value={date} onChange={setDate} />
        </Field>
      </TwoCol>
      <Field label="Kategori" htmlFor="exp-cat" hint={cat?.kind === 'fixed_asset' ? 'Demirbaş kâr hesabına gider olarak girmez; raporda ayrıca gösterilir.' : undefined}>
        <CategorySelect id="exp-cat" value={categoryId} onChange={setCategoryId} />
      </Field>
      <Field label="Açıklama" htmlFor="exp-desc">
        <TextInput id="exp-desc" placeholder="Ne alındı? (örn. Aysberg 4 kasa)" value={description} onChange={(ev) => setDescription(ev.target.value)} />
      </Field>
      <Field label="Ödeme durumu">
        <Segmented
          value={payStatus}
          onChange={setPayStatus}
          options={[
            { value: 'paid', label: 'Ödendi' },
            { value: 'unpaid', label: 'Ödenecek (veresiye)' },
            { value: 'out_of_pocket', label: 'Cepten ödendi' },
          ]}
        />
      </Field>
      {payStatus === 'paid' && (
        <TwoCol>
          <Field label="Nereden ödendi?" htmlFor="exp-src">
            <MoneyAccountSelect id="exp-src" value={sourceAccountId} onChange={setSource} />
          </Field>
          <Field label="Tedarikçi (isteğe bağlı)" htmlFor="exp-sup">
            <ContactSelect id="exp-sup" value={supplierId} onChange={setSupplierId} types={['supplier', 'other']} newType="supplier" placeholder="Seçilmedi" />
          </Field>
        </TwoCol>
      )}
      {payStatus === 'unpaid' && (
        <TwoCol>
          <Field label="Tedarikçi" htmlFor="exp-sup2" hint="Borç bu firmanın carisine yazılır.">
            <ContactSelect id="exp-sup2" value={supplierId} onChange={setSupplierId} types={['supplier', 'other']} newType="supplier" />
          </Field>
          <Field label="Son ödeme tarihi" htmlFor="exp-due">
            <DateInput id="exp-due" value={dueDate} onChange={setDueDate} />
          </Field>
        </TwoCol>
      )}
      {payStatus === 'out_of_pocket' && (
        <Field label="Kim ödedi?" htmlFor="exp-person" hint="Tutar bu kişiye borç olarak yazılır; geri ödenince Cariler'den kapatılır.">
          <ContactSelect id="exp-person" value={personId} onChange={setPersonId} types={['owner', 'personnel']} newType="personnel" />
        </Field>
      )}
    </FormFrame>
  );
}

// ------------------------------------------------------------------ Personel
export function PersonnelForm({ preset, editing, onClose }: FormProps) {
  const d = useData();
  const e = editing;
  const [date, setDate] = useState(e?.date ?? preset?.date ?? todayISO());
  const [contactId, setContactId] = useState(e?.contactId ?? preset?.contactId ?? '');
  const [payType, setPayType] = useState<PersonnelPayType>(e?.personnelType ?? 'salary');
  const [amount, setAmount] = useState<Kurus | null>(e?.amount ?? preset?.amount ?? null);
  const [sourceAccountId, setSource] = useState(e?.sourceAccountId ?? preset?.sourceAccountId ?? SYS.kasa);
  const [description, setDescription] = useState(e?.description ?? '');
  const save = useSave(editing, onClose, 'Personel ödemesi kaydedildi');
  const person = d.contactById.get(contactId);

  const monthInfo = useMemo(() => {
    if (!person) return null;
    const m = monthKey(date);
    const paid = d.txns.filter((t) => t.kind === 'personnel' && t.contactId === person.id && monthKey(t.date) === m && t.id !== e?.id);
    const total = paid.reduce((s, t) => s + t.amount, 0);
    return { total, count: paid.length, salary: person.monthlySalary };
  }, [person, date, d.txns, e?.id]);

  return (
    <FormFrame
      title={editing ? 'Personel ödemesini düzenle' : 'Personel ödemesi'}
      onClose={onClose}
      onSave={async () => {
        if (!person) throw new Error('Personel seçin.');
        await save(buildPersonnelPayment({ date, amount: amount ?? 0, contact: person, payType, sourceAccountId, description }));
      }}
    >
      <Field label="Personel" htmlFor="per-c">
        <ContactSelect id="per-c" value={contactId} onChange={setContactId} types={['personnel']} newType="personnel" />
      </Field>
      {monthInfo && (
        <div className="rounded-xl bg-ink-50 px-4 py-3 text-sm text-ink-700">
          Bu ay bu kişiye ödenen: <b className="tabular">{formatTL(monthInfo.total, 'auto')}</b> ({monthInfo.count} ödeme)
          {monthInfo.salary ? (
            <>
              {' '}
              · Aylık maaş <b className="tabular">{formatTL(monthInfo.salary, 'auto')}</b> · Kalan{' '}
              <b className="tabular">{formatTL(Math.max(0, monthInfo.salary - monthInfo.total), 'auto')}</b>
            </>
          ) : null}
        </div>
      )}
      <Field label="Ödeme türü">
        <Segmented value={payType} onChange={setPayType} options={(Object.keys(PERSONNEL_TYPE_LABEL) as PersonnelPayType[]).map((k) => ({ value: k, label: PERSONNEL_TYPE_LABEL[k] }))} />
      </Field>
      <TwoCol>
        <Field label="Tutar" htmlFor="per-amount">
          <MoneyInput id="per-amount" value={amount} onChange={setAmount} size="lg" />
        </Field>
        <Field label="Tarih" htmlFor="per-date">
          <DateInput id="per-date" value={date} onChange={setDate} />
        </Field>
      </TwoCol>
      <TwoCol>
        <Field label="Nereden ödendi?" htmlFor="per-src">
          <MoneyAccountSelect id="per-src" value={sourceAccountId} onChange={setSource} includeCards={false} />
        </Field>
        <Field label="Not (isteğe bağlı)" htmlFor="per-note">
          <TextInput id="per-note" value={description} onChange={(ev) => setDescription(ev.target.value)} placeholder="örn. Kasım maaşının kalanı" />
        </Field>
      </TwoCol>
    </FormFrame>
  );
}

// ------------------------------------------------------------------ Cari ödeme (borç kapama / sahip)
export function ContactPaymentForm({ preset, editing, onClose }: FormProps) {
  const d = useData();
  const e = editing;
  const [contactId, setContactId] = useState(e?.contactId ?? preset?.contactId ?? '');
  const [direction, setDirection] = useState<'pay' | 'receive'>(e?.direction ?? preset?.direction ?? 'pay');
  const [amount, setAmount] = useState<Kurus | null>(e?.amount ?? preset?.amount ?? null);
  const [accountId, setAccountId] = useState(e?.sourceAccountId ?? preset?.sourceAccountId ?? SYS.kasa);
  const [date, setDate] = useState(e?.date ?? preset?.date ?? todayISO());
  const [description, setDescription] = useState(e?.description ?? preset?.description ?? '');
  const save = useSave(editing, onClose, 'Ödeme kaydedildi');
  const contact = d.contactById.get(contactId);
  const balance = contact ? contactBalance(d.txns, contact) : 0;
  const isOwner = contact?.type === 'owner';

  return (
    <FormFrame
      title={editing ? 'Cari ödemeyi düzenle' : 'Cari ödeme / tahsilat'}
      onClose={onClose}
      onSave={async () => {
        if (!contact) throw new Error('Kişi veya firma seçin.');
        await save(buildContactPayment({ date, amount: amount ?? 0, contact, direction, accountId, description }));
      }}
    >
      <Field label="Kime / kimden" htmlFor="cp-c">
        <ContactSelect id="cp-c" value={contactId} onChange={setContactId} types={['supplier', 'other', 'owner', 'personnel']} newType="supplier" showBalance />
      </Field>
      {contact && (
        <div className="rounded-xl bg-ink-50 px-4 py-3 text-sm text-ink-700">
          {balance > 0 ? (
            <>
              {isOwner ? 'İşletmenin sahibe borcu' : 'Borcumuz'}: <b className="tabular">{formatTL(balance, 'auto')}</b>
            </>
          ) : balance < 0 ? (
            <>
              {isOwner ? 'Sahibin işletmeden çektiği' : 'Alacağımız'}: <b className="tabular">{formatTL(-balance, 'auto')}</b>
            </>
          ) : (
            'Bakiye yok.'
          )}
          {balance > 0 && direction === 'pay' && amount === null && (
            <Button size="sm" variant="subtle" className="ml-3" onClick={() => setAmount(balance)}>
              Tamamını öde
            </Button>
          )}
        </div>
      )}
      <Field label="İşlem">
        <Segmented
          value={direction}
          onChange={setDirection}
          options={
            isOwner
              ? [
                  { value: 'pay', label: 'Sahibe ödeme / sahip çekti' },
                  { value: 'receive', label: 'Sahip para koydu' },
                ]
              : [
                  { value: 'pay', label: 'Ödeme yaptık' },
                  { value: 'receive', label: 'Para aldık' },
                ]
          }
        />
      </Field>
      <TwoCol>
        <Field label="Tutar" htmlFor="cp-amount">
          <MoneyInput id="cp-amount" value={amount} onChange={setAmount} size="lg" />
        </Field>
        <Field label="Tarih" htmlFor="cp-date">
          <DateInput id="cp-date" value={date} onChange={setDate} />
        </Field>
      </TwoCol>
      <TwoCol>
        <Field label={direction === 'pay' ? 'Nereden ödendi?' : 'Nereye girdi?'} htmlFor="cp-acc">
          <MoneyAccountSelect id="cp-acc" value={accountId} onChange={setAccountId} includeCards={direction === 'pay'} />
        </Field>
        <Field label="Açıklama" htmlFor="cp-desc">
          <TextInput id="cp-desc" value={description} onChange={(ev) => setDescription(ev.target.value)} placeholder="örn. Ayran borcu" />
        </Field>
      </TwoCol>
    </FormFrame>
  );
}

// ------------------------------------------------------------------ Tahsilat (yemek kartı / POS)
export function CollectionForm({ preset, editing, onClose }: FormProps) {
  const d = useData();
  const e = editing;
  const methods = receivableMethods(d, true).filter((m) => !m.archived || m.id === (e?.paymentMethodId ?? preset?.paymentMethodId));
  const [methodId, setMethodId] = useState(e?.paymentMethodId ?? preset?.paymentMethodId ?? methods[0]?.id ?? '');
  const method = d.methodById.get(methodId);
  const initialGross = e ? -(e.postings.find((p) => p.accountId === method?.targetAccountId)?.amount ?? 0) : null;
  const [net, setNet] = useState<Kurus | null>(e?.amount ?? preset?.amount ?? null);
  const [gross, setGross] = useState<Kurus | null>(initialGross);
  const [grossTouched, setGrossTouched] = useState(Boolean(e));
  const [toAccountId, setTo] = useState(e?.targetAccountId ?? method?.collectAccountId ?? 'acc-akbank');
  const [date, setDate] = useState(e?.date ?? preset?.date ?? todayISO());
  const [description, setDescription] = useState(e?.description ?? '');
  const save = useSave(editing, onClose, 'Tahsilat kaydedildi');
  const pending = method ? receivableAging(d.txns.filter((t) => t.id !== e?.id), method, todayISO()) : null;

  const suggestedGross = (n: Kurus | null) => {
    if (n === null) return null;
    if (method?.commissionRate) return Math.round(n / (1 - method.commissionRate / 100));
    return n;
  };
  const effectiveGross = grossTouched ? gross : suggestedGross(net);
  const fee = effectiveGross !== null && net !== null ? effectiveGross - net : 0;

  return (
    <FormFrame
      title={editing ? 'Tahsilatı düzenle' : 'Yemek kartı / POS tahsilatı'}
      onClose={onClose}
      onSave={async () => {
        if (!method) throw new Error('Ödeme tipini seçin.');
        await save(buildCollection({ date, method, grossAmount: effectiveGross ?? 0, netAmount: net ?? 0, toAccountId, description }));
      }}
    >
      {!methods.length ? (
        <Notice tone="info">Alacak olarak takip edilen ödeme tipi yok. Ayarlar → Ödeme tipleri’nden açabilirsiniz.</Notice>
      ) : (
        <>
          <Field label="Hangi firma?" htmlFor="col-m">
            <Select
              id="col-m"
              value={methodId}
              onChange={(ev) => {
                setMethodId(ev.target.value);
                const m = d.methodById.get(ev.target.value);
                if (m?.collectAccountId) setTo(m.collectAccountId);
              }}
            >
              {methods.map((m) => {
                const bal = displayBalance('receivable', d.balances.get(m.targetAccountId) ?? 0);
                return (
                  <option key={m.id} value={m.id}>
                    {m.name} — bekleyen {formatTL(bal, 'auto')}
                  </option>
                );
              })}
            </Select>
          </Field>
          {pending && pending.balance > 0 && (
            <div className="rounded-xl bg-ink-50 px-4 py-3 text-sm text-ink-700">
              Bekleyen alacak <b className="tabular">{formatTL(pending.balance, 'auto')}</b>
              {pending.open[0] && <> · en eski satış {formatDate(pending.open[0].date, 'short')}</>}
              {pending.overdue > 0 && (
                <span className="font-semibold text-red-700"> · vadesi geçen {formatTL(pending.overdue, 'auto')}</span>
              )}
            </div>
          )}
          <TwoCol>
            <Field label="Hesaba geçen tutar (net)" htmlFor="col-net">
              <MoneyInput id="col-net" value={net} onChange={setNet} size="lg" />
            </Field>
            <Field
              label="Kapatılan satış tutarı (brüt)"
              htmlFor="col-gross"
              hint={method?.commissionRate ? `%${method.commissionRate} komisyonla hesaplandı; firmanın dökümüne göre değiştirebilirsiniz.` : 'Firmanın ödeme dökümündeki brüt tutar. Kesinti yoksa net ile aynı.'}
            >
              <MoneyInput
                id="col-gross"
                value={effectiveGross}
                onChange={(v) => {
                  setGrossTouched(true);
                  setGross(v);
                }}
              />
            </Field>
          </TwoCol>
          {fee !== 0 && effectiveGross ? (
            <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Komisyon / kesinti: <b className="tabular">{formatTL(fee)}</b> ({formatPct((fee / effectiveGross) * 100)}) — gider olarak yazılır.
            </div>
          ) : null}
          <TwoCol>
            <Field label="Paranın geçtiği hesap" htmlFor="col-to">
              <MoneyAccountSelect id="col-to" value={toAccountId} onChange={setTo} includeCards={false} />
            </Field>
            <Field label="Tarih" htmlFor="col-date">
              <DateInput id="col-date" value={date} onChange={setDate} />
            </Field>
          </TwoCol>
          <Field label="Açıklama" htmlFor="col-desc">
            <TextInput id="col-desc" value={description} onChange={(ev) => setDescription(ev.target.value)} placeholder="örn. Kasım 1–15 dönemi" />
          </Field>
        </>
      )}
    </FormFrame>
  );
}

// ------------------------------------------------------------------ Transfer
const TRANSFER_PRESETS: Array<{ label: string; from: (d: ReturnType<typeof useData>) => string; to: (d: ReturnType<typeof useData>) => string; desc: string }> = [
  { label: 'Kasadan bankaya yatırma', from: () => SYS.kasa, to: (d) => d.accounts.find((a) => a.kind === 'bank' && !a.archived)?.id ?? '', desc: 'Bankaya yatırıldı' },
  { label: 'Kart ekstresi ödemesi', from: (d) => d.accounts.find((a) => a.kind === 'bank' && !a.archived)?.id ?? '', to: (d) => d.accounts.find((a) => a.kind === 'card' && !a.archived)?.id ?? '', desc: 'Kredi kartı ekstre ödemesi' },
  { label: 'Bankadan kasaya çekim', from: (d) => d.accounts.find((a) => a.kind === 'bank' && !a.archived)?.id ?? '', to: () => SYS.kasa, desc: 'Bankadan nakit çekildi' },
];

export function TransferForm({ preset, editing, onClose }: FormProps) {
  const d = useData();
  const e = editing;
  const [fromId, setFrom] = useState(e?.sourceAccountId ?? preset?.sourceAccountId ?? SYS.kasa);
  const [toId, setTo] = useState(e?.targetAccountId ?? preset?.targetAccountId ?? '');
  const [amount, setAmount] = useState<Kurus | null>(e?.amount ?? preset?.amount ?? null);
  const [date, setDate] = useState(e?.date ?? preset?.date ?? todayISO());
  const [description, setDescription] = useState(e?.description ?? preset?.description ?? '');
  const save = useSave(editing, onClose, 'Transfer kaydedildi');
  const toAcc = d.accountById.get(toId);

  return (
    <FormFrame
      title={editing ? 'Transferi düzenle' : 'Hesaplar arası transfer'}
      onClose={onClose}
      onSave={async () => save(buildTransfer({ date, amount: amount ?? 0, fromAccountId: fromId, toAccountId: toId, description }))}
    >
      {!editing && (
        <div className="flex flex-wrap gap-2">
          {TRANSFER_PRESETS.map((p) => (
            <Button
              key={p.label}
              size="sm"
              variant="subtle"
              onClick={() => {
                setFrom(p.from(d));
                setTo(p.to(d));
                if (!description) setDescription(p.desc);
              }}
            >
              {p.label}
            </Button>
          ))}
        </div>
      )}
      <TwoCol>
        <Field label="Nereden" htmlFor="tr-from">
          <MoneyAccountSelect id="tr-from" value={fromId} onChange={setFrom} />
        </Field>
        <Field label="Nereye" htmlFor="tr-to" hint={toAcc?.kind === 'card' ? 'Karta ödeme borcu azaltır; gider olarak sayılmaz.' : undefined}>
          <MoneyAccountSelect id="tr-to" value={toId} onChange={setTo} exclude={fromId} placeholder="Hesap seçin…" />
        </Field>
      </TwoCol>
      <TwoCol>
        <Field label="Tutar" htmlFor="tr-amount">
          <MoneyInput id="tr-amount" value={amount} onChange={setAmount} size="lg" />
        </Field>
        <Field label="Tarih" htmlFor="tr-date">
          <DateInput id="tr-date" value={date} onChange={setDate} />
        </Field>
      </TwoCol>
      <Field label="Açıklama" htmlFor="tr-desc">
        <TextInput id="tr-desc" value={description} onChange={(ev) => setDescription(ev.target.value)} />
      </Field>
    </FormFrame>
  );
}

// ------------------------------------------------------------------ Diğer gelir
export function IncomeForm({ preset, editing, onClose }: FormProps) {
  const e = editing;
  const [categoryId, setCategoryId] = useState(e?.categoryId ?? preset?.categoryId ?? SYS.otherIncome);
  const [amount, setAmount] = useState<Kurus | null>(e?.amount ?? preset?.amount ?? null);
  const [toId, setTo] = useState(e?.targetAccountId ?? preset?.targetAccountId ?? SYS.kasa);
  const [date, setDate] = useState(e?.date ?? preset?.date ?? todayISO());
  const [description, setDescription] = useState(e?.description ?? '');
  const save = useSave(editing, onClose, 'Gelir kaydedildi');
  return (
    <FormFrame
      title={editing ? 'Geliri düzenle' : 'Diğer gelir'}
      onClose={onClose}
      onSave={async () => save(buildIncome({ date, amount: amount ?? 0, categoryId, toAccountId: toId, description }))}
    >
      <Notice tone="info">Günlük satışlar buraya değil, Gün sonu ekranına girilir. Burası satış dışı gelirler içindir (örn. atık yağ satışı).</Notice>
      <TwoCol>
        <Field label="Tutar" htmlFor="in-amount">
          <MoneyInput id="in-amount" value={amount} onChange={setAmount} size="lg" />
        </Field>
        <Field label="Tarih" htmlFor="in-date">
          <DateInput id="in-date" value={date} onChange={setDate} />
        </Field>
      </TwoCol>
      <TwoCol>
        <Field label="Kategori" htmlFor="in-cat">
          <CategorySelect id="in-cat" kind="income" value={categoryId} onChange={setCategoryId} />
        </Field>
        <Field label="Nereye girdi?" htmlFor="in-to">
          <MoneyAccountSelect id="in-to" value={toId} onChange={setTo} includeCards={false} />
        </Field>
      </TwoCol>
      <Field label="Açıklama" htmlFor="in-desc">
        <TextInput id="in-desc" value={description} onChange={(ev) => setDescription(ev.target.value)} />
      </Field>
    </FormFrame>
  );
}

