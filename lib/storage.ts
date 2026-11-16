import { getDb } from './sqlite';
import {
  STORAGE_KEYS,
  DEFAULT_PREFS,
  DEFAULT_ITEM_FIELDS,
  STATUS_FILTERS,
  SORT_MODES,
  VIEW_MODES,
} from './config';
import {
  normalizeItem,
  normalizeAccount,
  normalizeBillingDay,
  normalizeTransaction,
  normalizeSavingsGoal,
  normalizeRecurringExpense,
  normalizeDebt,
  cleanFilterValue,
} from './utils';
import type {
  Account, Debt, Item, Prefs, RecurringExpense, SavingsGoal, Transaction,
} from './types';

// ==========================================
// COLA DE ESCRITURA SERIALIZADA + REINTENTO ANTE SQLITE_BUSY
// ==========================================
let writeQueue: Promise<unknown> = Promise.resolve();

function isBusyError(err: unknown): boolean {
  const msg = String(err ?? '').toLowerCase();
  return msg.includes('locked') || msg.includes('busy') || msg.includes('code: 5');
}

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= retries || !isBusyError(err)) throw err;
      attempt += 1;
      await new Promise((r) => setTimeout(r, 80 * attempt));
    }
  }
}

function enqueueWrite<T>(task: () => Promise<T>): Promise<T> {
  const next = writeQueue.then(() => withRetry(task), () => withRetry(task));
  writeQueue = next.catch(() => {});
  return next;
}

// ==========================================
// PREFS (SQLite + fallback/migración desde LocalStorage)
// ==========================================
function parsePrefsRaw(raw: string | null): Prefs {
  if (!raw) return { ...DEFAULT_PREFS, itemFields: { ...DEFAULT_ITEM_FIELDS } };

  try {
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      ...DEFAULT_PREFS,
      ...parsed,
      status: STATUS_FILTERS.has(parsed.status as Prefs['status'])
        ? (parsed.status as Prefs['status'])
        : DEFAULT_PREFS.status,
      sort: SORT_MODES.has(parsed.sort as Prefs['sort'])
        ? (parsed.sort as Prefs['sort'])
        : DEFAULT_PREFS.sort,
      viewMode: VIEW_MODES.has(parsed.viewMode as Prefs['viewMode'])
        ? (parsed.viewMode as Prefs['viewMode'])
        : DEFAULT_PREFS.viewMode,
      ...{
        categoryFilter: cleanFilterValue(
          (parsed as Partial<Prefs> & { categoryFilter?: unknown }).categoryFilter,
        ),
      },
      budget:
        typeof parsed.budget === 'number' && Number.isFinite(parsed.budget) && parsed.budget > 0
          ? parsed.budget
          : null,
      itemFields: {
        ...DEFAULT_ITEM_FIELDS,
        ...(parsed.itemFields ?? {}),
      },
    };
  } catch {
    return { ...DEFAULT_PREFS, itemFields: { ...DEFAULT_ITEM_FIELDS } };
  }
}

export async function loadPrefs(): Promise<Prefs> {
  try {
    const db = await getDb();
    const rows = await db.select<{ value: string }[]>(
      'SELECT value FROM app_prefs WHERE key = $1',
      ['main'],
    );

    let raw: string | null = rows[0]?.value ?? null;

    if (!raw && typeof window !== 'undefined') {
      raw = localStorage.getItem(STORAGE_KEYS.prefs);
      if (raw) {
        await enqueueWrite(() =>
          db.execute(
            'INSERT INTO app_prefs (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
            ['main', raw],
          ),
        );
      }
    }

    return parsePrefsRaw(raw);
  } catch {
    const fallbackRaw =
      typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEYS.prefs) : null;
    return parsePrefsRaw(fallbackRaw);
  }
}

