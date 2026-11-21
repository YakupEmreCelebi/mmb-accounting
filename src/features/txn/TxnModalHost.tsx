import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftRight, HandCoins, Landmark, Pencil, Receipt, Trash2, TrendingUp, UserRound, type LucideIcon } from 'lucide-react';
import { db, repo } from '../../db';
import { touchesCash } from '../../domain/ledger';
import type { HistoryEntry } from '../../domain/types';
import { formatDate } from '../../lib/dates';
import { formatTL } from '../../lib/money';
import { accountName, contactName, useData } from '../../state/data';
import { useUI, type NewTxnKind, type TxnPreset } from '../../state/ui';
import { Badge, Button, Modal, Notice, Row } from '../../ui';
import { CollectionForm, ContactPaymentForm, ExpenseForm, IncomeForm, PersonnelForm, TransferForm } from './forms';
import { isEditableKind, KIND_META, txnTitle } from './meta';
import { PERSONNEL_TYPE_LABEL } from '../../domain/types';

const MENU: Array<{ kind: NewTxnKind; label: string; text: string; icon: LucideIcon }> = [
  { kind: 'expense', label: 'Gider', text: 'Malzeme, içecek, temizlik, araç, kira… Kasadan, bankadan, karttan veya veresiye.', icon: Receipt },
  { kind: 'personnel', label: 'Personel ödemesi', text: 'Maaş, avans, yevmiye, prim.', icon: UserRound },
  { kind: 'contact_payment', label: 'Borç ödeme / cari', text: 'Tedarikçiye veresiye borcu ödeme, işletme sahibine ödeme veya sahibin koyduğu para.', icon: HandCoins },
  { kind: 'collection', label: 'Yemek kartı tahsilatı', text: 'Yemek kartı firmasının ödemesi hesaba geçti.', icon: Landmark },
  { kind: 'transfer', label: 'Transfer', text: 'Kasadan bankaya, bankadan karta (ekstre ödemesi), bankadan kasaya.', icon: ArrowLeftRight },
  { kind: 'income', label: 'Diğer gelir', text: 'Satış dışı gelirler.', icon: TrendingUp },
];

export function TxnModalHost() {
  const { modal, closeModal, openNew } = useUI();
  if (!modal) return null;
  if (modal.type === 'menu') return <NewMenu preset={modal.preset} onPick={(k) => openNew(k, modal.preset)} onClose={closeModal} />;
  if (modal.type === 'new') return <FormFor kind={modal.kind} preset={modal.preset} onClose={closeModal} />;
  if (modal.type === 'edit') return <FormFor kind={modal.txn.kind as NewTxnKind} editing={modal.txn} onClose={closeModal} />;
  return <TxnDetail txnId={modal.txnId} onClose={closeModal} />;
}

function FormFor({ kind, preset, editing, onClose }: { kind: NewTxnKind; preset?: TxnPreset; editing?: import('../../domain/types').Txn; onClose: () => void }) {
  const props = { preset, editing, onClose };
  switch (kind) {
    case 'expense':
      return <ExpenseForm {...props} />;
    case 'personnel':
      return <PersonnelForm {...props} />;
    case 'contact_payment':
      return <ContactPaymentForm {...props} />;
    case 'collection':
      return <CollectionForm {...props} />;
    case 'transfer':
      return <TransferForm {...props} />;
    case 'income':
      return <IncomeForm {...props} />;
    default:
      return null;
  }
}

