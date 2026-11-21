import { useEffect, useState, type ReactNode } from 'react';
import { Delete, Lock } from 'lucide-react';
import { useData } from '../../state/data';
import { hashPin } from '../../lib/pin';
import { cx } from '../../ui';

const LOCK_EVENT = 'mamas-lock';
const IDLE_LOCK_MS = 5 * 60 * 1000;

export function lockApp() {
  window.dispatchEvent(new Event(LOCK_EVENT));
}

export function PinGate({ children }: { children: ReactNode }) {
  const data = useData();
  const pinHash = data.settings.pinHash as string | undefined;
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    let hiddenAt = 0;
    const onVis = () => {
      if (document.hidden) hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > IDLE_LOCK_MS) setUnlocked(false);
    };
    const onLock = () => setUnlocked(false);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener(LOCK_EVENT, onLock);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener(LOCK_EVENT, onLock);
    };
  }, []);

  if (!pinHash || unlocked) return <>{children}</>;
  return <PinScreen pinHash={pinHash} onUnlock={() => setUnlocked(true)} />;
}

function PinScreen({ pinHash, onUnlock }: { pinHash: string; onUnlock: () => void }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    if (pin.length !== 4) return;
    let cancelled = false;
    hashPin(pin).then((h) => {
      if (cancelled) return;
      if (h === pinHash) onUnlock();
      else {
        setError(true);
        setTimeout(() => {
          setPin('');
          setError(false);
        }, 600);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [pin, pinHash, onUnlock]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) setPin((p) => (p.length < 4 ? p + e.key : p));
      if (e.key === 'Backspace') setPin((p) => p.slice(0, -1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const press = (d: string) => setPin((p) => (p.length < 4 ? p + d : p));
  return (
    <div className="flex h-full flex-col items-center justify-center bg-ink-50 px-6 pt-safe">
      <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="mb-4 h-16 w-16 rounded-2xl" />
      <h1 className="text-xl font-bold text-ink-900">Mama&apos;s Burger Muhasebe</h1>
      <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-500">
        <Lock className="h-4 w-4" /> Devam etmek için şifrenizi girin
      </p>
      <div className={cx('my-8 flex gap-4', error && 'animate-[shake_0.3s]')}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={cx('h-4 w-4 rounded-full border-2', error ? 'border-red-500 bg-red-500' : i < pin.length ? 'border-brand-700 bg-brand-700' : 'border-ink-300')} />
        ))}
      </div>
      {error && <p className="-mt-4 mb-4 text-sm font-medium text-red-700">Şifre yanlış</p>}
      <div className="grid grid-cols-3 gap-4">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} onClick={() => press(d)} className="h-16 w-16 rounded-full bg-white text-2xl font-semibold text-ink-900 shadow-sm ring-1 ring-ink-200 active:bg-ink-100">
            {d}
          </button>
        ))}
        <span />
        <button onClick={() => press('0')} className="h-16 w-16 rounded-full bg-white text-2xl font-semibold text-ink-900 shadow-sm ring-1 ring-ink-200 active:bg-ink-100">
          0
        </button>
        <button onClick={() => setPin((p) => p.slice(0, -1))} aria-label="Sil" className="flex h-16 w-16 items-center justify-center rounded-full text-ink-600 active:bg-ink-100">
          <Delete className="h-6 w-6" />
        </button>
      </div>
    </div>
  );
}
