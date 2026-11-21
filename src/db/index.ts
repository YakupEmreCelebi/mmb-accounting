import { AppDB } from './db';
import { Repo } from './repo';

export const db = new AppDB();
export const repo = new Repo(db);
export { AppDB } from './db';
export { Repo, LockedError, validateBackup, type BackupFile } from './repo';
