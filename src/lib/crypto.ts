/**
 * Passphrase-based encryption for backup files (WebCrypto only, no dependencies).
 * Key: PBKDF2-HMAC-SHA256 (600.000 iterations, random 16-byte salt) → AES-GCM 256 with a random 12-byte IV.
 * AES-GCM is authenticated: a wrong passphrase or a modified file fails to decrypt instead of returning garbage.
 */
const enc = new TextEncoder();
const dec = new TextDecoder();

export const KDF_ITERATIONS = 600_000;
const MIN_ITERATIONS = 100_000;
const MAX_ITERATIONS = 5_000_000;

export interface EncryptedEnvelope {
  alg: 'AES-GCM';
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  salt: string;
  iv: string;
  data: string;
}

export class DecryptError extends Error {}

function toB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function encryptText(plain: string, passphrase: string, iterations = KDF_ITERATIONS): Promise<EncryptedEnvelope> {
  if (!passphrase) throw new Error('Parola boş olamaz.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, iterations);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plain)));
  return { alg: 'AES-GCM', kdf: 'PBKDF2-SHA256', iterations, salt: toB64(salt), iv: toB64(iv), data: toB64(ct) };
}

export async function decryptText(env: EncryptedEnvelope, passphrase: string): Promise<string> {
  if (!env || env.alg !== 'AES-GCM' || env.kdf !== 'PBKDF2-SHA256') throw new DecryptError('Desteklenmeyen şifreleme türü.');
  if (!Number.isInteger(env.iterations) || env.iterations < MIN_ITERATIONS || env.iterations > MAX_ITERATIONS) throw new DecryptError('Geçersiz yedek dosyası.');
  let salt: Uint8Array;
  let iv: Uint8Array;
  let data: Uint8Array;
  try {
    salt = fromB64(env.salt);
    iv = fromB64(env.iv);
    data = fromB64(env.data);
  } catch {
    throw new DecryptError('Yedek dosyası bozuk.');
  }
  const key = await deriveKey(passphrase, salt, env.iterations);
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    return dec.decode(plain);
  } catch {
    throw new DecryptError('Parola yanlış ya da dosya bozuk.');
  }
}
