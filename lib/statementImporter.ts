'use client';

// ==========================================
// IMPORTADOR DE EXTRACTOS (CSV / EXCEL)
// ==========================================
// Motor puro: lee el archivo, detecta dónde empieza la tabla real, adivina las
// columnas y normaliza filas a movimientos de DEPA. Ninguna función toca el
// estado global: el modal decide qué hacer con el resultado.
//
// Los extractos argentinos son un campo minado: 3 a 8 filas de cabecera con
// CBU y período, fechas DD/MM/YYYY, montos "1.200,50" y columnas Débito/Crédito
// separadas. Todo eso se resuelve acá para que la UI quede simple.

import * as XLSX from 'xlsx';
import { normalizeLabel, roundMoney } from './utils';
import type { Transaction } from './types';

// ==========================================
// TIPOS
// ==========================================
export interface RawStatementTable {
  headers: string[];
  rows: unknown[][];
  headerRowIndex: number;
}

export type StatementAmountMode = 'signed' | 'split';

export interface StatementColumnMapping {
  dateCol: number | null;
  descriptionCol: number | null;
  amountCol: number | null;
  debitCol: number | null;
  creditCol: number | null;
  categoryCol: number | null;
  amountMode: StatementAmountMode;
}

export interface ParsedStatementRow {
  /** Identificador efímero para React (no se persiste). */
  id: string;
  /** Epoch en ms, a medianoche local. */
  date: number;
  description: string;
  category: string;
  /** Siempre positivo: el signo vive en `type`. */
  amount: number;
  type: 'ingreso' | 'gasto';
  isDuplicate: boolean;
  selected: boolean;
}

export const STATEMENT_CATEGORIES: readonly string[] = [
  'Supermercado', 'Alquiler', 'Expensas', 'Servicios', 'Transporte', 'Salud',
  'Ocio', 'Educación', 'Sueldo', 'Freelance', 'Ahorro', 'Transferencia', 'Otros',
];

// ==========================================
// TEXTO: BOM, ACENTOS, DELIMITADOR
// ==========================================
const stripBom = (text: string): string => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);

const normalizeKey = (value: unknown): string =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

/** Cuenta separadores fuera de comillas para elegir el delimitador. */
function countDelimiter(line: string, delimiter: string): number {
  let count = 0;
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') i += 1;
      else inQuotes = !inQuotes;
    } else if (!inQuotes && char === delimiter) {
      count += 1;
    }
  }

  return count;
}

export function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '').slice(0, 10);
  const candidates = [';', ',', '\t'];

  let best = ';';
  let bestScore = -1;

  for (const delimiter of candidates) {
    const score = lines.reduce((sum, line) => sum + countDelimiter(line, delimiter), 0);
    if (score > bestScore) {
      bestScore = score;
      best = delimiter;
    }
  }

  return best;
}

/** Parser CSV tolerante: comillas dobles, `""` escapado y CRLF. */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  const source = stripBom(text);

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];

    if (inQuotes) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

// ==========================================
// FECHAS
// ==========================================
/** Diferencia en días entre 1899-12-30 y 1970-01-01 (epoch de Excel). */
const EXCEL_EPOCH_OFFSET = 25569;

const isValidDate = (year: number, month: number, day: number): boolean => {
  if (month < 1 || month > 12 || day < 1) return false;
  const lastDay = new Date(year, month, 0).getDate();
  return day <= lastDay;
};

function buildDate(
  year: number,
  month: number,
  day: number,
  hours = 0,
  minutes = 0,
  seconds = 0,
): Date | null {
  if (!isValidDate(year, month, day)) return null;
  return new Date(year, month - 1, day, hours, minutes, seconds);
}

