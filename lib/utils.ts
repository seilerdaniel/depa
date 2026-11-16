import {
  CATEGORY_MAX_LENGTH,
  SUBCATEGORY_MAX_LENGTH,
  PRIORITY,
  ACCOUNT_TYPES,
  TRANSACTION_TYPES,
  CURRENCIES,
  DEFAULT_USD_RATE,
  MAX_PHOTO_SIDE,
  MAX_PHOTO_DATA_LENGTH,
  PHOTO_QUALITIES,
  MAX_UPLOAD_BYTES,
  DEFAULT_PREFS,
  SORT_MODES,
  STATUS_FILTERS,
  VIEW_MODES,
  ACCOUNT_SORT_MODES,
  HOME_LAYOUTS,
  HOME_MODULES,
  HOME_ICONS,
  CARD_COLORS,
  CARD_SURFACES,
} from './config';
import type {
  Account, AccountType, CardAccentColor, CardSurfaceStyle, CashflowForecastResult,
  CashflowMonth, CreditCardStatement, Currency, Dimensions, HomeCardConfig, HomeModuleId,
  Installments, Item, ItemOption, Prefs, RecurringExpense, RecurringExpenseState,
  RecurringExpenseStatus, RecurringFrequency, SavingsGoal, Transaction, TransactionType,
} from './types';

// ==========================================
// FORMATEADORES
// ==========================================
export const priceFormatter = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });
export const dimensionFormatter = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });

export const money = (v: number) => `$ ${priceFormatter.format(v)}`;
export const pluralize = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;

/** Los dólares se muestran siempre con dos decimales: US$ 13,50. */
const usdFormatter = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Formatea según la moneda: `$ 1.200` para ARS, `US$ 13,50` para USD. */
export function moneyWithCurrency(amount: number, currency: Currency = 'ARS'): string {
  const value = Number.isFinite(amount) ? amount : 0;
  return currency === 'USD' ? `US$ ${usdFormatter.format(value)}` : money(value);
}

// ==========================================
// MULTI-MONEDA
// ==========================================
/** Cotización saneada: nunca deja dividir por 0 ni por NaN. */
const safeUsdRate = (usdRate: number): number =>
  Number.isFinite(usdRate) && usdRate > 0 ? usdRate : DEFAULT_USD_RATE;

const clampTaxPercent = (value: number): number =>
  Number.isFinite(value) ? Math.min(Math.max(value, 0), 200) : 0;

/**
 * Convierte a pesos. En USD aplica la cotización y, si viene, el porcentaje
 * de impuestos/percepciones (suscripciones digitales: 21, 30, 60…).
 */
export function toArs(
  amount: number,
  currency: Currency = 'ARS',
  usdRate: number = 1,
  taxPercent: number = 0,
): number {
  const value = Number(amount);
  if (!Number.isFinite(value)) return 0;
  if (currency !== 'USD') return roundMoney(value);

  const rate = safeUsdRate(usdRate);
  return roundMoney(value * rate * (1 + clampTaxPercent(taxPercent) / 100));
}

/**
 * Convierte entre dos monedas usando la cotización de referencia. Convierte
 * siempre vía ARS para que ida y vuelta no acumulen diferencias de redondeo.
 */
export function convertCurrency(
  amount: number,
  from: Currency = 'ARS',
  to: Currency = 'ARS',
  usdRate: number = DEFAULT_USD_RATE,
  taxPercent: number = 0,
): number {
  const value = Number(amount);
  if (!Number.isFinite(value)) return 0;
  if (from === to) return roundMoney(value);

  const inArs = toArs(value, from, usdRate, taxPercent);
  return to === 'ARS' ? inArs : roundMoney(inArs / safeUsdRate(usdRate));
}

/** Valida la moneda de un registro crudo. Cualquier cosa rara cae en ARS. */
export function normalizeCurrency(value: unknown): Currency {
  return typeof value === 'string' && CURRENCIES.has(value.toUpperCase() as Currency)
    ? (value.toUpperCase() as Currency)
    : 'ARS';
}

/** Cotización configurable: sólo positivos finitos; el resto usa el default. */
export function normalizeUsdRate(value: unknown): number {
  const rate = Number(value);
  return Number.isFinite(rate) && rate > 0 ? roundMoney(rate) : DEFAULT_USD_RATE;
}

/** Redondeo a centavos. Evita arrastrar errores de coma flotante en saldos. */
export const roundMoney = (n: number) => Math.round(n * 100) / 100;

// ==========================================
// PRIORIDADES
// ==========================================
const PRIORITY_WEIGHTS: Record<string, number> = {
  urgente: 5,
  alta: 4,
  media: 3,
  baja: 2,
  'muy baja': 1,
  'sin prioridad': 0,
};

export function priorityWeight(value: unknown): number {
  const key = String(value ?? '')
    .trim()
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return PRIORITY_WEIGHTS[key] ?? 0;
}

/**
 * Formatea un string 'YYYY-MM' a un texto legible (ej: 'Dic 2024').
 */
