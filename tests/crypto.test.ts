import { describe, expect, it } from 'vitest';
import { DecryptError, decryptText, encryptText } from '../src/lib/crypto';
import { FREE_ATTEMPTS, NO_FAILURES, lockSecondsAfter, registerFailure } from '../src/lib/pinPolicy';

const ITER = 100_000; // keep tests fast; the app uses 600.000

describe('backup encryption', () => {
  it('round-trips with the right passphrase and hides the content', async () => {
    const secret = JSON.stringify({ hello: 'Kasa 1.234,56 ₺ — çğışöü' });
    const env = await encryptText(secret, 'uzun bir parola cümlesi', ITER);
    expect(env.data).not.toContain('Kasa');
    expect(atob(env.data)).not.toContain('Kasa');
    expect(await decryptText(env, 'uzun bir parola cümlesi')).toBe(secret);
  });

  it('uses a fresh salt and IV every time', async () => {
    const a = await encryptText('x', 'parola123', ITER);
    const b = await encryptText('x', 'parola123', ITER);
    expect(a.salt).not.toBe(b.salt);
    expect(a.iv).not.toBe(b.iv);
  });

  it('rejects a wrong passphrase and tampered data', async () => {
    const env = await encryptText('gizli', 'dogru-parola', ITER);
    await expect(decryptText(env, 'yanlis-parola')).rejects.toBeInstanceOf(DecryptError);
    const bytes = Uint8Array.from(atob(env.data), (c) => c.charCodeAt(0));
    bytes[0] ^= 1;
    const tampered = { ...env, data: btoa(String.fromCharCode(...bytes)) };
    await expect(decryptText(tampered, 'dogru-parola')).rejects.toBeInstanceOf(DecryptError);
  });

  it('refuses unreasonable iteration counts', async () => {
    const env = await encryptText('x', 'parola123', ITER);
    await expect(decryptText({ ...env, iterations: 10 }, 'parola123')).rejects.toBeInstanceOf(DecryptError);
    await expect(decryptText({ ...env, iterations: 50_000_000 }, 'parola123')).rejects.toBeInstanceOf(DecryptError);
  });
});

describe('wrong PIN policy', () => {
  it('allows a few free attempts, then waits that grow and cap', () => {
    expect(FREE_ATTEMPTS).toBe(5);
    expect([1, 2, 3, 4].map(lockSecondsAfter)).toEqual([0, 0, 0, 0]);
    expect([5, 6, 7, 8, 9, 10, 20].map(lockSecondsAfter)).toEqual([30, 60, 120, 300, 900, 900, 900]);
  });

  it('records failures with a lock deadline', () => {
    let f = NO_FAILURES;
    for (let i = 0; i < 4; i++) f = registerFailure(f, 1000);
    expect(f).toEqual({ count: 4, lockedUntil: 0 });
    f = registerFailure(f, 1000);
    expect(f).toEqual({ count: 5, lockedUntil: 1000 + 30_000 });
  });
});
