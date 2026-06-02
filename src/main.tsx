import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { PublicView } from './components/public/PublicView'

// Rutas públicas (links de compartir / aprobación) → visor público sin login.
// El resto → la app normal.
const isPublic = /^\/(presentation|approve)\//.test(window.location.pathname)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isPublic ? <PublicView /> : <App />}
  </StrictMode>,
)

// Registro del service worker (PWA). Solo en producción para no interferir
// con el HMR del dev server. Detecta updates y dispara un CustomEvent
// 'pwa-update-available' que escucha el componente PWAUpdatePrompt.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => {
        // updatefound se dispara cuando hay un SW nuevo instalandose.
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing
          if (!newWorker) return
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // Hay un SW viejo controlando + uno nuevo en 'installed' (waiting).
              window.dispatchEvent(new CustomEvent('pwa-update-available'))
            }
          })
        })
        // Si al cargar ya hay uno en waiting (paginas que estuvieron abiertas
        // un buen rato), avisar tambien.
        if (reg.waiting && navigator.serviceWorker.controller) {
          window.dispatchEvent(new CustomEvent('pwa-update-available'))
        }
      })
      .catch((err) => console.warn('[sw] registro falló:', err))
  })
}
