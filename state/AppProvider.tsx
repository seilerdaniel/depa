'use client';

import {
  createContext, useCallback, useContext, useEffect, useMemo, useReducer,
  useRef, useState, type ReactNode,
} from 'react';
import { arrayMove } from '@dnd-kit/sortable';
import {
  loadItems, loadCategories, loadPrefs,
  saveItems, savePrefs, saveCategories, mergeItemCategories,
  loadAccounts, loadTransactions, loadSavingsGoals, loadRecurringExpenses, saveAllState,
} from '@/lib/storage';
import { DEFAULT_CATEGORIES, DEFAULT_PREFS, CATEGORY_MAX_LENGTH } from '@/lib/config';
import {
  createId, normalizeLabel, normalizeItem, normalizeAccount, normalizeTransaction,
  normalizeSavingsGoal, pruneTransactions, roundMoney, sameText, normalizeMonth,
  currentMonthKey, normalizePrefs, normalizeBillingDay, normalizeRecurringExpense,
  convertCurrency, normalizeUsdRate,
} from '@/lib/utils';
import type {
  Account, Currency, Item, Prefs, RecurringExpense, SavingsGoal, Transaction, View,
} from '@/lib/types';
import {
  isTauri, isLocalImageRef, persistImageToDisk, readDiskImageAsDataUrl,
  deleteDiskImage,
} from '@/lib/nativeImages';
import {
  listAutoBackups, readAutoBackupContent, runAutoBackup, MIN_BACKUP_INTERVAL_MS,
} from '@/lib/autoBackup';

export type Theme = 'light' | 'dark' | 'system';

/** Misma clave que usa el script anti-FOUC de `app/layout.tsx`. */
const THEME_STORAGE_KEY = 'depa.theme';

// ==========================================
// ESTADO Y ACCIONES DEL REDUCER
// ==========================================
interface AppState {
  items: Item[];
  categories: string[];
  prefs: Prefs;
  accounts: Account[];
  transactions: Transaction[];
  savingsGoals: SavingsGoal[];
  recurringExpenses: RecurringExpense[];
  view: View;
  ready: boolean;
  editingItem: Item | null;
  selectedItem: Item | null;
  buyPromptItemId: string | null;
}

type Action =
  | { type: 'init'; payload: Omit<AppState, 'ready' | 'editingItem' | 'selectedItem' | 'buyPromptItemId'> & { selectedItem?: Item | null } }
  | { type: 'add'; item: Item }
  | { type: 'update'; item: Item }
  | { type: 'remove'; id: string }
  | { type: 'restore'; item: Item; index: number }
  | { type: 'toggle-bought'; id: string; bought: boolean; accountId?: string | null }
  | { type: 'restore-purchases'; itemId: string; transactions: Transaction[] }
  | { type: 'set-wishlist'; id: string; wishlist: boolean }
  | { type: 'set-prefs'; patch: Partial<Prefs> }
  | { type: 'add-category'; name: string }
  | { type: 'update-category'; oldName: string; newName: string }
  | { type: 'delete-category'; name: string }
  | { type: 'set-view'; view: View }
  | { type: 'set-editing'; item: Item | null }
  | { type: 'set-selected'; item: Item | null }
  | { type: 'set-buy-prompt'; id: string | null }
  | { type: 'reorder-items'; items: Item[] }
  | { type: 'add-account'; account: Account }
  | { type: 'update-account'; account: Account }
  | { type: 'delete-account'; id: string }
  | { type: 'add-transaction'; transaction: Transaction }
  | { type: 'add-transactions-batch'; transactions: Transaction[] }
  | {
      /** Edición de metadatos: nunca toca monto, tipo ni cuentas. */
      type: 'update-transaction';
      transaction: Transaction;
    }
  | { type: 'delete-transaction'; id: string }
  | { type: 'add-savings-goal'; goal: SavingsGoal }
  | { type: 'update-savings-goal'; goal: SavingsGoal }
  | { type: 'delete-savings-goal'; id: string }
  | {
      type: 'contribute-goal';
      goalId: string;
      /** Positivo = aporte, negativo = retiro. */
      delta: number;
      /** Movimiento a registrar (null si no se vinculó cuenta). */
      transaction: Transaction | null;
    }
  | { type: 'add-recurring'; expense: RecurringExpense }
  | { type: 'update-recurring'; expense: RecurringExpense }
  | { type: 'delete-recurring'; id: string }
  | {
      type: 'pay-recurring';
      id: string;
      /** Mes pagado en formato 'YYYY-MM'. */
      paidMonth: string;
      /** Movimiento a registrar (null si se pagó sin cuenta). */
      transaction: Transaction | null;
    };

// ==========================================
// SALDOS: aplicar / revertir movimientos
// ==========================================
const adjustBalance = (accounts: Account[], id: string, delta: number): Account[] =>
  accounts.map((acc) => (acc.id === id ? { ...acc, balance: roundMoney(acc.balance + delta) } : acc));

const applyToBalances = (accounts: Account[], t: Transaction): Account[] => {
  if (t.type === 'ingreso') return adjustBalance(accounts, t.accountId, t.amount);
  if (t.type === 'gasto') return adjustBalance(accounts, t.accountId, -t.amount);

  let next = adjustBalance(accounts, t.accountId, -t.amount);
  if (t.destinationAccountId) next = adjustBalance(next, t.destinationAccountId, t.amount);
  return next;
};

const revertFromBalances = (accounts: Account[], t: Transaction): Account[] => {
  if (t.type === 'ingreso') return adjustBalance(accounts, t.accountId, -t.amount);
  if (t.type === 'gasto') return adjustBalance(accounts, t.accountId, t.amount);

  let next = adjustBalance(accounts, t.accountId, t.amount);
  if (t.destinationAccountId) next = adjustBalance(next, t.destinationAccountId, -t.amount);
  return next;
};

/**
 * Deshace el gasto que creó la compra de un artículo: revierte el saldo y
 * elimina la transacción vinculada.
 */
const detachLinkedPurchases = (s: AppState, itemId: string) => {
  const linked = s.transactions.filter(
    (t) => t.linkedItemId === itemId && t.type === 'gasto',
  );

  let accounts = s.accounts;
  for (const transaction of linked) accounts = revertFromBalances(accounts, transaction);

  return {
    accounts,
    transactions: s.transactions.filter(
      (t) => !(t.linkedItemId === itemId && t.type === 'gasto'),
    ),
  };
};

/**
 * Al marcar una compra, la financiación necesita un mes de inicio para poder
 * calcular qué cuota va.
 */
const withInstallmentStart = (item: Item): Item => {
  const inst = item.installments;
  if (!inst || inst.count < 1 || inst.amount <= 0 || inst.startMonth) return item;

  const startMonth = normalizeMonth(item.purchaseMonth) ?? currentMonthKey();
  return { ...item, installments: { ...inst, startMonth } };
};

/** Fecha límite de una meta: 'YYYY-MM-DD' o nada. */
const normalizeDeadline = (value: string | null | undefined): string | null =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;

