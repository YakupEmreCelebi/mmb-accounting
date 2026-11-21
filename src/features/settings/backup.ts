import { repo } from '../../db';
import { shareOrDownload, stamp } from '../../lib/share';
import type { AppData } from '../../state/data';

export function backupAge(data: AppData): { stale: boolean; label: string; at?: number } {
  const at = data.settings.lastBackupAt as number | undefined;
  const hasData = data.txns.length > 0;
  if (!at) return { stale: hasData, label: hasData ? 'Hiç yedek alınmadı' : 'Henüz kayıt yok' };
  const hours = (Date.now() - at) / 3600000;
  const d = new Date(at);
  const time = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const label = sameDay ? `Son yedek: bugün ${time}` : `Son yedek: ${d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} ${time}`;
  return { stale: hours > 26, label, at };
}

/** Builds the backup file now; call share() from a click handler right after. */
export async function prepareBackup(): Promise<{ blob: Blob; filename: string }> {
  const b = await repo.exportBackup();
  const blob = new Blob([JSON.stringify(b)], { type: 'application/json' });
  return { blob, filename: `mamas-burger-yedek_${stamp()}.json` };
}

export async function shareBackup(prepared: { blob: Blob; filename: string }): Promise<boolean> {
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
    throw new Error('Dosya okunamadı: geçerli bir yedek (JSON) değil.');
  }
}
