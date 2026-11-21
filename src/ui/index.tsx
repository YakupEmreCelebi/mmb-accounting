import { forwardRef, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, Info, X } from 'lucide-react';
import { formatAmountInput, formatTL, parseAmount, type Kurus } from '../lib/money';
import { useUI } from '../state/ui';

export function cx(...c: Array<string | false | null | undefined>): string {
  return c.filter(Boolean).join(' ');
}

// ------------------------------------------------------------------ buttons
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
  block?: boolean;
}

const VARIANT: Record<Variant, string> = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800 active:bg-brand-900 shadow-sm disabled:bg-brand-300',
  secondary: 'bg-white text-ink-800 border border-ink-200 hover:bg-ink-50 active:bg-ink-100 disabled:text-ink-400',
  ghost: 'bg-transparent text-ink-700 hover:bg-ink-100 active:bg-ink-200 disabled:text-ink-400',
  danger: 'bg-white text-red-700 border border-red-200 hover:bg-red-50 active:bg-red-100 disabled:text-red-300',
  subtle: 'bg-brand-50 text-brand-800 hover:bg-brand-100 active:bg-brand-200 disabled:text-brand-300',
};

const SIZE = { sm: 'h-9 px-3 text-sm rounded-lg gap-1.5', md: 'h-11 px-4 text-[15px] rounded-xl gap-2', lg: 'h-12 px-5 text-base rounded-xl gap-2' };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, block, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(
        'inline-flex select-none items-center justify-center whitespace-nowrap font-semibold transition disabled:cursor-not-allowed',
        VARIANT[variant],
        SIZE[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
});

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx('inline-flex h-10 w-10 items-center justify-center rounded-xl text-ink-600 hover:bg-ink-100 active:bg-ink-200', className)}
      {...rest}
    >
      {children}
    </button>
  );
}

// ------------------------------------------------------------------ layout bits
export function Card({ className, children, padded = true }: { className?: string; children: ReactNode; padded?: boolean }) {
  return <div className={cx('card', padded && 'p-4 sm:p-5', className)}>{children}</div>;
}

export function CardTitle({ children, action, sub }: { children: ReactNode; action?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div>
        <h3 className="text-base font-semibold text-ink-900">{children}</h3>
        {sub && <p className="mt-0.5 text-sm text-ink-500">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-ink-900 sm:text-[28px]">{title}</h1>
        {sub && <div className="mt-1 text-sm text-ink-500">{sub}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, tone = 'neutral', onClick }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'neutral' | 'good' | 'bad' | 'warn'; onClick?: () => void }) {
  const toneCls = tone === 'good' ? 'text-emerald-700' : tone === 'bad' ? 'text-red-700' : tone === 'warn' ? 'text-amber-700' : 'text-ink-900';
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp onClick={onClick} className={cx('card block w-full p-4 text-left', onClick && 'transition hover:border-ink-300 active:bg-ink-50')}>
      <div className="text-sm font-medium text-ink-500">{label}</div>
      <div className={cx('tabular mt-1 text-2xl font-semibold tracking-tight', toneCls)}>{value}</div>
      {sub && <div className="mt-1 text-sm text-ink-500">{sub}</div>}
    </Comp>
  );
}

export function Badge({ tone = 'neutral', children, className }: { tone?: 'neutral' | 'green' | 'red' | 'amber' | 'blue' | 'brand'; children: ReactNode; className?: string }) {
  const t = {
    neutral: 'bg-ink-100 text-ink-700',
    green: 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200',
    red: 'bg-red-50 text-red-800 ring-1 ring-inset ring-red-200',
    amber: 'bg-amber-50 text-amber-900 ring-1 ring-inset ring-amber-200',
    blue: 'bg-sky-50 text-sky-800 ring-1 ring-inset ring-sky-200',
    brand: 'bg-brand-50 text-brand-800 ring-1 ring-inset ring-brand-200',
  }[tone];
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold', t, className)}>{children}</span>;
}

export function Money({ value, className, tone, decimals = 'always' }: { value: Kurus; className?: string; tone?: 'auto' | 'none'; decimals?: 'always' | 'auto' | 'never' }) {
  const color = tone === 'auto' ? (value < 0 ? 'text-red-700' : value > 0 ? 'text-emerald-700' : '') : '';
  return <span className={cx('tabular whitespace-nowrap', color, className)}>{formatTL(value, decimals)}</span>;
}

