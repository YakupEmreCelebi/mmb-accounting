import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Archive, ArchiveRestore, Download, Lock, Pencil, Plus, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, repo } from '../../db';
import { GROUP_LABEL, KIND_LABEL, SYS, type Account, type PaymentMethod, type PaymentMethodType, type PnlGroup, type Recurring } from '../../domain/types';
import { newId } from '../../lib/id';
import { hashPin } from '../../lib/pin';
import { formatTL, type Kurus } from '../../lib/money';
import { moneyAccounts, useData } from '../../state/data';
import { useUI } from '../../state/ui';
import { Badge, Button, Card, CardTitle, Field, Modal, MoneyInput, Notice, PageHeader, Segmented, Select, Tabs, TextInput, Toggle, cx } from '../../ui';
import { CategorySelect, ContactSelect, MoneyAccountSelect } from '../txn/pickers';
import { backupAge, prepareBackup, readBackupFile, shareBackup } from './backup';

type Section = 'yedek' | 'odeme' | 'hesap' | 'kategori' | 'tekrar' | 'guvenlik' | 'gecmis' | 'genel';

export function Settings() {
  const [params, setParams] = useSearchParams();
  const section = (params.get('b') as Section) || 'yedek';
  return (
    <>
      <PageHeader title="Ayarlar" />
      <Tabs<Section>
        className="mb-5"
        value={section}
        onChange={(b) => setParams({ b }, { replace: true })}
        items={[
          { key: 'yedek', label: 'Yedekleme' },
          { key: 'odeme', label: 'Ödeme tipleri' },
          { key: 'hesap', label: 'Hesaplar ve kartlar' },
          { key: 'kategori', label: 'Kategoriler' },
          { key: 'tekrar', label: 'Tekrarlayan giderler' },
          { key: 'guvenlik', label: 'Şifre' },
          { key: 'gecmis', label: 'Değişiklik geçmişi' },
          { key: 'genel', label: 'Genel' },
        ]}
      />
      {section === 'yedek' && <BackupSection />}
      {section === 'odeme' && <PaymentMethodsSection />}
      {section === 'hesap' && <AccountsSection />}
      {section === 'kategori' && <CategoriesSection />}
      {section === 'tekrar' && <RecurringSection />}
      {section === 'guvenlik' && <PinSection />}
      {section === 'gecmis' && <HistorySection />}
      {section === 'genel' && <GeneralSection />}
    </>
  );
}

// ------------------------------------------------------------------ Yedekleme
function BackupSection() {
  const d = useData();
  const { toast, confirm } = useUI();
  const age = backupAge(d);
  const [prepared, setPrepared] = useState<{ blob: Blob; filename: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Prepare the file in advance so the share sheet opens straight from the tap.
  useEffect(() => {
    let alive = true;
    prepareBackup().then((p) => alive && setPrepared(p));
    return () => {
      alive = false;
    };
  }, [d.allTxns.length, d.dayCloses.length]);

  const persisted = d.settings.storagePersisted as boolean | undefined;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardTitle sub="Veriler bu cihazın içinde saklanır. Cihaz bozulur, kaybolur veya uygulama ana ekrandan silinirse veriler gider; yedek bu yüzden şart.">Yedek al</CardTitle>
        <div className={cx('mb-4 flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium', age.stale ? 'bg-amber-50 text-amber-900' : 'bg-emerald-50 text-emerald-900')}>
          <ShieldCheck className="h-5 w-5" /> {age.label}
        </div>
        <Button
          variant="primary"
          size="lg"
          block
          icon={<Download className="h-5 w-5" />}
          disabled={!prepared}
          onClick={async () => {
            if (!prepared) return;
            if (await shareBackup(prepared)) toast('Yedek kaydedildi');
            setPrepared(await prepareBackup());
          }}
        >
          Yedeği kaydet
        </Button>
        <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-ink-600">
          <li>“Yedeği kaydet”e dokunun.</li>
          <li>Açılan menüde <b>Dosyalara Kaydet</b>’i seçin.</li>
          <li><b>iCloud Drive</b> içinde bir klasör seçip (örn. “Mama’s Burger Yedek”) Kaydet’e basın.</li>
        </ol>
        <p className="mt-3 text-sm text-ink-500">Her gün sonunda bir yedek alın. Dosyalar küçüktür; eskileri silmek gerekmez.</p>
      </Card>

      <Card>
        <CardTitle sub="Başka bir cihaza geçerken veya bir sorun olduğunda">Yedekten geri yükle</CardTitle>
        <Notice tone="warn">Geri yükleme bu cihazdaki bütün verilerin yerine yedekteki verileri koyar.</Notice>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try {
              const data = await readBackupFile(f);
              const counts = (data as { counts?: Record<string, number>; exportedAt?: string }) ?? {};
              const ok = await confirm({
                title: 'Yedek geri yüklensin mi?',
                message: `${f.name} · ${counts.exportedAt ? new Date(counts.exportedAt).toLocaleString('tr-TR') : ''}\n${counts.counts?.txns ?? '?'} kayıt, ${counts.counts?.dayCloses ?? '?'} gün sonu. Bu cihazdaki mevcut veriler silinecek.`,
                confirmText: 'Geri yükle',
                danger: true,
              });
              if (!ok) return;
              const res = await repo.importBackup(data);
              toast(`Geri yüklendi: ${res.txns} kayıt`);
            } catch (err) {
              toast((err as Error).message, 'error');
            }
          }}
        />
        <Button className="mt-4" block icon={<Upload className="h-5 w-5" />} onClick={() => fileRef.current?.click()}>
          Yedek dosyası seç
        </Button>
        <div className="mt-5 space-y-1 text-sm text-ink-600">
          <div>Kayıt sayısı: {d.allTxns.length} · Gün sonu: {d.dayCloses.length} · Kişi/firma: {d.contacts.length}</div>
          <div>
            Kalıcı depolama:{' '}
            {persisted === undefined ? 'bilinmiyor' : persisted ? <span className="font-medium text-emerald-700">açık</span> : <span className="font-medium text-amber-700">tarayıcı izin vermedi (uygulamayı ana ekrandan açın)</span>}
          </div>
        </div>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ Ödeme tipleri
