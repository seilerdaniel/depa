'use client';

import {
  createContext, useCallback, useContext, useEffect, useMemo, useReducer,
  useRef, useState, type ReactNode,
} from 'react';
import { arrayMove } from '@dnd-kit/sortable';
import {
  loadItems, loadCategories, loadPrefs,
  saveItems, savePrefs, saveCategories, mergeItemCategories,
} from '@/lib/storage';
import { DEFAULT_CATEGORIES, DEFAULT_PREFS, CATEGORY_MAX_LENGTH } from '@/lib/config';
import { createId, normalizeLabel } from '@/lib/utils';
import type { Item, Prefs, View } from '@/lib/types';

export type Theme = 'light' | 'dark' | 'system';

// ==========================================
// ESTADO Y ACCIONES DEL REDUCER
// ==========================================
interface AppState {
  items: Item[];
  categories: string[];
  prefs: Prefs;
  view: View;
  ready: boolean;
  editingItem: Item | null;
  selectedItem: Item | null;
}

type Action =
  | { type: 'init'; payload: Omit<AppState, 'ready' | 'editingItem' | 'selectedItem'> & { selectedItem?: Item | null } }
  | { type: 'add'; item: Item }
  | { type: 'update'; item: Item }
  | { type: 'remove'; id: string }
  | { type: 'restore'; item: Item; index: number }
  | { type: 'toggle-bought'; id: string; bought: boolean }
  | { type: 'set-wishlist'; id: string; wishlist: boolean }
  | { type: 'set-prefs'; patch: Partial<Prefs> }
  | { type: 'add-category'; name: string }
  | { type: 'update-category'; oldName: string; newName: string }
  | { type: 'delete-category'; name: string }
  | { type: 'set-view'; view: View }
  | { type: 'set-editing'; item: Item | null }
  | { type: 'set-selected'; item: Item | null }
  | { type: 'reorder-items'; items: Item[] };

const reducer = (s: AppState, a: Action): AppState => {
  switch (a.type) {
    case 'init':
      return {
        ...a.payload,
        ready: true,
        editingItem: null,
        selectedItem: a.payload.selectedItem ?? null,
      };
    case 'add':
      return { ...s, items: [a.item, ...s.items] };
    case 'update':
      return {
        ...s,
        items: s.items.map((i) => (i.id === a.item.id ? a.item : i)),
        editingItem: null
      };
    case 'remove':
      return { ...s, items: s.items.filter((i) => i.id !== a.id) };
    case 'restore': {
      const items = s.items.slice();
      items.splice(a.index, 0, a.item);
      return { ...s, items };
    }
    case 'toggle-bought':
      return {
        ...s,
        items: s.items.map((i) => i.id === a.id ? { ...i, bought: a.bought } : i)
      };
    case 'set-wishlist':
      return {
        ...s,
        items: s.items.map((i) => i.id === a.id
          ? { ...i, wishlist: a.wishlist, bought: a.wishlist ? false : i.bought }
          : i)
      };
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
    case 'reorder-items':
      return { ...s, items: a.items };
    default:
      return s;
  }
};