export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      {icon && <div className="mb-3 text-ink-300">{icon}</div>}
      <div className="font-semibold text-ink-800">{title}</div>
      {text && <div className="mt-1 max-w-md text-sm text-ink-500">{text}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Notice({ tone = 'info', children, action }: { tone?: 'info' | 'warn' | 'error' | 'success'; children: ReactNode; action?: ReactNode }) {
  const cls = {
    info: 'border-sky-200 bg-sky-50 text-sky-900',
    warn: 'border-amber-200 bg-amber-50 text-amber-900',
    error: 'border-red-200 bg-red-50 text-red-900',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  }[tone];
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'info' ? Info : AlertTriangle;
  return (
    <div className={cx('flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-sm', cls)}>
      <Icon className="h-5 w-5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  );
}

export function Tabs<T extends string>({ items, value, onChange, className }: { items: Array<{ key: T; label: string; count?: number }>; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cx('-mx-1 flex gap-1 overflow-x-auto px-1 pb-1', className)} role="tablist">
      {items.map((it) => (
        <button
          key={it.key}
          role="tab"
          aria-selected={value === it.key}
          onClick={() => onChange(it.key)}
          className={cx(
            'inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition',
            value === it.key ? 'bg-ink-900 text-white' : 'bg-white text-ink-700 ring-1 ring-inset ring-ink-200 hover:bg-ink-50',
          )}
        >
          {it.label}
          {it.count !== undefined && (
            <span className={cx('rounded-full px-1.5 text-xs', value === it.key ? 'bg-white/20' : 'bg-ink-100 text-ink-600')}>{it.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ form controls
export function Field({ label, hint, error, children, className, htmlFor }: { label?: ReactNode; hint?: ReactNode; error?: ReactNode; children: ReactNode; className?: string; htmlFor?: string }) {
  return (
    <div className={className}>
      {label && (
        <label className="label" htmlFor={htmlFor}>
          {label}
        </label>
      )}
      {children}
      {error ? <p className="mt-1 text-sm text-red-700">{error}</p> : hint ? <p className="mt-1 text-sm text-ink-500">{hint}</p> : null}
    </div>
  );
}

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function TextInput({ className, ...rest }, ref) {
  return <input ref={ref} className={cx('input', className)} {...rest} />;
});

export function TextArea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx('input h-auto min-h-[88px] py-2.5', className)} {...rest} />;
}

export function DateInput({ value, onChange, id, max, min }: { value: string; onChange: (v: string) => void; id?: string; max?: string; min?: string }) {
  return <input id={id} type="date" className="input" value={value} max={max} min={min} onChange={(e) => e.target.value && onChange(e.target.value)} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={cx('input appearance-none pr-10', className)} {...rest}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400" aria-hidden />
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, size = 'md' }: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: string }>; size?: 'sm' | 'md' }) {
  return (
    <div className="flex w-full rounded-xl bg-ink-100 p-1" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'flex-1 rounded-lg px-2 font-semibold transition',
            size === 'sm' ? 'h-9 text-sm' : 'h-10 text-sm sm:text-[15px]',
            value === o.value ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-600 hover:text-ink-900',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, id }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; id?: string }) {
  const autoId = useId();
  const tid = id ?? autoId;
  return (
    <label htmlFor={tid} className="inline-flex cursor-pointer select-none items-center gap-3">
      <button
        id={tid}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx('relative h-7 w-12 shrink-0 rounded-full transition', checked ? 'bg-brand-600' : 'bg-ink-300')}
      >
        <span className={cx('absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition', checked ? 'left-[22px]' : 'left-0.5')} />
      </button>
      {label && <span className="text-[15px] text-ink-800">{label}</span>}
    </label>
  );
}

/**
 * Amount input that understands "1.500", "412,35" and sums like "400+150".
 * Keeps its own text while typing; reports parsed kuruş (or null) upward.
 */
export function MoneyInput({
  value,
  onChange,
  id,
  placeholder = '0',
  allowNegative = false,
  autoFocus,
  size = 'md',
  className,
  disabled,
}: {
  value: Kurus | null;
  onChange: (v: Kurus | null) => void;
  id?: string;
  placeholder?: string;
  allowNegative?: boolean;
  autoFocus?: boolean;
  size?: 'md' | 'lg';
  className?: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState(() => formatAmountInput(value));
  const lastEmitted = useRef<Kurus | null>(value);
  useEffect(() => {
    if (value !== lastEmitted.current) {
      setText(formatAmountInput(value));
      lastEmitted.current = value;
    }
  }, [value]);
  const parsed = text.trim() ? parseAmount(text) : null;
  const invalid = text.trim() !== '' && (parsed === null || (!allowNegative && parsed < 0));
  const showSum = !invalid && parsed !== null && /\+/.test(text);
  return (
    <div className={className}>
      <div className="relative">
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          enterKeyHint="done"
          autoFocus={autoFocus}
          disabled={disabled}
          placeholder={placeholder}
          className={cx('input tabular pr-9 text-right', size === 'lg' && 'h-14 text-xl font-semibold', invalid && 'border-red-400 focus:border-red-500 focus:ring-red-100')}
          value={text}
          onChange={(e) => {
            const t = e.target.value;
            setText(t);
            const p = t.trim() ? parseAmount(t) : null;
            const ok = p !== null && (allowNegative || p >= 0);
            const next = ok ? p : null;
            lastEmitted.current = next;
            onChange(next);
          }}
          onBlur={() => {
            if (parsed !== null && !invalid && !/\+/.test(text)) setText(formatAmountInput(parsed));
          }}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-400">₺</span>
      </div>
      {invalid && <p className="mt-1 text-sm text-red-700">Tutar anlaşılamadı. Örnek: 1.500 veya 412,35</p>}
      {showSum && <p className="tabular mt-1 text-right text-sm text-ink-500">= {formatTL(parsed!)}</p>}
    </div>
  );
}

// ------------------------------------------------------------------ overlays
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  dismissable = true,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  dismissable?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && dismissable && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose, dismissable]);
  if (!open) return null;
  const width = { sm: 'sm:max-w-md', md: 'sm:max-w-xl', lg: 'sm:max-w-3xl', xl: 'sm:max-w-5xl' }[size];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink-900/40 backdrop-blur-[1px]" onClick={() => dismissable && onClose()} />
      <div className={cx('relative flex max-h-[100dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-h-[88vh] sm:rounded-3xl', width)}>
        <div className="flex items-center justify-between gap-3 border-b border-ink-100 px-5 py-4 pt-safe sm:pt-4">
          <h2 className="min-w-0 truncate text-lg font-semibold text-ink-900">{title}</h2>
          <IconButton label="Kapat" onClick={onClose}>
            <X className="h-5 w-5" />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-ink-100 bg-ink-50/60 px-5 py-3 pb-safe sm:pb-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Toaster() {
  const { toasts } = useUI();
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={cx(
            'pointer-events-auto flex max-w-lg items-start gap-2 rounded-xl px-4 py-3 text-sm font-medium shadow-lg',
            t.kind === 'error' ? 'bg-red-700 text-white' : t.kind === 'info' ? 'bg-ink-800 text-white' : 'bg-emerald-700 text-white',
          )}
        >
          {t.kind === 'error' ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}

export function ConfirmHost() {
  const { confirmState, resolveConfirm } = useUI();
  if (!confirmState) return null;
  return (
    <Modal
      open
      size="sm"
      onClose={() => resolveConfirm(false)}
      title={confirmState.title}
      footer={
        <>
          <Button onClick={() => resolveConfirm(false)}>{confirmState.cancelText ?? 'Vazgeç'}</Button>
          <Button variant={confirmState.danger ? 'danger' : 'primary'} onClick={() => resolveConfirm(true)}>
            {confirmState.confirmText ?? 'Onayla'}
          </Button>
        </>
      }
    >
      {confirmState.message && <p className="text-[15px] leading-relaxed text-ink-700">{confirmState.message}</p>}
    </Modal>
  );
}

export function Splash({ text = 'Yükleniyor…' }: { text?: string }) {
  return (
    <div className="flex h-full items-center justify-center text-ink-500">
      <div className="flex items-center gap-3">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
        {text}
      </div>
    </div>
  );
}

/** Simple definition list row used in detail views. */
export function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div className="text-sm text-ink-500">{label}</div>
      <div className="text-right text-[15px] text-ink-900">{children}</div>
    </div>
  );
}
