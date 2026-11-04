import type { Priority, SortMode, StatusFilter, Prefs } from './types';

export const DEFAULT_CATEGORIES = [
  'Electrodomésticos grandes',
  'Pequeños electrodomésticos',
  'Muebles de cocina',
  'Muebles de baño',
  'Muebles de dormitorio',
  'Otros',
];

export const CATEGORY_MAX_LENGTH = 40;
export const SUBCATEGORY_MAX_LENGTH = 40;

export const PRIORITIES: { id: Priority; label: string; rank: number }[] = [
  { id: 'urgente', label: 'Urgente', rank: 0 },
  { id: 'media', label: 'Media', rank: 1 },
  { id: 'baja', label: 'Baja', rank: 2 },
];
export const PRIORITY = new Map(PRIORITIES.map((p) => [p.id, p]));

export const STATUS_FILTERS: ReadonlySet<StatusFilter> = new Set(['todos', 'pendientes', 'comprados']);
export const SORT_MODES: ReadonlySet<SortMode> = new Set(['prioridad', 'precio-desc', 'precio-asc', 'nombre']);
export const TAB_ORDER = ['list', 'wishlist', 'moodboard', 'dashboard', 'history'] as const;

export const STORAGE_KEYS = {
  items: 'depa.items.v1',
  prefs: 'depa.prefs.v1',
  categories: 'depa.categories.v1',
} as const;

export const DEFAULT_PREFS: Prefs = {
  sort: 'prioridad',
  category: 'todas',
  subcategory: 'todas',
  status: 'todos',
  search: '',
  budget: null,
  wishlistSort: 'prioridad',
  wishlistCategory: 'todas',
  wishlistSubcategory: 'todas',
  viewMode: 'grid', // NUEVO
};

export const MAX_PHOTO_SIDE = 900;
export const MAX_PHOTO_DATA_LENGTH = 150_000;
export const PHOTO_QUALITIES = [0.72, 0.6] as const;
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;