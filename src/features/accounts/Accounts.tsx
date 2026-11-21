import { Link } from 'react-router-dom';
import { ChevronRight, CreditCard, Landmark, Plus, Wallet } from 'lucide-react';
import { displayBalance } from '../../domain/ledger';
import { SYS } from '../../domain/types';
import { formatTL } from '../../lib/money';
import { moneyAccounts, useData } from '../../state/data';
import { useUI } from '../../state/ui';
import { Button, PageHeader, cx } from '../../ui';

export function Accounts() {
  const d = useData();
  const { openNew } = useUI();
  const list = moneyAccounts(d).map((a) => ({ a, bal: displayBalance(a.kind, d.balances.get(a.id) ?? 0) }));
  const groups = [
    { title: 'Kasa', items: list.filter((x) => x.a.kind === 'cash'), icon: Wallet },
    { title: 'Banka hesapları', items: list.filter((x) => x.a.kind === 'bank'), icon: Landmark },
    { title: 'Kredi kartları', items: list.filter((x) => x.a.kind === 'card'), icon: CreditCard },
  ];
  return (
    <>
      <PageHeader
        title="Kasa ve hesaplar"
        sub="Para nerede duruyor, kart borcu ne kadar"
        actions={
          <>
            <Link to="/ayarlar?b=hesap">
              <Button icon={<Plus className="h-4 w-4" />}>Hesap / kart ekle</Button>
            </Link>
            <Button variant="primary" onClick={() => openNew('transfer')}>
              Transfer
            </Button>
          </>
        }
      />
      <div className="space-y-5">
        {groups.map((g) =>
          g.items.length ? (
            <div key={g.title}>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-500">{g.title}</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {g.items.map(({ a, bal }) => (
                  <Link key={a.id} to={`/hesaplar/${a.id}`} className="card flex items-center gap-3 p-4 transition hover:border-ink-300">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-ink-100 text-ink-600">
                      <g.icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-ink-900">{a.id === SYS.kasa ? 'Kasa (nakit)' : a.name}</span>
                      <span className={cx('tabular block text-xl font-semibold', a.kind !== 'card' && bal < 0 ? 'text-red-700' : 'text-ink-900')}>
                        {formatTL(bal, 'auto')}
                        {a.kind === 'card' && <span className="ml-1 text-sm font-normal text-ink-500">borç</span>}
                      </span>
                    </span>
                    <ChevronRight className="h-5 w-5 text-ink-300" />
                  </Link>
                ))}
              </div>
            </div>
          ) : null,
        )}
      </div>
      <p className="mt-6 max-w-3xl text-sm text-ink-500">
        Banka bakiyeleri, POS satışları ve bu uygulamaya girilen ödemelerle hesaplanır. Bankadan yapılan bazı ödemeler girilmediyse bakiye gerçeğinden farklı görünür; hesabın sayfasından “Bakiye düzelt” ile gerçek bakiyeye eşitleyebilirsiniz.
      </p>
    </>
  );
}
