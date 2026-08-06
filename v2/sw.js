/* Service worker de Mi Alcancía v2.

   Estrategia: "network first" con respaldo en caché.
   Se pide siempre la versión de la red y solo se recurre a la copia guardada
   cuando no hay conexión. Al revés — caché primero — el usuario se queda
   pegado a una versión vieja de la app hasta que borre los datos del sitio,
   que es un problema clásico y molesto de diagnosticar.

   Aquí solo se guarda el armazón de la app. Los datos del usuario NO pasan
   por aquí: viven en localStorage e IndexedDB y nunca salen del teléfono. */

const CACHE = 'alcancia-v2-1';
const SHELL = ['./', './index.html', './app.webmanifest', './icon.svg', './icon-maskable.svg'];

self.addEventListener('install', function (ev) {
  ev.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(SHELL); })
      /* Si un archivo falla no se aborta la instalación: la app funciona
         igual online, solo se pierde parte del modo sin conexión. */
      .catch(function () {})
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (ev) {
  ev.waitUntil(
    caches.keys()
      .then(function (ks) {
        return Promise.all(ks.map(function (k) {
          return k === CACHE ? null : caches.delete(k);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (ev) {
  const req = ev.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   /* tipos de cambio, etc. */

  ev.respondWith(
    fetch(req)
      .then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
          const copia = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copia); }).catch(function () {});
        }
        return res;
      })
      .catch(function () {
        return caches.match(req).then(function (hit) {
          if (hit) return hit;
          /* Navegación sin conexión y sin copia exacta: se sirve el armazón,
             que basta porque toda la app va en un solo archivo. */
          if (req.mode === 'navigate') return caches.match('./index.html');
          return new Response('', { status: 504, statusText: 'sin conexión' });
        });
      })
  );
});
