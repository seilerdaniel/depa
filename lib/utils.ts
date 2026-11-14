import {
  CATEGORY_MAX_LENGTH,
  SUBCATEGORY_MAX_LENGTH,
  PRIORITY,
  ACCOUNT_TYPES,
  TRANSACTION_TYPES,
  MAX_PHOTO_SIDE,
  MAX_PHOTO_DATA_LENGTH,
  PHOTO_QUALITIES,
  MAX_UPLOAD_BYTES,
  DEFAULT_PREFS,
  SORT_MODES,
  STATUS_FILTERS,
  VIEW_MODES,
  HOME_LAYOUTS,
  HOME_MODULES,
  HOME_ICONS,
  CARD_COLORS,
  CARD_SURFACES,
} from './config';
import type {
  Account, AccountType, CardAccentColor, CardSurfaceStyle, Dimensions, HomeCardConfig,
  HomeModuleId, Installments, Item, Prefs, SavingsGoal, Transaction, TransactionType,
} from './types';

// ==========================================
// FORMATEADORES
// ==========================================
export const priceFormatter = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });
export const dimensionFormatter = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });

export const money = (v: number) => `$ ${priceFormatter.format(v)}`;
export const pluralize = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;

/** Redondeo a centavos. Evita arrastrar errores de coma flotante en saldos. */
export const roundMoney = (n: number) => Math.round(n * 100) / 100;

// ==========================================
// PRIORIDADES
// ==========================================
/**
 * Peso numérico 0..5 de una prioridad, para ordenar de mayor a menor.
 *
 * Acepta tanto los ids canónicos de la app ('urgente' | 'media' | 'baja')
 * como texto heredado de backups viejos ('URGENTE', 'ALTA', 'MEDIA', 'BAJA').
 * Un valor desconocido pesa 0: nunca gana un ordenamiento por prioridad,
 * pero tampoco rompe el render.
 */
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
  // Usamos 'es' para obtener la abreviatura del mes
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
    depth: normDim((raw as any).depth)
  };
  return d.height || d.width || d.depth ? d : null;
}

export function normalizeInstallments(raw: unknown): Installments | null {
  if (!raw || typeof raw !== 'object') return null;
  const count = Number((raw as any).count);
  const amount = Number((raw as any).amount);
  if (!Number.isFinite(count) || count < 1 || count > 72) return null;
  if (!Number.isFinite(amount) || amount <= 0) return null;

  // `normalizeItem` delega acá, así que este es el único lugar donde hay que
  // preservar `startMonth`. Sin él, el artículo queda como legado: activo.
  return {
    count: Math.round(count),
    amount: Math.round(amount * 100) / 100,
    startMonth: normalizeMonth((raw as any).startMonth),
  };
}

/** Referencia a una foto guardada en disco: `local-img://<archivo>`. */
const LOCAL_IMAGE_REF = /^local-img:\/\/[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;

/**
 * Deja pasar sólo fotos conocidas: un DataURL válido o una referencia
 * nuestra a disco. Cualquier otra cosa se descarta (evita rutas arbitrarias).
 */
export const normalizeImageData = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  if (/^data:image\//i.test(value)) return value;
  return LOCAL_IMAGE_REF.test(value) ? value : '';
};

/**
 * Toma un objeto crudo (de localStorage) y lo convierte en un Item seguro y validado.
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
    notes, brand: normalizeLabel(r.brand, 40),
    model: normalizeLabel(r.model, 40),
    color: normalizeLabel(r.color, 30),
    warranty: r.warranty === null || r.warranty === undefined || r.warranty === ''
      ? null
      : Number.isFinite(Number(r.warranty)) && Number(r.warranty) >= 0
        ? Math.round(Number(r.warranty))
        : null,
    orderNumber: normalizeLabel(r.orderNumber, 50),
  };
};

// ==========================================
// NORMALIZACIÓN DE ENTIDADES FINANCIERAS
// ==========================================
/**
 * Convierte una cuenta cruda (localStorage / backup) en una Account segura.
 * Descarta lo que no tenga nombre; el resto se corrige a valores por defecto.
 */
export function normalizeAccount(raw: unknown): Account | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  const name = normalizeLabel(r.name, 60);
  if (!name) return null;

  const balance = Number(r.balance);

  return {
    id: typeof r.id === 'string' && r.id ? r.id : createId(),
    name,
    type: ACCOUNT_TYPES.has(r.type as AccountType) ? (r.type as AccountType) : 'efectivo',
    balance: Number.isFinite(balance) ? roundMoney(balance) : 0,
    color: normalizeLabel(r.color, 20) || 'accent',
    createdAt: Number.isFinite(r.createdAt) ? (r.createdAt as number) : Date.now(),
  };
}

/**
 * Convierte un movimiento crudo en una Transaction segura.
 * Reglas: siempre hay cuenta origen, el monto es positivo y sólo las
 * transferencias conservan `destinationAccountId`.
 */
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
  };
}

/**
 * Deja sólo los movimientos cuyas cuentas existen realmente.
 * Evita huérfanos tras borrar una cuenta o importar un backup inconsistente.
 */
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
/**
 * Convierte una meta cruda (SQLite / backup) en una SavingsGoal segura.
 * Descarta lo que no tenga nombre; los montos se sanean a >= 0.
 */
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
// PREFS
// ==========================================
/**
 * Devuelve el valor si pertenece al set permitido; si no, el fallback.
 *
 * `localStorage` y los backups son datos NO confiables: un `viewMode` o un
 * `status` inventado dejaría la UI sin vista o con un filtro que no filtra.
 */
