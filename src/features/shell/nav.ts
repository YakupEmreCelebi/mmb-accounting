import { BarChart3, CalendarCheck, LayoutDashboard, ListOrdered, Settings, Users, Wallet, type LucideIcon } from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  /** Label for the narrow iPad-portrait sidebar. */
  short: string;
  icon: LucideIcon;
}

export const NAV: NavItem[] = [
  { to: '/', label: 'Ana sayfa', short: 'Özet', icon: LayoutDashboard },
  { to: '/gun-sonu', label: 'Gün sonu', short: 'Gün sonu', icon: CalendarCheck },
  { to: '/hareketler', label: 'Hareketler', short: 'Hareket', icon: ListOrdered },
  { to: '/cariler', label: 'Cariler', short: 'Cariler', icon: Users },
  { to: '/hesaplar', label: 'Kasa ve hesaplar', short: 'Kasa', icon: Wallet },
  { to: '/raporlar', label: 'Raporlar', short: 'Rapor', icon: BarChart3 },
  { to: '/ayarlar', label: 'Ayarlar', short: 'Ayarlar', icon: Settings },
];
