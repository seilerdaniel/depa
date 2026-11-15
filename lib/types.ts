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
  options?: ItemOption[];
  selectedOptionId?: string | null;
}

export interface ItemOption {
  id: string;
  label: string;
  brand: string;
  model: string;
  storeName: string;
  storeLocation: string;
  price: number;
  installments: Installments | null;
  purchaseUrl: string;
  rating: number;
  badge: string;
  pros: string;
  cons: string;
  createdAt: number;
}

export interface ItemFieldVisibility {
  subcategory: boolean;
  priority: boolean;
  purchaseMonth: boolean;
  installments: boolean;
  purchaseUrl: boolean;
  store: boolean;
  specs: boolean;
  warranty: boolean;
  orderNumber: boolean;
  notes: boolean;
  photo: boolean;
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
  itemFields: ItemFieldVisibility;
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
  /**
   * Día de cierre del resumen (1..31). Sólo aplica a `type === 'tarjeta'`;
   * en el resto de las cuentas se guarda `null`.
   */
  closingDay?: number | null;
  /** Día de vencimiento del resumen (1..31). Mismo criterio que `closingDay`. */
  dueDay?: number | null;
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
  /**
   * Vínculo con el gasto fijo que generó este movimiento. Sólo viaja en
   * memoria y en los backups: la tabla `transactions` no lo guarda.
   */
  recurringExpenseId?: string | null;
}

// ==========================================
// GASTOS FIJOS Y SERVICIOS DEL HOGAR (Etapa 5.1)
// ==========================================
export type RecurringFrequency = 'mensual' | 'bimestral' | 'anual';

/** Resultado de clasificar un servicio para el mes en curso. */
export type RecurringExpenseState = 'paid' | 'overdue' | 'due-soon' | 'upcoming' | 'paused';

export interface RecurringExpense {
  id: string;
  name: string;
  /** Alquiler, Expensas, Servicios, Seguros, Suscripciones, Impuestos… */
  category: string;
  /** Monto estimado. La boleta real puede diferir (luz, gas, agua). */
  amount: number;
  /** Día de vencimiento 1..31, recortado a fin de mes cuando hace falta. */
  dueDay: number;
  frequency: RecurringFrequency;
  /** Cuenta sugerida para registrar el pago. */
  accountId: string | null;
  active: boolean;
  /** Último mes pagado en formato 'YYYY-MM'. */
  lastPaidMonth: string | null;
  notes: string;
  createdAt: number;
}

export interface RecurringExpenseStatus {
  /** `false` para un bimestral/anual que no cae este mes. */
  appliesThisMonth: boolean;
  isPaidThisMonth: boolean;
  dueDateThisMonth: Date | null;
  /** Días hasta el vencimiento. Negativo = ya venció. */
  daysUntilDue: number | null;
  state: RecurringExpenseState;
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

// ==========================================
// TARJETAS DE CRÉDITO Y FLUJO DE CAJA (Etapa 4.3)
// ==========================================
export interface CreditCardStatement {
  /** Resumen a pagar: lo que la tarjeta debe (balance negativo) en positivo. */
  statementToPay: number;
  /** Próximo cierre del ciclo. `null` si la tarjeta no tiene `closingDay`. */
  nextClosingDate: Date | null;
  /** Próximo vencimiento. `null` si la tarjeta no tiene `dueDay`. */
  nextDueDate: Date | null;
  /** Días hasta el cierre. `null` si no hay fecha. Negativo = ya pasó. */
  daysToClosing: number | null;
  /** Días hasta el vencimiento. `null` si no hay fecha. */
  daysToDue: number | null;
  /** Gastos de la tarjeta posteriores al último cierre. */
  currentCycleSpend: number;
}

export interface CashflowMonth {
  /** Mes en formato 'YYYY-MM'. */
  key: string;
  /** Etiqueta corta para la UI (ej. 'dic 2026'). */
  label: string;
  estimatedIncome: number;
  /** Cuotas de compras ya realizadas, vigentes ese mes. */
  activeInstallments: number;
  /** Desembolso inicial de compras planificadas para ese mes. */
  plannedPurchases: number;
  /** Gastos fijos y servicios activos que caen en ese mes. */
  recurringTotal: number;
  totalOutflow: number;
  netCashflow: number;
  /** Liquidez acumulada al cierre del mes. */
  projectedLiquidity: number;
}

export interface CashflowForecastResult {
  /** Suma de los saldos de cuentas que no son tarjeta. */
  startingLiquidity: number;
  /** Ingreso mensual tomado como base antes del override. */
  defaultMonthlyIncome: number;
  months: CashflowMonth[];
  /** `true` si algún mes cierra con liquidez proyectada negativa. */
  hasNegativeMonth: boolean;
  /** Primer mes en rojo, si existe. */
  firstNegativeMonth: CashflowMonth | null;
}