export async function savePrefs(prefs: Prefs): Promise<void> {
  const serialized = JSON.stringify(prefs);

  try {
    localStorage.setItem(STORAGE_KEYS.prefs, serialized);
  } catch {
    // Ignorar si localStorage no está disponible
  }

  try {
    await enqueueWrite(async () => {
      const db = await getDb();
      await db.execute(
        'INSERT INTO app_prefs (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
        ['main', serialized],
      );
    });
  } catch (e) {
    console.warn('Error guardando prefs en SQLite', e);
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
// HELPER DE BORRADO SEGURO SIN TRANSACCIÓN MULTI-CONEXIÓN
// ==========================================
async function deleteRemovedRows(
  db: Awaited<ReturnType<typeof getDb>>,
  table: string,
  column: string,
  keepValues: string[],
) {
  if (keepValues.length === 0) {
    await db.execute(`DELETE FROM ${table}`);
    return;
  }
  const placeholders = keepValues.map((_, idx) => `$${idx + 1}`).join(', ');
  await db.execute(`DELETE FROM ${table} WHERE ${column} NOT IN (${placeholders})`, keepValues);
}

// ==========================================
// ITEMS (SQLite)
// ==========================================
export async function loadItems(): Promise<Item[]> {
  try {
    const db = await getDb();
    const rows = await db.select<Record<string, unknown>[]>(
      'SELECT * FROM items ORDER BY createdAt DESC',
    );

    return rows
      .map((r) => {
        let parsedOptions: unknown = [];
        let selectedOptionId: string | null = null;

        if (typeof r.options === 'string' && r.options) {
          try {
            const raw = JSON.parse(r.options);
            if (Array.isArray(raw)) {
              parsedOptions = raw;
            } else if (raw && typeof raw === 'object') {
              parsedOptions = (raw as { list?: unknown }).list ?? [];
              selectedOptionId = (raw as { selectedId?: string | null }).selectedId ?? null;
            }
          } catch {
            parsedOptions = [];
          }
        }

        return {
          ...r,
          bought: r.bought === 1,
          wishlist: r.wishlist === 1,
          dimensions: typeof r.dimensions === 'string' ? JSON.parse(r.dimensions) : null,
          installments: typeof r.installments === 'string' ? JSON.parse(r.installments) : null,
          options: parsedOptions,
          selectedOptionId,
        };
      })
      .map(normalizeItem)
      .filter((i): i is Item => i !== null);
  } catch (e) {
    console.error('Error al cargar items', e);
    return [];
  }
}

async function writeItemsDirect(items: Item[]) {
  const db = await getDb();
  await deleteRemovedRows(db, 'items', 'id', items.map((i) => i.id));

  const query = `
    INSERT INTO items (
      id, name, category, subcategory, price, currency, priority, bought, wishlist, createdAt, 
      purchaseUrl, imageUrl, imageData, storeName, storeLocation, dimensions, 
      installments, purchaseMonth, notes, brand, model, color, warranty, orderNumber, options
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25
    )
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name, category=excluded.category, subcategory=excluded.subcategory, 
      price=excluded.price, currency=excluded.currency, priority=excluded.priority,
      bought=excluded.bought, 
      wishlist=excluded.wishlist, purchaseUrl=excluded.purchaseUrl, imageUrl=excluded.imageUrl, 
      imageData=excluded.imageData, storeName=excluded.storeName, storeLocation=excluded.storeLocation, 
      dimensions=excluded.dimensions, installments=excluded.installments, purchaseMonth=excluded.purchaseMonth, 
      notes=excluded.notes, brand=excluded.brand, model=excluded.model, color=excluded.color, 
      warranty=excluded.warranty, orderNumber=excluded.orderNumber, options=excluded.options
  `;

  for (const i of items) {
    const hasOptions = (i.options && i.options.length > 0) || Boolean(i.selectedOptionId);
    const serializedOptions = hasOptions
      ? JSON.stringify({ list: i.options ?? [], selectedId: i.selectedOptionId ?? null })
      : null;

    await db.execute(query, [
      i.id,
      i.name,
      i.category,
      i.subcategory,
      i.price,
      i.currency ?? 'ARS',
      i.priority,
      i.bought ? 1 : 0,
      i.wishlist ? 1 : 0,
      i.createdAt,
      i.purchaseUrl,
      i.imageUrl,
      i.imageData,
      i.storeName,
      i.storeLocation,
      i.dimensions ? JSON.stringify(i.dimensions) : null,
      i.installments ? JSON.stringify(i.installments) : null,
      i.purchaseMonth,
      i.notes,
      i.brand,
      i.model,
      i.color,
      i.warranty,
      i.orderNumber,
      serializedOptions,
    ]);
  }
}

export function saveItems(
  items: Item[],
): Promise<{ success: boolean; error?: unknown }> {
  return enqueueWrite(async () => {
    try {
      await writeItemsDirect(items);
      return { success: true };
    } catch (error) {
      return { success: false, error };
    }
  });
}

// ==========================================
// CATEGORIES (SQLite)
// ==========================================
export async function loadCategories(): Promise<string[]> {
  try {
    const db = await getDb();
    const rows = await db.select<{ name: string }[]>('SELECT name FROM categories');
    return rows.map((r) => r.name);
  } catch {
    return [];
  }
}

async function writeCategoriesDirect(categories: string[]) {
  const db = await getDb();
  await deleteRemovedRows(db, 'categories', 'name', categories);

  for (const c of categories) {
    await db.execute('INSERT INTO categories (name) VALUES ($1) ON CONFLICT(name) DO NOTHING', [c]);
  }
}

export function saveCategories(
  categories: string[],
): Promise<{ success: boolean; error?: unknown }> {
  return enqueueWrite(async () => {
    try {
      await writeCategoriesDirect(categories);
      return { success: true };
    } catch (error) {
      return { success: false, error };
    }
  });
}

// ==========================================
// ACCOUNTS (SQLite)
// ==========================================
export async function loadAccounts(): Promise<Account[]> {
  try {
    const db = await getDb();
    const rows = await db.select<Record<string, unknown>[]>('SELECT * FROM accounts');
    return rows.map(normalizeAccount).filter((a): a is Account => a !== null);
  } catch {
    return [];
  }
}

async function writeAccountsDirect(accounts: Account[]) {
  const db = await getDb();
  await deleteRemovedRows(db, 'accounts', 'id', accounts.map((a) => a.id));

  const query = `
    INSERT INTO accounts (id, name, type, balance, currency, color, closingDay, dueDay, createdAt) 
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name, type=excluded.type, balance=excluded.balance,
      currency=excluded.currency, color=excluded.color,
      closingDay=excluded.closingDay, dueDay=excluded.dueDay
  `;

  for (const a of accounts) {
    // Sólo una tarjeta tiene días de facturación: en el resto se escribe null
    // aunque el objeto traiga basura de un import viejo.
    const isCard = a.type === 'tarjeta';
    await db.execute(query, [
      a.id,
      a.name,
      a.type,
      a.balance,
      a.currency ?? 'ARS',
      a.color,
      isCard ? normalizeBillingDay(a.closingDay) : null,
      isCard ? normalizeBillingDay(a.dueDay) : null,
      a.createdAt,
    ]);
  }
}

export function saveAccounts(
  accounts: Account[],
): Promise<{ success: boolean; error?: unknown }> {
  return enqueueWrite(async () => {
    try {
      await writeAccountsDirect(accounts);
      return { success: true };
    } catch (error) {
      return { success: false, error };
    }
  });
}

// ==========================================
// TRANSACTIONS (SQLite)
// ==========================================
export async function loadTransactions(): Promise<Transaction[]> {
  try {
    const db = await getDb();
    const rows = await db.select<Record<string, unknown>[]>(
      'SELECT * FROM transactions ORDER BY date DESC',
    );
    return rows.map(normalizeTransaction).filter((t): t is Transaction => t !== null);
  } catch {
    return [];
  }
}

async function writeTransactionsDirect(transactions: Transaction[]) {
  const db = await getDb();
  await deleteRemovedRows(db, 'transactions', 'id', transactions.map((t) => t.id));

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
      t.id,
      t.accountId,
      t.destinationAccountId ?? null,
      t.type,
      t.amount,
      t.date,
      t.category,
      t.notes,
      t.linkedItemId ?? null,
    ]);
  }
}