function NewMenu({ onPick, onClose }: { preset?: TxnPreset; onPick: (k: NewTxnKind) => void; onClose: () => void }) {
  const navigate = useNavigate();
  return (
    <Modal open onClose={onClose} title="Yeni işlem" size="lg">
      <button
        onClick={() => {
          onClose();
          navigate('/gun-sonu/bugun');
        }}
        className="mb-3 flex w-full items-center gap-4 rounded-2xl bg-brand-700 p-4 text-left text-white shadow-sm active:bg-brand-800"
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15">
          <Receipt className="h-6 w-6" />
        </span>
        <span>
          <span className="block text-base font-semibold">Gün sonu</span>
          <span className="block text-sm text-white/85">Günün satışlarını ödeme tiplerine göre gir, kasayı say ve günü kapat.</span>
        </span>
      </button>
      <div className="grid gap-3 sm:grid-cols-2">
        {MENU.map((m) => (
          <button key={m.kind} onClick={() => onPick(m.kind)} className="flex items-start gap-3 rounded-2xl border border-ink-200 bg-white p-4 text-left transition hover:border-ink-300 active:bg-ink-50">
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${KIND_META[m.kind].tint}`}>
              <m.icon className="h-5 w-5" />
            </span>
            <span>
              <span className="block font-semibold text-ink-900">{m.label}</span>
              <span className="mt-0.5 block text-sm leading-snug text-ink-500">{m.text}</span>
            </span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

function TxnDetail({ txnId, onClose }: { txnId: string; onClose: () => void }) {
  const d = useData();
  const { openEdit, confirm, toast } = useUI();
  const navigate = useNavigate();
  const t = d.allTxns.find((x) => x.id === txnId);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const closed = t ? d.dayCloseByDate.get(t.date)?.status === 'closed' : false;
  const locked = Boolean(t && closed && touchesCash(t));

  useEffect(() => {
    db.history.where('entityId').equals(txnId).toArray().then((h) => setHistory(h.sort((a, b) => a.at - b.at)));
  }, [txnId, t?.updatedAt]);

  if (!t) return null;
  const meta = KIND_META[t.kind];
  return (
    <Modal
      open
      onClose={onClose}
      title={meta.label}
      size="lg"
      footer={
        <>
          {(t.kind === 'day_sales' || t.kind === 'day_variance') && (
            <Button
              variant="primary"
              onClick={() => {
                onClose();
                navigate(`/gun-sonu/${t.date}`);
              }}
            >
              Gün sonuna git
            </Button>
          )}
          {isEditableKind(t.kind) && !t.void && (
            <>
              <Button
                variant="danger"
                icon={<Trash2 className="h-4 w-4" />}
                disabled={locked}
                onClick={async () => {
                  const ok = await confirm({ title: 'Kayıt iptal edilsin mi?', message: 'Kayıt silinmez, “iptal edildi” olarak işaretlenir ve hesaplara etkisi kalkar. Geçmişte görünmeye devam eder.', confirmText: 'İptal et', danger: true });
                  if (!ok) return;
                  try {
                    await repo.voidTxn(t.id, 'Kullanıcı iptal etti');
                    toast('Kayıt iptal edildi');
                    onClose();
                  } catch (e) {
                    toast((e as Error).message, 'error');
                  }
                }}
              >
                İptal et
              </Button>
              <Button variant="primary" icon={<Pencil className="h-4 w-4" />} disabled={locked} onClick={() => openEdit(t)}>
                Düzenle
              </Button>
            </>
          )}
        </>
      }
    >
      {t.void && <Notice tone="error">Bu kayıt iptal edildi{t.voidReason ? ` (${t.voidReason})` : ''}. Hesaplara etkisi yok.</Notice>}
      {locked && !t.void && <Notice tone="info">Bu günün kasası kapatıldığı için kayıt kilitli. Değiştirmek için Gün sonu ekranından günü yeniden açın.</Notice>}
      <div className="mt-3 divide-y divide-ink-100">
        <Row label="Başlık">{txnTitle(d, t)}</Row>
        <Row label="Tarih">{formatDate(t.date)}</Row>
        <Row label="Tutar">
          <span className="tabular font-semibold">{formatTL(t.amount)}</span>
        </Row>
        {t.description && t.kind !== 'expense' && <Row label="Açıklama">{t.description}</Row>}
        {t.categoryId && <Row label="Kategori">{accountName(d, t.categoryId)}</Row>}
        {t.contactId && <Row label="Kişi / firma">{contactName(d, t.contactId)}</Row>}
        {t.personnelType && <Row label="Ödeme türü">{PERSONNEL_TYPE_LABEL[t.personnelType]}</Row>}
        {t.payStatus && (
          <Row label="Ödeme durumu">
            {t.payStatus === 'paid' ? `Ödendi · ${accountName(d, t.sourceAccountId)}` : t.payStatus === 'unpaid' ? `Ödenecek (vade ${formatDate(t.dueDate ?? t.date, 'short')})` : 'Cepten ödendi'}
          </Row>
        )}
      </div>
      <h4 className="mb-2 mt-5 text-sm font-semibold text-ink-700">Muhasebe kaydı</h4>
      <div className="overflow-hidden rounded-xl border border-ink-200">
        <table className="w-full text-sm">
          <thead className="bg-ink-50 text-left text-ink-500">
            <tr>
              <th className="px-3 py-2 font-medium">Hesap</th>
              <th className="px-3 py-2 text-right font-medium">Borç</th>
              <th className="px-3 py-2 text-right font-medium">Alacak</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {t.postings.map((p, i) => (
              <tr key={i}>
                <td className="px-3 py-2">
                  {accountName(d, p.accountId)}
                  {p.contactId && <span className="text-ink-500"> · {contactName(d, p.contactId)}</span>}
                </td>
                <td className="tabular px-3 py-2 text-right">{p.amount > 0 ? formatTL(p.amount) : ''}</td>
                <td className="tabular px-3 py-2 text-right">{p.amount < 0 ? formatTL(-p.amount) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-ink-500">Her kayıt çift taraflıdır: borç ve alacak toplamı her zaman eşittir.</p>
      {history.length > 0 && (
        <>
          <h4 className="mb-2 mt-5 text-sm font-semibold text-ink-700">Değişiklik geçmişi</h4>
          <ul className="space-y-1 text-sm text-ink-600">
            {history.map((h) => (
              <li key={h.id} className="flex gap-2">
                <Badge tone={h.action === 'void' ? 'red' : h.action === 'update' ? 'amber' : 'neutral'}>
                  {h.action === 'create' ? 'Oluşturuldu' : h.action === 'update' ? 'Düzenlendi' : h.action === 'void' ? 'İptal' : h.action}
                </Badge>
                <span className="tabular">{new Date(h.at).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}
