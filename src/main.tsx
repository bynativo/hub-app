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
