/** Wrong-PIN policy: a few free tries, then waits that grow with each further mistake. */
export const FREE_ATTEMPTS = 5;
const WAIT_SECONDS = [30, 60, 120, 300, 900];

export interface PinFailures {
  count: number;
  lockedUntil: number;
}

export const NO_FAILURES: PinFailures = { count: 0, lockedUntil: 0 };

/** Seconds to wait after the given number of consecutive wrong attempts. */
export function lockSecondsAfter(failCount: number): number {
  if (failCount < FREE_ATTEMPTS) return 0;
  return WAIT_SECONDS[Math.min(failCount - FREE_ATTEMPTS, WAIT_SECONDS.length - 1)];
}

export function registerFailure(prev: PinFailures, now: number): PinFailures {
  const count = prev.count + 1;
  const wait = lockSecondsAfter(count);
  return { count, lockedUntil: wait ? now + wait * 1000 : 0 };
}

export function formatWait(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m ? `${m} dk ${String(s).padStart(2, '0')} sn` : `${s} sn`;
}