function PaymentMethodsSection() {
  const d = useData();
  const [editing, setEditing] = useState<PaymentMethod | 'new' | null>(null);
  return (
    <Card padded={false}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
        <CardTitle sub="Gün sonu ekranındaki alanlar. Komisyon ve vade isteğe bağlıdır; boşsa %0 ve aynı gün sayılır.">Ödeme tipleri</CardTitle>
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
          Ekle
        </Button>
      </div>
      <div className="divide-y divide-ink-100">
        {d.methods.map((m) => (
          <button key={m.id} onClick={() => setEditing(m)} className={cx('flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-ink-50', m.archived && 'opacity-60')}>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 font-medium text-ink-900">
                {m.name}
                {m.archived && <Badge>Gizli</Badge>}
              </span>
              <span className="block text-sm text-ink-500">
                {m.settleMode === 'receivable' ? `Alacak olarak bekler → ${d.accountById.get(m.collectAccountId ?? '')?.name ?? 'hesap seçilmedi'}` : `Doğrudan → ${d.accountById.get(m.targetAccountId)?.name ?? '?'}`}
                {' · '}Komisyon {m.commissionRate ? `%${m.commissionRate}` : '—'} · Vade {m.termDays ? `${m.termDays} gün` : '—'}
              </span>
            </span>
            <Pencil className="h-4 w-4 text-ink-400" />
          </button>
        ))}
      </div>
      {editing && <MethodEditor method={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function MethodEditor({ method, onClose }: { method?: PaymentMethod; onClose: () => void }) {
  const d = useData();
  const { toast } = useUI();
  const [name, setName] = useState(method?.name ?? '');
  const [type, setType] = useState<PaymentMethodType>(method?.type ?? 'meal_card');
  const [settleMode, setSettleMode] = useState<PaymentMethod['settleMode']>(method?.settleMode ?? 'receivable');
  const [targetAccountId, setTarget] = useState(method?.settleMode === 'direct' ? method.targetAccountId : 'acc-akbank');
  const [collectAccountId, setCollect] = useState(method?.collectAccountId ?? 'acc-akbank');
  const [rate, setRate] = useState(method?.commissionRate !== undefined ? String(method.commissionRate).replace('.', ',') : '');
  const [term, setTerm] = useState(method?.termDays !== undefined ? String(method.termDays) : '');
  const [archived, setArchived] = useState(Boolean(method?.archived));
  const [error, setError] = useState('');

  const save = async () => {
    setError('');
    const n = name.trim();
    if (!n) return setError('Ad girin.');
    const r = rate.trim() ? Number(rate.replace(',', '.')) : undefined;
    if (r !== undefined && (!Number.isFinite(r) || r < 0 || r >= 50)) return setError('Komisyon oranı 0 ile 50 arasında olmalı.');
    const t = term.trim() ? Number(term) : undefined;
    if (t !== undefined && (!Number.isInteger(t) || t < 0 || t > 365)) return setError('Vade 0–365 gün arasında olmalı.');
    const m: PaymentMethod = {
      id: method?.id ?? newId('pm'),
      name: n,
      type,
      settleMode,
      targetAccountId: settleMode === 'direct' ? targetAccountId : method?.settleMode === 'receivable' ? method.targetAccountId : '',
      collectAccountId: settleMode === 'receivable' ? collectAccountId : undefined,
      commissionRate: r,
      termDays: t,
      archived: archived || undefined,
      order: method?.order ?? Math.max(0, ...d.methods.map((x) => x.order)) + 1,
    };
    try {
      await repo.savePaymentMethod(m);
      toast('Kaydedildi');
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={method ? method.name : 'Yeni ödeme tipi'}
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
        <Field label="Ad" htmlFor="pm-name">
          <TextInput id="pm-name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Tür">
          <Select value={type} onChange={(e) => setType(e.target.value as PaymentMethodType)}>
            <option value="pos">Banka POS</option>
            <option value="cash">Nakit</option>
            <option value="meal_card">Yemek kartı</option>
            <option value="other">Diğer</option>
          </Select>
        </Field>
        <Field label="Para ne zaman hesaba geçer?">
          <Segmented
            value={settleMode}
            onChange={setSettleMode}
            options={[
              { value: 'direct', label: 'Aynı gün / ertesi gün' },
              { value: 'receivable', label: 'Firma sonra öder (alacak)' },
            ]}
          />
        </Field>
        {settleMode === 'direct' ? (
          <Field label="Para hangi hesaba geçer?">
            <MoneyAccountSelect value={targetAccountId} onChange={setTarget} includeCards={false} />
          </Field>
        ) : (
          <Field label="Firma ödemeyi hangi hesaba yapar?">
            <MoneyAccountSelect value={collectAccountId} onChange={setCollect} includeCards={false} />
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Komisyon oranı (%)" htmlFor="pm-rate" hint={settleMode === 'direct' ? 'Girilirse satış günü gider olarak düşülür' : 'Tahsilatta brüt tutarı önermek için kullanılır'}>
            <TextInput id="pm-rate" inputMode="decimal" placeholder="örn. 6" value={rate} onChange={(e) => setRate(e.target.value)} />
          </Field>
          <Field label="Vade (gün)" htmlFor="pm-term" hint="Kaç gün sonra ödeme beklenir">
            <TextInput id="pm-term" inputMode="numeric" placeholder="örn. 30" value={term} onChange={(e) => setTerm(e.target.value)} disabled={settleMode === 'direct'} />
          </Field>
        </div>
        {method && <Toggle checked={archived} onChange={setArchived} label="Gün sonu ekranında gizle (eski kayıtlar korunur)" />}
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ Hesaplar
function AccountsSection() {
  const d = useData();
  const [editing, setEditing] = useState<Account | 'bank' | 'card' | 'cash' | null>(null);
  const list = moneyAccounts(d, { includeArchived: true });
  return (
    <Card padded={false}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
        <CardTitle sub="Kasa, banka hesapları ve kredi kartları">Hesaplar ve kartlar</CardTitle>
        <div className="flex gap-2">
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('bank')}>
            Banka
          </Button>
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('card')}>
            Kredi kartı
          </Button>
        </div>
      </div>
      <div className="divide-y divide-ink-100">
        {list.map((a) => (
          <button key={a.id} onClick={() => setEditing(a)} className={cx('flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-ink-50', a.archived && 'opacity-60')}>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 font-medium text-ink-900">
                {a.name}
                {a.archived && <Badge>Arşivde</Badge>}
              </span>
              <span className="block text-sm text-ink-500">{KIND_LABEL[a.kind]}</span>
            </span>
            <Pencil className="h-4 w-4 text-ink-400" />
          </button>
        ))}
      </div>
      {editing && <AccountEditor account={typeof editing === 'string' ? undefined : editing} kind={typeof editing === 'string' ? editing : editing.kind} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function AccountEditor({ account, kind, onClose }: { account?: Account; kind: Account['kind']; onClose: () => void }) {
  const d = useData();
  const { toast } = useUI();
  const [name, setName] = useState(account?.name ?? (kind === 'card' ? 'Kredi kartı' : ''));
  const [archived, setArchived] = useState(Boolean(account?.archived));
  const [error, setError] = useState('');
  const bal = account ? d.balances.get(account.id) ?? 0 : 0;
  const save = async () => {
    const n = name.trim();
    if (!n) return setError('Ad girin.');
    if (archived && bal !== 0) return setError('Bakiyesi sıfır olmayan hesap arşivlenemez.');
    if (account?.id === SYS.kasa && archived) return setError('Kasa arşivlenemez.');
    await repo.saveAccount({ ...(account ?? { id: newId('acc'), kind, createdAt: Date.now(), order: 10 }), name: n, archived: archived || undefined });
    toast('Kaydedildi');
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={account ? account.name : kind === 'card' ? 'Yeni kredi kartı' : 'Yeni banka hesabı'}
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
        <Field label="Ad" htmlFor="ac-name" hint={kind === 'card' ? 'örn. Akbank Axess (işletme) — birden fazla kart varsa ayrı ayrı ekleyin' : undefined}>
          <TextInput id="ac-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        {account && account.id !== SYS.kasa && <Toggle checked={archived} onChange={setArchived} label="Arşivle (listelerde gizle)" />}
        {!account && <p className="text-sm text-ink-500">Mevcut bakiyeyi/borcu, hesabın sayfasındaki “Açılış bakiyesi” ile girebilirsiniz.</p>}
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ Kategoriler
const EXPENSE_GROUPS: PnlGroup[] = ['cogs', 'labor', 'operating', 'occupancy', 'fees', 'tax', 'capex', 'other_income'];

function CategoriesSection() {
  const d = useData();
  const { toast } = useUI();
  const [edit, setEdit] = useState<Account | null>(null);
  const [name, setName] = useState('');
  const cats = d.accounts.filter((a) => a.group && a.group !== 'sales' && a.group !== 'variance');
  return (
    <div className="space-y-5">
      <Notice tone="info">Kategoriler kâr/zarar raporunda hangi satırda görüneceğini belirler. Gider girerken de “+ Yeni kategori ekle” ile ekleyebilirsiniz. Kullanılan kategoriler silinmez, arşivlenir.</Notice>
      <div className="grid gap-5 lg:grid-cols-2">
        {EXPENSE_GROUPS.map((g) => {
          const items = cats.filter((c) => c.group === g);
          return (
            <Card key={g} padded={false}>
              <div className="px-5 pt-4">
                <CardTitle>{GROUP_LABEL[g]}</CardTitle>
              </div>
              <div className="divide-y divide-ink-100 border-t border-ink-100">
                {items.map((c) => (
                  <div key={c.id} className={cx('flex items-center gap-2 px-5 py-2.5', c.archived && 'opacity-50')}>
                    <span className="flex-1 text-[15px]">
                      {c.name} {c.system && <span className="text-xs text-ink-400">(sistem)</span>}
                    </span>
                    <button
                      aria-label="Yeniden adlandır"
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-500 hover:bg-ink-100"
                      onClick={() => {
                        setEdit(c);
                        setName(c.name);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    {!c.system && (
                      <button
                        aria-label={c.archived ? 'Arşivden çıkar' : 'Arşivle'}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-500 hover:bg-ink-100"
                        onClick={async () => {
                          await repo.saveAccount({ ...c, archived: !c.archived || undefined });
                          toast(c.archived ? 'Arşivden çıkarıldı' : 'Arşivlendi');
                        }}
                      >
                        {c.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
      {edit && (
        <Modal
          open
          onClose={() => setEdit(null)}
          title="Kategoriyi yeniden adlandır"
          footer={
            <>
              <Button onClick={() => setEdit(null)}>Vazgeç</Button>
              <Button
                variant="primary"
                onClick={async () => {
                  if (!name.trim()) return;
                  await repo.saveAccount({ ...edit, name: name.trim() });
                  toast('Kaydedildi');
                  setEdit(null);
                }}
              >
                Kaydet
              </Button>
            </>
          }
        >
          <TextInput autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </Modal>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Tekrarlayan
function RecurringSection() {
  const d = useData();
  const [editing, setEditing] = useState<Recurring | 'new' | null>(null);
  return (
    <Card padded={false}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
        <CardTitle sub="Kira, faturalar, muhasebeci gibi her ay tekrar eden giderler. Ana sayfada hatırlatılır; tek dokunuşla kaydedilir.">Tekrarlayan giderler</CardTitle>
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
          Ekle
        </Button>
      </div>
      {d.recurring.length ? (
        <div className="divide-y divide-ink-100">
          {d.recurring.map((r) => (
            <button key={r.id} onClick={() => setEditing(r)} className={cx('flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-ink-50', !r.active && 'opacity-60')}>
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-ink-900">{r.name}</span>
                <span className="block text-sm text-ink-500">
                  Her ayın {r.dayOfMonth}’i · {d.accountById.get(r.categoryId)?.name}
                  {!r.active && ' · durduruldu'}
                </span>
              </span>
              <span className="tabular font-semibold">{r.amount ? formatTL(r.amount, 'auto') : 'Tutar değişken'}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="px-5 pb-5 text-sm text-ink-500">Henüz tanımlı değil.</p>
      )}
      {editing && <RecurringEditor item={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function RecurringEditor({ item, onClose }: { item?: Recurring; onClose: () => void }) {
  const { toast, confirm } = useUI();
  const [name, setName] = useState(item?.name ?? '');
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? '');
  const [amount, setAmount] = useState<Kurus | null>(item?.amount ?? null);
  const [day, setDay] = useState(String(item?.dayOfMonth ?? 1));
  const [payStatus, setPayStatus] = useState<'paid' | 'unpaid'>(item?.payStatus ?? 'paid');
  const [source, setSource] = useState(item?.sourceAccountId ?? 'acc-akbank');
  const [contactId, setContactId] = useState(item?.contactId ?? '');
  const [active, setActive] = useState(item?.active ?? true);
  const [error, setError] = useState('');
  const save = async () => {
    const dn = Number(day);
    if (!name.trim()) return setError('Ad girin.');
    if (!categoryId) return setError('Kategori seçin.');
    if (!Number.isInteger(dn) || dn < 1 || dn > 31) return setError('Gün 1–31 arası olmalı.');
    if (payStatus === 'unpaid' && !contactId) return setError('Ödenecek gider için firma seçin.');
    await repo.saveRecurring({
      id: item?.id ?? newId('rc'),
      name: name.trim(),
      categoryId,
      amount: amount ?? undefined,
      dayOfMonth: dn,
      payStatus,
      sourceAccountId: payStatus === 'paid' ? source : undefined,
      contactId: contactId || undefined,
      active,
      createdAt: item?.createdAt ?? Date.now(),
    });
    toast('Kaydedildi');
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={item ? item.name : 'Yeni tekrarlayan gider'}
      footer={
        <>
          {error && <p className="mr-auto text-sm font-medium text-red-700">{error}</p>}
          {item && (
            <Button
              variant="danger"
              icon={<Trash2 className="h-4 w-4" />}
              onClick={async () => {
                if (await confirm({ title: 'Silinsin mi?', message: 'Daha önce kaydedilmiş giderler silinmez.', confirmText: 'Sil', danger: true })) {
                  await repo.deleteRecurring(item.id);
                  onClose();
                }
              }}
            >
              Sil
            </Button>
          )}
          <Button onClick={onClose}>Vazgeç</Button>
          <Button variant="primary" onClick={save}>
            Kaydet
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Ad" htmlFor="rc-name">
          <TextInput id="rc-name" placeholder="örn. Dükkân kirası" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Kategori">
          <CategorySelect value={categoryId} onChange={setCategoryId} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tutar (değişkense boş bırakın)" htmlFor="rc-amount">
            <MoneyInput id="rc-amount" value={amount} onChange={setAmount} />
          </Field>
          <Field label="Ayın kaçında?" htmlFor="rc-day">
            <TextInput id="rc-day" inputMode="numeric" value={day} onChange={(e) => setDay(e.target.value)} />
          </Field>
        </div>
        <Field label="Ödeme">
          <Segmented
            value={payStatus}
            onChange={setPayStatus}
            options={[
              { value: 'paid', label: 'Hesaptan ödenir' },
              { value: 'unpaid', label: 'Borç yazılır (fatura gelir)' },
            ]}
          />
        </Field>
        {payStatus === 'paid' ? (
          <Field label="Hangi hesaptan?">
            <MoneyAccountSelect value={source} onChange={setSource} />
          </Field>
        ) : (
          <Field label="Firma">
            <ContactSelect value={contactId} onChange={setContactId} types={['supplier', 'other']} newType="supplier" />
          </Field>
        )}
        {item && <Toggle checked={active} onChange={setActive} label="Aktif" />}
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ PIN
function PinSection() {
  const d = useData();
  const { toast } = useUI();
  const has = Boolean(d.settings.pinHash);
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const valid = /^\d{4}$/.test(pin) && pin === pin2;
  return (
    <Card className="max-w-xl">
      <CardTitle sub="Uygulama açılırken ve 5 dakikadan uzun arka planda kaldıktan sonra 4 haneli şifre sorar.">Uygulama şifresi</CardTitle>
      <div className="mb-4 flex items-center gap-2 text-sm">
        <Lock className="h-4 w-4" /> {has ? <span className="font-medium text-emerald-700">Şifre açık</span> : <span className="text-ink-500">Şifre yok</span>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={has ? 'Yeni şifre' : 'Şifre (4 rakam)'} htmlFor="pin1">
          <TextInput id="pin1" type="password" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
        </Field>
        <Field label="Şifre tekrar" htmlFor="pin2">
          <TextInput id="pin2" type="password" inputMode="numeric" maxLength={4} value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))} />
        </Field>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          variant="primary"
          disabled={!valid}
          onClick={async () => {
            await repo.setSetting('pinHash', await hashPin(pin));
            setPin('');
            setPin2('');
            toast('Şifre kaydedildi');
          }}
        >
          {has ? 'Şifreyi değiştir' : 'Şifreyi aç'}
        </Button>
        {has && (
          <Button
            variant="danger"
            onClick={async () => {
              await db.settings.delete('pinHash');
              toast('Şifre kaldırıldı');
            }}
          >
            Şifreyi kaldır
          </Button>
        )}
      </div>
      <p className="mt-4 text-sm text-ink-500">Şifreyi unutursanız: uygulamayı silip yedekten geri yüklemek gerekir. Yedek dosyası şifreyi içermez.</p>
    </Card>
  );
}

// ------------------------------------------------------------------ Geçmiş
function HistorySection() {
  const items = useLiveQuery(() => db.history.orderBy('at').reverse().limit(200).toArray(), []);
  const { openDetail } = useUI();
  const label: Record<string, string> = { create: 'Eklendi', update: 'Düzenlendi', void: 'İptal', close: 'Gün kapatıldı', reopen: 'Gün açıldı', delete: 'Silindi', restore: 'Geri yüklendi' };
  return (
    <Card padded={false}>
      <div className="px-5 pt-5">
        <CardTitle sub="Son 200 değişiklik. Kayıtlar silinmez; iptal ve düzeltmeler burada izlenir.">Değişiklik geçmişi</CardTitle>
      </div>
      <div className="divide-y divide-ink-100">
        {(items ?? []).map((h) => (
          <button key={h.id} onClick={() => h.entity === 'txn' && openDetail(h.entityId)} className="flex w-full items-start gap-3 px-5 py-2.5 text-left hover:bg-ink-50">
            <Badge tone={h.action === 'void' || h.action === 'delete' ? 'red' : h.action === 'update' || h.action === 'reopen' ? 'amber' : 'neutral'}>{label[h.action] ?? h.action}</Badge>
            <span className="min-w-0 flex-1 text-sm text-ink-700">{h.summary}</span>
            <span className="tabular shrink-0 text-xs text-ink-500">{new Date(h.at).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ Genel
function GeneralSection() {
  const d = useData();
  const { toast } = useUI();
  const [name, setName] = useState((d.settings.businessName as string) ?? '');
  const counts = useMemo(() => ({ txns: d.txns.length, days: d.dayCloses.length }), [d]);
  return (
    <Card className="max-w-xl">
      <CardTitle>Genel</CardTitle>
      <Field label="İşletme adı" htmlFor="g-name">
        <TextInput id="g-name" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Button
        className="mt-4"
        variant="primary"
        onClick={async () => {
          await repo.setSetting('businessName', name.trim());
          toast('Kaydedildi');
        }}
      >
        Kaydet
      </Button>
      <p className="mt-6 text-sm text-ink-500">
        Sürüm 1.0 · {counts.txns} kayıt · {counts.days} gün sonu. Veriler yalnızca bu cihazda saklanır; internet gerekmez.
      </p>
    </Card>
  );
}
