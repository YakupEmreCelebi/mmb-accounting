import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '../../ui';

/** Shown when a new version has been downloaded; the user decides when to reload. */
export function UpdateBanner() {
  const [apply, setApply] = useState<null | (() => void)>(null);
  useEffect(() => {
    const on = (e: Event) => setApply(() => (e as CustomEvent<() => void>).detail);
    window.addEventListener('mamas-update-ready', on);
    return () => window.removeEventListener('mamas-update-ready', on);
  }, []);
  if (!apply) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-[70] flex justify-center px-4 pt-safe">
      <div className="mt-3 flex items-center gap-3 rounded-2xl bg-ink-900 px-4 py-3 text-sm text-white shadow-xl">
        <RefreshCw className="h-4 w-4" />
        Uygulamanın yeni sürümü hazır.
        <Button size="sm" variant="primary" onClick={() => apply()}>
          Güncelle
        </Button>
      </div>
    </div>
  );
}