export function formatMonth(monthStr: string | null | undefined): string {
  if (!monthStr) return '';
  const [year, month] = monthStr.split('-');
  if (!year || !month) return '';
  const date = new Date(Number(year), Number(month) - 1);
  return new Intl.DateTimeFormat('es', { month: 'short', year: 'numeric' }).format(date);
}

// ==========================================
// VALIDACIONES Y NORMALIZACIONES BÁSICAS
// ==========================================
export const sameText = (a?: string, b?: string) =>
  typeof a === 'string' && typeof b === 'string' && a.toLocaleLowerCase('es') === b.toLocaleLowerCase('es');

export const normalizeLabel = (value: unknown, max: number) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '';

/** Texto comparable: minúsculas y sin acentos, para buscadores. */
export const foldText = (value: unknown): string =>
  String(value ?? '')
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

/** Valida un mes 'YYYY-MM' (incluye el rango 01-12). Cualquier otra cosa → null. */
export const normalizeMonth = (value: unknown): string | null =>
  typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : null;

/** Clave del mes actual en formato 'YYYY-MM', para comparar con `startMonth`. */
export function currentMonthKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export const createId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `item-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

/**
 * Convierte un string de precio (ej: "1.200,50") a número flotante.
 */
export function parsePrice(raw: unknown): number {
  let value = String(raw ?? '').trim().replace(/[$%\s]/g, '');
  if (!value) return NaN;
  if (value.includes(',')) value = value.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(value)) value = value.replace(/\./g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return NaN;
  return Number(value);
}

/**
 * Convierte un string de dimensión a número (retorna NaN si es inválido, null si está vacío).
 */
export function parseDimension(raw: unknown): number | null {
  const value = String(raw ?? '').trim().replace(/\s*cm$/i, '').replace(',', '.');
  if (!value) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return NaN;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : NaN;
}

/**
 * Valida y normaliza URLs (agrega https:// si falta).
 */
export function normalizeUrl(rawValue: unknown, allowDataImage = false): string | null {
  const raw = String(rawValue ?? '').trim();
  if (!raw) return '';
  if (/^data:/i.test(raw)) {
    if (!allowDataImage) return null;
    return /^data:image\/(?:png|jpe?g|webp|gif|avif|bmp);base64,[a-z0-9+/=\s]+$/i.test(raw) ? raw : null;
  }
  let candidate = raw;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(candidate)) candidate = `https://${candidate}`;
  try {
    const url = new URL(candidate);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

// ==========================================
// NORMALIZACIÓN DE ENTIDADES COMPLEJAS
// ==========================================
const normDim = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
};

export function normalizeDimensions(raw: unknown): Dimensions | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = {
    height: normDim((raw as any).height),
    width: normDim((raw as any).width),
    depth: normDim((raw as any).depth),
  };
  return d.height || d.width || d.depth ? d : null;
}

export function normalizeInstallments(raw: unknown): Installments | null {
  if (!raw || typeof raw !== 'object') return null;
  const count = Number((raw as any).count);
  const amount = Number((raw as any).amount);
  if (!Number.isFinite(count) || count < 1 || count > 72) return null;
  if (!Number.isFinite(amount) || amount <= 0) return null;

  return {
    count: Math.round(count),
    amount: Math.round(amount * 100) / 100,
    startMonth: normalizeMonth((raw as any).startMonth),
  };
}

/** Referencia a una foto guardada en disco: `local-img://<archivo>`. */
const LOCAL_IMAGE_REF = /^local-img:\/\/[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;

export const normalizeImageData = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  if (/^data:image\//i.test(value)) return value;
  return LOCAL_IMAGE_REF.test(value) ? value : '';
};

// ==========================================
// OPCIONES DE COMPRA (Comparador)
// ==========================================
export function normalizeItemOption(raw: unknown): ItemOption | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  const price = Number(r.price);
  if (!Number.isFinite(price) || price < 0) return null;

  const label = normalizeLabel(r.label, 80);
  const brand = normalizeLabel(r.brand, 40);
  const model = normalizeLabel(r.model, 40);
  const storeName = normalizeLabel(r.storeName, 80);

  if (!label && !brand && !model && !storeName) return null;

  const rawRating = Number(r.rating);
  const rating = Number.isFinite(rawRating)
    ? Math.min(5, Math.max(0, Math.round(rawRating)))
    : 0;

  return {
    id: typeof r.id === 'string' && r.id ? r.id : createId(),
    label,
    brand,
    model,
    storeName,
    storeLocation: normalizeLabel(r.storeLocation, 120),
    price: roundMoney(price),
    installments: normalizeInstallments(r.installments),
    purchaseUrl: normalizeUrl(r.purchaseUrl) || '',
    rating,
    badge: normalizeLabel(r.badge, 32),
    pros: normalizeLabel(r.pros, 200),
    cons: normalizeLabel(r.cons, 200),
    createdAt: Number.isFinite(r.createdAt) ? (r.createdAt as number) : Date.now(),
  };
}

export function normalizeItemOptions(raw: unknown): ItemOption[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: ItemOption[] = [];

  for (const entry of raw) {
    const opt = normalizeItemOption(entry);
    if (!opt) continue;
    if (seen.has(opt.id)) opt.id = createId();
    seen.add(opt.id);
    out.push(opt);
  }
  return out;
}

