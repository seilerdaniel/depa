import type {
  Priority, SortMode, StatusFilter, Prefs, ViewMode, AccountType, TransactionType,
  AccountSortMode, Currency, CardAccentColor, CardSurfaceStyle, HomeCardConfig, HomeLayout,
  HomeModuleId, StartView, ItemFieldVisibility,
} from './types';

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
  { id: 'alta', label: 'Alta', rank: 1 },
  { id: 'media', label: 'Media', rank: 2 },
  { id: 'baja', label: 'Baja', rank: 3 },
];
export const PRIORITY = new Map(PRIORITIES.map((p) => [p.id, p]));

export const STATUS_FILTERS: ReadonlySet<StatusFilter> = new Set(['todos', 'pendientes', 'comprados']);
export const SORT_MODES: ReadonlySet<SortMode> = new Set(['prioridad', 'precio-desc', 'precio-asc', 'nombre', 'manual']);
export const VIEW_MODES: ReadonlySet<ViewMode> = new Set(['grid', 'list', 'table']);
export const TAB_ORDER = ['list', 'wishlist', 'moodboard', 'dashboard', 'history'] as const;

export const START_VIEWS: ReadonlySet<StartView> = new Set(['home', 'list', 'finance']);

export const START_VIEW_OPTIONS: readonly { id: StartView; label: string; hint: string }[] = [
  { id: 'home', label: 'Inicio', hint: 'Panel general de módulos' },
  { id: 'list', label: 'Mis Compras', hint: 'Lista de artículos del depa' },
  { id: 'finance', label: 'Mis Finanzas', hint: 'Cuentas y movimientos' },
];

export const ACCOUNT_TYPES: ReadonlySet<AccountType> = new Set(['banco', 'billetera', 'efectivo', 'tarjeta']);
export const TRANSACTION_TYPES: ReadonlySet<TransactionType> = new Set(['ingreso', 'gasto', 'transferencia']);

export const CURRENCIES: ReadonlySet<Currency> = new Set(['ARS', 'USD']);

/** Cotización de referencia por defecto (ARS por USD). */
export const DEFAULT_USD_RATE = 1200;

export const CURRENCY_OPTIONS: readonly { id: Currency; label: string; hint: string }[] = [
  { id: 'ARS', label: 'Pesos (ARS)', hint: 'Saldo y movimientos en pesos' },
  { id: 'USD', label: 'Dólares (USD)', hint: 'Se consolida con la cotización de referencia' },
];

export const ACCOUNT_SORT_MODES: ReadonlySet<AccountSortMode> = new Set([
  'manual', 'balance-desc', 'balance-asc', 'type', 'name',
]);

/** Etiquetas del selector de orden de cuentas. */
export const ACCOUNT_SORT_OPTIONS: readonly { id: AccountSortMode; label: string }[] = [
  { id: 'manual', label: 'Orden de creación' },
  { id: 'balance-desc', label: 'Mayor saldo primero' },
  { id: 'balance-asc', label: 'Menor saldo / Deudas primero' },
  { id: 'type', label: 'Por tipo' },
  { id: 'name', label: 'Alfabético (A–Z)' },
];

// ==========================================
// INICIO PERSONALIZABLE
// ==========================================
export const HOME_LAYOUTS: ReadonlySet<HomeLayout> = new Set(['cards-lg', 'cards-sm', 'list']);
export const CARD_SURFACES: ReadonlySet<CardSurfaceStyle> = new Set(['default', 'bordered', 'tinted', 'minimal']);
export const CARD_COLORS: ReadonlySet<CardAccentColor> = new Set([
  'accent', 'high', 'medium', 'low', 'urgent', 'neutral',
]);

/** Etiquetas de la sección "Vista y densidad" del panel de configuración. */
export const HOME_LAYOUT_OPTIONS: readonly { id: HomeLayout; label: string; hint: string }[] = [
  { id: 'cards-lg', label: 'Cards grandes', hint: 'KPIs detallados en 2 columnas' },
  { id: 'cards-sm', label: 'Cards compactas', hint: 'Resumen en 3 columnas' },
  { id: 'list', label: 'Lista minimalista', hint: 'Una línea por módulo' },
];

export const CARD_SURFACE_OPTIONS: readonly { id: CardSurfaceStyle; label: string }[] = [
  { id: 'default', label: 'Estándar' },
  { id: 'bordered', label: 'Borde acentuado' },
  { id: 'tinted', label: 'Fondo suave' },
  { id: 'minimal', label: 'Minimal' },
];

export const CARD_COLOR_OPTIONS: readonly { id: CardAccentColor; label: string }[] = [
  { id: 'accent', label: 'Acento' },
  { id: 'high', label: 'Naranja' },
  { id: 'medium', label: 'Ámbar' },
  { id: 'low', label: 'Verde' },
  { id: 'urgent', label: 'Rojo' },
  { id: 'neutral', label: 'Neutro' },
];

/**
 * Íconos que el usuario puede asignar a un módulo.
 * Debe ser un subconjunto de los símbolos reales de `public/icons.svg`:
 * un nombre inventado dejaría el `<use>` apuntando a la nada.
 */
export const HOME_ICON_NAMES: readonly string[] = [
  'finance', 'wallet', 'bank', 'shopping-cart', 'store',
  'home', 'edit', 'check', 'calendar', 'chart',
  'list', 'wishlist', 'archive', 'bell', 'brand',
  'globe', 'photo', 'dims', 'history', 'moodboard', 'grid', 'local',
];

