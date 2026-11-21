import { useState } from 'react';
import { repo } from '../../db';
import { displayBalance, contactBalance } from '../../domain/ledger';
import { GROUP_LABEL, type Account, type Contact, type ContactType, type PnlGroup } from '../../domain/types';
import { newId } from '../../lib/id';
import { formatTL } from '../../lib/money';
import { expenseCategories, incomeCategories, moneyAccounts, useData } from '../../state/data';
import { useRunner } from '../../state/ui';
import { Button, Select, Segmented, TextInput } from '../../ui';

const NEW = '__new__';

export function MoneyAccountSelect({
  value,
  onChange,
  includeCards = true,
  id,
  exclude,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  includeCards?: boolean;
  id?: string;
  exclude?: string;
  placeholder?: string;
}) {
  const d = useData();
  const list = moneyAccounts(d, { includeCards }).filter((a) => a.id !== exclude);
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {list.map((a) => {
        const bal = displayBalance(a.kind, d.balances.get(a.id) ?? 0);
        const suffix = a.kind === 'card' ? `borç ${formatTL(bal, 'auto')}` : formatTL(bal, 'auto');
        return (
          <option key={a.id} value={a.id}>
            {a.name} ({suffix})
          </option>
        );
      })}
    </Select>
  );
}

const EXPENSE_GROUPS: PnlGroup[] = ['cogs', 'labor', 'operating', 'occupancy', 'fees', 'tax', 'capex'];

export function CategorySelect({ value, onChange, kind = 'expense', id }: { value: string; onChange: (v: string) => void; kind?: 'expense' | 'income'; id?: string }) {
  const d = useData();
  const run = useRunner();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [group, setGroup] = useState<PnlGroup>(kind === 'income' ? 'other_income' : 'operating');
  const cats = kind === 'income' ? incomeCategories(d) : expenseCategories(d);
  const groups: PnlGroup[] = kind === 'income' ? ['other_income'] : EXPENSE_GROUPS;

  const add = async () => {
    const n = name.trim();
    if (!n) return;
    const acc: Account = {
      id: newId('cat'),
      name: n,
      kind: kind === 'income' ? 'income' : group === 'capex' ? 'fixed_asset' : 'expense',
      group,
      order: 50,
      createdAt: Date.now(),
    };
    const ok = await run(() => repo.saveAccount(acc), `“${n}” kategorisi eklendi`);
    if (ok) {
      onChange(acc.id);
      setAdding(false);
      setName('');
    }
  };

  return (
    <div className="space-y-2">
      <Select
        id={id}
        value={adding ? NEW : value}
        onChange={(e) => {
          if (e.target.value === NEW) setAdding(true);
          else {
            setAdding(false);
            onChange(e.target.value);
          }
        }}
      >
        <option value="">Kategori seçin…</option>
        {groups.map((g) => {
          const items = cats.filter((c) => c.group === g);
          if (!items.length) return null;
          return (
            <optgroup key={g} label={GROUP_LABEL[g]}>
              {items.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          );
        })}
        <option value={NEW}>+ Yeni kategori ekle…</option>
      </Select>
      {adding && (
        <div className="space-y-2 rounded-xl border border-brand-200 bg-brand-50/50 p-3">
          <TextInput autoFocus placeholder="Kategori adı (örn. Ambalaj, Kırtasiye)" value={name} onChange={(e) => setName(e.target.value)} />
          {kind === 'expense' && (
            <Select value={group} onChange={(e) => setGroup(e.target.value as PnlGroup)}>
              {groups.map((g) => (
                <option key={g} value={g}>
                  Rapordaki yeri: {GROUP_LABEL[g]}
                </option>
              ))}
            </Select>
          )}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Vazgeç
            </Button>
            <Button size="sm" variant="primary" onClick={add} disabled={!name.trim()}>
              Ekle
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ContactSelect({
  value,
  onChange,
  types,
  newType,
  placeholder = 'Seçin…',
  id,
  showBalance,
}: {
  value: string;
  onChange: (v: string) => void;
  types: ContactType[];
  newType?: ContactType;
  placeholder?: string;
  id?: string;
  showBalance?: boolean;
}) {
  const d = useData();
  const run = useRunner();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [employment, setEmployment] = useState<'permanent' | 'temporary'>('temporary');
  const list = d.contacts.filter((c) => types.includes(c.type) && (!c.archived || c.id === value));
  const label = newType === 'personnel' ? 'personel' : newType === 'supplier' ? 'tedarikçi' : 'kişi';

  const add = async () => {
    const n = name.trim();
    if (!n || !newType) return;
    const c: Contact = { id: newId('ct'), name: n, type: newType, createdAt: Date.now() };
    if (newType === 'personnel') c.employment = employment;
    const ok = await run(() => repo.saveContact(c), `${n} eklendi`);
    if (ok) {
      onChange(c.id);
      setAdding(false);
      setName('');
    }
  };

  return (
    <div className="space-y-2">
      <Select
        id={id}
        value={adding ? NEW : value}
        onChange={(e) => {
          if (e.target.value === NEW) setAdding(true);
          else {
            setAdding(false);
            onChange(e.target.value);
          }
        }}
      >
        <option value="">{placeholder}</option>
        {list.map((c) => {
          let suffix = '';
          if (showBalance) {
            const b = contactBalance(d.txns, c);
            if (b) suffix = b > 0 ? ` — borcumuz ${formatTL(b, 'auto')}` : ` — alacağımız ${formatTL(-b, 'auto')}`;
          } else if (c.type === 'personnel') suffix = c.employment === 'permanent' ? ' (kalıcı)' : ' (geçici)';
          return (
            <option key={c.id} value={c.id}>
              {c.name}
              {suffix}
            </option>
          );
        })}
        {newType && <option value={NEW}>+ Yeni {label} ekle…</option>}
      </Select>
      {adding && (
        <div className="space-y-2 rounded-xl border border-brand-200 bg-brand-50/50 p-3">
          <TextInput autoFocus placeholder={newType === 'personnel' ? 'Ad soyad' : 'Firma / kişi adı'} value={name} onChange={(e) => setName(e.target.value)} />
          {newType === 'personnel' && (
            <Segmented
              size="sm"
              value={employment}
              onChange={setEmployment}
              options={[
                { value: 'temporary', label: 'Geçici / yevmiyeli' },
                { value: 'permanent', label: 'Kalıcı' },
              ]}
            />
          )}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Vazgeç
            </Button>
            <Button size="sm" variant="primary" onClick={add} disabled={!name.trim()}>
              Ekle
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