export interface OptionWinners {
  bestCashId: string | null;
  lowestInstallmentId: string | null;
  bestValueId: string | null;
}

/**
 * Detecta las opciones ganadoras según precio al contado, cuota mensual
 * y relación precio/calidad (requiere al menos 2 opciones comparables).
 */
export function analyzeItemOptions(options: ItemOption[]): OptionWinners {
  if (options.length < 2) {
    return { bestCashId: null, lowestInstallmentId: null, bestValueId: null };
  }

  let bestCash: ItemOption | null = null;
  let lowestInst: ItemOption | null = null;
  let bestValue: { option: ItemOption; score: number } | null = null;

  for (const opt of options) {
    if (opt.price > 0 && (!bestCash || opt.price < bestCash.price)) {
      bestCash = opt;
    }

    const monthly = opt.installments?.amount ?? 0;
    if (monthly > 0 && (!lowestInst || monthly < (lowestInst.installments?.amount ?? Infinity))) {
      lowestInst = opt;
    }

    if (opt.rating > 0 && opt.price > 0) {
      const score = Math.pow(opt.rating, 1.4) / opt.price;
      if (!bestValue || score > bestValue.score) {
        bestValue = { option: opt, score };
      }
    }
  }

  return {
    bestCashId: bestCash?.id ?? null,
    lowestInstallmentId: lowestInst?.id ?? null,
    bestValueId: bestValue?.option.id ?? null,
  };
}

/**
 * Toma un objeto crudo (de SQLite / backup) y lo convierte en un Item seguro y validado.
 */
export function normalizeItem(raw: unknown): Item | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const name = normalizeLabel(r.name, 60);
  if (!name) return null;
  const price = Number(r.price);
  if (!Number.isFinite(price) || price < 0) return null;
  const wishlist = r.wishlist === true;

  const notes = normalizeLabel(r.notes, 250);

  return {
    id: typeof r.id === 'string' && r.id ? r.id : createId(),
    name,
    category: normalizeLabel(r.category, CATEGORY_MAX_LENGTH) || 'Otros',
    subcategory: normalizeLabel(r.subcategory, SUBCATEGORY_MAX_LENGTH),
    price: Math.round(price * 100) / 100,
    currency: normalizeCurrency(r.currency),
    priority: PRIORITY.has(r.priority as any) ? (r.priority as Item['priority']) : 'media',
    bought: wishlist ? false : r.bought === true,
    wishlist,
    createdAt: Number.isFinite(r.createdAt) ? (r.createdAt as number) : Date.now(),
    purchaseUrl: normalizeUrl(r.purchaseUrl) || '',
    imageUrl: normalizeUrl(r.imageUrl, true) || '',
    imageData: normalizeImageData(r.imageData),
    storeName: normalizeLabel(r.storeName, 80),
    storeLocation: normalizeLabel(r.storeLocation, 120),
    dimensions: normalizeDimensions(r.dimensions),
    installments: normalizeInstallments(r.installments),
    purchaseMonth: typeof r.purchaseMonth === 'string' && /^\d{4}-\d{2}$/.test(r.purchaseMonth) ? r.purchaseMonth : null,
    notes,
    brand: normalizeLabel(r.brand, 40),
    model: normalizeLabel(r.model, 40),
    color: normalizeLabel(r.color, 30),
    warranty: r.warranty === null || r.warranty === undefined || r.warranty === ''
      ? null
      : Number.isFinite(Number(r.warranty)) && Number(r.warranty) >= 0
        ? Math.round(Number(r.warranty))
        : null,
    orderNumber: normalizeLabel(r.orderNumber, 50),
    options: normalizeItemOptions(r.options),
    selectedOptionId: typeof r.selectedOptionId === 'string' && r.selectedOptionId
      ? r.selectedOptionId
      : null,
  };
}

// ==========================================
// NORMALIZACIÓN DE ENTIDADES FINANCIERAS
// ==========================================
/**
 * Día de facturación de una tarjeta (cierre o vencimiento).
 * Acepta enteros 1..31; vacío, decimal o fuera de rango → null.
 */
export function normalizeBillingDay(value: unknown): number | null {
  const day = Number(value);
  if (!Number.isInteger(day) || day < 1 || day > 31) return null;
  return day;
}

export function normalizeAccount(raw: unknown): Account | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  const name = normalizeLabel(r.name, 60);
  if (!name) return null;

  const balance = Number(r.balance);
  const type: AccountType = ACCOUNT_TYPES.has(r.type as AccountType)
    ? (r.type as AccountType)
    : 'efectivo';

  // Los días de facturación sólo tienen sentido en una tarjeta: en el resto
  // se fuerzan a null para que un backup raro no deje datos fantasma.
  const isCard = type === 'tarjeta';

  return {
    id: typeof r.id === 'string' && r.id ? r.id : createId(),
    name,
    type,
    balance: Number.isFinite(balance) ? roundMoney(balance) : 0,
    currency: normalizeCurrency(r.currency),
    color: normalizeLabel(r.color, 20) || 'accent',
    closingDay: isCard ? normalizeBillingDay(r.closingDay) : null,
    dueDay: isCard ? normalizeBillingDay(r.dueDay) : null,
    createdAt: Number.isFinite(r.createdAt) ? (r.createdAt as number) : Date.now(),
  };
}

