import { OWNER_CONTACT_ID, SYS, type Account, type Contact, type PaymentMethod, type PnlGroup } from './types';

/** Default chart of accounts for a single fast-food restaurant. Ids are stable so backups stay compatible. */
export function defaultAccounts(now = Date.now()): Account[] {
  const a = (id: string, name: string, kind: Account['kind'], extra: Partial<Account> = {}): Account => ({
    id,
    name,
    kind,
    createdAt: now,
    ...extra,
  });
  const cat = (id: string, name: string, group: PnlGroup, order: number, extra: Partial<Account> = {}) =>
    a(id, name, group === 'capex' ? 'fixed_asset' : 'expense', { group, order, ...extra });

  return [
    // Para hesapları
    a(SYS.kasa, 'Kasa', 'cash', { system: true, order: 1 }),
    a('acc-akbank', 'Akbank', 'bank', { order: 2 }),
    a('acc-tfkb', 'Türkiye Finans', 'bank', { order: 3 }),
    a('acc-vakif', 'Vakıfbank', 'bank', { order: 4 }),
    a('acc-card-1', 'Kredi kartı', 'card', { order: 5 }),

    // Sistem / cari hesapları
    a(SYS.payable, 'Tedarikçi borçları', 'payable', { system: true }),
    a(SYS.personnel, 'Personel cari', 'personnel', { system: true }),
    a(SYS.owner, 'İşletme sahibi cari', 'owner', { system: true }),
    a(SYS.opening, 'Açılış bakiyeleri', 'equity', { system: true }),

    // Gelir
    a(SYS.sales, 'Satışlar', 'income', { group: 'sales', system: true, order: 1 }),
    a(SYS.returns, 'Satış iadeleri', 'income', { group: 'sales', system: true, order: 2 }),
    a(SYS.otherIncome, 'Diğer gelirler', 'income', { group: 'other_income', order: 1 }),

    // Malzeme maliyeti
    cat('cat-malzeme', 'Malzeme (gıda)', 'cogs', 1),
    cat('cat-icecek', 'İçecek', 'cogs', 2),
    cat('cat-ambalaj', 'Ambalaj', 'cogs', 3),

    // Personel
    cat(SYS.salary, 'Maaş', 'labor', 1, { system: true }),
    cat(SYS.advance, 'Avans', 'labor', 2, { system: true }),
    cat(SYS.daily, 'Yevmiye (geçici personel)', 'labor', 3, { system: true }),
    cat(SYS.bonus, 'Prim / bahşiş', 'labor', 4, { system: true }),
    cat('cat-sgk', 'SGK primi', 'labor', 5),
    cat('cat-personel-yemek', 'Personel yemeği', 'labor', 6),

    // İşletme giderleri
    cat('cat-temizlik', 'Temizlik', 'operating', 1),
    cat('cat-mutfak', 'Mutfak gereçleri', 'operating', 2),
    cat('cat-bakim', 'Bakım ve onarım', 'operating', 3),
    cat('cat-arac', 'Araç (yakıt, bakım, park)', 'operating', 4),
    cat('cat-ulasim', 'Ulaşım', 'operating', 5),
    cat('cat-enerji', 'Elektrik, su, doğalgaz', 'operating', 6),
    cat('cat-iletisim', 'İnternet ve telefon', 'operating', 7),
    cat('cat-pazarlama', 'Reklam ve pazarlama', 'operating', 8),
    cat('cat-muhasebe', 'Muhasebe ve danışmanlık', 'operating', 9),
    cat(SYS.other, 'Diğer', 'operating', 99, { system: true }),

    // Kira
    cat('cat-kira', 'Kira', 'occupancy', 1),

    // Komisyon ve banka
    cat(SYS.feePos, 'POS komisyonu', 'fees', 1, { system: true }),
    cat(SYS.feeMeal, 'Yemek kartı komisyonu', 'fees', 2, { system: true }),
    cat('cat-banka', 'Banka masrafları ve faiz', 'fees', 3),

    // Vergi
    cat('cat-vergi', 'Vergi ve harçlar', 'tax', 1),

    // Fark
    a(SYS.variance, 'Kasa / hesap farkı', 'expense', { group: 'variance', system: true }),

    // Yatırım
    cat('cat-demirbas', 'Demirbaş', 'capex', 1),
  ];
}

const MEAL_CARDS: Array<[string, string]> = [
  ['sodexo', 'Sodexo (Pluxee)'],
  ['ticket', 'Ticket (Edenred)'],
  ['multinet', 'Multinet'],
  ['setcard', 'Setcard'],
  ['metropol', 'Metropol'],
  ['tokenflex', 'TokenFlex'],
];

export function defaultPaymentMethods(): { methods: PaymentMethod[]; receivables: Account[] } {
  const now = Date.now();
  const methods: PaymentMethod[] = [
    { id: 'pm-akbank', name: 'Akbank POS', type: 'pos', settleMode: 'direct', targetAccountId: 'acc-akbank', order: 1 },
    { id: 'pm-tfkb', name: 'Türkiye Finans POS', type: 'pos', settleMode: 'direct', targetAccountId: 'acc-tfkb', order: 2 },
    { id: 'pm-vakif', name: 'Vakıfbank POS', type: 'pos', settleMode: 'direct', targetAccountId: 'acc-vakif', order: 3 },
    { id: 'pm-nakit', name: 'Nakit', type: 'cash', settleMode: 'direct', targetAccountId: SYS.kasa, order: 4 },
  ];
  const receivables: Account[] = [];
  MEAL_CARDS.forEach(([key, name], i) => {
    const accId = `acc-recv-${key}`;
    methods.push({
      id: `pm-${key}`,
      name,
      type: 'meal_card',
      settleMode: 'receivable',
      targetAccountId: accId,
      collectAccountId: 'acc-akbank',
      order: 10 + i,
    });
    receivables.push({ id: accId, name: `${name} alacağı`, kind: 'receivable', paymentMethodId: `pm-${key}`, system: true, createdAt: now });
  });
  return { methods, receivables };
}

export function defaultContacts(now = Date.now()): Contact[] {
  return [{ id: OWNER_CONTACT_ID, name: 'İşletme sahibi', type: 'owner', createdAt: now }];
}
