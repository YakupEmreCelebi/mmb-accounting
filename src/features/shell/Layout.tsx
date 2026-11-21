import type { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Lock, Menu, Plus, ShieldCheck, AlertTriangle } from 'lucide-react';
import { useData } from '../../state/data';
import { useUI } from '../../state/ui';
import { cx } from '../../ui';
import { NAV } from './nav';
import { lockApp } from './PinGate';
import { backupAge } from '../settings/backup';

function Brand() {
  return (
    <div className="flex items-center gap-3 md:justify-center md:px-0 lg:justify-start lg:px-2">
      <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-10 w-10 rounded-xl" />
      <div className="leading-tight md:hidden lg:block">
        <div className="text-[15px] font-bold text-ink-900">Mama&apos;s Burger</div>
        <div className="text-xs font-medium text-ink-500">Muhasebe</div>
      </div>
    </div>
  );
}

function BackupStatus() {
  const data = useData();
  const age = backupAge(data);
  const hasPin = Boolean(data.settings.pinHash);
  return (
    <div className="space-y-2">
      <NavLink
        to="/ayarlar?b=yedek"
        title={age.label}
        className={cx(
          'flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium md:justify-center lg:justify-start',
          age.stale ? 'bg-amber-50 text-amber-900 ring-1 ring-inset ring-amber-200' : 'text-ink-600 hover:bg-ink-100',
        )}
      >
        {age.stale ? <AlertTriangle className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4 text-emerald-700" />}
        <span className="truncate md:hidden lg:inline">{age.label}</span>
      </NavLink>
      {hasPin && (
        <button onClick={lockApp} title="Kilitle" className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-ink-600 hover:bg-ink-100 md:justify-center lg:justify-start">
          <Lock className="h-4 w-4" /> <span className="md:hidden lg:inline">Kilitle</span>
        </button>
      )}
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { openMenu } = useUI();
  const loc = useLocation();
  return (
    <div className="flex h-full">
      {/* Sidebar (iPad and up) */}
      <aside className="hidden shrink-0 flex-col border-r border-ink-200/80 bg-white pt-safe md:flex md:w-[88px] lg:w-64">
        <div className="px-3 pb-4 pt-5 lg:px-4">
          <Brand />
        </div>
        <div className="px-3 lg:px-4">
          <button
            onClick={() => openMenu()}
            title="Yeni işlem"
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-700 font-semibold text-white shadow-sm hover:bg-brand-800 active:bg-brand-900"
          >
            <Plus className="h-5 w-5" /> <span className="md:hidden lg:inline">Yeni işlem</span>
          </button>
        </div>
        <nav className="mt-4 flex-1 space-y-1 overflow-y-auto px-3">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              title={n.label}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition md:h-14 md:flex-col md:justify-center md:gap-0.5 md:px-1 md:text-[11px] lg:h-11 lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:text-[15px]',
                  isActive ? 'bg-brand-50 text-brand-800' : 'text-ink-700 hover:bg-ink-100',
                )
              }
            >
              <n.icon className="h-5 w-5 shrink-0" />
              <span className="max-w-full truncate md:hidden lg:inline">{n.label}</span>
              <span className="hidden max-w-full truncate md:inline lg:hidden">{n.short}</span>
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-ink-100 p-3 pb-safe">
          <BackupStatus />
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-ink-200/80 bg-white px-4 py-3 pt-safe md:hidden">
          <Brand />
          <button onClick={() => openMenu()} className="flex h-10 items-center gap-1.5 rounded-xl bg-brand-700 px-3 text-sm font-semibold text-white">
            <Plus className="h-4 w-4" /> Yeni
          </button>
        </header>
        <main key={loc.pathname} className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-6xl px-4 py-5 pb-28 sm:px-6 md:pb-10 lg:px-8">{children}</div>
        </main>
        {/* Bottom tab bar (phones) */}
        <nav className="grid grid-cols-5 border-t border-ink-200 bg-white pb-safe md:hidden">
          {[NAV[0], NAV[1], NAV[2], NAV[3]].map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => cx('flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium', isActive ? 'text-brand-700' : 'text-ink-500')}>
              <n.icon className="h-5 w-5" />
              {n.label}
            </NavLink>
          ))}
          <NavLink to="/menu" className={({ isActive }) => cx('flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium', isActive ? 'text-brand-700' : 'text-ink-500')}>
            <Menu className="h-5 w-5" />
            Diğer
          </NavLink>
        </nav>
      </div>
    </div>
  );
}