export const HOME_ICONS: ReadonlySet<string> = new Set(HOME_ICON_NAMES);

export interface HomeModuleMeta {
  id: HomeModuleId;
  title: string;
  description: string;
  /** `soon` = todavía no tiene pantalla propia; la card avisa "Próximamente". */
  status: 'active' | 'soon';
  defaultVisible: boolean;
  defaultIcon: string;
  defaultColor: CardAccentColor;
  defaultSurface: CardSurfaceStyle;
}

export const HOME_MODULES: readonly HomeModuleMeta[] = [
  {
    id: 'finanzas',
    title: 'Mis Finanzas',
    description: 'Cuentas, billeteras y flujo de movimientos.',
    status: 'active',
    defaultVisible: true,
    defaultIcon: 'finance',
    defaultColor: 'accent',
    defaultSurface: 'default',
  },
  {
    id: 'compras',
    title: 'Mis Compras',
    description: 'Presupuesto, cuotas y planificación de artículos.',
    status: 'active',
    defaultVisible: true,
    defaultIcon: 'store',
    defaultColor: 'accent',
    defaultSurface: 'default',
  },
  {
    id: 'hogar',
    title: 'Mi Hogar',
    description: 'Servicios, medidas y garantías del departamento.',
    status: 'soon',
    defaultVisible: false,
    defaultIcon: 'home',
    defaultColor: 'high',
    defaultSurface: 'default',
  },
  {
    id: 'notas',
    title: 'Mis Notas',
    description: 'Notas rápidas y checklists del día a día.',
    status: 'soon',
    defaultVisible: false,
    defaultIcon: 'edit',
    defaultColor: 'medium',
    defaultSurface: 'default',
  },
  {
    id: 'tareas',
    title: 'Mis Tareas',
    description: 'Pendientes y trámites con fecha límite.',
    status: 'soon',
    defaultVisible: false,
    defaultIcon: 'check',
    defaultColor: 'low',
    defaultSurface: 'default',
  },
  {
    id: 'habitos',
    title: 'Mis Hábitos',
    description: 'Rutinas y rachas diarias.',
    status: 'soon',
    defaultVisible: false,
    defaultIcon: 'calendar',
    defaultColor: 'urgent',
    defaultSurface: 'default',
  },
];

/**
 * Cards por defecto. Devuelve objetos nuevos: `DEFAULT_PREFS` es un valor
 * compartido y mutarlo en un render contaminaría a toda la app.
 */
export function createDefaultHomeCards(): Record<HomeModuleId, HomeCardConfig> {
  const cards = {} as Record<HomeModuleId, HomeCardConfig>;
  for (const module of HOME_MODULES) {
    cards[module.id] = {
      visible: module.defaultVisible,
      icon: module.defaultIcon,
      color: module.defaultColor,
      surface: module.defaultSurface,
    };
  }
  return cards;
}

export const STORAGE_KEYS = {
  items: 'depa.items.v1',
  prefs: 'depa.prefs.v1',
  categories: 'depa.categories.v1',
  accounts: 'depa.accounts.v1',
  transactions: 'depa.transactions.v1',
} as const;

export const DEFAULT_ITEM_FIELDS: ItemFieldVisibility = {
  subcategory: true,
  priority: true,
  purchaseMonth: true,
  installments: true,
  purchaseUrl: true,
  store: true,
  specs: true,
  warranty: true,
  orderNumber: true,
  notes: true,
  photo: true,
};

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
  viewMode: 'grid',
  accountSort: 'manual',
  usdRate: DEFAULT_USD_RATE,
  homeLayout: 'cards-lg',
  homeCards: createDefaultHomeCards(),
  startView: 'home',
  itemFields: { ...DEFAULT_ITEM_FIELDS },
};

export const ITEM_FIELD_OPTIONS: {
  key: keyof ItemFieldVisibility;
  label: string;
  hint: string;
}[] = [
  { key: 'subcategory', label: 'Subcategoría', hint: 'Ej. Heladera, Sillón' },
  { key: 'priority', label: 'Prioridad', hint: 'Urgente, Alta, Media o Baja' },
  { key: 'purchaseMonth', label: 'Mes de compra', hint: 'Planificación mensual en el Dashboard' },
  { key: 'installments', label: 'Financiación / Cuotas', hint: 'Cantidad y valor de cuota' },
  { key: 'purchaseUrl', label: 'Link de compra', hint: 'URL directa a la publicación' },
  { key: 'store', label: 'Tienda y ubicación', hint: 'Comercio, sucursal o barrio' },
  { key: 'specs', label: 'Especificaciones físicas', hint: 'Marca, modelo, color y medidas' },
  { key: 'warranty', label: 'Garantía', hint: 'Meses de cobertura' },
  { key: 'orderNumber', label: 'Número de pedido', hint: 'Comprobante o seguimiento' },
  { key: 'notes', label: 'Notas', hint: 'Observaciones adicionales' },
  { key: 'photo', label: 'Foto del artículo', hint: 'Imagen desde archivo o URL' },
];

export const MAX_PHOTO_SIDE = 900;
export const MAX_PHOTO_DATA_LENGTH = 150_000;
export const PHOTO_QUALITIES = [0.72, 0.6] as const;
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;