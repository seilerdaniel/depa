import {
  STORAGE_KEYS, DEFAULT_PREFS, DEFAULT_CATEGORIES,
  STATUS_FILTERS, SORT_MODES, CATEGORY_MAX_LENGTH,
} from './config';
import { normalizeItem, normalizeLabel, cleanFilterValue, sameText, createId } from './utils';
import type { Item, Prefs } from './types';

const readJSON = <T>(key: string, fallback: T): T => {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
  catch { return fallback; }
};

const writeJSON = (key: string, value: unknown): boolean => {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { return false; }
};

export function loadItems(): Item[] {
  const raw = readJSON<unknown>(STORAGE_KEYS.items, []);
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const items: Item[] = [];
  for (const entry of raw) {
    const item = normalizeItem(entry);
    if (!item) continue;
    if (seen.has(item.id)) item.id = createId();
    seen.add(item.id);
    items.push(item);
  }
  return items;
}

export function loadCategories(): string[] {
  const raw = readJSON<unknown>(STORAGE_KEYS.categories, []);
  const names: string[] = [];
  const seen = new Set<string>();
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      const name = normalizeLabel(entry, CATEGORY_MAX_LENGTH);
      if (!name) continue;
      const k = name.toLocaleLowerCase('es');
      if (seen.has(k)) continue;
      seen.add(k);
      names.push(name);
    }
  }
  return names.length ? names : DEFAULT_CATEGORIES.slice();
}

export function loadPrefs(): Prefs {
  const raw = readJSON<Record<string, unknown>>(STORAGE_KEYS.prefs, {});
  const prefs = raw && typeof raw === 'object' ? raw : {};
  const budgetValue = Number(prefs.budget);
  
  const hasBudget =
    prefs.budget !== null &&
    prefs.budget !== undefined &&
    prefs.budget !== '' &&
    Number.isFinite(budgetValue) &&
    budgetValue >= 0;

  return {
    sort: SORT_MODES.has(prefs.sort as any) ? (prefs.sort as Prefs['sort']) : DEFAULT_PREFS.sort,
    category: cleanFilterValue(prefs.category),
    subcategory: cleanFilterValue(prefs.subcategory),
    status: STATUS_FILTERS.has(prefs.status as any) ? (prefs.status as Prefs['status']) : DEFAULT_PREFS.status,
    budget: hasBudget ? Math.round(budgetValue * 100) / 100 : null,
    wishlistSort: SORT_MODES.has(prefs.wishlistSort as any) ? (prefs.wishlistSort as Prefs['wishlistSort']) : DEFAULT_PREFS.wishlistSort,
    wishlistCategory: cleanFilterValue(prefs.wishlistCategory),
    wishlistSubcategory: cleanFilterValue(prefs.wishlistSubcategory),
    // Aquí agregamos las propiedades que faltaban y que causaban el error en Vercel:
    viewMode: prefs.viewMode === 'table' ? 'table' : 'grid',
    search: typeof prefs.search === 'string' ? prefs.search : '',
  };
}

export function saveItems(items: Item[]): { success: true } | { success: false; error: unknown } {
  try { localStorage.setItem(STORAGE_KEYS.items, JSON.stringify(items)); return { success: true }; }
  catch (error) { return { success: false, error }; }
}

export const savePrefs = (prefs: Prefs) => writeJSON(STORAGE_KEYS.prefs, prefs);
export const saveCategories = (cats: string[]) => writeJSON(STORAGE_KEYS.categories, cats);

export function mergeItemCategories(items: Item[], categories: string[]): boolean {
  let changed = false;
  for (const item of items) {
    if (!categories.some((c) => sameText(c, item.category))) {
      categories.push(item.category);
      changed = true;
    }
  }
  return changed;
}