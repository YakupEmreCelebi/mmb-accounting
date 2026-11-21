import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { PageHeader } from '../../ui';
import { NAV } from './nav';

export function MobileMenu() {
  return (
    <>
      <PageHeader title="Menü" />
      <div className="card divide-y divide-ink-100">
        {NAV.map((n) => (
          <Link key={n.to} to={n.to} className="flex items-center gap-3 px-4 py-4 text-[15px] font-medium text-ink-800 active:bg-ink-50">
            <n.icon className="h-5 w-5 text-ink-500" />
            <span className="flex-1">{n.label}</span>
            <ChevronRight className="h-5 w-5 text-ink-300" />
          </Link>
        ))}
      </div>
    </>
  );
}