const reducer = (s: AppState, a: Action): AppState => {
  switch (a.type) {
    case 'init':
      return {
        ...a.payload,
        ready: true,
        editingItem: null,
        selectedItem: a.payload.selectedItem ?? null,
        buyPromptItemId: null,
      };
    case 'add':
      return { ...s, items: [a.item, ...s.items] };
    case 'update':
      return {
        ...s,
        items: s.items.map((i) => (i.id === a.item.id ? a.item : i)),
        editingItem: null,
      };
    case 'remove':
      return { ...s, items: s.items.filter((i) => i.id !== a.id) };
    case 'restore': {
      const items = s.items.slice();
      items.splice(a.index, 0, a.item);
      return { ...s, items };
    }
    case 'toggle-bought': {
      const found = s.items.find((i) => i.id === a.id);
      if (!found) return s;

      if (a.bought && found.bought) return s;

      const item = a.bought ? withInstallmentStart(found) : found;
      const items = s.items.map((i) => (i.id === a.id ? { ...i, bought: a.bought } : i));

      if (!a.bought) {
        return { ...s, ...detachLinkedPurchases(s, a.id), items };
      }

      if (!a.accountId) return { ...s, items };

      const account = s.accounts.find((acc) => acc.id === a.accountId);
      if (!account) return s;

      const rawAmount =
        item.installments && item.installments.count > 0 && item.installments.amount > 0
          ? item.installments.amount
          : item.price;

      // El artículo puede estar en USD y la cuenta en pesos (o al revés): el
      // movimiento se registra en la moneda de la cuenta.
      const amount = convertCurrency(
        rawAmount,
        item.currency ?? 'ARS',
        account.currency ?? 'ARS',
        s.prefs.usdRate,
      );
      if (amount <= 0) return s;

      const transaction: Transaction = {
        id: createId(),
        accountId: a.accountId,
        destinationAccountId: null,
        type: 'gasto',
        amount,
        date: Date.now(),
        category: item.category,
        notes: `Compra: ${item.name}`,
        linkedItemId: item.id,
      };

      return {
        ...s,
        items,
        accounts: applyToBalances(s.accounts, transaction),
        transactions: [transaction, ...s.transactions],
      };
    }
    case 'restore-purchases': {
      if (!s.items.some((i) => i.id === a.itemId)) return s;

      let accounts = s.accounts;
      for (const transaction of a.transactions) {
        accounts = applyToBalances(accounts, transaction);
      }

      return {
        ...s,
        accounts,
        transactions: [...a.transactions, ...s.transactions],
        items: s.items.map((i) => (i.id === a.itemId ? { ...i, bought: true } : i)),
      };
    }
    case 'set-wishlist': {
      const current = s.items.find((i) => i.id === a.id);
      const reverted = a.wishlist && current?.bought ? detachLinkedPurchases(s, a.id) : null;

      return {
        ...s,
        accounts: reverted ? reverted.accounts : s.accounts,
        transactions: reverted ? reverted.transactions : s.transactions,
        items: s.items.map((i) =>
          i.id === a.id
            ? { ...i, wishlist: a.wishlist, bought: a.wishlist ? false : i.bought }
            : i,
        ),
      };
    }
    case 'set-prefs':
      return { ...s, prefs: { ...s.prefs, ...a.patch } };
    case 'add-category':
      return { ...s, categories: [...s.categories, a.name] };
    case 'update-category':
      return {
        ...s,
        categories: s.categories.map((c) => (c === a.oldName ? a.newName : c)),
        items: s.items.map((i) => (i.category === a.oldName ? { ...i, category: a.newName } : i)),
      };
    case 'delete-category':
      return {
        ...s,
        categories: s.categories.filter((c) => c !== a.name),
        items: s.items.map((i) => (i.category === a.name ? { ...i, category: 'Otros' } : i)),
      };
    case 'set-view':
      return { ...s, view: a.view };
    case 'set-editing':
      return { ...s, editingItem: a.item };
    case 'set-selected':
      return { ...s, selectedItem: a.item };
    case 'set-buy-prompt':
      return { ...s, buyPromptItemId: a.id };
    case 'reorder-items':
      return { ...s, items: a.items };

    // ---------- FINANZAS ----------
    case 'add-account':
      return { ...s, accounts: [...s.accounts, a.account] };

    case 'update-account':
      return {
        ...s,
        accounts: s.accounts.map((acc) => (acc.id === a.account.id ? a.account : acc)),
      };

    case 'delete-account': {
      const affected = s.transactions.filter(
        (t) => t.accountId === a.id || t.destinationAccountId === a.id,
      );
      const affectedIds = new Set(affected.map((t) => t.id));

      let accounts = s.accounts.filter((acc) => acc.id !== a.id);
      for (const t of affected) accounts = revertFromBalances(accounts, t);

      return {
        ...s,
        accounts,
        transactions: s.transactions.filter((t) => !affectedIds.has(t.id)),
      };
    }

    case 'add-transaction':
      return {
        ...s,
        accounts: applyToBalances(s.accounts, a.transaction),
        transactions: [a.transaction, ...s.transactions],
      };

    case 'add-transactions-batch': {
      if (a.transactions.length === 0) return s;

      // Un solo dispatch: se agrega el neto por cuenta en vez de recorrer el
      // array de cuentas una vez por movimiento.
      const deltas = new Map<string, number>();
      const bump = (id: string, delta: number) =>
        deltas.set(id, roundMoney((deltas.get(id) ?? 0) + delta));

      for (const transaction of a.transactions) {
        if (transaction.type === 'ingreso') {
          bump(transaction.accountId, transaction.amount);
        } else if (transaction.type === 'gasto') {
          bump(transaction.accountId, -transaction.amount);
        } else if (transaction.destinationAccountId) {
          bump(transaction.accountId, -transaction.amount);
          bump(transaction.destinationAccountId, transaction.amount);
        }
      }

      return {
        ...s,
        accounts: s.accounts.map((account) => {
          const delta = deltas.get(account.id);
          return delta ? { ...account, balance: roundMoney(account.balance + delta) } : account;
        }),
        transactions: [...a.transactions, ...s.transactions],
      };
    }

    case 'update-transaction':
      return {
        ...s,
        transactions: s.transactions.map((t) =>
          t.id === a.transaction.id
            ? {
                ...t,
                category: a.transaction.category,
                notes: a.transaction.notes,
                date: a.transaction.date,
              }
            : t,
        ),
      };

    case 'delete-transaction': {
      const transaction = s.transactions.find((t) => t.id === a.id);
      if (!transaction) return s;

      return {
        ...s,
        accounts: revertFromBalances(s.accounts, transaction),
        transactions: s.transactions.filter((t) => t.id !== a.id),
      };
    }

    // ---------- METAS DE AHORRO ----------
    case 'add-savings-goal':
      return { ...s, savingsGoals: [a.goal, ...s.savingsGoals] };

    case 'update-savings-goal':
      return {
        ...s,
        savingsGoals: s.savingsGoals.map((g) => (g.id === a.goal.id ? a.goal : g)),
      };

    case 'delete-savings-goal':
      return { ...s, savingsGoals: s.savingsGoals.filter((g) => g.id !== a.id) };

    case 'contribute-goal': {
      const goal = s.savingsGoals.find((g) => g.id === a.goalId);
      if (!goal || a.delta === 0) return s;

      const next: AppState = {
        ...s,
        savingsGoals: s.savingsGoals.map((g) =>
          g.id === a.goalId
            ? { ...g, currentAmount: Math.max(0, roundMoney(g.currentAmount + a.delta)) }
            : g,
        ),
      };

      if (!a.transaction) return next;

      return {
        ...next,
        accounts: applyToBalances(next.accounts, a.transaction),
        transactions: [a.transaction, ...next.transactions],
      };
    }

    // ---------- GASTOS FIJOS ----------
    case 'add-recurring':
      return { ...s, recurringExpenses: [a.expense, ...s.recurringExpenses] };

    case 'update-recurring':
      return {
        ...s,
        recurringExpenses: s.recurringExpenses.map((e) =>
          e.id === a.expense.id ? a.expense : e,
        ),
      };

    case 'delete-recurring':
      return {
        ...s,
        recurringExpenses: s.recurringExpenses.filter((e) => e.id !== a.id),
      };

    case 'pay-recurring': {
      // Un único dispatch: el saldo, el movimiento y el mes pagado cambian
      // juntos o no cambia nada.
      const next: AppState = {
        ...s,
        recurringExpenses: s.recurringExpenses.map((e) =>
          e.id === a.id ? { ...e, lastPaidMonth: a.paidMonth } : e,
        ),
      };

      if (!a.transaction) return next;

      return {
        ...next,
        accounts: applyToBalances(next.accounts, a.transaction),
        transactions: [a.transaction, ...next.transactions],
      };
    }

    default:
      return s;
  }
};

