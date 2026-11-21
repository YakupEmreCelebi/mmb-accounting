import { repo } from '../../db';
import { BACKUP_APP, BACKUP_VERSION } from '../../db/repo';
import { decryptText, encryptText, type EncryptedEnvelope } from '../../lib/crypto';
import { shareOrDownload, stamp } from '../../lib/share';
import type { AppData } from '../../state/data';

export interface EncryptedBackupFile {
  app: typeof BACKUP_APP;
  format: 'encrypted';
  version: number;
  exportedAt: string;
  enc: EncryptedEnvelope;
}

export interface PreparedBackup {
  blob: Blob;
  filename: string;
  encrypted: boolean;
}

export function backupAge(data: AppData): { stale: boolean; label: string; at?: number } {
  const at = data.settings.lastBackupAt as number | undefined;
  const hasData = data.txns.length > 0;
  if (!at) return { stale: hasData, label: hasData ? 'Hiç yedek alınmadı' : 'Henüz kayıt yok' };
  const hours = (Date.now() - at) / 3600000;
  const d = new Date(at);
  const time = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const sameDay = d.toDateString() === new Date().toDateString();
  const label = sameDay ? `Son yedek: bugün ${time}` : `Son yedek: ${d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} ${time}`;
  return { stale: hours > 26, label, at };
}

/**
 * Builds the backup file now (call shareBackup from a tap right after, so the share sheet is allowed to open).
 * When a backup passphrase is set on this device the file is encrypted with it.
 */
export async function prepareBackup(): Promise<PreparedBackup> {
  const b = await repo.exportBackup();
  const json = JSON.stringify(b);
  const passphrase = await repo.getSetting<string | null>('backupPassphrase', null);
  if (passphrase) {
    const file: EncryptedBackupFile = { app: BACKUP_APP, format: 'encrypted', version: BACKUP_VERSION, exportedAt: b.exportedAt, enc: await encryptText(json, passphrase) };
    return { blob: new Blob([JSON.stringify(file)], { type: 'application/json' }), filename: `mamas-burger-yedek-sifreli_${stamp()}.json`, encrypted: true };
  }
  return { blob: new Blob([json], { type: 'application/json' }), filename: `mamas-burger-yedek_${stamp()}.json`, encrypted: false };
}

export async function shareBackup(prepared: PreparedBackup): Promise<boolean> {
  const r = await shareOrDownload(prepared.blob, prepared.filename);
  if (r === 'cancelled') return false;
  await repo.setSetting('lastBackupAt', Date.now());
  return true;
}

export async function readBackupFile(file: File): Promise<unknown> {
  const text = await file.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Dosya okunamadı: geçerli bir yedek değil.');
  }
}

export function isEncryptedBackup(x: unknown): x is EncryptedBackupFile {
  const f = x as EncryptedBackupFile;
  return Boolean(f && typeof f === 'object' && f.app === BACKUP_APP && f.format === 'encrypted' && f.enc);
}

/** Decrypts an encrypted backup and returns the plain backup object (validated later by repo.importBackup). */
export async function decryptBackup(file: EncryptedBackupFile, passphrase: string): Promise<unknown> {
  if (typeof file.version !== 'number' || file.version > BACKUP_VERSION) throw new Error('Yedek dosyası bu uygulama sürümünden daha yeni.');
  const text = await decryptText(file.enc, passphrase);
  return JSON.parse(text);
}
