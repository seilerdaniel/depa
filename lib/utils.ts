import {
  CATEGORY_MAX_LENGTH,
  SUBCATEGORY_MAX_LENGTH,
  PRIORITY,
  MAX_PHOTO_SIDE,
  MAX_PHOTO_DATA_LENGTH,
  PHOTO_QUALITIES,
  MAX_UPLOAD_BYTES,
} from './config';
import type { Dimensions, Installments, Item } from './types';

// ==========================================
// FORMATEADORES
// ==========================================
export const priceFormatter = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });
export const dimensionFormatter = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });

export const money = (v: number) => `$ ${priceFormatter.format(v)}`;
export const pluralize = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;

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
  return { count: Math.round(count), amount: Math.round(amount * 100) / 100 };
}

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
    imageData: typeof r.imageData === 'string' && /^data:image\//i.test(r.imageData) ? r.imageData : '',
    storeName: normalizeLabel(r.storeName, 80),
    storeLocation: normalizeLabel(r.storeLocation, 120),
    dimensions: normalizeDimensions(r.dimensions),
    installments: normalizeInstallments(r.installments),
    purchaseMonth: typeof r.purchaseMonth === 'string' && /^\d{4}-\d{2}$/.test(r.purchaseMonth) ? r.purchaseMonth : null,
    notes,
  };
}

// ==========================================
// FORMATEADORES DE VISTA (UI)
// ==========================================
export const cleanFilterValue = (v: unknown) => normalizeLabel(v, CATEGORY_MAX_LENGTH) || 'todas';
export const getItemImage = (item: Item) => item.imageData || item.imageUrl || '';

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
// PROCESAMIENTO DE IMÁGENES (OPTIMIZACIÓN)
// ==========================================
const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => res(String(reader.result || ''));
    reader.onerror = () => rej(new Error('No se pudo leer el archivo.'));
    reader.readAsDataURL(file);
  });

const loadImageElement = (src: string): Promise<HTMLImageElement> =>
  new Promise((res, rej) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('El archivo no parece ser una imagen compatible.'));
    img.src = src;
  });

function renderJpeg(image: HTMLImageElement, maxSide: number, quality: number): string {
  const w = image.naturalWidth || image.width;
  const h = image.naturalHeight || image.height;
  if (!w || !h) throw new Error('No se pudieron leer las dimensiones de la imagen.');

  const scale = Math.min(1, maxSide / Math.max(w, h));
  const tw = Math.max(1, Math.round(w * scale));
  const th = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement('canvas');
  canvas.width = tw;
  canvas.height = th;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo procesar la imagen.');

  // Fondo blanco por si la imagen original tiene transparencia
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, tw, th);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, tw, th);

  return canvas.toDataURL('image/jpeg', quality);
}

/**
 * Toma un archivo de imagen, lo redimensiona y comprime para que quepa en localStorage.
 */
export async function optimizePhoto(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Elige un archivo de imagen (JPG, PNG o WebP).');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('La imagen supera los 20 MB. Prueba con una más liviana.');
  }

  const original = await readFileAsDataUrl(file);
  const img = await loadImageElement(original);

  let maxSide = MAX_PHOTO_SIDE;
  let last = '';

  // Intentamos comprimir bajando iterativamente la resolución y calidad
  while (maxSide >= 480) {
    for (const q of PHOTO_QUALITIES) {
      last = renderJpeg(img, maxSide, q);
      if (last.length <= MAX_PHOTO_DATA_LENGTH) return last;
    }
    maxSide = Math.round(maxSide * 0.75);
  }

  if (last && last.length <= MAX_PHOTO_DATA_LENGTH * 1.3) return last;

  throw new Error('La foto es demasiado pesada incluso optimizada. Prueba con otra.');
}

/**
 * Calcula un tamaño aproximado en KB de un DataURL base64.
 */
export const estimateKb = (dataUrl: string) => Math.max(1, Math.round((dataUrl.length * 0.75) / 1024));