const initialState: AppState = {
  items: [],
  categories: DEFAULT_CATEGORIES.slice(),
  prefs: DEFAULT_PREFS,
  accounts: [],
  transactions: [],
  savingsGoals: [],
  recurringExpenses: [],
  view: 'home',
  ready: false,
  editingItem: null,
  selectedItem: null,
  buyPromptItemId: null,
};

// ==========================================
// CONTRATOS DE CADA CONTEXTO
// ==========================================
export interface ToastState {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export interface ToastOptions {
  actionLabel?: string;
  onAction?: () => void;
}

export interface BackupExportData {
  items: Item[];
  categories: string[];
  prefs: Prefs;
  accounts: Account[];
  transactions: Transaction[];
  savingsGoals: SavingsGoal[];
  recurringExpenses: RecurringExpense[];
  version: number;
}

export interface BackupImportData {
  /** Opcional a propósito: un JSON roto debe fallar con mensaje, no en tipos. */
  items?: unknown[];
  categories?: string[];
  prefs?: unknown;
  accounts?: unknown[];
  transactions?: unknown[];
  savingsGoals?: unknown[];
  recurringExpenses?: unknown[];
}

export interface DataValue {
  items: Item[];
  categories: string[];
  ready: boolean;
  addItem: (draft: Omit<Item, 'id' | 'createdAt' | 'bought'>) => boolean;
  updateItem: (item: Item) => void;
  removeItem: (id: string) => void;
  toggleBought: (id: string, bought: boolean, accountId?: string | null) => void;
  setWishlist: (id: string, wishlist: boolean) => boolean;
  reorderItems: (activeId: string, overId: string) => void;
  addCategory: (name: string) => boolean;
  updateCategory: (oldName: string, newName: string) => boolean;
  deleteCategory: (name: string) => void;
  exportData: () => void;
  importData: (file: File) => void;
  /** Respaldo local forzado (ignora el intervalo mínimo). */
  triggerManualLocalBackup: () => Promise<boolean>;
  /** Restaura una copia automática por nombre de archivo. */
  restoreLocalBackup: (fileName: string) => Promise<boolean>;
}

export interface PrefsValue {
  prefs: Prefs;
  setPrefs: (patch: Partial<Prefs>) => void;
}

/**
 * Moneda en la que viene expresado el monto de un movimiento. Si se omite, se
 * asume la moneda de la cuenta de origen (comportamiento histórico).
 */
export interface TransactionSource {
  currency?: Currency;
  /** Impuestos/percepciones a sumar cuando la moneda de origen es USD. */
  taxPercent?: number;
}

export interface FinanceValue {
  accounts: Account[];
  transactions: Transaction[];
  savingsGoals: SavingsGoal[];
  recurringExpenses: RecurringExpense[];
  addAccount: (draft: Omit<Account, 'id' | 'createdAt'>) => boolean;
  updateAccount: (account: Account) => boolean;
  deleteAccount: (id: string) => void;
  addTransaction: (draft: Omit<Transaction, 'id'>, source?: TransactionSource) => boolean;
  /** Alta atómica de varios movimientos; devuelve cuántos se importaron. */
  addTransactionsBatch: (
    drafts: Array<Omit<Transaction, 'id'>>,
    source?: TransactionSource,
  ) => number;
  updateTransaction: (
    id: string,
    patch: { category: string; notes: string; date: number },
  ) => boolean;
  deleteTransaction: (id: string) => void;
  addSavingsGoal: (draft: Omit<SavingsGoal, 'id' | 'createdAt'>) => boolean;
  updateSavingsGoal: (goal: SavingsGoal) => boolean;
  deleteSavingsGoal: (id: string) => void;
  contributeToGoal: (goalId: string, amount: number, accountId?: string | null) => boolean;
  addRecurringExpense: (draft: Omit<RecurringExpense, 'id' | 'createdAt'>) => boolean;
  updateRecurringExpense: (expense: RecurringExpense) => boolean;
  deleteRecurringExpense: (id: string) => void;
  /**
   * Registra el pago del mes: movimiento (si hay cuenta) + `lastPaidMonth`
   * en un solo dispatch.
   */
  payRecurringExpense: (
    id: string,
    accountId?: string | null,
    customAmount?: number,
  ) => boolean;
}

export interface UIValue {
  view: View;
  setView: (v: View) => void;
  editingItem: Item | null;
  setEditingItem: (item: Item | null) => void;
  selectedItem: Item | null;
  setSelectedItem: (item: Item | null) => void;
  buyPromptItemId: string | null;
  setBuyPromptItemId: (id: string | null) => void;
  isCategoryManagerOpen: boolean;
  setCategoryManagerOpen: (open: boolean) => void;
  isSettingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  itemFormOpen: boolean;
  setItemFormOpen: (open: boolean) => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
}

export interface ToastValue {
  toast: ToastState | null;
  showToast: (message: string, opts?: { actionLabel?: string; onAction?: () => void }) => void;
  hideToast: () => void;
  announce: (msg: string) => void;
}

// ==========================================
// CONTEXTOS
// ==========================================
const DataContext = createContext<DataValue | null>(null);
const PrefsContext = createContext<PrefsValue | null>(null);
const FinanceContext = createContext<FinanceValue | null>(null);
const UIContext = createContext<UIValue | null>(null);
const ToastContext = createContext<ToastValue | null>(null);

// ==========================================
// HOOKS
// ==========================================
export const useData = (): DataValue => {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within AppProvider');
  return ctx;
};

export const usePrefs = (): PrefsValue => {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error('usePrefs must be used within AppProvider');
  return ctx;
};

export const useFinance = (): FinanceValue => {
  const ctx = useContext(FinanceContext);
  if (!ctx) throw new Error('useFinance must be used within AppProvider');
  return ctx;
};

export const useUI = (): UIValue => {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI must be used within AppProvider');
  return ctx;
};

export const useToast = (): ToastValue => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within AppProvider');
  return ctx;
};

export function usePurchasePayment(item: Pick<Item, 'id' | 'bought'>): string | null {
  const { transactions, accounts } = useFinance();

  return useMemo(() => {
    if (!item.bought) return null;

    const linked = transactions.find(
      (t) => t.linkedItemId === item.id && t.type === 'gasto',
    );
    if (!linked) return 'Sin cuenta vinculada';

    const account = accounts.find((acc) => acc.id === linked.accountId);
    return account ? `Pagado con ${account.name}` : 'Pagado con cuenta eliminada';
  }, [item.bought, item.id, transactions, accounts]);
}