const initialState: AppState = {
  items: [],
  categories: DEFAULT_CATEGORIES.slice(),
  prefs: DEFAULT_PREFS,
  view: 'list',
  ready: false,
  editingItem: null,
  selectedItem: null,
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

export interface DataValue {
  items: Item[];
  categories: string[];
  ready: boolean;
  addItem: (draft: Omit<Item, 'id' | 'createdAt' | 'bought'>) => boolean;
  updateItem: (item: Item) => void;
  removeItem: (id: string) => void;
  toggleBought: (id: string, bought: boolean) => void;
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

export interface UIValue {
  view: View;
  setView: (v: View) => void;
  editingItem: Item | null;
  setEditingItem: (item: Item | null) => void;
  selectedItem: Item | null;
  setSelectedItem: (item: Item | null) => void;
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

// ==========================================
// COMPONENTE PROVIDER
// ==========================================
export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [theme, setThemeState] = useState<Theme>('system');
  const [isCategoryManagerOpen, setCategoryManagerOpen] = useState(false);

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

  // --- 1. EFECTOS DE CARGA Y PERSISTENCIA ---
  useEffect(() => {
    const items = loadItems();
    const categories = loadCategories();
    const prefs = loadPrefs();

    if (mergeItemCategories(items, categories)) saveCategories(categories);

    dispatch({ type: 'init', payload: { items, categories, prefs, view: 'list' } });
  }, []);

  useEffect(() => {
    if (!state.ready) return;

    // Primer render "ready" = datos recién leídos de localStorage.
    // Escribirlos de vuelta sería un costo puro (y en StrictMode, doble).
    if (!hydrated.current) {
      hydrated.current = true;
      return;
    }

    const res = saveItems(state.items);
    if (!res.success) {
      const err = res.error as any;
      const quota = err && (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED' || err.code === 22 || err.code === 1014);
      showToast(quota ? 'No queda espacio para más fotos. Eliminá algún artículo o usá una URL de imagen.' : 'No se pudo guardar en este navegador.');
    }
  }, [state.items, state.ready]);

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

  // Si el usuario cierra la pestaña dentro de la ventana de 300ms, no perdemos el último cambio.
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

  useEffect(() => {
    if (state.ready) saveCategories(state.categories);
  }, [state.categories, state.ready]);

  // Sincronización entre pestañas
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key.includes('depa.')) {
        const items = loadItems();
        const categories = loadCategories();
        const prefs = loadPrefs();
        if (mergeItemCategories(items, categories)) saveCategories(categories);
        dispatch({ type: 'init', payload: { items, categories, prefs, view: state.view } });
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [state.view]);

  // --- 2. EFECTOS DE TEMA (MODO OSCURO) ---
  useEffect(() => {
    const saved = localStorage.getItem('depa.theme') as Theme | null;
    if (saved) setThemeState(saved);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    localStorage.setItem('depa.theme', t);
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    if (t === 'system') {
      const sys = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      root.classList.add(sys);
    } else {
      root.classList.add(t);
    }
  }, []);

  useEffect(() => {
    if (theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      document.documentElement.classList.remove('light', 'dark');
      document.documentElement.classList.add(media.matches ? 'dark' : 'light');
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme]);

  // --- 3. SERVICE WORKER (PWA) ---
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // En producción registramos el SW normalmente.
    if (process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('Service Worker falló:', err);
      });
      return;
    }

    // En desarrollo un SW viejo sigue sirviendo HTML y chunks cacheados:
    // el navegador muestra código desactualizado y localhost se siente lento.
    // Lo desregistramos y borramos sólo nuestras cachés (prefijo "depa").
    void (async () => {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));

        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(
            keys.filter((key) => key.startsWith('depa')).map((key) => caches.delete(key))
          );
        }
      } catch (err) {
        console.warn('No se pudo limpiar el Service Worker de desarrollo:', err);
      }
    })();
  }, []);

  // --- 4. FUNCIONES DE UI Y TOAST ---
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
    setToast({ id: Date.now(), message, actionLabel: opts?.actionLabel, onAction: opts?.onAction });
    toastTimer.current = window.setTimeout(hideToast, opts?.onAction ? 7000 : 3400);
  }, [hideToast]);

  // --- 5. ACCIONES DE DATOS ---
  const addItem = useCallback<DataValue['addItem']>((draft) => {
    const item: Item = { ...draft, id: createId(), createdAt: Date.now(), bought: false };
    dispatch({ type: 'add', item });

    if (draft.wishlist) {
      announce(`${item.name} agregado a la wishlist`);
      showToast('Artículo agregado a la wishlist', {
        actionLabel: 'Ver wishlist',
        onAction: () => dispatch({ type: 'set-view', view: 'wishlist' })
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
        dispatch({ type: 'restore', item: removed, index: Math.min(index, state.items.length - 1) });
        announce(`${removed.name} restaurado en la lista`);
      },
    });
  }, [state.items, showToast, announce]);

  const toggleBought = useCallback<DataValue['toggleBought']>((id, bought) => {
    dispatch({ type: 'toggle-bought', id, bought });
    const item = state.items.find((i) => i.id === id);
    if (item) announce(`${item.name} marcado como ${bought ? 'comprado' : 'pendiente'}`);
  }, [state.items, announce]);

  const setWishlist = useCallback<DataValue['setWishlist']>((id, wishlist) => {
    const item = state.items.find((i) => i.id === id);
    if (!item || item.wishlist === wishlist) return false;

    const prev = { wishlist: item.wishlist, bought: item.bought };
    dispatch({ type: 'set-wishlist', id, wishlist });

    const msg = wishlist ? `"${item.name}" guardado en la wishlist` : `"${item.name}" movido a la lista de compras`;
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
    if (state.categories.some(c => c.toLocaleLowerCase('es') === trimmed.toLocaleLowerCase('es'))) return false;

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

  const reorderItems = useCallback<DataValue['reorderItems']>((activeId, overId) => {
    const oldIndex = state.items.findIndex((i) => i.id === activeId);
    const newIndex = state.items.findIndex((i) => i.id === overId);
    if (oldIndex !== -1 && newIndex !== -1) {
      const newItems = arrayMove(state.items, oldIndex, newIndex);
      dispatch({ type: 'reorder-items', items: newItems });
    }
  }, [state.items]);

  // --- 6. FUNCIONES DE BACKUP (EXPORTAR / IMPORTAR) ---
  // Lee el estado desde la ref para NO depender de `prefs`:
  // si dependiera de prefs, DataContext cambiaría al cambiar un filtro.
  const exportData = useCallback<DataValue['exportData']>(() => {
    const snapshot = stateRef.current;
    const data = {
      items: snapshot.items,
      categories: snapshot.categories,
      prefs: snapshot.prefs,
      version: 1
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

        dispatch({
          type: 'init',
          payload: {
            items: parsed.items,
            categories: parsed.categories || DEFAULT_CATEGORIES,
            prefs: parsed.prefs || DEFAULT_PREFS,
            view: 'list'
          }
        });

        showToast('Datos importados correctamente');
        dispatch({ type: 'set-view', view: 'list' });
      } catch (err) {
        showToast('Error al leer el archivo. Asegúrate de que sea un backup válido.');
      }
    };
    reader.readAsText(file);
  }, [showToast]);

  // --- 7. VALORES DE CADA CONTEXTO ---
  // Cada useMemo depende SÓLO de su slice. Ésta es la razón de ser del refactor.
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
    isCategoryManagerOpen,
    setCategoryManagerOpen,
    theme,
    setTheme,
  }), [
    state.view, state.editingItem, state.selectedItem,
    setView, setEditingItem, setSelectedItem,
    isCategoryManagerOpen,
    theme, setTheme,
  ]);

  return (
    <ToastContext.Provider value={toastValue}>
      <PrefsContext.Provider value={prefsValue}>
        <DataContext.Provider value={dataValue}>
          <UIContext.Provider value={uiValue}>
            {children}
            <p id="sr-status" className="sr-only" role="status" aria-live="polite" />
          </UIContext.Provider>
        </DataContext.Provider>
      </PrefsContext.Provider>
    </ToastContext.Provider>
  );
}