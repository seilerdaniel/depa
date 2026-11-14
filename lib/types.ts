export type Priority = 'urgente' | 'alta' | 'media' | 'baja';
export type StatusFilter = 'todos' | 'pendientes' | 'comprados';
export type SortMode = 'prioridad' | 'precio-desc' | 'precio-asc' | 'nombre' | 'manual';
export type View = 'home' | 'list' | 'wishlist' | 'moodboard' | 'dashboard' | 'finance' | 'history' | 'settings';
export type ViewMode = 'grid' | 'table' | 'list';
export type StartView = 'home' | 'list' | 'finance';

export interface Dimensions {
  height: number | null;
  width: number | null;
  depth: number | null;
}

export interface Installments {
  count: number;
  amount: number;
  /**
   * Mes del primer pago en formato 'YYYY-MM'.
   * `null`/ausente = sin seguimiento (artículos viejos): se asume activa.
   */
  startMonth?: string | null;
}

export interface Item {
  id: string;
  name: string;
  category: string;
  subcategory: string;
  price: number;
  priority: Priority;
  bought: boolean;
  wishlist: boolean;
  createdAt: number;
  purchaseUrl: string;
  imageUrl: string;
  imageData: string;
  storeName: string;
  storeLocation: string;
  dimensions: Dimensions | null;
  installments: Installments | null;
  purchaseMonth: string | null;
  notes: string;
  brand: string;
  model: string;
  color: string;
  warranty: number | null;
  orderNumber: string;
}

export interface Prefs {
  sort: SortMode;
  category: string;
  subcategory: string;
  status: StatusFilter;
  budget: number | null;
  wishlistSort: SortMode;
  wishlistCategory: string;
  wishlistSubcategory: string;
  viewMode: ViewMode;
  search: string;
  homeLayout: HomeLayout;
  homeCards: Record<HomeModuleId, HomeCardConfig>;
  startView: StartView;
}

// ==========================================
// INICIO PERSONALIZABLE
// ==========================================
export type HomeLayout = 'cards-lg' | 'cards-sm' | 'list';

/** Módulos del Inicio. Los cuatro últimos todavía no tienen pantalla. */
export type HomeModuleId = 'finanzas' | 'compras' | 'hogar' | 'notas' | 'tareas' | 'habitos';

export type CardSurfaceStyle = 'default' | 'bordered' | 'tinted' | 'minimal';

export type CardAccentColor = 'accent' | 'high' | 'medium' | 'low' | 'urgent' | 'neutral';

export interface HomeCardConfig {
  visible: boolean;
  icon: string;
  color: CardAccentColor;
  surface: CardSurfaceStyle;
}

// ==========================================
// FINANZAS (Fase 2)
// ==========================================
export type AccountType = 'banco' | 'billetera' | 'efectivo' | 'tarjeta';
export type TransactionType = 'ingreso' | 'gasto' | 'transferencia';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  /** Saldo actual. Se ajusta atómicamente al registrar/eliminar movimientos. */
  balance: number;
  /** Token de color o hex (ej. 'accent' | '#22c55e'). */
  color: string;
  createdAt: number;
}

export interface Transaction {
  id: string;
  /** Cuenta origen: de donde sale el dinero (o donde entra, si es ingreso). */
  accountId: string;
  /** Sólo para 'transferencia': cuenta destino. */
  destinationAccountId?: string | null;
  type: TransactionType;
  amount: number;
  date: number;
  category: string;
  notes: string;
  /** Vínculo opcional con un artículo de la lista de compras. */
  linkedItemId?: string | null;
}

// ==========================================
// METAS DE AHORRO
// ==========================================
export interface SavingsGoal {
  id: string;
  name: string;
  /** Objetivo en pesos. 0 = todavía sin monto definido. */
  targetAmount: number;
  /** Cuánto se lleva ahorrado. */
  currentAmount: number;
  /** Token de color o hex (ej. 'accent' | '#22c55e'). */
  color: string;
  /** Fecha límite opcional en formato 'YYYY-MM-DD'. */
  deadline?: string | null;
  createdAt: number;
}