export function parseStatementDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : buildDate(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }

  // Serial de Excel: se interpreta en UTC y se reconstruye en local para que
  // el día no se corra por zona horaria.
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value <= 0 || value >= 100000) return null;
    const utc = new Date(Math.round((value - EXCEL_EPOCH_OFFSET) * 86400000));
    return buildDate(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate());
  }

  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;

  // ISO: YYYY-MM-DD (con hora opcional).
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(text);
  if (iso) {
    return buildDate(
      Number(iso[1]), Number(iso[2]), Number(iso[3]),
      Number(iso[4] ?? 0), Number(iso[5] ?? 0), Number(iso[6] ?? 0),
    );
  }

  // Argentino: DD/MM/YYYY o DD-MM-YYYY (con hora opcional).
  const local = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(text);
  if (local) {
    let year = Number(local[3]);
    if (year < 100) year += 2000;

    return buildDate(
      year, Number(local[2]), Number(local[1]),
      Number(local[4] ?? 0), Number(local[5] ?? 0), Number(local[6] ?? 0),
    );
  }

  return null;
}

/** Clave de día calendario local, para comparar duplicados. */
export function statementDayKey(value: number | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

// ==========================================
// MONTOS
// ==========================================
export function parseStatementAmount(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value !== 'string') return 0;

  let text = value.trim();
  if (!text) return 0;

  let negative = false;

  // Contabilidad: (1.200,00) es negativo.
  if (text.startsWith('(') && text.endsWith(')')) {
    negative = true;
    text = text.slice(1, -1);
  }

  // Fuera símbolos de moneda, espacios duros y letras (ARS, USD).
  text = text.replace(/[^\d.,+-]/g, '');

  if (text.includes('-')) negative = true;
  text = text.replace(/[+-]/g, '');
  if (!text) return 0;

  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');

  if (lastComma >= 0 && lastDot >= 0) {
    // El último separador es el decimal; el otro es de miles.
    text = lastComma > lastDot
      ? text.replace(/\./g, '').replace(/,/g, '.')
      : text.replace(/,/g, '');
  } else if (lastComma >= 0) {
    text = text.replace(/,/g, '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(text)) {
    // 1.234.567 sin decimales: puntos de miles.
    text = text.replace(/\./g, '');
  }

  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return 0;

  return negative ? -parsed : parsed;
}

// ==========================================
// CATEGORÍAS SUGERIDAS
// ==========================================
const CATEGORY_KEYWORDS: ReadonlyArray<[RegExp, string]> = [
  [/supermercado|carrefour|coto|jumbo|disco|vea|walmart|changomas|makro|anonima|hiper|\bdia\b|super chino/, 'Supermercado'],
  [/edenor|edesur|metrogas|camuzzi|naturgy|personal|claro|movistar|fibertel|telecom|internet|telefono|celular|gas |luz|agua|aysa|\babl\b|expensas|alquiler|seguro/, 'Servicios'],
  [/sube|cabify|uber|\bdidi\b|taxi|colectivo|tren|subte|ypf|shell|axion|\bpuma\b|nafta|combustible|peaje|estacionamiento/, 'Transporte'],
  [/farmacia|hospital|clinica|sanatorio|medic|obra social|osde|swiss medical|galeno|salud|dentista|optica/, 'Salud'],
  [/netflix|spotify|youtube|cinemark|cinema|\bcine\b|restaurant|resto|\bbar\b|cerveza|helado|juego|steam|playstation|mercadolibre|tienda/, 'Ocio'],
  [/colegio|universidad|curso|capacitacion|educacion|libro|libreria|escuela|instituto/, 'Educación'],
  [/sueldo|haberes|salario|aguinaldo|honorarios|jubilacion|pension/, 'Sueldo'],
  [/transferencia|transf|debin|\bcvu\b|\bcbu\b|alias/, 'Transferencia'],
];

export function guessCategoryFromConcept(concept: string): string {
  const text = normalizeKey(concept);
  if (!text) return 'Otros';

  for (const [pattern, category] of CATEGORY_KEYWORDS) {
    if (pattern.test(text)) return category;
  }

  return 'Otros';
}

// ==========================================
// DETECCIÓN DE ENCABEZADOS Y COLUMNAS
// ==========================================
const HEADER_HINTS = [
  'fecha', 'date', 'concepto', 'descripcion', 'detalle', 'movimiento',
  'importe', 'monto', 'debito', 'credito', 'saldo', 'categoria', 'referencia',
];

function headerScore(row: unknown[]): number {
  let score = 0;

  for (const cell of row) {
    const text = normalizeKey(cell);
    if (!text) continue;
    if (HEADER_HINTS.some((hint) => text.includes(hint))) score += 1;
  }

  return score;
}

function findHeaderRow(grid: unknown[][]): number {
  const limit = Math.min(grid.length, 20);

  let bestIndex = 0;
  let bestScore = 0;
  let firstContentRow = -1;

  for (let i = 0; i < limit; i += 1) {
    const row = grid[i];
    if (!Array.isArray(row)) continue;
    if (row.every((cell) => String(cell ?? '').trim() === '')) continue;

    if (firstContentRow < 0) firstContentRow = i;

    const score = headerScore(row);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  // 3+ coincidencias es un encabezado casi seguro; con 2 igual es la mejor
  // pista disponible. Sin nada, arrancamos en la primera fila con contenido.
  if (bestScore >= 2) return bestIndex;
  return firstContentRow >= 0 ? firstContentRow : 0;
}

function buildTable(grid: unknown[][]): RawStatementTable {
  if (grid.length === 0) return { headers: [], rows: [], headerRowIndex: -1 };

  const headerRowIndex = findHeaderRow(grid);
  const rawHeader = Array.isArray(grid[headerRowIndex]) ? grid[headerRowIndex] : [];

  const body = grid
    .slice(headerRowIndex + 1)
    .filter((row): row is unknown[] => Array.isArray(row))
    .filter((row) => row.some((cell) => String(cell ?? '').trim() !== ''));

  // Columnas totalmente vacías (típicas de CSV con `;;;;`) se descartan para
  // que los selectores no muestren "Columna 14" sin datos.
  const width = Math.max(rawHeader.length, ...body.map((row) => row.length), 0);
  const usedColumns: number[] = [];

  for (let col = 0; col < width; col += 1) {
    const hasHeader = String(rawHeader[col] ?? '').trim() !== '';
    const hasData = body.some((row) => String(row[col] ?? '').trim() !== '');
    if (hasHeader || hasData) usedColumns.push(col);
  }

  const headers = usedColumns.map((col) => {
    const text = String(rawHeader[col] ?? '').trim();
    return text || `Columna ${col + 1}`;
  });

  const rows = body.map((row) => usedColumns.map((col) => row[col] ?? ''));

  return { headers, rows, headerRowIndex };
}

export function detectColumnMapping(headers: string[]): StatementColumnMapping {
  const norm = headers.map(normalizeKey);

  const find = (...patterns: RegExp[]): number | null => {
    for (let i = 0; i < norm.length; i += 1) {
      if (patterns.some((pattern) => pattern.test(norm[i]))) return i;
    }
    return null;
  };

  const dateCol = find(/fecha/, /^date$/, /f\.?\s*operacion/);
  const descriptionCol = find(
    /concepto|descripcion|detalle|movimiento|referencia|operacion|comercio/,
  );
  const categoryCol = find(/categoria|rubro/);
  const debitCol = find(/debito|egreso|extraccion|cargo|salida|^debe/);
  const creditCol = find(/credito|ingreso|deposito|abono|entrada|^haber/);

  const amountMode: StatementAmountMode =
    debitCol !== null || creditCol !== null ? 'split' : 'signed';

  const amountCol = amountMode === 'signed'
    ? find(/importe|monto|amount|valor|total/)
    : null;

  return {
    dateCol,
    descriptionCol,
    amountCol,
    debitCol,
    creditCol,
    categoryCol,
    amountMode,
  };
}

// ==========================================
// LECTURA DE ARCHIVOS
// ==========================================
function decodeTextBuffer(buffer: ArrayBuffer): string {
  let text = stripBom(new TextDecoder('utf-8').decode(buffer));

  // Si el UTF-8 falló hay U+FFFD: los extractos viejos suelen ser ANSI.
  if (text.includes('\uFFFD')) {
    try {
      text = stripBom(new TextDecoder('windows-1252').decode(buffer));
    } catch {
      // `TextDecoder` moderno siempre soporta windows-1252; si no, UTF-8 sirve.
    }
  }

  return text;
}

const isExcelFile = (name: string): boolean =>
  /\.(xlsx|xls)$/i.test(name);

export async function parseStatementFile(file: File): Promise<RawStatementTable> {
  if (isExcelFile(file.name)) {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });

    let fallback: RawStatementTable | null = null;

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;

      const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        raw: true,
        defval: '',
        blankrows: false,
      });

      const table = buildTable(grid);
      if (table.rows.length === 0) continue;

      if (!fallback) fallback = table;

      // Primera hoja que parece un extracto de verdad (fecha + descripción).
      const mapping = detectColumnMapping(table.headers);
      if (mapping.dateCol !== null && mapping.descriptionCol !== null) return table;
    }

    return fallback ?? { headers: [], rows: [], headerRowIndex: -1 };
  }

  const buffer = await file.arrayBuffer();
  const text = decodeTextBuffer(buffer);
  const delimiter = detectDelimiter(text);
  const grid = parseDelimited(text, delimiter);

  return buildTable(grid);
}

