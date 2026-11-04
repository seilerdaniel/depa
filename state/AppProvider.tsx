'use client';

import {
  createContext, useCallback, useContext, useEffect, useMemo, useReducer,
  useRef, useState, type ReactNode,
} from 'react';
import { arrayMove } from '@dnd-kit/sortable'; // <--- IMPORTANTE: Agregado para el Drag & Drop
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
// INTERFAZ DEL CONTEXTO
// ==========================================
interface ToastState {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface AppContextValue extends AppState {
  addItem: (draft: Omit<Item, 'id' | 'createdAt' | 'bought'>) => boolean;
  updateItem: (item: Item) => void;
  removeItem: (id: string) => void;
  toggleBought: (id: string, bought: boolean) => void;
  setWishlist: (id: string, wishlist: boolean) => boolean;
  setPrefs: (patch: Partial<Prefs>) => void;
  addCategory: (name: string) => boolean;
  updateCategory: (oldName: string, newName: string) => boolean;
  deleteCategory: (name: string) => void;
  setView: (v: View) => void;
  setEditingItem: (item: Item | null) => void;
  setSelectedItem: (item: Item | null) => void;
  reorderItems: (activeId: string, overId: string) => void; // <--- AGREGADO

  isCategoryManagerOpen: boolean;
  setCategoryManagerOpen: (open: boolean) => void;

  theme: Theme;
  setTheme: (t: Theme) => void;

  exportData: () => void;
  importData: (file: File) => void;

  toast: ToastState | null;
  showToast: (message: string, opts?: { actionLabel?: string; onAction?: () => void }) => void;
  hideToast: () => void;
  announce: (msg: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
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
    const res = saveItems(state.items);
    if (!res.success) {
      const err = res.error as any;
      const quota = err && (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED' || err.code === 22 || err.code === 1014);
      showToast(quota ? 'No queda espacio para más fotos. Eliminá algún artículo o usá una URL de imagen.' : 'No se pudo guardar en este navegador.');
    }
  }, [state.items, state.ready]);

  useEffect(() => {
    if (state.ready) savePrefs(state.prefs);
  }, [state.prefs, state.ready]);

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
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('Service Worker falló:', err);
      });
    }
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

  const showToast = useCallback<AppContextValue['showToast']>((message, opts) => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), message, actionLabel: opts?.actionLabel, onAction: opts?.onAction });
    toastTimer.current = window.setTimeout(hideToast, opts?.onAction ? 7000 : 3400);
  }, [hideToast]);

  // --- 5. ACCIONES DE DATOS ---
  const addItem = useCallback<AppContextValue['addItem']>((draft) => {
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

  const updateItem = useCallback<AppContextValue['updateItem']>((item) => {
    dispatch({ type: 'update', item });
    announce(`${item.name} actualizado`);
    showToast('Artículo actualizado correctamente');
  }, [announce, showToast]);

  const removeItem = useCallback<AppContextValue['removeItem']>((id) => {
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

  const toggleBought = useCallback<AppContextValue['toggleBought']>((id, bought) => {
    dispatch({ type: 'toggle-bought', id, bought });
    const item = state.items.find((i) => i.id === id);
    if (item) announce(`${item.name} marcado como ${bought ? 'comprado' : 'pendiente'}`);
  }, [state.items, announce]);

  const setWishlist = useCallback<AppContextValue['setWishlist']>((id, wishlist) => {
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

  const setPrefs = useCallback<AppContextValue['setPrefs']>((patch) => {
    dispatch({ type: 'set-prefs', patch });
  }, []);

  const addCategory = useCallback<AppContextValue['addCategory']>((name) => {
    if (state.categories.some((c) => c.toLocaleLowerCase('es') === name.toLocaleLowerCase('es'))) return false;
    dispatch({ type: 'add-category', name });
    return true;
  }, [state.categories]);

  const updateCategory = useCallback<AppContextValue['updateCategory']>((oldName, newName) => {
    const trimmed = normalizeLabel(newName, CATEGORY_MAX_LENGTH);
    if (!trimmed || trimmed === oldName) return false;
    if (state.categories.some(c => c.toLocaleLowerCase('es') === trimmed.toLocaleLowerCase('es'))) return false;

    dispatch({ type: 'update-category', oldName, newName: trimmed });
    showToast('Categoría actualizada');
    return true;
  }, [state.categories, showToast]);

  const deleteCategory = useCallback<AppContextValue['deleteCategory']>((name) => {
    dispatch({ type: 'delete-category', name });
    showToast(`Categoría "${name}" eliminada. Sus artículos se movieron a "Otros".`);
  }, [showToast]);

  const setView = useCallback<AppContextValue['setView']>((view) => {
    dispatch({ type: 'set-view', view });
  }, []);

  const setEditingItem = useCallback<AppContextValue['setEditingItem']>((item) => {
    dispatch({ type: 'set-editing', item });
  }, []);

  const setSelectedItem = useCallback<AppContextValue['setSelectedItem']>((item) => {
    dispatch({ type: 'set-selected', item });
  }, []);

  // --- NUEVO: FUNCIÓN PARA REORDENAR ---
  const reorderItems = useCallback((activeId: string, overId: string) => {
    const oldIndex = state.items.findIndex((i) => i.id === activeId);
    const newIndex = state.items.findIndex((i) => i.id === overId);
    if (oldIndex !== -1 && newIndex !== -1) {
      const newItems = arrayMove(state.items, oldIndex, newIndex);
      dispatch({ type: 'reorder-items', items: newItems });
    }
  }, [state.items]);

  // --- 6. FUNCIONES DE BACKUP (EXPORTAR / IMPORTAR) ---
  const exportData = useCallback(() => {
    const data = {
      items: state.items,
      categories: state.categories,
      prefs: state.prefs,
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
  }, [state.items, state.categories, state.prefs, showToast]);

  const importData = useCallback((file: File) => {
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

  // --- 7. VALOR DEL CONTEXTO Y RETORNO ---
  const value = useMemo<AppContextValue>(() => ({
    ...state,
    addItem, updateItem, removeItem, toggleBought, setWishlist,
    setPrefs, addCategory, updateCategory, deleteCategory,
    setView, setEditingItem, setSelectedItem,
    reorderItems, // <--- AGREGADO AQUÍ
    isCategoryManagerOpen, setCategoryManagerOpen,
    theme, setTheme,
    exportData, importData,
    toast, showToast, hideToast, announce,
  }), [
    state,
    addItem, updateItem, removeItem, toggleBought, setWishlist,
    setPrefs, addCategory, updateCategory, deleteCategory,
    setView, setEditingItem, setSelectedItem,
    reorderItems, // <--- AGREGADO A LAS DEPENDENCIAS
    isCategoryManagerOpen,
    theme, setTheme,
    exportData, importData,
    toast, showToast, hideToast, announce
  ]);

  return (
    <AppContext.Provider value={value}>
      {children}
      <p id="sr-status" className="sr-only" role="status" aria-live="polite" />
    </AppContext.Provider>
  );
}