export function normalizeTransaction(raw: unknown): Transaction | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  const accountId = typeof r.accountId === 'string' ? r.accountId : '';
  if (!accountId) return null;

  const amount = Number(r.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const type: TransactionType = TRANSACTION_TYPES.has(r.type as TransactionType)
    ? (r.type as TransactionType)
    : 'gasto';

  const destination = typeof r.destinationAccountId === 'string' && r.destinationAccountId
    ? r.destinationAccountId
    : null;

  const linkedItemId = typeof r.linkedItemId === 'string' && r.linkedItemId
    ? r.linkedItemId
    : null;

  return {
    id: typeof r.id === 'string' && r.id ? r.id : createId(),
    accountId,
    destinationAccountId: type === 'transferencia' ? destination : null,
    type,
    amount: roundMoney(amount),
    date: Number.isFinite(r.date) ? (r.date as number) : Date.now(),
    category: normalizeLabel(r.category, 40),
    notes: normalizeLabel(r.notes, 250),
    linkedItemId,
    recurringExpenseId:
      typeof r.recurringExpenseId === 'string' && r.recurringExpenseId
        ? r.recurringExpenseId
        : null,
  };
}

export function pruneTransactions(transactions: Transaction[], accounts: Account[]): Transaction[] {
  const ids = new Set(accounts.map((a) => a.id));
  return transactions.filter((t) => {
    if (!ids.has(t.accountId)) return false;
    if (t.type !== 'transferencia') return true;
    return !!t.destinationAccountId && ids.has(t.destinationAccountId);
  });
}

// ==========================================
// METAS DE AHORRO
// ==========================================
export function normalizeSavingsGoal(raw: unknown): SavingsGoal | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  const name = normalizeLabel(r.name, 60);
  if (!name) return null;

  const target = roundMoney(Number(r.targetAmount));
  const current = roundMoney(Number(r.currentAmount));

  return {
    id: typeof r.id === 'string' && r.id ? r.id : createId(),
    name,
    targetAmount: Number.isFinite(target) && target > 0 ? target : 0,
    currentAmount: Number.isFinite(current) && current > 0 ? current : 0,
    color: normalizeLabel(r.color, 20) || 'accent',
    deadline: typeof r.deadline === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.deadline)
      ? r.deadline
      : null,
    createdAt: Number.isFinite(r.createdAt) ? (r.createdAt as number) : Date.now(),
  };
}

// ==========================================
// GASTOS FIJOS Y SERVICIOS DEL HOGAR
// ==========================================
const RECURRING_FREQUENCIES: ReadonlySet<RecurringFrequency> = new Set([
  'mensual', 'bimestral', 'anual',
]);

/** Meses entre pagos de cada frecuencia. */
const FREQUENCY_STEP: Record<RecurringFrequency, number> = {
  mensual: 1,
  bimestral: 2,
  anual: 12,
};

export const RECURRING_CATEGORIES: readonly string[] = [
  'Alquiler', 'Expensas', 'Servicios', 'Seguros', 'Suscripciones', 'Impuestos',
];

export function normalizeRecurringExpense(raw: unknown): RecurringExpense | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  const name = normalizeLabel(r.name, 60);
  if (!name) return null;

  const amount = roundMoney(Number(r.amount));
  if (!Number.isFinite(amount) || amount < 0) return null;

  const frequency = RECURRING_FREQUENCIES.has(r.frequency as RecurringFrequency)
    ? (r.frequency as RecurringFrequency)
    : 'mensual';

  const currency = normalizeCurrency(r.currency);

  return {
    id: typeof r.id === 'string' && r.id ? r.id : createId(),
    name,
    category: normalizeLabel(r.category, 40) || 'Servicios',
    amount,
    currency,
    // Los impuestos sólo aplican a montos en dólares: en pesos se limpia para
    // que un cambio de moneda no deje un porcentaje fantasma.
    taxPercent: currency === 'USD' ? clampTaxPercent(Number(r.taxPercent)) : 0,
    // 10 es un default razonable: la mayoría de los servicios vencen a mitad de mes.
    dueDay: normalizeBillingDay(r.dueDay) ?? 10,
    frequency,
    accountId: typeof r.accountId === 'string' && r.accountId ? r.accountId : null,
    active: typeof r.active === 'boolean' ? r.active : true,
    lastPaidMonth: normalizeMonth(r.lastPaidMonth),
    notes: normalizeLabel(r.notes, 200),
    createdAt: Number.isFinite(r.createdAt) ? (r.createdAt as number) : Date.now(),
  };
}

/**
 * Un bimestral/anual sólo "cae" en los meses que corresponden a su ciclo,
 * contado desde el mes en que se dio de alta. Un mensual cae siempre.
 *
 * Es la lectura más defendible de "aplica según el ciclo desde createdAt":
 * si el servicio se creó en marzo y es bimestral, toca marzo, mayo, julio…
 */