export function saveTransactions(
  transactions: Transaction[],
): Promise<{ success: boolean; error?: unknown }> {
  return enqueueWrite(async () => {
    try {
      await writeTransactionsDirect(transactions);
      return { success: true };
    } catch (error) {
      return { success: false, error };
    }
  });
}

// ==========================================
// SAVINGS GOALS (SQLite)
// ==========================================
export async function loadSavingsGoals(): Promise<SavingsGoal[]> {
  try {
    const db = await getDb();
    const rows = await db.select<Record<string, unknown>[]>(
      'SELECT * FROM savings_goals ORDER BY createdAt DESC',
    );
    return rows.map(normalizeSavingsGoal).filter((g): g is SavingsGoal => g !== null);
  } catch {
    return [];
  }
}

async function writeSavingsGoalsDirect(goals: SavingsGoal[]) {
  const db = await getDb();
  await deleteRemovedRows(db, 'savings_goals', 'id', goals.map((g) => g.id));

  const query = `
    INSERT INTO savings_goals (id, name, targetAmount, currentAmount, deadline, color, createdAt)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name, targetAmount=excluded.targetAmount,
      currentAmount=excluded.currentAmount, deadline=excluded.deadline, color=excluded.color
  `;

  for (const g of goals) {
    await db.execute(query, [
      g.id,
      g.name,
      g.targetAmount,
      g.currentAmount,
      g.deadline ?? null,
      g.color,
      g.createdAt,
    ]);
  }
}

export function saveSavingsGoals(
  goals: SavingsGoal[],
): Promise<{ success: boolean; error?: unknown }> {
  return enqueueWrite(async () => {
    try {
      await writeSavingsGoalsDirect(goals);
      return { success: true };
    } catch (error) {
      return { success: false, error };
    }
  });
}

