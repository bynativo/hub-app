// Service worker del hub. Estrategia:
//  - assets hashed de Vite (/assets/*): cache-first (los hashes cambian al
//    redeployar, asi que cache aggresivo es seguro).
//  - navegacion (HTML): network-first con fallback al index.html cacheado, para
//    detectar nuevas versiones rapido pero seguir funcionando offline.
//  - Supabase / /api: network-first sin fallback (datos en vivo).
//  - cualquier otra cosa (Google fonts, etc.): cache-first oportunista.
// Al instalar una version nueva, el SW se queda en "waiting" hasta que el
// cliente le manda { type: 'SKIP_WAITING' }; ese mensaje lo dispara el toast
// "Actualizar" del componente PWAUpdatePrompt.
//
// NOTA: el numero de version se actualiza con cada release para invalidar el
// cache anterior. Se puede automatizar pero por ahora es manual — bump a v2,
// v3, etc. cuando agregamos cambios incompatibles al esquema del cache.

const VERSION = 'hub-v1'
const SHELL = ['/', '/index.html', '/manifest.json', '/icon-192.svg', '/icon-512.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(SHELL))
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))
      ),
      self.clients.claim(),
    ])
  )
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  // Supabase + endpoints serverless: network-first sin caching.
  if (url.host.includes('supabase.co') || url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(req).catch(() => new Response('', { status: 503 })))
    return
  }

  // Assets hashed de Vite — cache-first, llenan cache al primer pedido.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached
        return fetch(req).then((res) => {
          if (res.ok) {
            const clone = res.clone()
            caches.open(VERSION).then((c) => c.put(req, clone))
          }
          return res
        })
      })
    )
    return
  }

  // Navegacion / HTML: network-first con fallback a index.html cacheado.
  if (req.mode === 'navigate' || (req.headers.get('Accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone()
          caches.open(VERSION).then((c) => c.put('/index.html', clone))
          return res
        })
        .catch(() => caches.match('/index.html').then((r) => r || new Response('', { status: 503 })))
    )
    return
  }

  // Otros: cache-first oportunista (fonts, manifest, iconos, etc.)
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached
      return fetch(req).then((res) => {
        if (res.ok && res.type === 'basic') {
          const clone = res.clone()
          caches.open(VERSION).then((c) => c.put(req, clone))
        }
        return res
      }).catch(() => new Response('', { status: 503 }))
    })
  )
})

// Web Push: una notificacion entrante abre el hub en la tarea correspondiente
// si la data trae `url` o `taskId`. Click en la notificacion enfoca la ventana
// abierta o abre una nueva en esa URL.
self.addEventListener('push', (event) => {
  let payload = {}
  try { payload = event.data ? event.data.json() : {} } catch { payload = {} }
  const title = payload.title || '🔔 Recordatorio del hub'
  const options = {
    body: payload.body || '',
    icon: '/icon-192.svg',
    badge: '/icon-192.svg',
    data: payload.data || {},
    tag: payload.tag || 'hub-notif',
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = event.notification.data || {}
  const targetUrl = data.url || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const c of clientList) {
        if ('focus' in c) {
          c.focus()
          if (data.taskId && 'postMessage' in c) {
            c.postMessage({ type: 'OPEN_TASK', taskId: data.taskId })
          }
          return
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl)
    })
  )
})
