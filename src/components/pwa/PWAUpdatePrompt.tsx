import { useEffect, useState } from 'react'

// Escucha el evento custom 'pwa-update-available' que dispara main.tsx cuando
// detecta un service worker nuevo en estado 'installed' mientras hay uno viejo
// controlando la pagina. Muestra un toast con boton "Actualizar" que postea
// SKIP_WAITING al SW en espera y recarga al activarse.
export function PWAUpdatePrompt() {
  const [visible, setVisible] = useState(false)
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    function onUpdate() { setVisible(true) }
    window.addEventListener('pwa-update-available', onUpdate)
    return () => window.removeEventListener('pwa-update-available', onUpdate)
  }, [])

  async function applyUpdate() {
    if (!('serviceWorker' in navigator)) return
    setUpdating(true)
    const reg = await navigator.serviceWorker.getRegistration()
    if (!reg?.waiting) {
      // Por las dudas: si ya no hay waiting, recargo igual.
      location.reload()
      return
    }
    // Cuando el SW nuevo toma control, recargamos para servir el shell nuevo.
    navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true })
    reg.waiting.postMessage({ type: 'SKIP_WAITING' })
  }

  if (!visible) return null

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[400] bg-bg2 border border-claude/40 shadow-lg rounded-xl px-4 py-3 flex items-center gap-3 max-w-[420px] animate-fade-in">
      <span className="text-[18px]">✨</span>
      <div className="flex-1">
        <div className="text-[13px] font-medium">Nueva versión disponible</div>
        <div className="text-[11px] text-gray-500">Actualizá para tener los últimos cambios.</div>
      </div>
      <button onClick={applyUpdate} disabled={updating}
        className="text-[12px] bg-claude text-white px-3 py-1.5 rounded-md cursor-pointer hover:bg-purple-700 disabled:opacity-60">
        {updating ? 'Actualizando…' : 'Actualizar'}
      </button>
      <button onClick={() => setVisible(false)}
        className="text-gray-400 hover:text-gray-600 text-[18px] leading-none cursor-pointer">×</button>
    </div>
  )
}