export function recurringAppliesToMonth(expense: RecurringExpense, month: string): boolean {
  if (expense.frequency === 'mensual') return true;

  const target = monthIndex(month);
  const start = monthIndex(currentMonthKey(new Date(expense.createdAt)));
  if (target === null || start === null) return true;

  const elapsed = target - start;
  if (elapsed < 0) return false;

  return elapsed % FREQUENCY_STEP[expense.frequency] === 0;
}

export function analyzeRecurringExpenseStatus(
  expense: RecurringExpense,
  now: Date = new Date(),
): RecurringExpenseStatus {
  const currentKey = currentMonthKey(now);
  const appliesThisMonth = recurringAppliesToMonth(expense, currentKey);
  const isPaidThisMonth = expense.lastPaidMonth === currentKey;

  // `dateInMonth` recorta el día a fin de mes: un vencimiento el 31 cae el 28
  // en febrero y el 30 en abril, en vez de desbordar al mes siguiente.
  const dueDateThisMonth = dateInMonth(now.getFullYear(), now.getMonth(), expense.dueDay);
  const daysUntilDue = daysBetween(dueDateThisMonth, now);

  let state: RecurringExpenseState;
  if (!expense.active) state = 'paused';
  else if (isPaidThisMonth) state = 'paid';
  else if (daysUntilDue < 0) state = 'overdue';
  else if (daysUntilDue <= 5) state = 'due-soon';
  else state = 'upcoming';

  return {
    appliesThisMonth,
    isPaidThisMonth,
    dueDateThisMonth,
    daysUntilDue,
    state,
  };
}

// ==========================================
// PREFS
// ==========================================
function pickEnum<T extends string>(
  value: unknown,
  allowed: ReadonlySet<T>,
  fallback: T,
): T {
  return typeof value === 'string' && allowed.has(value as T) ? (value as T) : fallback;
}

export function normalizeHomeCards(raw: unknown): Record<HomeModuleId, HomeCardConfig> {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const cards = {} as Record<HomeModuleId, HomeCardConfig>;

  for (const module of HOME_MODULES) {
    const rawCard = source[module.id];
    const card = rawCard && typeof rawCard === 'object' ? (rawCard as Record<string, unknown>) : {};

    cards[module.id] = {
      visible: typeof card.visible === 'boolean' ? card.visible : module.defaultVisible,
      icon: typeof card.icon === 'string' && HOME_ICONS.has(card.icon) ? card.icon : module.defaultIcon,
      color: pickEnum<CardAccentColor>(card.color, CARD_COLORS, module.defaultColor),
      surface: pickEnum<CardSurfaceStyle>(card.surface, CARD_SURFACES, module.defaultSurface),
    };
  }

  return cards;
}

export function normalizePrefs(raw: unknown): Prefs {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_PREFS, homeCards: normalizeHomeCards(null) };

  const prefs = raw as Record<string, unknown>;

  return {
    ...DEFAULT_PREFS,
    ...prefs,
    sort: pickEnum(prefs.sort, SORT_MODES, DEFAULT_PREFS.sort),
    wishlistSort: pickEnum(prefs.wishlistSort, SORT_MODES, DEFAULT_PREFS.wishlistSort),
    status: pickEnum(prefs.status, STATUS_FILTERS, DEFAULT_PREFS.status),
    viewMode: pickEnum(prefs.viewMode, VIEW_MODES, DEFAULT_PREFS.viewMode),
    accountSort: pickEnum(prefs.accountSort, ACCOUNT_SORT_MODES, DEFAULT_PREFS.accountSort ?? 'manual'),
    usdRate: normalizeUsdRate(prefs.usdRate),
    homeLayout: pickEnum(prefs.homeLayout, HOME_LAYOUTS, DEFAULT_PREFS.homeLayout),
    homeCards: normalizeHomeCards(prefs.homeCards),
  };
}

// ==========================================
// FORMATEADORES DE VISTA (UI)
// ==========================================
export const cleanFilterValue = (v: unknown) => normalizeLabel(v, CATEGORY_MAX_LENGTH) || 'todas';

export function formatDimensions(d?: Dimensions | null): string {
  if (!d) return '';
  const { height, width, depth } = d;
  if (height && width && depth) {
    return `${dimensionFormatter.format(height)} × ${dimensionFormatter.format(width)} × ${dimensionFormatter.format(depth)} cm`;
  }
  const parts: string[] = [];
  if (height) parts.push(`Alto ${dimensionFormatter.format(height)}`);
  if (width) parts.push(`Ancho ${dimensionFormatter.format(width)}`);
  if (depth) parts.push(`Prof. ${dimensionFormatter.format(depth)}`);
  return parts.length ? `${parts.join(' · ')} cm` : '';
}

export function formatInstallments(inst?: Installments | null): string {
  if (!inst || inst.count < 1 || inst.amount <= 0) return '';
  return `${inst.count} cuota${inst.count === 1 ? '' : 's'} × ${money(inst.amount)}`;
}

