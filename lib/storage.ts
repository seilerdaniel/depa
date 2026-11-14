import { getDb } from './sqlite';
import { STORAGE_KEYS, DEFAULT_PREFS } from './config';
import { normalizeItem, normalizeAccount, normalizeTransaction, normalizeSavingsGoal } from './utils';
import type { Account, Item, Prefs, SavingsGoal, Transaction } from './types';

// ==========================================
// PREFS (localStorage)
// ==========================================
export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.prefs);
    return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(prefs: Prefs) {
  try {
    localStorage.setItem(STORAGE_KEYS.prefs, JSON.stringify(prefs));
  } catch (e) {
    console.warn('Error guardando prefs', e);
  }
}

export function mergeItemCategories(items: Item[], categories: string[]): boolean {
  let changed = false;
  for (const item of items) {
    if (item.category !== 'Otros' && !categories.includes(item.category)) {
      categories.push(item.category);
      changed = true;
    }
  }
  return changed;
}

// ==========================================
// ITEMS (SQLite)
// ==========================================
export async function loadItems(): Promise<Item[]> {
  try {
    const db = await getDb();
    const rows = await db.select<Record<string, unknown>[]>(
      'SELECT * FROM items ORDER BY createdAt DESC'
    );

    return rows
      .map((r: Record<string, unknown>) => ({
        ...r,
        bought: r.bought === 1,
        wishlist: r.wishlist === 1,
        dimensions: r.dimensions ? JSON.parse(String(r.dimensions)) : null,
        installments: r.installments ? JSON.parse(String(r.installments)) : null,
      }))
      .map((r: Record<string, unknown>) => normalizeItem(r))
      .filter((i: Item | null): i is Item => i !== null);
  } catch (e) {
    console.error('Error al cargar items', e);
    return [];
  }
}

export async function saveItems(
  items: Item[]
): Promise<{ success: boolean; error?: unknown }> {
  try {
    const db = await getDb();

    const existing = await db.select<{ id: string }[]>('SELECT id FROM items');
    const incomingIds = new Set(items.map((i) => i.id));
    for (const { id } of existing) {
      if (!incomingIds.has(id)) {
        await db.execute('DELETE FROM items WHERE id = $1', [id]);
      }
    }

    const query = `
      INSERT INTO items (
        id, name, category, subcategory, price, priority, bought, wishlist, createdAt,
        purchaseUrl, imageUrl, imageData, storeName, storeLocation, dimensions,
        installments, purchaseMonth, notes, brand, model, color, warranty, orderNumber
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23
      )
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name, category=excluded.category, subcategory=excluded.subcategory,
        price=excluded.price, priority=excluded.priority, bought=excluded.bought,
        wishlist=excluded.wishlist, purchaseUrl=excluded.purchaseUrl, imageUrl=excluded.imageUrl,
        imageData=excluded.imageData, storeName=excluded.storeName, storeLocation=excluded.storeLocation,
        dimensions=excluded.dimensions, installments=excluded.installments, purchaseMonth=excluded.purchaseMonth,
        notes=excluded.notes, brand=excluded.brand, model=excluded.model, color=excluded.color,
        warranty=excluded.warranty, orderNumber=excluded.orderNumber
    `;

    for (const i of items) {
      await db.execute(query, [
        i.id, i.name, i.category, i.subcategory, i.price, i.priority,
        i.bought ? 1 : 0, i.wishlist ? 1 : 0, i.createdAt, i.purchaseUrl,
        i.imageUrl, i.imageData, i.storeName, i.storeLocation,
        i.dimensions ? JSON.stringify(i.dimensions) : null,
        i.installments ? JSON.stringify(i.installments) : null,
        i.purchaseMonth, i.notes, i.brand, i.model, i.color, i.warranty, i.orderNumber,
      ]);
    }

    return { success: true };
  } catch (error) {
    console.error('Error guardando items:', error);
    return { success: false, error };
  }
}

// ==========================================
// CATEGORIES (SQLite)
// ==========================================
export async function loadCategories(): Promise<string[]> {
  try {
    const db = await getDb();
    const rows = await db.select<{ name: string }[]>('SELECT name FROM categories');
    return rows.map((r: { name: string }) => r.name);
  } catch {
    return [];
  }
}

export async function saveCategories(
  categories: string[]
): Promise<{ success: boolean; error?: unknown }> {
  try {
    const db = await getDb();

    const existing = await db.select<{ name: string }[]>('SELECT name FROM categories');
    const incoming = new Set(categories);
    for (const { name } of existing) {
      if (!incoming.has(name)) {
        await db.execute('DELETE FROM categories WHERE name = $1', [name]);
      }
    }

    for (const c of categories) {
      await db.execute(
        'INSERT INTO categories (name) VALUES ($1) ON CONFLICT(name) DO NOTHING',
        [c]
      );
    }

    return { success: true };
  } catch (error) {
    console.error('Error guardando categorías:', error);
    return { success: false, error };
  }
}