// ==========================================
// COMPONENTE PROVIDER
// ==========================================
export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [theme, setThemeState] = useState<Theme>('system');
  const [isCategoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const [isSettingsOpen, setSettingsOpen] = useState(false);
  const [itemFormOpen, setItemFormOpen] = useState(true);

  const setTheme = useCallback<UIValue['setTheme']>((nextTheme) => {
    setThemeState(nextTheme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      // Modo privado o almacenamiento lleno: el tema sigue andando en memoria.
    }
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        setThemeState(stored);
      }
    } catch {
      // Sin acceso a localStorage nos quedamos con el tema del sistema.
    }
  }, []);

  // Timers y refs
  const toastTimer = useRef<number | null>(null);
  const announceTimer = useRef<number | null>(null);
  const imageCleanupTimers = useRef<Map<string, number>>(new Map());

  // Marca que la hidratación inicial ya terminó
  const hydrated = useRef(false);

  // Respaldo automático: arranque único y primer cambio ya contado
  const autoBackupStarted = useRef(false);
  const autoBackupHydrated = useRef(false);

  // Debounce de prefs
  const prefsTimer = useRef<number | null>(null);
  const prefsPending = useRef<Prefs | null>(null);

  // Espejo del estado para acciones estables
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Limpiar timers pendientes al desmontar
  useEffect(() => {
    const timers = imageCleanupTimers.current;
    return () => {
      timers.forEach((timerId) => window.clearTimeout(timerId));
      timers.clear();
    };
  }, []);

  // ==========================================
  // UI / TOAST
  // ==========================================
  const announce = useCallback((message: string) => {
    if (announceTimer.current) window.clearTimeout(announceTimer.current);
    const el = document.getElementById('sr-status');
    if (el) el.textContent = '';
    announceTimer.current = window.setTimeout(() => {
      if (el) el.textContent = message;
    }, 40);
  }, []);

  const hideToast = useCallback(() => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = null;
    setToast(null);
  }, []);

  const showToast = useCallback<ToastValue['showToast']>((message, opts) => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast({
      id: Date.now(),
      message,
      actionLabel: opts?.actionLabel,
      onAction: opts?.onAction,
    });
    toastTimer.current = window.setTimeout(hideToast, opts?.onAction ? 7000 : 3400);
  }, [hideToast]);

  // ==========================================
  // RESPALDO AUTOMÁTICO LOCAL
  // ==========================================
  /**
   * Único generador del payload de backup: lo comparten la exportación manual
   * y los snapshots silenciosos, así nunca divergen.
   */
  const buildBackupPayload = useCallback(async (): Promise<BackupExportData> => {
    const snapshot = stateRef.current;

    // Las imágenes locales viajan como DataURL: la copia se puede restaurar
    // incluso si los archivos originales ya no están en disco.
    const items = await Promise.all(
      snapshot.items.map(async (item) => {
        if (!item.imageData || !isLocalImageRef(item.imageData)) return item;

        const dataUrl = await readDiskImageAsDataUrl(item.imageData);
        return dataUrl ? { ...item, imageData: dataUrl } : item;
      }),
    );

    return {
      items,
      categories: snapshot.categories,
      prefs: snapshot.prefs,
      accounts: snapshot.accounts,
      transactions: snapshot.transactions,
      savingsGoals: snapshot.savingsGoals,
      recurringExpenses: snapshot.recurringExpenses,
      version: 4,
    };
  }, []);

  /** Escribe un respaldo silencioso. Nunca informa ni interrumpe la UI. */
  const silentAutoBackup = useCallback(async () => {
    try {
      // Chequeo barato antes de serializar: las fotos locales se leen por IPC
      // y no tiene sentido pagar ese costo si todavía no toca respaldar.
      const [latest] = await listAutoBackups();
      if (latest && Date.now() - latest.timestamp < MIN_BACKUP_INTERVAL_MS) return;

      const payload = await buildBackupPayload();
      await runAutoBackup(JSON.stringify(payload));
    } catch (error) {
      console.warn('Respaldo automático omitido.', error);
    }
  }, [buildBackupPayload]);

  // ==========================================
  // EFECTOS DE CARGA Y PERSISTENCIA (ASYNC EN SQLITE)
  // ==========================================
  useEffect(() => {
    let mounted = true;
    async function initDB() {
      const [items, categories, accounts, rawTransactions, savingsGoals, recurringExpenses, prefs] =
        await Promise.all([
          loadItems(),
          loadCategories(),
          loadAccounts(),
          loadTransactions(),
          loadSavingsGoals(),
          loadRecurringExpenses(),
          loadPrefs(),
        ]);

      if (!mounted) return;

      const transactions = pruneTransactions(rawTransactions, accounts);

      if (mergeItemCategories(items, categories)) {
        saveCategories(categories).catch(console.error);
      }

      // MIGRACIÓN 4.1: Base64 heredado → archivo en disco
      let loadedItems = items;

      if (isTauri()) {
        const migrated = await Promise.all(
          items.map(async (item) => {
            if (!item.imageData?.startsWith('data:image/')) return item;

            const stored = await persistImageToDisk(item.imageData, item.id);
            return stored === item.imageData ? item : { ...item, imageData: stored };
          }),
        );

        const changed = migrated.some((item, index) => item !== items[index]);

        if (changed) {
          loadedItems = migrated;
          saveItems(migrated).catch(console.error);
        }
      }

      dispatch({
        type: 'init',
        payload: {
          items: loadedItems,
          categories,
          prefs,
          accounts,
          transactions,
          savingsGoals,
          recurringExpenses,
          view: prefs.startView,
        },
      });
    }

    initDB();
    return () => { mounted = false; };
  }, []);

  // Persistencia serializada en SQLite
  useEffect(() => {
    if (!state.ready) return;

    if (!hydrated.current) {
      hydrated.current = true;
      return;
    }

    void (async () => {
      const res = await saveAllState({
        items: state.items,
        categories: state.categories,
        accounts: state.accounts,
        savingsGoals: state.savingsGoals,
        recurringExpenses: state.recurringExpenses,
        transactions: state.transactions,
      });

      if (!res.success) {
        console.error('Error guardando en SQLite:', res.error);
        showToast('Error al guardar cambios en la base de datos local.');
      }
    })();
  }, [
    state.items,
    state.categories,
    state.accounts,
    state.transactions,
    state.savingsGoals,
    state.recurringExpenses,
    state.ready,
    showToast,
  ]);

  // Respaldo automático de arranque: 3 s para no competir con la hidratación.
  useEffect(() => {
    if (!state.ready || autoBackupStarted.current) return;

    if (!isTauri()) {
      autoBackupStarted.current = true;
      return;
    }

    const timer = window.setTimeout(() => {
      // La marca se pone al disparar: así un remount de StrictMode no lo cancela.
      autoBackupStarted.current = true;
      void silentAutoBackup();
    }, 3000);

    return () => window.clearTimeout(timer);
  }, [state.ready, silentAutoBackup]);

  // Respaldo con debounce: 15 s después del último cambio persistido.
  // `runAutoBackup` aplica además el mínimo de 30 minutos entre copias.
  useEffect(() => {
    if (!state.ready || !isTauri()) return;

    // El primer render post-hidratación no cuenta como "cambio".
    if (!autoBackupHydrated.current) {
      autoBackupHydrated.current = true;
      return;
    }

    const timer = window.setTimeout(() => {
      void silentAutoBackup();
    }, 15_000);

    return () => window.clearTimeout(timer);
  }, [
    state.items,
    state.categories,
    state.accounts,
    state.transactions,
    state.savingsGoals,
    state.recurringExpenses,
    state.ready,
    silentAutoBackup,
  ]);

  // Debounce de Prefs en SQLite
  useEffect(() => {
    if (!state.ready) return;

    prefsPending.current = state.prefs;
    if (prefsTimer.current !== null) window.clearTimeout(prefsTimer.current);

    prefsTimer.current = window.setTimeout(() => {
      prefsTimer.current = null;
      if (prefsPending.current) {
        void savePrefs(prefsPending.current);
        prefsPending.current = null;
      }
    }, 300);

    return () => {
      if (prefsTimer.current !== null) {
        window.clearTimeout(prefsTimer.current);
        prefsTimer.current = null;
      }
    };
  }, [state.prefs, state.ready]);

  // Flush al cerrar / ocultar la ventana
  useEffect(() => {
    const flush = () => {
      if (prefsPending.current) {
        void savePrefs(prefsPending.current);
        prefsPending.current = null;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };

    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // ==========================================
  // EFECTOS DE TEMA (MODO OSCURO)
  // ==========================================
  useEffect(() => {
    const root = document.documentElement;

    const apply = () => {
      const isDark =
        theme === 'dark' ||
        (theme === 'system' &&
          window.matchMedia('(prefers-color-scheme: dark)').matches);
      root.classList.toggle('dark', isDark);
      root.style.colorScheme = isDark ? 'dark' : 'light';
    };

    apply();

    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }
  }, [theme]);

  // ==========================================
  // SERVICE WORKER (Solo web, bloqueado en Tauri)
  // ==========================================
  useEffect(() => {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) return;
    if (!('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker
        .register('/sw.js')
        .catch((err) => console.warn('SW registration failed', err));
    };

    window.addEventListener('load', register);
    return () => window.removeEventListener('load', register);
  }, []);

  // ==========================================
  // ACCIONES DE DATOS
  // ==========================================
  const addItem = useCallback<DataValue['addItem']>((draft) => {
    const item: Item = { ...draft, id: createId(), createdAt: Date.now(), bought: false };
    dispatch({ type: 'add', item });

    if (draft.wishlist) {
      announce(`${item.name} agregado a la wishlist`);
      showToast('Artículo agregado a la wishlist', {
        actionLabel: 'Ver wishlist',
        onAction: () => dispatch({ type: 'set-view', view: 'wishlist' }),
      });
    } else {
      announce(`${item.name} agregado a la lista`);
      showToast('Artículo agregado a la lista');
    }
    return true;
  }, [announce, showToast]);

  const updateItem = useCallback<DataValue['updateItem']>((item) => {
    const previous = stateRef.current.items.find((i) => i.id === item.id);
    dispatch({ type: 'update', item });

    // Si reemplazó o quitó una foto local en disco, eliminamos la anterior
    if (
      isTauri() &&
      previous?.imageData &&
      isLocalImageRef(previous.imageData) &&
      previous.imageData !== item.imageData
    ) {
      void deleteDiskImage(previous.imageData).catch(console.warn);
    }

    announce(`${item.name} actualizado`);
    showToast('Artículo actualizado correctamente');
  }, [announce, showToast]);

  const removeItem = useCallback<DataValue['removeItem']>((id) => {
    const index = stateRef.current.items.findIndex((i) => i.id === id);
    if (index === -1) return;
    const removed = stateRef.current.items[index];

    dispatch({ type: 'remove', id });

    // Programamos la limpieza de la imagen en disco una vez vencida la ventana de Deshacer
    if (isTauri() && removed.imageData && isLocalImageRef(removed.imageData)) {
      const imageRef = removed.imageData;
      const timerId = window.setTimeout(() => {
        imageCleanupTimers.current.delete(id);
        const stillExists = stateRef.current.items.some((i) => i.imageData === imageRef);
        if (!stillExists) {
          void deleteDiskImage(imageRef).catch(console.warn);
        }
      }, 7500);
      imageCleanupTimers.current.set(id, timerId);
    }

    showToast(`"${removed.name}" eliminado`, {
      actionLabel: 'Deshacer',
      onAction: () => {
        const pendingCleanup = imageCleanupTimers.current.get(id);
        if (pendingCleanup !== undefined) {
          window.clearTimeout(pendingCleanup);
          imageCleanupTimers.current.delete(id);
        }
        dispatch({
          type: 'restore',
          item: removed,
          index: Math.min(index, stateRef.current.items.length),
        });
        announce(`${removed.name} restaurado en la lista`);
      },
    });
  }, [showToast, announce]);

  const toggleBought = useCallback<DataValue['toggleBought']>((id, bought, accountId) => {
    const current = stateRef.current;
    const item = current.items.find((i) => i.id === id);
    if (!item) return;

    if (bought && accountId === undefined && current.accounts.length > 0) {
      dispatch({ type: 'set-buy-prompt', id });
      return;
    }

    const reverted = bought
      ? []
      : current.transactions.filter((t) => t.linkedItemId === id && t.type === 'gasto');

    dispatch({ type: 'toggle-bought', id, bought, accountId: accountId ?? null });
    announce(`${item.name} marcado como ${bought ? 'comprado' : 'pendiente'}`);

    if (bought && accountId) {
      showToast('Compra registrada en finanzas');
      return;
    }

    if (!bought && reverted.length > 0) {
      showToast(`"${item.name}" vuelve a pendiente`, {
        actionLabel: 'Deshacer',
        onAction: () => {
          dispatch({ type: 'restore-purchases', itemId: id, transactions: reverted });
          announce(`Compra de ${item.name} restaurada`);
        },
      });
    }
  }, [announce, showToast]);

  const setWishlist = useCallback<DataValue['setWishlist']>((id, wishlist) => {
    const current = stateRef.current;
    const item = current.items.find((i) => i.id === id);
    if (!item || item.wishlist === wishlist) return false;

    const prev = { wishlist: item.wishlist, bought: item.bought };
    const revertedPurchases =
      wishlist && item.bought
        ? current.transactions.filter((t) => t.linkedItemId === id && t.type === 'gasto')
        : [];

    dispatch({ type: 'set-wishlist', id, wishlist });

    const msg = wishlist
      ? `"${item.name}" guardado en la wishlist`
      : `"${item.name}" movido a la lista de compras`;
    announce(msg);
    showToast(msg, {
      actionLabel: 'Deshacer',
      onAction: () => {
        dispatch({ type: 'set-wishlist', id, wishlist: prev.wishlist });
        if (prev.bought) {
          if (revertedPurchases.length > 0) {
            dispatch({ type: 'restore-purchases', itemId: id, transactions: revertedPurchases });
          } else {
            dispatch({ type: 'toggle-bought', id, bought: true, accountId: null });
          }
        }
      },
    });
    return true;
  }, [announce, showToast]);

  const setPrefs = useCallback<PrefsValue['setPrefs']>((patch) => {
    // La cotización nunca puede quedar en 0 o NaN: rompería todo consolidado.
    dispatch({
      type: 'set-prefs',
      patch: patch.usdRate === undefined ? patch : { ...patch, usdRate: normalizeUsdRate(patch.usdRate) },
    });
  }, []);

  const addCategory = useCallback<DataValue['addCategory']>((name) => {
    const trimmed = normalizeLabel(name, CATEGORY_MAX_LENGTH);
    if (!trimmed) return false;
    if (stateRef.current.categories.some((c) => sameText(c, trimmed))) return false;

    dispatch({ type: 'add-category', name: trimmed });
    showToast(`Categoría "${trimmed}" creada`);
    return true;
  }, [showToast]);

  const updateCategory = useCallback<DataValue['updateCategory']>((oldName, newName) => {
    const trimmed = normalizeLabel(newName, CATEGORY_MAX_LENGTH);
    if (!trimmed || trimmed === oldName) return false;
    if (stateRef.current.categories.some((c) => c.toLocaleLowerCase('es') === trimmed.toLocaleLowerCase('es'))) {
      return false;
    }

    dispatch({ type: 'update-category', oldName, newName: trimmed });
    showToast('Categoría actualizada');
    return true;
  }, [showToast]);

  const deleteCategory = useCallback<DataValue['deleteCategory']>((name) => {
    dispatch({ type: 'delete-category', name });
    showToast(`Categoría "${name}" eliminada. Sus artículos se movieron a "Otros".`);
  }, [showToast]);

  const setView = useCallback<UIValue['setView']>((view) => {
    dispatch({ type: 'set-view', view });
  }, []);

  const setEditingItem = useCallback<UIValue['setEditingItem']>((item) => {
    dispatch({ type: 'set-editing', item });
  }, []);

  const setSelectedItem = useCallback<UIValue['setSelectedItem']>((item) => {
    dispatch({ type: 'set-selected', item });
  }, []);

  const setBuyPromptItemId = useCallback<UIValue['setBuyPromptItemId']>((id) => {
    dispatch({ type: 'set-buy-prompt', id });
  }, []);

  const reorderItems = useCallback<DataValue['reorderItems']>((activeId, overId) => {
    const items = stateRef.current.items;
    const oldIndex = items.findIndex((i) => i.id === activeId);
    const newIndex = items.findIndex((i) => i.id === overId);
    if (oldIndex !== -1 && newIndex !== -1) {
      const newItems = arrayMove(items, oldIndex, newIndex);
      dispatch({ type: 'reorder-items', items: newItems });
    }
  }, []);

  // ==========================================
  // ACCIONES DE FINANZAS
  // ==========================================
  const addAccount = useCallback<FinanceValue['addAccount']>((draft) => {
    const name = normalizeLabel(draft.name, 60);
    if (!name) return false;
    if (stateRef.current.accounts.some((a) => sameText(a.name, name))) return false;

    const account: Account = {
      id: createId(),
      name,
      type: draft.type,
      balance: Number.isFinite(draft.balance) ? roundMoney(draft.balance) : 0,
      currency: draft.currency ?? 'ARS',
      color: normalizeLabel(draft.color, 20) || 'accent',
      closingDay: draft.type === 'tarjeta' ? normalizeBillingDay(draft.closingDay) : null,
      dueDay: draft.type === 'tarjeta' ? normalizeBillingDay(draft.dueDay) : null,
      createdAt: Date.now(),
    };

    dispatch({ type: 'add-account', account });
    announce(`Cuenta ${name} creada`);
    showToast('Cuenta creada');
    return true;
  }, [announce, showToast]);

  const updateAccount = useCallback<FinanceValue['updateAccount']>((account) => {
    const accounts = stateRef.current.accounts;
    const current = accounts.find((a) => a.id === account.id);
    if (!current) return false;

    const name = normalizeLabel(account.name, 60);
    if (!name) return false;
    if (accounts.some((a) => a.id !== account.id && sameText(a.name, name))) return false;

    const balance = Number(account.balance);

    // Cambiar la moneda reinterpretaría todo el historial de la cuenta: sólo
    // se permite mientras no tenga movimientos.
    const hasMovements = stateRef.current.transactions.some(
      (t) => t.accountId === account.id || t.destinationAccountId === account.id,
    );
    const currency: Currency = hasMovements
      ? current.currency ?? 'ARS'
      : account.currency ?? current.currency ?? 'ARS';

    dispatch({
      type: 'update-account',
      account: {
        ...current,
        name,
        type: account.type,
        currency,
        color: normalizeLabel(account.color, 20) || current.color,
        balance: Number.isFinite(balance) ? roundMoney(balance) : current.balance,
        // Al dejar de ser tarjeta los días dejan de existir: se limpian a null
        // (no `undefined`) para que SQLite no conserve el valor anterior.
        closingDay:
          account.type === 'tarjeta' ? normalizeBillingDay(account.closingDay) : null,
        dueDay: account.type === 'tarjeta' ? normalizeBillingDay(account.dueDay) : null,
      },
    });

    showToast('Cuenta actualizada');
    return true;
  }, [showToast]);

  const deleteAccount = useCallback<FinanceValue['deleteAccount']>((id) => {
    const current = stateRef.current;
    const account = current.accounts.find((a) => a.id === id);
    if (!account) return;

    const affected = current.transactions.filter(
      (t) => t.accountId === id || t.destinationAccountId === id,
    ).length;

    dispatch({ type: 'delete-account', id });
    announce(`Cuenta ${account.name} eliminada`);
    showToast(
      affected > 0
        ? `Cuenta "${account.name}" eliminada junto con ${affected} movimiento${affected === 1 ? '' : 's'}.`
        : `Cuenta "${account.name}" eliminada.`,
    );
  }, [announce, showToast]);

  const addTransaction = useCallback<FinanceValue['addTransaction']>((draft, source) => {
    const accounts = stateRef.current.accounts;
    const account = accounts.find((a) => a.id === draft.accountId);
    if (!account) return false;

    const accountCurrency = account.currency ?? 'ARS';

    // El monto llega en la moneda declarada por el formulario (por defecto, la
    // de la cuenta) y se guarda siempre en la moneda de la cuenta.
    const amount = convertCurrency(
      Number(draft.amount),
      source?.currency ?? accountCurrency,
      accountCurrency,
      stateRef.current.prefs.usdRate,
      source?.taxPercent ?? 0,
    );
    if (!Number.isFinite(amount) || amount <= 0) return false;

    let destinationAccountId: string | null = null;
    if (draft.type === 'transferencia') {
      if (!draft.destinationAccountId) return false;
      if (draft.destinationAccountId === draft.accountId) return false;

      const destination = accounts.find((a) => a.id === draft.destinationAccountId);
      if (!destination) return false;

      // Una transferencia mueve un único monto: origen y destino deben compartir
      // moneda. Cambiar de moneda es una operación de cambio, no una transferencia.
      if ((destination.currency ?? 'ARS') !== accountCurrency) return false;

      destinationAccountId = draft.destinationAccountId;
    }

    const transaction: Transaction = {
      id: createId(),
      accountId: draft.accountId,
      destinationAccountId,
      type: draft.type,
      amount,
      date: Number.isFinite(draft.date) ? draft.date : Date.now(),
      category: normalizeLabel(draft.category, 40),
      notes: normalizeLabel(draft.notes, 250),
      linkedItemId: draft.linkedItemId ?? null,
    };

    dispatch({ type: 'add-transaction', transaction });
    announce('Movimiento registrado');
    showToast('Movimiento registrado');
    return true;
  }, [announce, showToast]);

  const addTransactionsBatch = useCallback<FinanceValue['addTransactionsBatch']>((drafts, source) => {
    const accounts = stateRef.current.accounts;
    const byId = new Map(accounts.map((account) => [account.id, account] as const));
    const valid: Transaction[] = [];

    for (const draft of drafts) {
      const account = byId.get(draft.accountId);
      if (!account) continue;

      const accountCurrency = account.currency ?? 'ARS';
      const amount = convertCurrency(
        Number(draft.amount),
        source?.currency ?? accountCurrency,
        accountCurrency,
        stateRef.current.prefs.usdRate,
        source?.taxPercent ?? 0,
      );
      if (!Number.isFinite(amount) || amount <= 0) continue;

      let destinationAccountId: string | null = null;

      if (draft.type === 'transferencia') {
        if (!draft.destinationAccountId) continue;
        if (draft.destinationAccountId === draft.accountId) continue;

        const destination = byId.get(draft.destinationAccountId);
        if (!destination) continue;
        if ((destination.currency ?? 'ARS') !== accountCurrency) continue;

        destinationAccountId = draft.destinationAccountId;
      } else if (draft.type !== 'ingreso' && draft.type !== 'gasto') {
        continue;
      }

      valid.push({
        id: createId(),
        accountId: draft.accountId,
        destinationAccountId,
        type: draft.type,
        amount,
        date: Number.isFinite(draft.date) ? draft.date : Date.now(),
        category: normalizeLabel(draft.category, 40) || 'Otros',
        notes: normalizeLabel(draft.notes, 250),
        linkedItemId: draft.linkedItemId ?? null,
        recurringExpenseId: draft.recurringExpenseId ?? null,
      });
    }

    if (valid.length === 0) return 0;

    dispatch({ type: 'add-transactions-batch', transactions: valid });
    announce(`Se importaron ${valid.length} movimientos`);
    showToast(`Se importaron ${valid.length} movimientos`);
    return valid.length;
  }, [announce, showToast]);

  const updateTransaction = useCallback<FinanceValue['updateTransaction']>((id, patch) => {    const current = stateRef.current.transactions.find((t) => t.id === id);
    if (!current) return false;

    dispatch({
      type: 'update-transaction',
      transaction: {
        ...current,
        category: normalizeLabel(patch.category, 40),
        notes: normalizeLabel(patch.notes, 250),
        date: Number.isFinite(patch.date) ? patch.date : current.date,
      },
    });

    announce('Movimiento actualizado');
    showToast('Movimiento actualizado');
    return true;
  }, [announce, showToast]);

  const deleteTransaction = useCallback<FinanceValue['deleteTransaction']>((id) => {
    if (!stateRef.current.transactions.some((t) => t.id === id)) return;

    dispatch({ type: 'delete-transaction', id });
    announce('Movimiento eliminado');
    showToast('Movimiento eliminado');
  }, [announce, showToast]);

  // ==========================================
  // METAS DE AHORRO
  // ==========================================
  const addSavingsGoal = useCallback<FinanceValue['addSavingsGoal']>((draft) => {
    const name = normalizeLabel(draft.name, 60);
    if (!name) return false;
    if (stateRef.current.savingsGoals.some((g) => sameText(g.name, name))) return false;

    const target = roundMoney(Number(draft.targetAmount));
    const current = roundMoney(Number(draft.currentAmount));

    const goal: SavingsGoal = {
      id: createId(),
      name,
      targetAmount: Number.isFinite(target) && target > 0 ? target : 0,
      currentAmount: Number.isFinite(current) && current > 0 ? current : 0,
      color: normalizeLabel(draft.color, 20) || 'accent',
      deadline: normalizeDeadline(draft.deadline),
      createdAt: Date.now(),
    };

    dispatch({ type: 'add-savings-goal', goal });
    announce(`Meta ${name} creada`);
    showToast('Meta de ahorro creada');
    return true;
  }, [announce, showToast]);

  const updateSavingsGoal = useCallback<FinanceValue['updateSavingsGoal']>((goal) => {
    const goals = stateRef.current.savingsGoals;
    const current = goals.find((g) => g.id === goal.id);
    if (!current) return false;

    const name = normalizeLabel(goal.name, 60);
    if (!name) return false;
    if (goals.some((g) => g.id !== goal.id && sameText(g.name, name))) return false;

    const target = roundMoney(Number(goal.targetAmount));
    const amount = roundMoney(Number(goal.currentAmount));

    dispatch({
      type: 'update-savings-goal',
      goal: {
        ...current,
        name,
        targetAmount: Number.isFinite(target) && target > 0 ? target : 0,
        currentAmount: Number.isFinite(amount) && amount > 0 ? amount : 0,
        color: normalizeLabel(goal.color, 20) || current.color,
        deadline: normalizeDeadline(goal.deadline),
      },
    });

    showToast('Meta actualizada');
    return true;
  }, [showToast]);

  const deleteSavingsGoal = useCallback<FinanceValue['deleteSavingsGoal']>((id) => {
    const goal = stateRef.current.savingsGoals.find((g) => g.id === id);
    if (!goal) return;

    dispatch({ type: 'delete-savings-goal', id });
    announce(`Meta ${goal.name} eliminada`);
    showToast(`Meta "${goal.name}" eliminada. Sus movimientos se conservan.`);
  }, [announce, showToast]);

  const contributeToGoal = useCallback<FinanceValue['contributeToGoal']>(
    (goalId, amount, accountId) => {
      const current = stateRef.current;
      const goal = current.savingsGoals.find((g) => g.id === goalId);
      if (!goal) return false;

      const raw = Number(amount);
      const requested = roundMoney(Math.abs(raw));
      if (!Number.isFinite(requested) || requested <= 0) return false;

      const isWithdrawal = raw < 0;
      if (isWithdrawal && goal.currentAmount <= 0) return false;

      const effective = isWithdrawal ? Math.min(requested, goal.currentAmount) : requested;

      let transaction: Transaction | null = null;
      if (accountId) {
        const account = current.accounts.find((a) => a.id === accountId);
        if (!account) return false;

        // Las metas se llevan en pesos: si la cuenta es en USD, el aporte se
        // registra convertido para que el saldo siga siendo coherente.
        const accountAmount = convertCurrency(
          effective,
          'ARS',
          account.currency ?? 'ARS',
          current.prefs.usdRate,
        );
        if (accountAmount <= 0) return false;

        transaction = {
          id: createId(),
          accountId,
          destinationAccountId: null,
          type: isWithdrawal ? 'ingreso' : 'gasto',
          amount: accountAmount,
          date: Date.now(),
          category: 'Ahorro',
          notes: `${isWithdrawal ? 'Retiro de meta' : 'Aporte a meta'}: ${goal.name}`,
          linkedItemId: null,
        };
      }

      dispatch({
        type: 'contribute-goal',
        goalId,
        delta: isWithdrawal ? -effective : effective,
        transaction,
      });

      announce(isWithdrawal ? 'Retiro registrado' : 'Aporte registrado');
      showToast(
        isWithdrawal
          ? `Retiro registrado en "${goal.name}"`
          : `Aporte registrado en "${goal.name}"`,
      );
      return true;
    },
    [announce, showToast],
  );

  // ==========================================
  // GASTOS FIJOS Y SERVICIOS DEL HOGAR
  // ==========================================
  const addRecurringExpense = useCallback<FinanceValue['addRecurringExpense']>((draft) => {
    const name = normalizeLabel(draft.name, 60);
    if (!name) return false;
    if (stateRef.current.recurringExpenses.some((e) => sameText(e.name, name))) return false;

    const expense = normalizeRecurringExpense({
      ...draft,
      id: createId(),
      createdAt: Date.now(),
    });
    if (!expense) return false;

    dispatch({ type: 'add-recurring', expense });
    announce(`Servicio ${expense.name} creado`);
    showToast('Gasto fijo creado');
    return true;
  }, [announce, showToast]);

  const updateRecurringExpense = useCallback<FinanceValue['updateRecurringExpense']>((expense) => {
    const list = stateRef.current.recurringExpenses;
    const current = list.find((e) => e.id === expense.id);
    if (!current) return false;

    const name = normalizeLabel(expense.name, 60);
    if (!name) return false;
    if (list.some((e) => e.id !== expense.id && sameText(e.name, name))) return false;

    // Normalizar acá evita que un formulario mal tipado ensucie la base.
    const next = normalizeRecurringExpense({
      ...current,
      ...expense,
      id: current.id,
      createdAt: current.createdAt,
    });
    if (!next) return false;

    dispatch({ type: 'update-recurring', expense: next });
    showToast('Gasto fijo actualizado');
    return true;
  }, [showToast]);

  const deleteRecurringExpense = useCallback<FinanceValue['deleteRecurringExpense']>((id) => {
    const expense = stateRef.current.recurringExpenses.find((e) => e.id === id);
    if (!expense) return;

    dispatch({ type: 'delete-recurring', id });
    announce(`Servicio ${expense.name} eliminado`);
    showToast(`Servicio "${expense.name}" eliminado. Sus movimientos se conservan.`);
  }, [announce, showToast]);

  const payRecurringExpense = useCallback<FinanceValue['payRecurringExpense']>(
    (id, accountId, customAmount) => {
      const current = stateRef.current;
      const expense = current.recurringExpenses.find((e) => e.id === id);
      if (!expense) return false;

      // La boleta real puede diferir del estimado (luz, gas, agua).
      const raw = Number(customAmount);
      const requested = roundMoney(
        Number.isFinite(raw) && raw > 0 ? raw : expense.amount,
      );
      if (!Number.isFinite(requested) || requested <= 0) return false;

      // `undefined` = usar la cuenta sugerida; `null` = pagar sin cuenta.
      const targetAccount = accountId === undefined ? expense.accountId : accountId;

      let transaction: Transaction | null = null;
      if (targetAccount) {
        const account = current.accounts.find((a) => a.id === targetAccount);
        if (!account) return false;

        // El monto del servicio está en su moneda; el gasto se debita en la
        // moneda de la cuenta. Un servicio USD pagado desde pesos suma la
        // cotización y las percepciones configuradas.
        const amount = convertCurrency(
          requested,
          expense.currency ?? 'ARS',
          account.currency ?? 'ARS',
          current.prefs.usdRate,
          expense.taxPercent ?? 0,
        );
        if (!Number.isFinite(amount) || amount <= 0) return false;

        transaction = {
          id: createId(),
          accountId: targetAccount,
          destinationAccountId: null,
          type: 'gasto',
          amount,
          date: Date.now(),
          category: expense.category,
          notes: `Servicio: ${expense.name}`,
          linkedItemId: null,
          recurringExpenseId: expense.id,
        };
      }

      dispatch({ type: 'pay-recurring', id, paidMonth: currentMonthKey(), transaction });

      announce(`Pago de ${expense.name} registrado`);
      showToast(`Servicio "${expense.name}" registrado`);
      return true;
    },
    [announce, showToast],
  );

  // ==========================================
  // FUNCIONES DE BACKUP (EXPORTAR / IMPORTAR)
  // ==========================================
  const exportData = useCallback<DataValue['exportData']>(() => {
    void (async () => {
      const data = await buildBackupPayload();

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `depa-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Copia de seguridad descargada');
    })();
  }, [buildBackupPayload, showToast]);

  /** Misma validación para archivo importado y para copia local restaurada. */
  const importPayload = useCallback(async (raw: unknown): Promise<boolean> => {
    try {
      const parsed = (raw ?? {}) as BackupImportData;

      if (!Array.isArray(parsed.items)) {
        throw new Error('Formato de archivo inválido');
      }

      const validItems: Item[] = parsed.items
        .map((entry: unknown) => normalizeItem(entry))
        .filter((i: Item | null): i is Item => i !== null);

      if (validItems.length === 0 && parsed.items.length > 0) {
        throw new Error('El archivo no contiene artículos válidos.');
      }

      const previousItems = stateRef.current.items;

      const importedItems = await Promise.all(
        validItems.map(async (item) => {
          if (!item.imageData?.startsWith('data:image/')) return item;

          const stored = await persistImageToDisk(item.imageData, item.id);
          return stored === item.imageData ? item : { ...item, imageData: stored };
        }),
      );

      const rawAccounts = Array.isArray(parsed.accounts) ? parsed.accounts : [];
      const validAccounts = rawAccounts
        .map((entry: unknown) => normalizeAccount(entry))
        .filter((a: Account | null): a is Account => a !== null);

      const rawTransactions = Array.isArray(parsed.transactions) ? parsed.transactions : [];
      const validTransactions = pruneTransactions(
        rawTransactions
          .map((entry: unknown) => normalizeTransaction(entry))
          .filter((t: Transaction | null): t is Transaction => t !== null),
        validAccounts,
      );

      const rawGoals = Array.isArray(parsed.savingsGoals) ? parsed.savingsGoals : [];
      const validGoals = rawGoals
        .map((entry: unknown) => normalizeSavingsGoal(entry))
        .filter((g: SavingsGoal | null): g is SavingsGoal => g !== null);

      // Backups viejos no traen la clave: se importa vacío, sin fallar.
      const rawRecurring = Array.isArray(parsed.recurringExpenses)
        ? parsed.recurringExpenses
        : [];
      const validRecurring = rawRecurring
        .map((entry: unknown) => normalizeRecurringExpense(entry))
        .filter((e: RecurringExpense | null): e is RecurringExpense => e !== null);

      const nextPrefs = normalizePrefs(parsed.prefs);

      dispatch({
        type: 'init',
        payload: {
          items: importedItems,
          categories: parsed.categories || DEFAULT_CATEGORIES,
          prefs: nextPrefs,
          accounts: validAccounts,
          transactions: validTransactions,
          savingsGoals: validGoals,
          recurringExpenses: validRecurring,
          view: 'list',
        },
      });

      // Guardamos también las preferencias importadas en SQLite
      void savePrefs(nextPrefs);

      // Limpiar imágenes locales que pertenecían a artículos anteriores y ya no se usan
      if (isTauri()) {
        const nextRefs = new Set(
          importedItems.map((i) => i.imageData).filter((ref): ref is string => Boolean(ref)),
        );
        for (const oldItem of previousItems) {
          if (
            oldItem.imageData &&
            isLocalImageRef(oldItem.imageData) &&
            !nextRefs.has(oldItem.imageData)
          ) {
            void deleteDiskImage(oldItem.imageData).catch(console.warn);
          }
        }
      }

      showToast(
        `Datos importados correctamente (${importedItems.length} artículos, ${validAccounts.length} cuentas, ${validGoals.length} metas)`,
      );
      dispatch({ type: 'set-view', view: 'list' });
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error
        ? err.message
        : 'Error al leer el archivo. Asegúrate de que sea un backup válido.';
      showToast(message);
      return false;
    }
  }, [showToast]);

  const importData = useCallback<DataValue['importData']>((file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      void (async () => {
        try {
          const content = e.target?.result as string;
          await importPayload(JSON.parse(content));
        } catch {
          showToast('Error al leer el archivo. Asegúrate de que sea un backup válido.');
        }
      })();
    };
    reader.readAsText(file);
  }, [importPayload, showToast]);

  const triggerManualLocalBackup = useCallback<DataValue['triggerManualLocalBackup']>(
    async () => {
      try {
        const payload = await buildBackupPayload();
        const result = await runAutoBackup(JSON.stringify(payload), { force: true });

        if (result.created) {
          showToast('Respaldo local guardado');
          return true;
        }
      } catch (error) {
        console.warn('Respaldo manual fallido.', error);
      }

      showToast('No se pudo guardar el respaldo local.');
      return false;
    },
    [buildBackupPayload, showToast],
  );

  const restoreLocalBackup = useCallback<DataValue['restoreLocalBackup']>(
    async (fileName) => {
      const content = await readAutoBackupContent(fileName);

      if (!content) {
        showToast('No se pudo leer la copia seleccionada.');
        return false;
      }

      try {
        return await importPayload(JSON.parse(content));
      } catch {
        showToast('La copia seleccionada está dañada.');
        return false;
      }
    },
    [importPayload, showToast],
  );

  // ==========================================
  // VALORES DE CADA CONTEXTO
  // ==========================================
  const toastValue = useMemo<ToastValue>(() => ({
    toast,
    showToast,
    hideToast,
    announce,
  }), [toast, showToast, hideToast, announce]);

  const prefsValue = useMemo<PrefsValue>(() => ({
    prefs: state.prefs,
    setPrefs,
  }), [state.prefs, setPrefs]);

  const financeValue = useMemo<FinanceValue>(() => ({
    accounts: state.accounts,
    transactions: state.transactions,
    savingsGoals: state.savingsGoals,
    recurringExpenses: state.recurringExpenses,
    addAccount, updateAccount, deleteAccount, addTransaction, updateTransaction, deleteTransaction,
    addTransactionsBatch,
    addSavingsGoal, updateSavingsGoal, deleteSavingsGoal, contributeToGoal,
    addRecurringExpense, updateRecurringExpense, deleteRecurringExpense, payRecurringExpense,
  }), [
    state.accounts, state.transactions, state.savingsGoals, state.recurringExpenses,
    addAccount, updateAccount, deleteAccount, addTransaction, updateTransaction, deleteTransaction,
    addTransactionsBatch,
    addSavingsGoal, updateSavingsGoal, deleteSavingsGoal, contributeToGoal,
    addRecurringExpense, updateRecurringExpense, deleteRecurringExpense, payRecurringExpense,
  ]);

  const dataValue = useMemo<DataValue>(() => ({
    items: state.items,
    categories: state.categories,
    ready: state.ready,
    addItem, updateItem, removeItem, toggleBought, setWishlist,
    reorderItems,
    addCategory, updateCategory, deleteCategory,
    exportData, importData, triggerManualLocalBackup, restoreLocalBackup,
  }), [
    state.items, state.categories, state.ready,
    addItem, updateItem, removeItem, toggleBought, setWishlist,
    reorderItems,
    addCategory, updateCategory, deleteCategory,
    exportData, importData, triggerManualLocalBackup, restoreLocalBackup,
  ]);

  const uiValue = useMemo<UIValue>(() => ({
    view: state.view,
    setView,
    editingItem: state.editingItem,
    setEditingItem,
    selectedItem: state.selectedItem,
    setSelectedItem,
    buyPromptItemId: state.buyPromptItemId,
    setBuyPromptItemId,
    isCategoryManagerOpen,
    setCategoryManagerOpen,
    isSettingsOpen,
    setSettingsOpen,
    itemFormOpen,
    setItemFormOpen,
    theme,
    setTheme,
  }), [
    state.view, state.editingItem, state.selectedItem, state.buyPromptItemId,
    setView, setEditingItem, setSelectedItem, setBuyPromptItemId,
    isCategoryManagerOpen,
    isSettingsOpen,
    itemFormOpen,
    theme, setTheme,
  ]);

  return (
    <ToastContext.Provider value={toastValue}>
      <PrefsContext.Provider value={prefsValue}>
        <FinanceContext.Provider value={financeValue}>
          <DataContext.Provider value={dataValue}>
            <UIContext.Provider value={uiValue}>
              {children}
              <p id="sr-status" className="sr-only" role="status" aria-live="polite" />
            </UIContext.Provider>
          </DataContext.Provider>
        </FinanceContext.Provider>
      </PrefsContext.Provider>
    </ToastContext.Provider>
  );
}