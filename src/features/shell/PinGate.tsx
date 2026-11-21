import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Delete, Lock, Timer } from 'lucide-react';
import { repo } from '../../db';
import { useData } from '../../state/data';
import { hashPin } from '../../lib/pin';
import { FREE_ATTEMPTS, NO_FAILURES, formatWait, registerFailure, type PinFailures } from '../../lib/pinPolicy';
import { cx } from '../../ui';

const LOCK_EVENT = 'mamas-lock';
const IDLE_LOCK_MS = 5 * 60 * 1000;

export function lockApp() {
  window.dispatchEvent(new Event(LOCK_EVENT));
}

export function PinGate({ children }: { children: ReactNode }) {
  const data = useData();
  const pinHash = data.settings.pinHash as string | undefined;
  const failures = (data.settings.pinFailures as PinFailures | undefined) ?? NO_FAILURES;
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
  return <PinScreen pinHash={pinHash} failures={failures} onUnlock={() => setUnlocked(true)} />;
}

function PinScreen({ pinHash, failures, onUnlock }: { pinHash: string; failures: PinFailures; onUnlock: () => void }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [showHelp, setShowHelp] = useState(false);
  const pinRef = useRef('');
  const busy = useRef(false);
  const failuresRef = useRef(failures);
  failuresRef.current = failures;

  const waitSeconds = Math.max(0, Math.ceil((failures.lockedUntil - now) / 1000));
  const locked = waitSeconds > 0;
  const lockedRef = useRef(locked);
  lockedRef.current = locked;

  // Tick while a wait is running so the countdown updates and the keypad unlocks on time.
  useEffect(() => {
    if (!locked) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [locked]);

  const reset = () => {
    pinRef.current = '';
    setPin('');
  };

  const submit = async (code: string) => {
    busy.current = true;
    const ok = (await hashPin(code)) === pinHash;
    if (ok) {
      await repo.setSetting('pinFailures', NO_FAILURES);
      busy.current = false;
      onUnlock();
      return;
    }
    await repo.setSetting('pinFailures', registerFailure(failuresRef.current, Date.now()));
    setNow(Date.now());
    setError(true);
    setTimeout(() => {
      reset();
      setError(false);
      busy.current = false;
    }, 600);
  };

  const press = (digit: string) => {
    if (lockedRef.current || busy.current || pinRef.current.length >= 4) return;
    pinRef.current += digit;
    setPin(pinRef.current);
    if (pinRef.current.length === 4) void submit(pinRef.current);
  };
  const back = () => {
    if (busy.current) return;
    pinRef.current = pinRef.current.slice(0, -1);
    setPin(pinRef.current);
  };

  const pressRef = useRef(press);
  pressRef.current = press;
  const backRef = useRef(back);
  backRef.current = back;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) pressRef.current(e.key);
      if (e.key === 'Backspace') backRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const left = FREE_ATTEMPTS - failures.count;
  const keyCls = 'h-16 w-16 rounded-full bg-white text-2xl font-semibold text-ink-900 shadow-sm ring-1 ring-ink-200 active:bg-ink-100 disabled:opacity-40';

  return (
    <div className="flex h-full flex-col items-center justify-center overflow-y-auto bg-ink-50 px-6 pt-safe">
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
      <div className="-mt-4 mb-4 min-h-[44px] text-center text-sm font-medium" role="status" aria-live="polite">
        {locked ? (
          <span className="inline-flex items-center gap-1.5 text-red-700">
            <Timer className="h-4 w-4" /> Çok fazla yanlış deneme. {formatWait(waitSeconds)} sonra tekrar deneyin.
          </span>
        ) : error ? (
          <span className="text-red-700">Şifre yanlış</span>
        ) : failures.count > 0 && left > 0 ? (
          <span className="text-amber-800">{left} deneme hakkınız kaldı; sonra bekleme süresi başlar.</span>
        ) : failures.count >= FREE_ATTEMPTS ? (
          <span className="text-amber-800">Bir yanlış denemede daha bekleme süresi uzar.</span>
        ) : null}
      </div>
      <div className="grid grid-cols-3 gap-4">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} disabled={locked} onClick={() => press(d)} className={keyCls}>
            {d}
          </button>
        ))}
        <span />
        <button disabled={locked} onClick={() => press('0')} className={keyCls}>
          0
        </button>
        <button onClick={back} aria-label="Sil" className="flex h-16 w-16 items-center justify-center rounded-full text-ink-600 active:bg-ink-100">
          <Delete className="h-6 w-6" />
        </button>
      </div>
      <button onClick={() => setShowHelp((v) => !v)} className="mt-8 text-sm font-medium text-ink-500 underline-offset-2 hover:underline">
        Şifremi unuttum
      </button>
      {showHelp && (
        <p className="mt-2 max-w-sm pb-6 text-center text-sm text-ink-600">
          Şifre yalnızca bu iPad’de saklanır ve geri alınamaz. Uygulamayı ana ekrandan silip yeniden ekleyin, sonra son yedeği geri yükleyin. Son yedekten sonra girilen kayıtlar kaybolur.
        </p>
      )}
    </div>
  );
}
