'use client';

import {
  createContext, useCallback, useContext, useEffect, useMemo, useReducer,
  useRef, useState, type ReactNode,
} from 'react';
import { arrayMove } from '@dnd-kit/sortable';
import {
  loadItems, loadCategories, loadPrefs,
  saveItems, savePrefs, saveCategories, mergeItemCategories,
  loadAccounts, saveAccounts, loadTransactions, saveTransactions,
  loadSavingsGoals, saveSavingsGoals,
} from '@/lib/storage';
import { DEFAULT_CATEGORIES, DEFAULT_PREFS, CATEGORY_MAX_LENGTH } from '@/lib/config';
import {
  createId, normalizeLabel, normalizeItem, normalizeAccount, normalizeTransaction,
  normalizeSavingsGoal, pruneTransactions, roundMoney, sameText, normalizeMonth,
  currentMonthKey,
} from '@/lib/utils';
import type { Account, Item, Prefs, SavingsGoal, Transaction, View } from '@/lib/types';

export type Theme = 'light' | 'dark' | 'system';

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
 * elimina la transacción vinculada. Un artículo sólo puede tener un gasto
 * generado por este flujo, pero filtramos por id por si hubiera duplicados.
 */
const detachLinkedPurchases = (s: AppState, itemId: string) => {
  const linked = s.transactions.filter(
    (t) => t.linkedItemId === itemId && t.type === 'gasto'
  );

  let accounts = s.accounts;
  for (const transaction of linked) accounts = revertFromBalances(accounts, transaction);

  return {
    accounts,
    transactions: s.transactions.filter(
      (t) => !(t.linkedItemId === itemId && t.type === 'gasto')
    ),
  };
};

/**
 * Al marcar una compra, la financiación necesita un mes de inicio para poder
 * calcular qué cuota va. Si el usuario no lo eligió en el formulario se usa el
 * mes planificado del artículo y, si tampoco hay, el mes actual.
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

      // Marcar dos veces lo mismo no debe duplicar el gasto.
      if (a.bought && found.bought) return s;

      const item = a.bought ? withInstallmentStart(found) : found;
      const items = s.items.map((i) => (i.id === a.id ? { ...i, bought: a.bought } : i));

      if (!a.bought) {
        return { ...s, ...detachLinkedPurchases(s, a.id), items };
      }

      // Compra sin registrar en finanzas: sólo cambia el estado del artículo.
      if (!a.accountId) return { ...s, items };

      const account = s.accounts.find((acc) => acc.id === a.accountId);
      if (!account) return s;

      // Si el artículo está en cuotas, el gasto es la cuota mensual; si no, el precio.
      const amount =
        item.installments && item.installments.count > 0 && item.installments.amount > 0
          ? item.installments.amount
          : item.price;

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
      // Si el artículo ya no existe (se borró dentro de la ventana del toast),
      // no resucitamos plata sin compra: no-op.
      if (!s.items.some((i) => i.id === a.itemId)) return s;

      // Deshacer un "desmarcar comprado": vuelven los gastos y los saldos
      // exactamente como estaban, en un solo paso.
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
      // Mover a wishlist desmarca la compra: no debe quedar el gasto colgado.
      const reverted = a.wishlist && current?.bought ? detachLinkedPurchases(s, a.id) : null;

      return {
        ...s,
        accounts: reverted ? reverted.accounts : s.accounts,
        transactions: reverted ? reverted.transactions : s.transactions,
        items: s.items.map((i) =>
          i.id === a.id
            ? { ...i, wishlist: a.wishlist, bought: a.wishlist ? false : i.bought }
            : i
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
      // Borrar una cuenta borra sus movimientos, pero antes revierte el efecto
      // que esos movimientos tuvieron sobre las OTRAS cuentas (transferencias).
      const affected = s.transactions.filter(
        (t) => t.accountId === a.id || t.destinationAccountId === a.id
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

      // Aporte/retiro sin cuenta: sólo se mueve la meta, no la plata real.
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
  version: number;
}

export interface BackupImportData {
  items: unknown[];
  categories?: string[];
  prefs?: Prefs;
  accounts?: unknown[];
  transactions?: unknown[];
  savingsGoals?: unknown[];
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
}

export interface PrefsValue {
  prefs: Prefs;
  setPrefs: (patch: Partial<Prefs>) => void;
}

export interface FinanceValue {
  accounts: Account[];
  transactions: Transaction[];
  savingsGoals: SavingsGoal[];
  addAccount: (draft: Omit<Account, 'id' | 'createdAt'>) => boolean;
  updateAccount: (account: Account) => boolean;
  deleteAccount: (id: string) => void;
  addTransaction: (draft: Omit<Transaction, 'id'>) => boolean;
  deleteTransaction: (id: string) => void;
  addSavingsGoal: (draft: Omit<SavingsGoal, 'id' | 'createdAt'>) => boolean;
  updateSavingsGoal: (goal: SavingsGoal) => boolean;
  deleteSavingsGoal: (id: string) => void;
  /**
   * Aporte atómico a una meta. `amount` positivo suma; negativo retira.
   * Con `accountId` mueve el saldo real y registra el movimiento.
   */
  contributeToGoal: (goalId: string, amount: number, accountId?: string | null) => boolean;
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