// ==========================================
// SEGUIMIENTO DE CUOTAS
// ==========================================
export interface InstallmentStatus {
  active: boolean;
  current: number;
  total: number;
  monthlyAmount: number;
  finished: boolean;
}

const monthIndex = (value: string): number | null => {
  const month = normalizeMonth(value);
  if (!month) return null;
  const [year, m] = month.split('-').map(Number);
  return year * 12 + (m - 1);
};

export function getInstallmentStatus(
  installments: Installments | null | undefined,
  currentMonthYYYYMM: string,
): InstallmentStatus | null {
  if (!installments || installments.count < 1 || installments.amount <= 0) return null;

  const total = installments.count;
  const start = installments.startMonth ? monthIndex(installments.startMonth) : null;
  const now = monthIndex(currentMonthYYYYMM);

  if (start === null || now === null) {
    return {
      active: true,
      current: 0,
      total,
      monthlyAmount: installments.amount,
      finished: false,
    };
  }

  const elapsed = Math.max(0, now - start);

  if (elapsed >= total) {
    return { active: false, current: 0, total, monthlyAmount: 0, finished: true };
  }

  return {
    active: true,
    current: elapsed + 1,
    total,
    monthlyAmount: installments.amount,
    finished: false,
  };
}

export function formatInstallmentProgress(status: InstallmentStatus | null): string {
  if (!status) return '';
  if (status.finished) return 'Cuotas finalizadas';
  if (status.current >= 1) return `Cuota ${status.current} de ${status.total}`;
  return '';
}

// ==========================================
// RESUMEN DE COMPRAS (fuente única de verdad)
// ==========================================
export interface PurchasesSummary {
  pendingTotal: number;
  pendingCount: number;
  boughtTotal: number;
  boughtCount: number;
  grand: number;
  monthlyAmount: number;
  activeInstallments: number;
}

export function summarizePurchases(
  items: Item[],
  currentMonthYYYYMM: string,
  usdRate: number = DEFAULT_USD_RATE,
): PurchasesSummary {
  let pendingTotal = 0;
  let pendingCount = 0;
  let boughtTotal = 0;
  let boughtCount = 0;
  let monthlyAmount = 0;
  let activeInstallments = 0;

  for (const item of items) {
    if (item.wishlist) continue;

    const currency = item.currency ?? 'ARS';
    const priceInArs = toArs(item.price, currency, usdRate);

    if (item.bought) {
      boughtTotal += priceInArs;
      boughtCount += 1;

      const status = getInstallmentStatus(item.installments, currentMonthYYYYMM);
      if (status?.active && status.monthlyAmount > 0) {
        monthlyAmount += toArs(status.monthlyAmount, currency, usdRate);
        activeInstallments += 1;
      }
    } else {
      pendingTotal += priceInArs;
      pendingCount += 1;
    }
  }

  return {
    pendingTotal: roundMoney(pendingTotal),
    pendingCount,
    boughtTotal: roundMoney(boughtTotal),
    boughtCount,
    grand: roundMoney(pendingTotal + boughtTotal),
    monthlyAmount: roundMoney(monthlyAmount),
    activeInstallments,
  };
}