// ==========================================
// ACCOUNTS (SQLite)
// ==========================================
export async function loadAccounts(): Promise<Account[]> {
  try {
    const db = await getDb();
    const rows = await db.select<Record<string, unknown>[]>('SELECT * FROM accounts');
    
    return rows
      .map((r: Record<string, unknown>) => normalizeAccount(r))
      .filter((a: Account | null): a is Account => a !== null);
  } catch {
    return [];
  }
}

export async function saveAccounts(
  accounts: Account[]
): Promise<{ success: boolean; error?: unknown }> {
  try {
    const db = await getDb();

    const existing = await db.select<{ id: string }[]>('SELECT id FROM accounts');
    const incomingIds = new Set(accounts.map((a) => a.id));
    for (const { id } of existing) {
      if (!incomingIds.has(id)) {
        await db.execute('DELETE FROM accounts WHERE id = $1', [id]);
      }
    }

    const query = `
      INSERT INTO accounts (id, name, type, balance, color, createdAt)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name, type=excluded.type, balance=excluded.balance, color=excluded.color
    `;

    for (const a of accounts) {
      await db.execute(query, [a.id, a.name, a.type, a.balance, a.color, a.createdAt]);
    }

    return { success: true };
  } catch (error) {
    console.error('Error guardando cuentas:', error);
    return { success: false, error };
  }
}

// ==========================================
// TRANSACTIONS (SQLite)
// ==========================================
export async function loadTransactions(): Promise<Transaction[]> {
  try {
    const db = await getDb();
    const rows = await db.select<Record<string, unknown>[]>(
      'SELECT * FROM transactions ORDER BY date DESC'
    );
    
    return rows
      .map((r: Record<string, unknown>) => normalizeTransaction(r))
      .filter((t: Transaction | null): t is Transaction => t !== null);
  } catch {
    return [];
  }
}

export async function saveTransactions(
  transactions: Transaction[]
): Promise<{ success: boolean; error?: unknown }> {
  try {
    const db = await getDb();

    const existing = await db.select<{ id: string }[]>('SELECT id FROM transactions');
    const incomingIds = new Set(transactions.map((t) => t.id));
    for (const { id } of existing) {
      if (!incomingIds.has(id)) {
        await db.execute('DELETE FROM transactions WHERE id = $1', [id]);
      }
    }

    const query = `
      INSERT INTO transactions (id, accountId, destinationAccountId, type, amount, date, category, notes, linkedItemId)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT(id) DO UPDATE SET
        accountId=excluded.accountId, destinationAccountId=excluded.destinationAccountId,
        type=excluded.type, amount=excluded.amount, date=excluded.date,
        category=excluded.category, notes=excluded.notes, linkedItemId=excluded.linkedItemId
    `;

    for (const t of transactions) {
      await db.execute(query, [
        t.id, t.accountId, t.destinationAccountId, t.type,
        t.amount, t.date, t.category, t.notes, t.linkedItemId,
      ]);
    }

    return { success: true };
  } catch (error) {
    console.error('Error guardando transacciones:', error);
    return { success: false, error };
  }
}

// ==========================================
// SAVINGS GOALS (SQLite)
// ==========================================
export async function loadSavingsGoals(): Promise<SavingsGoal[]> {
  try {
    const db = await getDb();
    const rows = await db.select<Record<string, unknown>[]>(
      'SELECT * FROM savings_goals ORDER BY createdAt DESC'
    );

    return rows
      .map((r: Record<string, unknown>) => normalizeSavingsGoal(r))
      .filter((g: SavingsGoal | null): g is SavingsGoal => g !== null);
  } catch {
    return [];
  }
}

export async function saveSavingsGoals(
  goals: SavingsGoal[]
): Promise<{ success: boolean; error?: unknown }> {
  try {
    const db = await getDb();

    const existing = await db.select<{ id: string }[]>('SELECT id FROM savings_goals');
    const incomingIds = new Set(goals.map((g) => g.id));
    for (const { id } of existing) {
      if (!incomingIds.has(id)) {
        await db.execute('DELETE FROM savings_goals WHERE id = $1', [id]);
      }
    }

    const query = `
      INSERT INTO savings_goals (id, name, targetAmount, currentAmount, color, deadline, createdAt)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name, targetAmount=excluded.targetAmount,
        currentAmount=excluded.currentAmount, color=excluded.color,
        deadline=excluded.deadline
    `;

    for (const g of goals) {
      await db.execute(query, [
        g.id, g.name, g.targetAmount, g.currentAmount, g.color, g.deadline ?? null, g.createdAt,
      ]);
    }

    return { success: true };
  } catch (error) {
    console.error('Error guardando metas de ahorro:', error);
    return { success: false, error };
  }
}