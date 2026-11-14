'use client';

// ==========================================
// IMÁGENES NATIVAS EN DISCO
// ==========================================
// En Tauri las fotos viven en `%LOCALAPPDATA%/<app>/images/` y SQLite guarda
// sólo una referencia corta: `local-img://<archivo>`. En el navegador (sin
// plugin-fs) todo sigue funcionando con DataURL Base64, sin tocar el código
// de los componentes.
//
// El prefijo es deliberadamente distinto de `file://` y de `asset://`: así se
// distingue a simple vista qué strings son referencias nuestras.

import { useEffect, useState } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { appLocalDataDir, join } from '@tauri-apps/api/path';
import { exists, mkdir, readFile, remove, writeFile } from '@tauri-apps/plugin-fs';

export const LOCAL_IMG_PREFIX = 'local-img://';

/** Carpeta de imágenes dentro de `appLocalDataDir()`. */
const IMAGES_DIR = 'images';

/** Sólo nombres simples: evita `..`, separadores y rutas absolutas. */
const SAFE_FILENAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;

const EXT_BY_MIME: Record<string, string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

const MIME_BY_EXT: Record<string, string> = {
  webp: 'image/webp',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  avif: 'image/avif',
};

/** ¿Estamos dentro del WebView de Tauri (y no en un navegador)? */
export const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** ¿El string es una referencia a una foto guardada por nosotros? */
export const isLocalImageRef = (value: string | null | undefined): boolean =>
  typeof value === 'string' && value.startsWith(LOCAL_IMG_PREFIX);

/** Nombre de archivo de una referencia, o `null` si es sospechosa. */
export function localImageFileName(ref: string): string | null {
  if (!isLocalImageRef(ref)) return null;
  const name = ref.slice(LOCAL_IMG_PREFIX.length);
  return SAFE_FILENAME.test(name) ? name : null;
}

// ==========================================
// BASE64 <-> BYTES
// ==========================================
function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * `String.fromCharCode(...bytes)` con un array enorme revienta el stack, así
 * que convertimos por bloques.
 */
function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, i + CHUNK);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

interface ParsedDataUrl {
  mime: string;
  base64: string;
}

function parseImageDataUrl(dataUrl: string): ParsedDataUrl | null {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) return null;
  return { mime: match[1].toLowerCase(), base64: match[2] };
}

// ==========================================
// RUTAS
// ==========================================
// `appLocalDataDir()` es una llamada IPC. Una grilla con 50 fotos la hacía 50
// veces al montar; el directorio no cambia en toda la sesión, así que se
// memoriza (y se descarta si la primera llamada falla).
let imagesDirPromise: Promise<string> | null = null;

function imagesDir(): Promise<string> {
  imagesDirPromise ??= (async () => {
    try {
      return join(await appLocalDataDir(), IMAGES_DIR);
    } catch (error) {
      imagesDirPromise = null;
      throw error;
    }
  })();

  return imagesDirPromise;
}

/** Crea `images/` si no existe y devuelve su ruta absoluta. */
async function ensureImagesDir(): Promise<string> {
  const dir = await imagesDir();

  try {
    if (!(await exists(dir))) {
      await mkdir(dir, { recursive: true });
    }
  } catch (error) {
    // Otra escritura concurrente pudo crearla: sólo importa si no existe.
    if (!(await exists(dir).catch(() => false))) throw error;
  }

  return dir;
}

// ==========================================
// API PRINCIPAL
// ==========================================
/**
 * Guarda un DataURL como archivo y devuelve `local-img://<archivo>`.
 *
 * - Fuera de Tauri (o si algo falla) devuelve el DataURL intacto: la foto
 *   nunca se pierde, sólo queda pesada.
 * - Si el string ya es una referencia o una URL remota, no hace nada.
 */
export async function persistImageToDisk(
  dataUrl: string,
  itemId: string,
): Promise<string> {
  if (!isTauri()) return dataUrl;

  const parsed = parseImageDataUrl(dataUrl);
  if (!parsed) return dataUrl;

  try {
    const dir = await ensureImagesDir();
    const safeId = itemId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || 'item';
    const ext = EXT_BY_MIME[parsed.mime] ?? 'jpg';
    const filename = `${safeId}-${Date.now()}.${ext}`;

    await writeFile(await join(dir, filename), base64ToBytes(parsed.base64));

    return `${LOCAL_IMG_PREFIX}${filename}`;
  } catch (error) {
    console.warn('No se pudo guardar la imagen en disco; se conserva el Base64.', error);
    return dataUrl;
  }
}

/**
 * Convierte `imageData`/`imageUrl` en algo usable por un `<img>`.
 * Las referencias locales se resuelven contra el protocolo de assets.
 */
export async function resolveImageSrc(
  imageData: string,
  imageUrl: string,
): Promise<string> {
  if (!isLocalImageRef(imageData)) return imageData || imageUrl;

  const filename = localImageFileName(imageData);
  if (!filename || !isTauri()) return '';

  try {
    return convertFileSrc(await join(await imagesDir(), filename));
  } catch (error) {
    console.warn('No se pudo resolver la imagen local.', error);
    return '';
  }
}

/** Lee el archivo y lo devuelve como DataURL (para backups portables). */
export async function readDiskImageAsDataUrl(imageData: string): Promise<string> {
  const filename = localImageFileName(imageData);
  if (!filename || !isTauri()) return '';

  try {
    const bytes = await readFile(await join(await imagesDir(), filename));
    const ext = filename.split('.').pop()?.toLowerCase() ?? '';
    const mime = MIME_BY_EXT[ext] ?? 'image/jpeg';
    return `data:${mime};base64,${bytesToBase64(bytes)}`;
  } catch (error) {
    console.warn('No se pudo leer la imagen para el backup.', error);
    return '';
  }
}

/** Borra el archivo asociado. Silencioso: la imagen puede no existir. */
export async function deleteDiskImage(imageData: string): Promise<void> {
  const filename = localImageFileName(imageData);
  if (!filename || !isTauri()) return;

  try {
    await remove(await join(await imagesDir(), filename));
  } catch {
    // Ya no está, o nunca se escribió: no es un error para la app.
  }
}

/**
 * Hook de render: devuelve la URL lista para `<img>` y resuelve las
 * referencias locales en un efecto (requieren IPC).
 */
export function useResolvedImageSrc(imageData: string, imageUrl: string): string {
  const direct = imageData || imageUrl;
  const needsDisk = isLocalImageRef(imageData);

  const [resolved, setResolved] = useState(() => (needsDisk ? '' : direct));

  useEffect(() => {
    if (!needsDisk) {
      setResolved(direct);
      return;
    }

    let cancelled = false;
    setResolved('');

    resolveImageSrc(imageData, imageUrl).then((src) => {
      if (!cancelled) setResolved(src);
    });

    return () => { cancelled = true; };
  }, [imageData, imageUrl, direct, needsDisk]);

  return resolved;
}
