import { useState } from 'react';
import { repo } from '../../db';
import { buildOpening } from '../../domain/ledger';
import { SYS, type Contact, type ContactType } from '../../domain/types';
import { newId } from '../../lib/id';
import { todayISO } from '../../lib/dates';
import type { Kurus } from '../../lib/money';
import { useData } from '../../state/data';
import { useUI } from '../../state/ui';
import { Button, DateInput, Field, Modal, MoneyInput, Segmented, TextArea, TextInput, Toggle } from '../../ui';

export function ContactEditor({ contact, type, onClose }: { contact?: Contact; type?: ContactType; onClose: (saved?: Contact) => void }) {
  const d = useData();
  const { toast } = useUI();
  const kind: ContactType = contact?.type ?? type ?? 'supplier';
  const [name, setName] = useState(contact?.name ?? '');
  const [employment, setEmployment] = useState<'permanent' | 'temporary'>(contact?.employment ?? 'permanent');
  const [salary, setSalary] = useState<Kurus | null>(contact?.monthlySalary ?? null);
  const [phone, setPhone] = useState(contact?.phone ?? '');
  const [note, setNote] = useState(contact?.note ?? '');
  const [archived, setArchived] = useState(Boolean(contact?.archived));
  const [opening, setOpening] = useState<Kurus | null>(null);
  const [openingDate, setOpeningDate] = useState(todayISO());
  const [error, setError] = useState('');

  const save = async () => {
    setError('');
    const n = name.trim();
    if (!n) return setError('Ad girin.');
    const c: Contact = {
      ...(contact ?? { id: newId('ct'), createdAt: Date.now(), type: kind }),
      name: n,
      phone: phone.trim() || undefined,
      note: note.trim() || undefined,
      archived: archived || undefined,
    };
    if (kind === 'personnel') {
      c.employment = employment;
      c.monthlySalary = salary ?? undefined;
    }
    try {
      await repo.saveContact(c);
      if (!contact && opening) {
        await repo.addTxn(
          buildOpening({ date: openingDate, account: d.accountById.get(SYS.payable)!, balance: opening, contact: c, description: `Açılış borcu: ${n}` }),
        );
      }
      toast(contact ? 'Kaydedildi' : `${n} eklendi`);
      onClose(c);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const title = contact ? `${contact.name} · düzenle` : kind === 'personnel' ? 'Yeni personel' : 'Yeni tedarikçi';
  return (
    <Modal
      open
      onClose={() => onClose()}
      title={title}
      footer={
        <>
          {error && <p className="mr-auto text-sm font-medium text-red-700">{error}</p>}
          <Button onClick={() => onClose()}>Vazgeç</Button>
          <Button variant="primary" onClick={save}>
            Kaydet
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={kind === 'personnel' ? 'Ad soyad' : 'Firma / kişi adı'} htmlFor="ce-name">
          <TextInput id="ce-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        {kind === 'personnel' && (
          <>
            <Field label="Çalışma şekli">
              <Segmented
                value={employment}
                onChange={setEmployment}
                options={[
                  { value: 'permanent', label: 'Kalıcı' },
                  { value: 'temporary', label: 'Geçici / yevmiyeli' },
                ]}
              />
            </Field>
            <Field label="Aylık maaş (isteğe bağlı)" htmlFor="ce-sal" hint="Girilirse ödeme ekranında “bu ay kalan” gösterilir.">
              <MoneyInput id="ce-sal" value={salary} onChange={setSalary} />
            </Field>
          </>
        )}
        <Field label="Telefon" htmlFor="ce-phone">
          <TextInput id="ce-phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="Not" htmlFor="ce-note">
          <TextArea id="ce-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {!contact && kind !== 'personnel' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Açılış borcu (isteğe bağlı)" htmlFor="ce-open" hint="Uygulamaya geçmeden önceki veresiye borcu">
              <MoneyInput id="ce-open" value={opening} onChange={setOpening} />
            </Field>
            <Field label="Borç tarihi" htmlFor="ce-open-date">
              <DateInput id="ce-open-date" value={openingDate} onChange={setOpeningDate} />
            </Field>
          </div>
        )}
        {contact && contact.type !== 'owner' && <Toggle checked={archived} onChange={setArchived} label="Arşivle (listelerde gizle)" />}
      </div>
    </Modal>
  );
}
