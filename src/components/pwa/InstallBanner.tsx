import { useEffect, useState } from 'react'

// Banner amigable de instalacion.
// - Aparece despues de 3 visitas distintas (contador en localStorage).
// - Android/Chrome: usa el evento beforeinstallprompt para mostrar el prompt
//   nativo del navegador al apretar "Instalar".
// - iOS/Safari: no hay API, mostramos instrucciones manuales.
// - Cerrarlo se persiste en localStorage 7 dias.
// - Si ya esta instalada (display-mode: standalone), no se muestra.

const VISITS_KEY = 'hub_pwa_visits'
const DISMISSED_KEY = 'hub_pwa_install_dismissed_at'
const VISIT_TODAY_KEY = 'hub_pwa_visit_today'
const VISITS_NEEDED = 3
const DISMISS_DAYS = 7

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isIOS(): boolean {
  const ua = navigator.userAgent.toLowerCase()
  // iPad reciente reporta MacIntel; chequear touch tambien.
  return /iphone|ipad|ipod/.test(ua) || (ua.includes('mac') && 'ontouchend' in document)
}

function isStandalone(): boolean {
  const mq = window.matchMedia('(display-mode: standalone)').matches
  // iOS expone navigator.standalone.
  const ios = (window.navigator as { standalone?: boolean }).standalone === true
  return mq || ios
}

function bumpVisitCount(): number {
  // Contamos una visita por dia para evitar inflar con refresh.
  const today = new Date().toISOString().slice(0, 10)
  if (localStorage.getItem(VISIT_TODAY_KEY) === today) {
    return parseInt(localStorage.getItem(VISITS_KEY) || '0', 10)
  }
  const current = parseInt(localStorage.getItem(VISITS_KEY) || '0', 10) + 1
  localStorage.setItem(VISITS_KEY, String(current))
  localStorage.setItem(VISIT_TODAY_KEY, today)
  return current
}

export function InstallBanner() {
  const [visible, setVisible] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showIOSHelp, setShowIOSHelp] = useState(false)

  useEffect(() => {
    if (isStandalone()) return
    const visits = bumpVisitCount()
    const dismissedAt = parseInt(localStorage.getItem(DISMISSED_KEY) || '0', 10)
    const dismissExpired = !dismissedAt || (Date.now() - dismissedAt) > DISMISS_DAYS * 86400000
    if (visits >= VISITS_NEEDED && dismissExpired) {
      // En iOS se muestra directamente las instrucciones (no hay prompt).
      if (isIOS()) setVisible(true)
    }

    function onBefore(e: Event) {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      if (visits >= VISITS_NEEDED && dismissExpired) setVisible(true)
    }
    function onInstalled() { setVisible(false); setDeferredPrompt(null) }
    window.addEventListener('beforeinstallprompt', onBefore)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBefore)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  function dismiss() {
    setVisible(false)
    localStorage.setItem(DISMISSED_KEY, String(Date.now()))
  }

  async function installAndroid() {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    setDeferredPrompt(null)
    if (outcome === 'accepted') setVisible(false)
    else dismiss()
  }

  if (!visible) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-[380px] z-[350] bg-bg2 border border-claude/30 shadow-xl rounded-2xl p-4 animate-fade-in">
      <div className="flex items-start gap-3">
        <div className="text-[24px] leading-none mt-0.5">📲</div>
        <div className="flex-1">
          <div className="text-[14px] font-medium mb-0.5">Instalá el hub en tu celular</div>
          <div className="text-[12px] text-gray-500 leading-snug mb-3">
            Acceso rápido, modo pantalla completa y soporte para recordatorios push.
          </div>

          {showIOSHelp ? (
            <div className="text-[12px] text-gray-600 bg-bg3 rounded-md p-2.5 leading-snug">
              <ol className="list-decimal pl-4 space-y-0.5">
                <li>Tocá el botón <b>Compartir</b> ⬆️ abajo en Safari.</li>
                <li>Bajá y elegí <b>Agregar a pantalla de inicio</b>.</li>
                <li>Confirmá. El hub queda como app.</li>
              </ol>
            </div>
          ) : deferredPrompt ? (
            <button onClick={installAndroid}
              className="w-full text-[13px] bg-claude text-white px-3 py-2 rounded-md cursor-pointer hover:bg-purple-700 font-medium">
              Instalar Hub en tu celular
            </button>
          ) : isIOS() ? (
            <button onClick={() => setShowIOSHelp(true)}
              className="w-full text-[13px] bg-claude text-white px-3 py-2 rounded-md cursor-pointer hover:bg-purple-700 font-medium">
              Ver cómo instalar
            </button>
          ) : null}

          <button onClick={dismiss}
            className="text-[11px] text-gray-400 hover:text-gray-600 mt-2 cursor-pointer">
            Ahora no
          </button>
        </div>
      </div>
    </div>
  )
}