/**
 * Medio de pago con el que se registró la compra de un artículo.
 *
 * - `null`: el artículo no está comprado, no corresponde mostrar nada.
 * - `'Pagado con <cuenta>'`: hay un gasto vinculado y la cuenta existe.
 * - `'Sin cuenta vinculada'`: se compró sin registrar en finanzas.
 * - `'Pagado con cuenta eliminada'`: el gasto sobrevivió a su cuenta.
 */
export function usePurchasePayment(item: Pick<Item, 'id' | 'bought'>): string | null {
  const { transactions, accounts } = useFinance();

  return useMemo(() => {
    if (!item.bought) return null;

    const linked = transactions.find(
      (t) => t.linkedItemId === item.id && t.type === 'gasto'
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

  const setTheme = useCallback<UIValue['setTheme']>((nextTheme) => {
    setThemeState(nextTheme);
  }, []);

  // Timers y refs
  const toastTimer = useRef<number | null>(null);
  const announceTimer = useRef<number | null>(null);

  // Marca que la hidratación inicial ya terminó: evita reescribir en disco
  // los mismos megabytes de Base64 que acabamos de leer.
  const hydrated = useRef(false);

  // Debounce de prefs: guardamos sólo el último valor pendiente.
  const prefsTimer = useRef<number | null>(null);
  const prefsPending = useRef<Prefs | null>(null);

  // Espejo del estado para acciones que deben ser estables (exportData).
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // ==========================================
  // FIX #1: UI / TOAST declarados ANTES de los useEffect de persistencia.
  // Antes estaban más abajo, y el array de dependencias [.., showToast]
  // del useEffect de "Persistencia de Items" los tocaba en TDZ.
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
  // EFECTOS DE CARGA Y PERSISTENCIA (ASYNC)
  // ==========================================
  useEffect(() => {
    let mounted = true;
    async function initDB() {
      // 1. Cargas asíncronas desde SQLite
      const [items, categories, accounts, rawTransactions, savingsGoals] = await Promise.all([
        loadItems(),
        loadCategories(),
        loadAccounts(),
        loadTransactions(),
        loadSavingsGoals(),
      ]);

      // 2. Carga síncrona desde localStorage
      const prefs = loadPrefs();

      if (!mounted) return;

      const transactions = pruneTransactions(rawTransactions, accounts);

      if (mergeItemCategories(items, categories)) {
        saveCategories(categories).catch(console.error);
      }

      dispatch({
        type: 'init',
        payload: {
          items, categories, prefs, accounts, transactions, savingsGoals, view: 'home',
        },
      });
    }

    initDB();
    return () => { mounted = false; };
  }, []);

  // ==========================================
  // PERSISTENCIA UNIFICADA EN SQLITE
  // ==========================================
  useEffect(() => {
    if (!state.ready) return;

    // Evitamos guardar inmediatamente después de cargar la base de datos
    if (!hydrated.current) {
      hydrated.current = true;
      return;
    }

    // Guardamos todo de forma concurrente pero en un solo Promise
    // para evitar que SQLite se bloquee al intentar dos escrituras a la vez.
    Promise.all([
      saveItems(state.items),
      saveCategories(state.categories),
      saveAccounts(state.accounts),
      saveTransactions(state.transactions),
      saveSavingsGoals(state.savingsGoals),
    ]).then((results) => {
      const hasError = results.some(r => r && !r.success);
      if (hasError) {
        console.error('🔥 Error guardando en SQLite. Revisa las transacciones.');
      }
    }).catch(console.error);

  }, [state.items, state.categories, state.accounts, state.transactions, state.savingsGoals, state.ready]);

  // Debounce de Prefs (Sincrónico en LocalStorage)
  useEffect(() => {
    if (!state.ready) return;

    prefsPending.current = state.prefs;
    if (prefsTimer.current !== null) window.clearTimeout(prefsTimer.current);

    prefsTimer.current = window.setTimeout(() => {
      prefsTimer.current = null;
      if (prefsPending.current) {
        savePrefs(prefsPending.current);
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

  // Flush al cerrar / ocultar la pestaña
  useEffect(() => {
    const flush = () => {
      if (prefsPending.current) {
        savePrefs(prefsPending.current);
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
    };

    apply();

    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }
  }, [theme]);

  // ==========================================
  // FIX #2: SERVICE WORKER (PWA) — useEffect CERRADO correctamente con }, []);
  // En la versión original faltaba el cierre y todo el componente quedaba
  // dentro del callback (de ahí el error "() => JSX.Element | undefined").
  // ==========================================
  useEffect(() => {
    // WebView2 no debe cachear un bundle viejo tras recompilar el .exe:
    // en Tauri ni siquiera registramos el Service Worker.
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
    dispatch({ type: 'update', item });
    announce(`${item.name} actualizado`);
    showToast('Artículo actualizado correctamente');
  }, [announce, showToast]);

  const removeItem = useCallback<DataValue['removeItem']>((id) => {
    const index = state.items.findIndex((i) => i.id === id);
    if (index === -1) return;
    const removed = state.items[index];

    dispatch({ type: 'remove', id });
    showToast(`"${removed.name}" eliminado`, {
      actionLabel: 'Deshacer',
      onAction: () => {
        dispatch({
          type: 'restore',
          item: removed,
          index: Math.min(index, state.items.length - 1),
        });
        announce(`${removed.name} restaurado en la lista`);
      },
    });
  }, [state.items, showToast, announce]);

  const toggleBought = useCallback<DataValue['toggleBought']>((id, bought, accountId) => {
    const item = state.items.find((i) => i.id === id);
    if (!item) return;

    // Al comprar con cuentas disponibles, primero preguntamos el medio de pago.
    // `accountId === null` explícito significa "sin registrar en finanzas".
    if (bought && accountId === undefined && state.accounts.length > 0) {
      dispatch({ type: 'set-buy-prompt', id });
      return;
    }

    // Copiamos los gastos vinculados ANTES del dispatch: el reducer los elimina
    // y sin esta copia no habría nada que restaurar.
    const reverted = bought
      ? []
      : state.transactions.filter((t) => t.linkedItemId === id && t.type === 'gasto');

    dispatch({ type: 'toggle-bought', id, bought, accountId: accountId ?? null });
    announce(`${item.name} marcado como ${bought ? 'comprado' : 'pendiente'}`);

    if (bought && accountId) {
      showToast('Compra registrada en finanzas');
      return;
    }

    // Desmarcar una compra con gasto vinculado borra movimientos y revierte
    // saldos. Es destructivo, así que damos 7 segundos para volver atrás.
    if (!bought && reverted.length > 0) {
      showToast(`"${item.name}" vuelve a pendiente`, {
        actionLabel: 'Deshacer',
        onAction: () => {
          dispatch({ type: 'restore-purchases', itemId: id, transactions: reverted });
          announce(`Compra de ${item.name} restaurada`);
        },
      });
    }
  }, [state.items, state.accounts, state.transactions, announce, showToast]);

  const setWishlist = useCallback<DataValue['setWishlist']>((id, wishlist) => {
    const item = state.items.find((i) => i.id === id);
    if (!item || item.wishlist === wishlist) return false;

    const prev = { wishlist: item.wishlist, bought: item.bought };
    dispatch({ type: 'set-wishlist', id, wishlist });

    const msg = wishlist
      ? `"${item.name}" guardado en la wishlist`
      : `"${item.name}" movido a la lista de compras`;
    announce(msg);
    showToast(msg, {
      actionLabel: 'Deshacer',
      onAction: () => {
        dispatch({ type: 'set-wishlist', id, wishlist: prev.wishlist });
        if (prev.bought) dispatch({ type: 'toggle-bought', id, bought: true });
      },
    });
    return true;
  }, [state.items, announce, showToast]);

  const setPrefs = useCallback<PrefsValue['setPrefs']>((patch) => {
    dispatch({ type: 'set-prefs', patch });
  }, []);

  const addCategory = useCallback<DataValue['addCategory']>((name) => {
    if (state.categories.some((c) => c.toLocaleLowerCase('es') === name.toLocaleLowerCase('es'))) return false;
    dispatch({ type: 'add-category', name });
    return true;
  }, [state.categories]);

  const updateCategory = useCallback<DataValue['updateCategory']>((oldName, newName) => {
    const trimmed = normalizeLabel(newName, CATEGORY_MAX_LENGTH);
    if (!trimmed || trimmed === oldName) return false;
    if (state.categories.some((c) => c.toLocaleLowerCase('es') === trimmed.toLocaleLowerCase('es'))) return false;

    dispatch({ type: 'update-category', oldName, newName: trimmed });
    showToast('Categoría actualizada');
    return true;
  }, [state.categories, showToast]);

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
    const oldIndex = state.items.findIndex((i) => i.id === activeId);
    const newIndex = state.items.findIndex((i) => i.id === overId);
    if (oldIndex !== -1 && newIndex !== -1) {
      const newItems = arrayMove(state.items, oldIndex, newIndex);
      dispatch({ type: 'reorder-items', items: newItems });
    }
  }, [state.items]);

  // ==========================================
  // ACCIONES DE FINANZAS
  // ==========================================
  const addAccount = useCallback<FinanceValue['addAccount']>((draft) => {
    const name = normalizeLabel(draft.name, 60);
    if (!name) return false;
    if (state.accounts.some((a) => sameText(a.name, name))) return false;

    const account: Account = {
      id: createId(),
      name,
      type: draft.type,
      balance: Number.isFinite(draft.balance) ? roundMoney(draft.balance) : 0,
      color: normalizeLabel(draft.color, 20) || 'accent',
      createdAt: Date.now(),
    };

    dispatch({ type: 'add-account', account });
    announce(`Cuenta ${name} creada`);
    showToast('Cuenta creada');
    return true;
  }, [state.accounts, announce, showToast]);

  const updateAccount = useCallback<FinanceValue['updateAccount']>((account) => {
    const current = state.accounts.find((a) => a.id === account.id);
    if (!current) return false;

    const name = normalizeLabel(account.name, 60);
    if (!name) return false;
    if (state.accounts.some((a) => a.id !== account.id && sameText(a.name, name))) return false;

    const balance = Number(account.balance);

    dispatch({
      type: 'update-account',
      account: {
        ...current,
        name,
        type: account.type,
        color: normalizeLabel(account.color, 20) || current.color,
        // Editar el saldo a mano desacopla la cuenta del historial de movimientos:
        // se permite como ajuste, pero se sanea para que nunca quede NaN.
        balance: Number.isFinite(balance) ? roundMoney(balance) : current.balance,
      },
    });

    showToast('Cuenta actualizada');
    return true;
  }, [state.accounts, showToast]);

  const deleteAccount = useCallback<FinanceValue['deleteAccount']>((id) => {
    const account = state.accounts.find((a) => a.id === id);
    if (!account) return;

    const affected = state.transactions.filter(
      (t) => t.accountId === id || t.destinationAccountId === id
    ).length;

    dispatch({ type: 'delete-account', id });
    announce(`Cuenta ${account.name} eliminada`);
    showToast(
      affected > 0
        ? `Cuenta "${account.name}" eliminada junto con ${affected} movimiento${affected === 1 ? '' : 's'}.`
        : `Cuenta "${account.name}" eliminada.`
    );
  }, [state.accounts, state.transactions, announce, showToast]);

  const addTransaction = useCallback<FinanceValue['addTransaction']>((draft) => {
    const amount = roundMoney(Number(draft.amount));
    if (!Number.isFinite(amount) || amount <= 0) return false;

    const accountIds = new Set(state.accounts.map((a) => a.id));
    if (!accountIds.has(draft.accountId)) return false;

    let destinationAccountId: string | null = null;
    if (draft.type === 'transferencia') {
      if (!draft.destinationAccountId) return false;
      if (draft.destinationAccountId === draft.accountId) return false;
      if (!accountIds.has(draft.destinationAccountId)) return false;
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
  }, [state.accounts, announce, showToast]);

  const deleteTransaction = useCallback<FinanceValue['deleteTransaction']>((id) => {
    if (!state.transactions.some((t) => t.id === id)) return;

    dispatch({ type: 'delete-transaction', id });
    announce('Movimiento eliminado');
    showToast('Movimiento eliminado');
  }, [state.transactions, announce, showToast]);

  // ==========================================
  // METAS DE AHORRO
  // ==========================================
  const addSavingsGoal = useCallback<FinanceValue['addSavingsGoal']>((draft) => {
    const name = normalizeLabel(draft.name, 60);
    if (!name) return false;
    if (state.savingsGoals.some((g) => sameText(g.name, name))) return false;

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
  }, [state.savingsGoals, announce, showToast]);

  const updateSavingsGoal = useCallback<FinanceValue['updateSavingsGoal']>((goal) => {
    const current = state.savingsGoals.find((g) => g.id === goal.id);
    if (!current) return false;

    const name = normalizeLabel(goal.name, 60);
    if (!name) return false;
    if (state.savingsGoals.some((g) => g.id !== goal.id && sameText(g.name, name))) return false;

    const target = roundMoney(Number(goal.targetAmount));
    const amount = roundMoney(Number(goal.currentAmount));

    dispatch({
      type: 'update-savings-goal',
      goal: {
        ...current,
        name,
        targetAmount: Number.isFinite(target) && target > 0 ? target : 0,
        // Editar el acumulado a mano es un ajuste consciente: se permite.
        currentAmount: Number.isFinite(amount) && amount > 0 ? amount : 0,
        color: normalizeLabel(goal.color, 20) || current.color,
        deadline: normalizeDeadline(goal.deadline),
      },
    });

    showToast('Meta actualizada');
    return true;
  }, [state.savingsGoals, showToast]);

  const deleteSavingsGoal = useCallback<FinanceValue['deleteSavingsGoal']>((id) => {
    const goal = state.savingsGoals.find((g) => g.id === id);
    if (!goal) return;

    dispatch({ type: 'delete-savings-goal', id });
    announce(`Meta ${goal.name} eliminada`);
    // Los movimientos ya registrados quedan: son historia real de las cuentas.
    showToast(`Meta "${goal.name}" eliminada. Sus movimientos se conservan.`);
  }, [state.savingsGoals, announce, showToast]);

  const contributeToGoal = useCallback<FinanceValue['contributeToGoal']>(
    (goalId, amount, accountId) => {
      const goal = state.savingsGoals.find((g) => g.id === goalId);
      if (!goal) return false;

      const raw = Number(amount);
      const requested = roundMoney(Math.abs(raw));
      if (!Number.isFinite(requested) || requested <= 0) return false;

      const isWithdrawal = raw < 0;
      if (isWithdrawal && goal.currentAmount <= 0) return false;

      // Nunca se retira más de lo acumulado: la meta no puede quedar negativa.
      const effective = isWithdrawal ? Math.min(requested, goal.currentAmount) : requested;

      let transaction: Transaction | null = null;
      if (accountId) {
        if (!state.accounts.some((a) => a.id === accountId)) return false;

        transaction = {
          id: createId(),
          accountId,
          destinationAccountId: null,
          // Aportar sale de la cuenta (gasto); retirar vuelve a la cuenta (ingreso).
          type: isWithdrawal ? 'ingreso' : 'gasto',
          amount: effective,
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
    [state.savingsGoals, state.accounts, announce, showToast],
  );

  // ==========================================
  // FUNCIONES DE BACKUP (EXPORTAR / IMPORTAR)
  // ==========================================
  const exportData = useCallback<DataValue['exportData']>(() => {
    const snapshot = stateRef.current;
    const data: BackupExportData = {
      items: snapshot.items,
      categories: snapshot.categories,
      prefs: snapshot.prefs,
      accounts: snapshot.accounts,
      transactions: snapshot.transactions,
      savingsGoals: snapshot.savingsGoals,
      version: 3,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `depa-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Copia de seguridad descargada');
  }, [showToast]);

  const importData = useCallback<DataValue['importData']>((file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const parsed = JSON.parse(content);

        if (!parsed.items || !Array.isArray(parsed.items)) {
          throw new Error('Formato de archivo inválido');
        }

        // BLINDAJE: Normalizamos cada artículo y filtramos los que sean inválidos
        const validItems = parsed.items
          .map((raw: unknown) => normalizeItem(raw))
          .filter((i: Item | null): i is Item => i !== null);

        if (validItems.length === 0 && parsed.items.length > 0) {
          throw new Error('El archivo no contiene artículos válidos.');
        }

        // Backups v1 no traen finanzas: arrays vacíos como fallback.
        const rawAccounts = Array.isArray(parsed.accounts) ? parsed.accounts : [];
        const validAccounts = rawAccounts
          .map((raw: unknown) => normalizeAccount(raw))
          .filter((a: Account | null): a is Account => a !== null);

        const rawTransactions = Array.isArray(parsed.transactions) ? parsed.transactions : [];
        const validTransactions = pruneTransactions(
          rawTransactions
            .map((raw: unknown) => normalizeTransaction(raw))
            .filter((t: Transaction | null): t is Transaction => t !== null),
          validAccounts
        );

        // Backups v2 tampoco traen metas: array vacío, no se pierde nada.
        const rawGoals = Array.isArray(parsed.savingsGoals) ? parsed.savingsGoals : [];
        const validGoals = rawGoals
          .map((raw: unknown) => normalizeSavingsGoal(raw))
          .filter((g: SavingsGoal | null): g is SavingsGoal => g !== null);

        dispatch({
          type: 'init',
          payload: {
            items: validItems,
            categories: parsed.categories || DEFAULT_CATEGORIES,
            prefs: parsed.prefs || DEFAULT_PREFS,
            accounts: validAccounts,
            transactions: validTransactions,
            savingsGoals: validGoals,
            view: 'list',
          },
        });

        showToast(
          `Datos importados correctamente (${validItems.length} artículos, ${validAccounts.length} cuentas, ${validGoals.length} metas)`
        );
        dispatch({ type: 'set-view', view: 'list' });
      } catch (err: unknown) {
        // FIX #3: `catch (err: any)` violaba useUnknownInCatchVariables.
        // Tipamos como unknown y estrechamos con instanceof.
        const message = err instanceof Error
          ? err.message
          : 'Error al leer el archivo. Asegúrate de que sea un backup válido.';
        showToast(message);
      }
    };
    reader.readAsText(file);
  }, [showToast]);

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
    addAccount, updateAccount, deleteAccount, addTransaction, deleteTransaction,
    addSavingsGoal, updateSavingsGoal, deleteSavingsGoal, contributeToGoal,
  }), [
    state.accounts, state.transactions, state.savingsGoals,
    addAccount, updateAccount, deleteAccount, addTransaction, deleteTransaction,
    addSavingsGoal, updateSavingsGoal, deleteSavingsGoal, contributeToGoal,
  ]);

  const dataValue = useMemo<DataValue>(() => ({
    items: state.items,
    categories: state.categories,
    ready: state.ready,
    addItem, updateItem, removeItem, toggleBought, setWishlist,
    reorderItems,
    addCategory, updateCategory, deleteCategory,
    exportData, importData,
  }), [
    state.items, state.categories, state.ready,
    addItem, updateItem, removeItem, toggleBought, setWishlist,
    reorderItems,
    addCategory, updateCategory, deleteCategory,
    exportData, importData,
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
    theme,
    setTheme,
  }), [
    state.view, state.editingItem, state.selectedItem, state.buyPromptItemId,
    setView, setEditingItem, setSelectedItem, setBuyPromptItemId,
    isCategoryManagerOpen,
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