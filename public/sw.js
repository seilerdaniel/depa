/**
 * Service Worker de Depa.
 *
 * Reglas:
 * - Navegación (HTML): Network First. Nunca servimos una shell vieja si hay red.
 * - `/_next/static/*`: Cache First. Los chunks llevan hash, son inmutables.
 * - Todo lo demás (API, cross-origin, imágenes externas): pasa de largo.
 *
 * El prefijo "depa-" es importante: el cleanup de desarrollo en AppProvider
 * borra exactamente nuestras cachés y no las de otras apps del mismo origen.
 */
const VERSION = 'v3';
const STATIC_CACHE = `depa-static-${VERSION}`;
const NAV_CACHE = `depa-nav-${VERSION}`;
const OWN_CACHES = new Set([STATIC_CACHE, NAV_CACHE]);
const OFFLINE_URL = '/';

// 1. Instalar: no precacheamos el HTML para no arrancar con una shell vieja.
self.addEventListener('install', () => {
  self.skipWaiting();
});

// 2. Activar: borrar cachés de versiones anteriores y tomar control.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => !OWN_CACHES.has(key)).map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

// 3. Navegación: red primero, caché como red de seguridad offline.
async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(NAV_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;

    const fallback = await caches.match(OFFLINE_URL);
    if (fallback) return fallback;

    return new Response(
      '<!doctype html><meta charset="utf-8"><title>Sin conexión</title><body style="font-family:system-ui;padding:2rem"><h1>Sin conexión</h1><p>Volvé a intentar cuando tengas internet.</p></body>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
}

// 4. Assets de Next: caché primero, luego red (y guardamos para la próxima).
async function cacheFirstStatic(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response && response.ok) {
    const cache = await caches.open(STATIC_CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

// 5. Router de estrategias.
self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirstStatic(request));
  }
});