// lib/sqlite.ts
import Database from '@tauri-apps/plugin-sql';
import { appLocalDataDir, join } from '@tauri-apps/api/path';

const isTauri = () =>
  typeof window !== 'undefined' &&
  ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

let dbPromise: Promise<Database> | null = null;

export async function getDb(): Promise<Database> {
  if (!isTauri()) {
    return {
      select: async <T>(_query: string, _bindValues?: unknown[]): Promise<T> => [] as unknown as T,
      execute: async (_query: string, _bindValues?: unknown[]) => ({ rowsAffected: 0, lastInsertId: 0 }),
    } as unknown as Database;
  }

  if (dbPromise) return dbPromise;

  dbPromise = (async () => {
    const rawPath = await join(await appLocalDataDir(), 'depa_data.db');
    const safePath = rawPath.replace(/\\/g, '/');
    const dbUrl = `sqlite:${safePath}`;

    const db = await Database.load(dbUrl);

    // WAL permite lecturas concurrentes sin bloquear escrituras y busy_timeout
    // evita que SQLITE_BUSY falle de inmediato ante contención en el pool.
    await db.execute('PRAGMA journal_mode = WAL;');
    await db.execute('PRAGMA synchronous = NORMAL;');
    await db.execute('PRAGMA busy_timeout = 5000;');

    return db;
  })().catch((error) => {
    dbPromise = null;
    console.error('❌ Error crítico al inicializar SQLite:', error);
    throw error;
  });

  return dbPromise;
}