'use client';

// ==========================================
// RESPALDO AUTOMÁTICO LOCAL SILENCIOSO
// ==========================================
// Guarda snapshots JSON completos en `%LOCALAPPDATA%/<app>/backups/` y rota
// las últimas `MAX_AUTO_BACKUPS` copias. Fuera de Tauri (navegador) todas las
// funciones degradan a valores vacíos: la app sigue funcionando igual.
//
// Regla de oro: ningún fallo de disco puede interrumpir al usuario. Todo se
// captura y se registra como advertencia en consola.

import {
  BaseDirectory,
  mkdir,
  readDir,
  readTextFile,
  remove,
  writeTextFile,
} from '@tauri-apps/plugin-fs';
import { isTauri } from './nativeImages';

/** Carpeta dentro de `appLocalDataDir()`. */
export const BACKUP_DIR = 'backups';
export const BACKUP_PREFIX = 'depa-auto-';
export const MAX_AUTO_BACKUPS = 5;
/** Frecuencia mínima entre respaldos automáticos (los manuales la ignoran). */
export const MIN_BACKUP_INTERVAL_MS = 30 * 60 * 1000;

export interface AutoBackupEntry {
  fileName: string;
  /** Epoch en ms, leído del nombre del archivo. */
  timestamp: number;
  sizeBytes?: number;
}

/** `depa-auto-2026-11-15_08-15-00.json` a un epoch local. */
const FILE_NAME_PATTERN =
  /^depa-auto-(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})\.json$/;

/** Sólo nombres propios: evita `../`, rutas absolutas y separadores. */
const SAFE_FILE_NAME = /^depa-auto-[A-Za-z0-9_-]+\.json$/;

function parseTimestamp(fileName: string): number {
  const match = FILE_NAME_PATTERN.exec(fileName);
  if (!match) return 0;

  const [, year, month, day, hour, minute, second] = match;
  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  ).getTime();
}

const pad = (value: number): string => String(value).padStart(2, '0');

function createFileName(now: Date): string {
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  return `${BACKUP_PREFIX}${date}_${time}.json`;
}

/** Crea `backups/` si no existe. Otra escritura concurrente no es un error. */
async function ensureBackupDir(): Promise<void> {
  await mkdir(BACKUP_DIR, { baseDir: BaseDirectory.AppLocalData, recursive: true });
}

const isAutoBackupName = (name: string): boolean =>
  name.startsWith(BACKUP_PREFIX) && name.endsWith('.json') && FILE_NAME_PATTERN.test(name);

/** Lista los respaldos automáticos, del más nuevo al más viejo. */
export async function listAutoBackups(): Promise<AutoBackupEntry[]> {
  if (!isTauri()) return [];

  try {
    await ensureBackupDir();

    const entries = await readDir(BACKUP_DIR, { baseDir: BaseDirectory.AppLocalData });

    return entries
      .filter((entry) => entry.isFile && isAutoBackupName(entry.name))
      .map((entry) => ({
        fileName: entry.name,
        timestamp: parseTimestamp(entry.name),
      }))
      .filter((entry) => entry.timestamp > 0)
      .sort((a, b) => b.timestamp - a.timestamp);
  } catch (error) {
    console.warn('No se pudieron listar los respaldos locales.', error);
    return [];
  }
}

/**
 * Crea un respaldo y rota los excedentes.
 *
 * Con `force: false` respeta `MIN_BACKUP_INTERVAL_MS`: si la última copia es
 * más reciente, no escribe nada. Nunca lanza.
 */
export async function runAutoBackup(
  serializedJson: string,
  options?: { force?: boolean },
): Promise<{ created: boolean; fileName?: string }> {
  if (!isTauri() || !serializedJson.trim()) return { created: false };

  try {
    await ensureBackupDir();

    if (!options?.force) {
      const [latest] = await listAutoBackups();
      if (latest && Date.now() - latest.timestamp < MIN_BACKUP_INTERVAL_MS) {
        return { created: false };
      }
    }

    const fileName = createFileName(new Date());

    await writeTextFile(`${BACKUP_DIR}/${fileName}`, serializedJson, {
      baseDir: BaseDirectory.AppLocalData,
    });

    // Rotación: la lista ya viene ordenada de más nuevo a más viejo.
    const all = await listAutoBackups();
    for (const stale of all.slice(MAX_AUTO_BACKUPS)) {
      try {
        await remove(`${BACKUP_DIR}/${stale.fileName}`, {
          baseDir: BaseDirectory.AppLocalData,
        });
      } catch (error) {
        console.warn(`No se pudo borrar el respaldo ${stale.fileName}.`, error);
      }
    }

    return { created: true, fileName };
  } catch (error) {
    // Un disco lleno o un permiso faltante no puede romper la experiencia.
    console.warn('Respaldo automático omitido.', error);
    return { created: false };
  }
}

/** Lee el contenido de un respaldo, validando el nombre para evitar traversal. */
export async function readAutoBackupContent(fileName: string): Promise<string | null> {
  if (!isTauri() || !SAFE_FILE_NAME.test(fileName)) return null;

  try {
    return await readTextFile(`${BACKUP_DIR}/${fileName}`, {
      baseDir: BaseDirectory.AppLocalData,
    });
  } catch (error) {
    console.warn(`No se pudo leer el respaldo ${fileName}.`, error);
    return null;
  }
}