// ==========================================
// TARJETAS DE CRÉDITO
// ==========================================
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Último día real del mes (28/29/30/31). `monthIndex0` va de 0 a 11. */
function lastDayOfMonth(year: number, monthIndex0: number): number {
  // Día 0 del mes siguiente = último día del mes actual.
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

/** Fecha del día pedido dentro del mes, recortada a fin de mes. */
function dateInMonth(year: number, monthIndex0: number, day: number): Date {
  return new Date(year, monthIndex0, Math.min(day, lastDayOfMonth(year, monthIndex0)));
}

const startOfDay = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const endOfDay = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

/** Diferencia en días calendario, inmune a los cambios de horario (DST). */
export function daysBetween(target: Date, from: Date): number {
  return Math.round((startOfDay(target).getTime() - startOfDay(from).getTime()) / MS_PER_DAY);
}

/** Próxima vez que cae `day`: este mes si todavía no pasó, si no el que viene. */
function nextOccurrence(day: number, now: Date): Date {
  const today = startOfDay(now);
  const thisMonth = dateInMonth(now.getFullYear(), now.getMonth(), day);
  if (thisMonth.getTime() >= today.getTime()) return thisMonth;

  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return dateInMonth(next.getFullYear(), next.getMonth(), day);
}

/** Última vez que cayó `day`, estrictamente antes de hoy. */
function previousOccurrence(day: number, now: Date): Date {
  const today = startOfDay(now);
  const thisMonth = dateInMonth(now.getFullYear(), now.getMonth(), day);
  if (thisMonth.getTime() < today.getTime()) return thisMonth;

  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return dateInMonth(prev.getFullYear(), prev.getMonth(), day);
}

/**
 * Estado del resumen de una tarjeta: cuánto hay que pagar, cuándo cierra,
 * cuándo vence y cuánto se gastó en el ciclo en curso.
 *
 * Los días de cierre/vencimiento son opcionales: si faltan, las fechas
 * quedan en `null` y sólo se calcula el monto.
 */
export function analyzeCreditCardStatement(
  account: Account,
  transactions: Transaction[],
  now: Date = new Date(),
): CreditCardStatement {
  const statementToPay =
    account.balance < 0 ? roundMoney(Math.abs(account.balance)) : 0;

  const closingDay = normalizeBillingDay(account.closingDay);
  const dueDay = normalizeBillingDay(account.dueDay);

  const nextClosingDate = closingDay === null ? null : nextOccurrence(closingDay, now);
  const nextDueDate = dueDay === null ? null : nextOccurrence(dueDay, now);

  // El último cierre marca el arranque del ciclo actual. Sin día configurado
  // se usa el inicio del mes calendario, que es la aproximación más honesta.
  const cycleStart =
    closingDay === null
      ? new Date(now.getFullYear(), now.getMonth(), 1)
      : endOfDay(previousOccurrence(closingDay, now));

  const currentCycleSpend = transactions
    .filter(
      (t) => t.accountId === account.id && t.type === 'gasto' && t.date > cycleStart.getTime(),
    )
    .reduce((sum, t) => sum + t.amount, 0);

  return {
    statementToPay,
    nextClosingDate,
    nextDueDate,
    daysToClosing: nextClosingDate === null ? null : daysBetween(nextClosingDate, now),
    daysToDue: nextDueDate === null ? null : daysBetween(nextDueDate, now),
    currentCycleSpend: roundMoney(currentCycleSpend),
  };
}

// ==========================================
// PROYECCIÓN DE FLUJO DE CAJA (6 MESES)
// ==========================================
const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat('es-AR', { month: 'short' });

/**
 * Ingreso mensual de referencia: promedio de los últimos 3 meses calendario
 * que hayan tenido ingresos. Los meses vacíos no castigan el promedio.
 */
export function estimateBaselineMonthlyIncome(
  transactions: Transaction[],
  now: Date = new Date(),
  accounts: Account[] = [],
  usdRate: number = DEFAULT_USD_RATE,
): number {
  const currencyOf = new Map(accounts.map((a) => [a.id, a.currency ?? 'ARS'] as const));
  const totals = new Map<string, number>();
  for (const t of transactions) {
    if (t.type !== 'ingreso') continue;
    const key = currentMonthKey(new Date(t.date));
    const amountInArs = toArs(t.amount, currencyOf.get(t.accountId) ?? 'ARS', usdRate);
    totals.set(key, (totals.get(key) ?? 0) + amountInArs);
  }

  const withIncome: number[] = [];
  for (let offset = 0; offset < 3; offset += 1) {
    const pivot = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const total = totals.get(currentMonthKey(pivot)) ?? 0;
    if (total > 0) withIncome.push(total);
  }

  if (withIncome.length === 0) return 0;
  return roundMoney(withIncome.reduce((sum, v) => sum + v, 0) / withIncome.length);
}

/**
 * Proyección a 6 meses del flujo de caja.
 *
 * Cruza tres fuentes: ingresos estimados, cuotas ya vigentes y compras
 * planificadas (pendientes con `purchaseMonth`). No muta nada: es puramente
 * derivada, así que se puede llamar en cada render sin riesgo.
 */
export function buildCashflowForecast(
  items: Item[],
  transactions: Transaction[],
  accounts: Account[],
  monthlyIncomeOverride?: number | null,
  recurringExpenses: RecurringExpense[] = [],
  now: Date = new Date(),
  usdRate: number = DEFAULT_USD_RATE,
): CashflowForecastResult {
  const currencyOf = new Map(accounts.map((a) => [a.id, a.currency ?? 'ARS'] as const));

  // Todo el flujo se proyecta en pesos: las cuentas y servicios en USD se
  // consolidan con la cotización de referencia.
  const startingLiquidity = roundMoney(
    accounts
      .filter((a) => a.type !== 'tarjeta')
      .reduce((sum, a) => sum + toArs(a.balance, a.currency ?? 'ARS', usdRate), 0),
  );

  const defaultMonthlyIncome = estimateBaselineMonthlyIncome(transactions, now, accounts, usdRate);

  // Un override negativo o inválido se descarta: el promedio automático manda.
  const override =
    typeof monthlyIncomeOverride === 'number' &&
    Number.isFinite(monthlyIncomeOverride) &&
    monthlyIncomeOverride >= 0
      ? roundMoney(monthlyIncomeOverride)
      : null;

  const baseIncome = override ?? defaultMonthlyIncome;

  const currentKey = currentMonthKey(now);
  const incomeThisMonth = roundMoney(
    transactions
      .filter((t) => t.type === 'ingreso' && currentMonthKey(new Date(t.date)) === currentKey)
      .reduce(
        (sum, t) => sum + toArs(t.amount, currencyOf.get(t.accountId) ?? 'ARS', usdRate),
        0,
      ),
  );

  const months: CashflowMonth[] = [];
  let runningLiquidity = startingLiquidity;

  for (let i = 0; i < 6; i += 1) {
    const pivot = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const key = currentMonthKey(pivot);

    // En el mes en curso, lo ya cobrado puede superar el promedio histórico:
    // proyectar menos de lo que hay en la cuenta sería engañoso.
    const estimatedIncome =
      i === 0 && override === null
        ? roundMoney(Math.max(baseIncome, incomeThisMonth))
        : baseIncome;

    let installmentsTotal = 0;
    let plannedTotal = 0;
    let recurringTotal = 0;

    for (const item of items) {
      if (item.wishlist) continue;

      if (item.bought) {
        // Compras ya hechas: las cuotas mandan según el mes de la proyección.
        const status = getInstallmentStatus(item.installments, key);
        if (status?.active && status.monthlyAmount > 0) {
          installmentsTotal += toArs(status.monthlyAmount, item.currency ?? 'ARS', usdRate);
        }
        continue;
      }

      // Compras planificadas: sólo pesan desde el mes elegido.
      const startMonth = normalizeMonth(item.purchaseMonth);
      if (!startMonth) continue;

      const startIndex = monthIndex(startMonth);
      const targetIndex = monthIndex(key);
      if (startIndex === null || targetIndex === null) continue;

      const offset = targetIndex - startIndex;
      if (offset < 0) continue;

      const plan = item.installments;
      const hasPlan = !!plan && plan.count > 1 && plan.amount > 0;

      if (offset === 0) {
        // Desembolso de este mes: cuota 1 si hay plan, si no el precio.
        plannedTotal += toArs(hasPlan ? plan.amount : item.price, item.currency ?? 'ARS', usdRate);
      } else if (hasPlan && offset < plan.count) {
        // Cuotas 2..N: ya no son "compra planificada", son cuota viva.
        installmentsTotal += toArs(plan.amount, item.currency ?? 'ARS', usdRate);
      }
    }

    const activeInstallments = roundMoney(installmentsTotal);
    const plannedPurchases = roundMoney(plannedTotal);

    // Gastos fijos: sólo los activos y sólo los meses que les toca.
    // En el mes en curso se saltea lo ya pagado: ese gasto ya está descontado
    // del saldo líquido y contarlo otra vez inflaría el egreso.
    for (const expense of recurringExpenses) {
      if (!expense.active) continue;
      if (!recurringAppliesToMonth(expense, key)) continue;
      if (i === 0 && expense.lastPaidMonth === currentKey) continue;
      recurringTotal += toArs(
        expense.amount,
        expense.currency ?? 'ARS',
        usdRate,
        expense.taxPercent ?? 0,
      );
    }

    const recurring = roundMoney(recurringTotal);
    const totalOutflow = roundMoney(activeInstallments + plannedPurchases + recurring);
    const netCashflow = roundMoney(estimatedIncome - totalOutflow);
    runningLiquidity = roundMoney(runningLiquidity + netCashflow);

    months.push({
      key,
      label: `${MONTH_LABEL_FORMATTER.format(pivot).replace('.', '')} ${pivot.getFullYear()}`,
      estimatedIncome,
      activeInstallments,
      plannedPurchases,
      recurringTotal: recurring,
      totalOutflow,
      netCashflow,
      projectedLiquidity: runningLiquidity,
    });
  }

  const firstNegativeMonth = months.find((m) => m.projectedLiquidity < 0) ?? null;

  return {
    startingLiquidity,
    defaultMonthlyIncome,
    months,
    hasNegativeMonth: firstNegativeMonth !== null,
    firstNegativeMonth,
  };
}

// ==========================================
// PROCESAMIENTO DE IMÁGENES (OPTIMIZACIÓN)
// ==========================================
const PHOTO_MIN_SIDE = 480;

export async function optimizePhoto(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Elige un archivo de imagen (JPG, PNG o WebP).');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('La imagen supera los 20 MB. Prueba con una más liviana.');
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('El archivo no parece ser una imagen compatible.');
  }

  const naturalWidth = bitmap.width;
  const naturalHeight = bitmap.height;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx || !naturalWidth || !naturalHeight) {
    bitmap.close();
    throw new Error('No se pudieron leer las dimensiones de la imagen.');
  }

  try {
    let maxSide = MAX_PHOTO_SIDE;

    while (maxSide >= PHOTO_MIN_SIDE) {
      const scale = Math.min(1, maxSide / Math.max(naturalWidth, naturalHeight));
      const targetWidth = Math.max(1, Math.round(naturalWidth * scale));
      const targetHeight = Math.max(1, Math.round(naturalHeight * scale));

      if (canvas.width !== targetWidth) canvas.width = targetWidth;
      if (canvas.height !== targetHeight) canvas.height = targetHeight;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, targetWidth, targetHeight);

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);

      for (const quality of PHOTO_QUALITIES) {
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        if (dataUrl.length <= MAX_PHOTO_DATA_LENGTH) return dataUrl;
      }

      maxSide = Math.round(maxSide * 0.75);
    }
  } finally {
    bitmap.close();
  }

  throw new Error('La foto es demasiado pesada incluso optimizada. Prueba con otra.');
}

export const estimateKb = (dataUrl: string) => Math.max(1, Math.round((dataUrl.length * 0.75) / 1024));