// ==========================================
// PREVIEW + DUPLICADOS
// ==========================================
export interface BuildPreviewOptions {
  targetAccountId: string;
  transactions: Transaction[];
  /** Invierte el signo cuando el banco lista los gastos en positivo. */
  invertSigns?: boolean;
}

interface DuplicateKeySource {
  type: Transaction['type'];
  amount: number;
  date: number;
}

const duplicateKey = (entry: DuplicateKeySource): string =>
  `${statementDayKey(entry.date)}|${entry.type}|${roundMoney(entry.amount).toFixed(2)}`;

export function buildStatementPreview(
  table: RawStatementTable,
  mapping: StatementColumnMapping,
  options: BuildPreviewOptions,
): ParsedStatementRow[] {
  const existing = new Set(
    options.transactions
      .filter((transaction) => transaction.accountId === options.targetAccountId)
      .map((transaction) => duplicateKey(transaction)),
  );

  const preview: ParsedStatementRow[] = [];

  table.rows.forEach((cells, index) => {
    const rawDate = mapping.dateCol === null ? null : cells[mapping.dateCol];
    const date = parseStatementDate(rawDate);
    if (!date) return;

    const rawDescription = mapping.descriptionCol === null
      ? ''
      : cells[mapping.descriptionCol];
    const description = normalizeLabel(rawDescription, 120) || 'Movimiento importado';

    let amount = 0;
    let type: ParsedStatementRow['type'] = 'gasto';

    if (mapping.amountMode === 'split') {
      const debit = mapping.debitCol === null
        ? 0
        : Math.abs(parseStatementAmount(cells[mapping.debitCol]));
      const credit = mapping.creditCol === null
        ? 0
        : Math.abs(parseStatementAmount(cells[mapping.creditCol]));

      if (credit > 0) {
        amount = credit;
        type = 'ingreso';
      } else if (debit > 0) {
        amount = debit;
        type = 'gasto';
      } else {
        return;
      }
    } else {
      if (mapping.amountCol === null) return;

      const signed = parseStatementAmount(cells[mapping.amountCol]);
      if (!Number.isFinite(signed) || signed === 0) return;

      amount = Math.abs(signed);
      type = signed > 0 ? 'ingreso' : 'gasto';
    }

    if (options.invertSigns) {
      type = type === 'ingreso' ? 'gasto' : 'ingreso';
    }

    const normalizedAmount = roundMoney(amount);
    if (normalizedAmount <= 0) return;

    const rawCategory = mapping.categoryCol === null
      ? ''
      : normalizeLabel(cells[mapping.categoryCol], 40);
    const category = rawCategory || guessCategoryFromConcept(description);

    const isDuplicate = existing.has(
      duplicateKey({ type, amount: normalizedAmount, date: date.getTime() }),
    );

    preview.push({
      id: `row-${index}-${date.getTime()}-${normalizedAmount}`,
      date: date.getTime(),
      description,
      category,
      amount: normalizedAmount,
      type,
      isDuplicate,
      // Los duplicados nacen desmarcados: el usuario decide.
      selected: !isDuplicate,
    });
  });

  return preview;
}
