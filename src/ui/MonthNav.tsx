import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addMonths, formatMonth, monthKey, todayISO } from '../lib/dates';

export function MonthNav({ value, onChange, allowFuture = false }: { value: string; onChange: (m: string) => void; allowFuture?: boolean }) {
  const current = monthKey(todayISO());
  const atEnd = !allowFuture && value >= current;
  return (
    <div className="inline-flex h-11 items-center rounded-xl bg-white ring-1 ring-inset ring-ink-200">
      <button aria-label="Önceki ay" onClick={() => onChange(addMonths(value, -1))} className="flex h-11 w-11 items-center justify-center rounded-l-xl text-ink-600 hover:bg-ink-50 active:bg-ink-100">
        <ChevronLeft className="h-5 w-5" />
      </button>
      <span className="min-w-[128px] text-center text-[15px] font-semibold text-ink-900">{formatMonth(value)}</span>
      <button
        aria-label="Sonraki ay"
        disabled={atEnd}
        onClick={() => onChange(addMonths(value, 1))}
        className="flex h-11 w-11 items-center justify-center rounded-r-xl text-ink-600 hover:bg-ink-50 active:bg-ink-100 disabled:text-ink-300"
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  );
}
