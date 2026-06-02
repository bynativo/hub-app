import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

// Activacion de notificaciones push. Flujo:
//  1) Si el browser soporta Notification + PushManager, y aun no se decidio,
//     mostramos un banner amigable despues del primer render (con un pequeño
//     delay para no abrumar). El usuario puede aceptar, rechazar, o "ahora no".
//  2) "Aceptar" pide permiso al browser y, si lo da, suscribe al PushManager
//     usando la VAPID public key. Guarda la suscripcion en push_subscriptions.
//  3) "Ahora no" persiste un dismiss de 7 dias en localStorage.
//  4) Si el usuario ya tiene permission='granted' pero no hay subscription
//     activa (ej. limpio storage del browser), re-suscribe silenciosamente al
//     cargar — asi el endpoint en BD siempre refleja el dispositivo actual.
//
// La VAPID public key es publica por diseño (asi opera Web Push). Lo unico
// que NO puede leakear es la private (esa va al edge function send-push).

const VAPID_PUBLIC_KEY = 'BC62QDpZMUKRjhDLLDUZl2DQ01aMn3KHKdrwIkmXnZi5Eb8bFilHBJo8CNIwfKdqHWdOj31CQvKd0_tvm8r9eyc'

const DISMISSED_KEY = 'hub_push_dismissed_at'
const DISMISS_DAYS = 7

function urlBase64ToUint8Array(b64: string): Uint8Array {
  const padding = '='.repeat((4 - (b64.length % 4)) % 4)
  const base64 = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

function arrayBufferToBase64(buf: ArrayBuffer | null): string {
  if (!buf) return ''
  const bytes = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s)
}

async function persistSubscription(sub: PushSubscription) {
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
  const endpoint = json.endpoint || sub.endpoint
  const p256dh = json.keys?.p256dh || arrayBufferToBase64(sub.getKey('p256dh'))
  const auth = json.keys?.auth || arrayBufferToBase64(sub.getKey('auth'))
  if (!endpoint || !p256dh || !auth) return
  await supabase.from('push_subscriptions').upsert({
    endpoint,
    p256dh,
    auth,
    user_agent: navigator.userAgent.slice(0, 200),
    last_used_at: new Date().toISOString(),
  }, { onConflict: 'endpoint' })
}

export function NotificationsSubscribe() {
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supported = typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window

  useEffect(() => {
    if (!supported) return
    const dismissedAt = parseInt(localStorage.getItem(DISMISSED_KEY) || '0', 10)
    const dismissExpired = !dismissedAt || (Date.now() - dismissedAt) > DISMISS_DAYS * 86400000
    const perm = Notification.permission
    if (perm === 'default' && dismissExpired) {
      // Pequeño delay para no asaltar al usuario en el primer paint.
      const t = setTimeout(() => setVisible(true), 3500)
      return () => clearTimeout(t)
    }
    // Si ya dio permiso, re-sincronizar la subscription en silencio.
    if (perm === 'granted') {
      navigator.serviceWorker.ready.then(async (reg) => {
        try {
          let sub = await reg.pushManager.getSubscription()
          if (!sub) {
            sub = await reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
            })
          }
          await persistSubscription(sub)
        } catch (e) {
          console.warn('[push] re-subscribe falló:', e)
        }
      })
    }
  }, [supported])

  async function accept() {
    if (!supported) return
    setBusy(true); setError(null)
    try {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') {
        setBusy(false)
        if (perm === 'denied') localStorage.setItem(DISMISSED_KEY, String(Date.now()))
        setVisible(false)
        return
      }
      const reg = await navigator.serviceWorker.ready
      let sub = await reg.pushManager.getSubscription()
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
        })
      }
      await persistSubscription(sub)
      setVisible(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, String(Date.now()))
    setVisible(false)
  }

  if (!supported || !visible) return null

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[360] bg-bg2 border border-claude/30 shadow-xl rounded-2xl px-4 py-3 max-w-[420px] w-[calc(100%-2rem)] animate-fade-in">
      <div className="flex items-start gap-3">
        <span className="text-[22px] leading-none mt-0.5">🔔</span>
        <div className="flex-1">
          <div className="text-[13px] font-medium">¿Activar notificaciones para recordatorios y seguimientos?</div>
          <div className="text-[11px] text-gray-500 mt-0.5 leading-snug">
            Te avisamos en el celu / escritorio cuando vence un recordatorio o llega un seguimiento.
          </div>
          {error && <div className="text-[11px] text-danger mt-1">Error: {error}</div>}
          <div className="flex gap-2 mt-2.5">
            <button onClick={accept} disabled={busy}
              className="text-[12px] bg-claude text-white px-3 py-1.5 rounded-md cursor-pointer hover:bg-purple-700 disabled:opacity-60 font-medium">
              {busy ? 'Activando…' : 'Activar'}
            </button>
            <button onClick={dismiss} disabled={busy}
              className="text-[12px] text-gray-500 px-3 py-1.5 cursor-pointer hover:text-gray-700">
              Ahora no
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