function pickEnum<T extends string>(
  value: unknown,
  allowed: ReadonlySet<T>,
  fallback: T,
): T {
  return typeof value === 'string' && allowed.has(value as T) ? (value as T) : fallback;
}

/**
 * Valida la apariencia de los seis módulos del Inicio.
 *
 * Cada módulo se resuelve por separado y cae a SU default: un backup viejo
 * (sin `homeCards`) o con un ícono inexistente no rompe la grilla.
 */
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

/**
 * Sanea prefs de cualquier origen (localStorage o backup importado).
 * `DEFAULT_PREFS` actúa de base, así un JSON viejo no deja campos en `undefined`.
 */
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
  /** Queda al menos una cuota por pagar en el mes actual. */
  active: boolean;
  /** Cuota vigente (1-based). 0 si terminó o si no hay `startMonth` conocido. */
  current: number;
  total: number;
  /** Monto que sigue pesando este mes. 0 cuando ya se pagaron todas. */
  monthlyAmount: number;
  /** `true` cuando `elapsed >= count`. */
  finished: boolean;
}

/** Índice absoluto de mes (año * 12 + mes 0-11) para restar sin cruzar años. */
const monthIndex = (value: string): number | null => {
  const month = normalizeMonth(value);
  if (!month) return null;
  const [year, m] = month.split('-').map(Number);
  return year * 12 + (m - 1);
};

/**
 * Estado de una financiación en un mes dado.
 *
 * Reglas:
 * - Sin `startMonth` (artículos viejos) se considera activa y se cobra completa.
 * - Si el mes actual es anterior al inicio, la cuota vigente es la 1.
 * - Si ya transcurrieron `count` meses, la financiación terminó: no suma al fijo.
 */
export function getInstallmentStatus(
  installments: Installments | null | undefined,
  currentMonthYYYYMM: string,
): InstallmentStatus | null {
  if (!installments || installments.count < 1 || installments.amount <= 0) return null;

  const total = installments.count;
  const start = installments.startMonth ? monthIndex(installments.startMonth) : null;
  const now = monthIndex(currentMonthYYYYMM);

  // Retrocompatibilidad: no se puede saber cuántas cuotas van.
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

/** Texto de progreso: "Cuota 3 de 6" o "Cuotas finalizadas". */
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
  /** Pendiente + comprado. */
  grand: number;
  /** Compromiso mensual de cuotas ACTIVAS de artículos YA comprados. */
  monthlyAmount: number;
  /** Cuántas financiaciones siguen vigentes este mes. */
  activeInstallments: number;
}

/**
 * Único lugar donde se define qué cuenta cada métrica de compras.
 *
 * `PurchasesPanel` y `Dashboard` lo consumen: si mañana cambia la regla,
 * cambia acá y las dos pantallas siguen coincidiendo al centavo.
 */
export function summarizePurchases(
  items: Item[],
  currentMonthYYYYMM: string,
): PurchasesSummary {
  let pendingTotal = 0;
  let pendingCount = 0;
  let boughtTotal = 0;
  let boughtCount = 0;
  let monthlyAmount = 0;
  let activeInstallments = 0;

  for (const item of items) {
    if (item.wishlist) continue;

    if (item.bought) {
      boughtTotal += item.price;
      boughtCount += 1;

      // Sólo una compra efectiva genera compromiso, y sólo mientras la
      // financiación no haya terminado.
      const status = getInstallmentStatus(item.installments, currentMonthYYYYMM);
      if (status?.active && status.monthlyAmount > 0) {
        monthlyAmount += status.monthlyAmount;
        activeInstallments += 1;
      }
    } else {
      pendingTotal += item.price;
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
// PROCESAMIENTO DE IMÁGENES (OPTIMIZACIÓN)
// ==========================================
/**
 * Piso de resolución: por debajo de esto la foto deja de ser útil
 * y conviene rechazarla en lugar de guardar una mancha de píxeles.
 */
const PHOTO_MIN_SIDE = 480;

/**
 * Toma un archivo de imagen, lo redimensiona y comprime para que quepa en localStorage.
 *
 * Decodifica directo del File con `createImageBitmap` (sin pasar por un DataURL
 * intermedio, que duplicaba memoria) y reutiliza un único canvas entre intentos.
 */
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

  // Un canvas para todos los intentos: crear uno por vuelta era basura pura.
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx || !naturalWidth || !naturalHeight) {
    bitmap.close();
    throw new Error('No se pudieron leer las dimensiones de la imagen.');
  }

  try {
    let maxSide = MAX_PHOTO_SIDE;

    // Bajamos resolución y calidad de forma acotada: 900 → 675 → 506 → 480.
    while (maxSide >= PHOTO_MIN_SIDE) {
      const scale = Math.min(1, maxSide / Math.max(naturalWidth, naturalHeight));
      const targetWidth = Math.max(1, Math.round(naturalWidth * scale));
      const targetHeight = Math.max(1, Math.round(naturalHeight * scale));

      // Asignar width/height reinicia el contexto; lo hacemos sólo si cambió.
      if (canvas.width !== targetWidth) canvas.width = targetWidth;
      if (canvas.height !== targetHeight) canvas.height = targetHeight;

      // Fondo blanco por si el original trae transparencia.
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
    // Libera la memoria decodificada aunque haya error o corte temprano.
    bitmap.close();
  }

  throw new Error('La foto es demasiado pesada incluso optimizada. Prueba con otra.');
}

/**
 * Calcula un tamaño aproximado en KB de un DataURL base64.
 */
export const estimateKb = (dataUrl: string) => Math.max(1, Math.round((dataUrl.length * 0.75) / 1024));