// lib/sqlite.ts
import Database from '@tauri-apps/plugin-sql';
import { appLocalDataDir, join } from '@tauri-apps/api/path';

const isTauri = () =>
  typeof window !== 'undefined' &&
  ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

let dbInstance: Database | null = null;

export async function getDb() {
  if (!isTauri()) {
    console.warn('⚠️ Modo Navegador: SQLite simulado.');
    return {
      select: async <T>(_query: string, _bindValues?: unknown[]): Promise<T> => [] as unknown as T,
      execute: async (_query: string, _bindValues?: unknown[]) => ({ rowsAffected: 0, lastInsertId: 0 }),
    } as unknown as Database;
  }

  if (dbInstance) return dbInstance;

  // Arreglamos las barras invertidas de Windows
  const rawPath = await join(await appLocalDataDir(), 'depa_data.db');
  const safePath = rawPath.replace(/\\/g, '/');
  const dbUrl = `sqlite:${safePath}`;

  console.log('✅ Conectando a SQLite en:', dbUrl);

  try {
    dbInstance = await Database.load(dbUrl);

    // Crear tablas
    await dbInstance.execute(`CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, name TEXT, category TEXT, subcategory TEXT, price REAL, priority TEXT, bought INTEGER, wishlist INTEGER, createdAt INTEGER, purchaseUrl TEXT, imageUrl TEXT, imageData TEXT, storeName TEXT, storeLocation TEXT, dimensions TEXT, installments TEXT, purchaseMonth TEXT, notes TEXT, brand TEXT, model TEXT, color TEXT, warranty TEXT, orderNumber TEXT);`);
    await dbInstance.execute(`CREATE TABLE IF NOT EXISTS categories (name TEXT PRIMARY KEY);`);
    await dbInstance.execute(`CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, name TEXT, type TEXT, balance REAL, color TEXT, createdAt INTEGER);`);
    await dbInstance.execute(`CREATE TABLE IF NOT EXISTS transactions (id TEXT PRIMARY KEY, accountId TEXT, destinationAccountId TEXT, type TEXT, amount REAL, date INTEGER, category TEXT, notes TEXT, linkedItemId TEXT);`);
    await dbInstance.execute(`CREATE TABLE IF NOT EXISTS savings_goals (id TEXT PRIMARY KEY, name TEXT NOT NULL, targetAmount REAL NOT NULL DEFAULT 0, currentAmount REAL NOT NULL DEFAULT 0, color TEXT NOT NULL DEFAULT 'accent', deadline TEXT, createdAt INTEGER NOT NULL);`);

    return dbInstance;
  } catch (error) {
    console.error('❌ Error crítico al inicializar SQLite:', error);
    throw error;
  }
}