// ==========================================
// DEUDAS Y COMPROMISOS (SQLite)
// ==========================================
export async function loadDebts(): Promise<Debt[]> {
  try {
    const db = await getDb();
    const rows = await db.select<Record<string, unknown>[]>(
      'SELECT * FROM debts ORDER BY createdAt DESC',
    );
    return rows.map(normalizeDebt).filter((d): d is Debt => d !== null);
  } catch {
    return [];
  }
}

async function writeDebtsDirect(debts: Debt[]) {
  const db = await getDb();
  await deleteRemovedRows(db, 'debts', 'id', debts.map((d) => d.id));

  const query = `
    INSERT INTO debts (id, title, creditor, totalAmount, paidAmount, currency, dueDate, priority, notes, createdAt)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    ON CONFLICT(id) DO UPDATE SET
      title=excluded.title, creditor=excluded.creditor,
      totalAmount=excluded.totalAmount, paidAmount=excluded.paidAmount,
      currency=excluded.currency, dueDate=excluded.dueDate,
      priority=excluded.priority, notes=excluded.notes
  `;

  for (const d of debts) {
    await db.execute(query, [
      d.id,
      d.title,
      d.creditor,
      d.totalAmount,
      d.paidAmount,
      d.currency ?? 'ARS',
      d.dueDate ?? null,
      d.priority,
      d.notes,
      d.createdAt,
    ]);
  }
}

export function saveDebts(
  debts: Debt[],
): Promise<{ success: boolean; error?: unknown }> {
  return enqueueWrite(async () => {
    try {
      await writeDebtsDirect(debts);
      return { success: true };
    } catch (error) {
      return { success: false, error };
    }
  });
}

// ==========================================
// GASTOS FIJOS Y SERVICIOS (SQLite)
// ==========================================
export async function loadRecurringExpenses(): Promise<RecurringExpense[]> {
  try {
    const db = await getDb();
    const rows = await db.select<Record<string, unknown>[]>(
      'SELECT * FROM recurring_expenses ORDER BY dueDay ASC',
    );
    return rows
      .map(normalizeRecurringExpense)
      .filter((e): e is RecurringExpense => e !== null);
  } catch {
    return [];
  }
}

async function writeRecurringExpensesDirect(expenses: RecurringExpense[]) {
  const db = await getDb();
  await deleteRemovedRows(db, 'recurring_expenses', 'id', expenses.map((e) => e.id));

  const query = `
    INSERT INTO recurring_expenses (id, name, category, amount, currency, taxPercent, dueDay, frequency, accountId, active, lastPaidMonth, notes, createdAt)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name, category=excluded.category, amount=excluded.amount,
      currency=excluded.currency, taxPercent=excluded.taxPercent,
      dueDay=excluded.dueDay, frequency=excluded.frequency, accountId=excluded.accountId,
      active=excluded.active, lastPaidMonth=excluded.lastPaidMonth, notes=excluded.notes
  `;

  for (const e of expenses) {
    await db.execute(query, [
      e.id,
      e.name,
      e.category,
      e.amount,
      e.currency ?? 'ARS',
      e.currency === 'USD' ? e.taxPercent ?? 0 : 0,
      e.dueDay,
      e.frequency,
      e.accountId ?? null,
      // SQLite no tiene boolean: 1/0 mantiene la columna INTEGER honesta.
      e.active ? 1 : 0,
      e.lastPaidMonth ?? null,
      e.notes,
      e.createdAt,
    ]);
  }
}

export function saveRecurringExpenses(
  expenses: RecurringExpense[],
): Promise<{ success: boolean; error?: unknown }> {
  return enqueueWrite(async () => {
    try {
      await writeRecurringExpensesDirect(expenses);
      return { success: true };
    } catch (error) {
      return { success: false, error };
    }
  });
}

// ==========================================
// GUARDADO UNIFICADO EN UN ÚNICO TURNO DE COLA
// ==========================================
export function saveAllState(data: {
  items: Item[];
  categories: string[];
  accounts: Account[];
  savingsGoals: SavingsGoal[];
  transactions: Transaction[];
  recurringExpenses: RecurringExpense[];
  debts: Debt[];
}): Promise<{ success: boolean; error?: unknown }> {
  return enqueueWrite(async () => {
    try {
      await writeItemsDirect(data.items);
      await writeCategoriesDirect(data.categories);
      await writeAccountsDirect(data.accounts);
      await writeSavingsGoalsDirect(data.savingsGoals);
      await writeRecurringExpensesDirect(data.recurringExpenses);
      await writeDebtsDirect(data.debts);
      await writeTransactionsDirect(data.transactions);
      return { success: true };
    } catch (error) {
      return { success: false, error };
    }
  });
}