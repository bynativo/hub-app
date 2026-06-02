import { useStore } from '../../lib/store'

// Bottom navigation visible solo en mobile (<md). 5 items: Mis tareas /
// Seguimiento / botón central + (Capturar) / Banco / Agencia. El sidebar
// desktop sigue siendo la nav principal en md y arriba.
//
// Mantenemos la altura como 56px (h-14) + safe-area-inset-bottom para que en
// iOS no choque con la home indicator.

interface NavBtnProps {
  label: string
  icon: string
  view: string
  color?: string
}

function NavBtn({ label, icon, view, color }: NavBtnProps) {
  const activeView = useStore(s => s.activeView)
  const setView = useStore(s => s.setView)
  const setActiveClient = useStore(s => s.setActiveClient)
  const isActive = activeView === view
  return (
    <button
      onClick={() => { setActiveClient(null); setView(view) }}
      className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 cursor-pointer transition-colors ${
        isActive ? 'text-claude' : 'text-gray-400 hover:text-gray-600'
      }`}
      style={isActive && color ? { color } : undefined}
    >
      <span className="text-[18px] leading-none">{icon}</span>
      <span className="text-[10px] font-medium leading-none">{label}</span>
    </button>
  )
}

export function BottomNav() {
  const openCapture = useStore(s => s.openCapture)
  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-[100] bg-bg2 border-t border-black/13 flex items-stretch shadow-[0_-4px_12px_rgba(0,0,0,0.06)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <NavBtn label="Mis tareas" icon="📋" view="mis-tareas" />
      <NavBtn label="Seguim." icon="👀" view="seguimiento" />
      {/* FAB central — Capturar */}
      <button
        onClick={() => openCapture()}
        className="flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 cursor-pointer"
        aria-label="Capturar nueva tarea"
      >
        <span className="w-10 h-10 -mt-3 rounded-full bg-claude text-white flex items-center justify-center shadow-lg text-[22px] leading-none">+</span>
        <span className="text-[10px] font-medium leading-none text-claude">Capturar</span>
      </button>
      <NavBtn label="Banco" icon="🟢" view="banco-tareas" color="#2563eb" />
      <NavBtn label="Agencia" icon="🟣" view="agencia-tareas" color="#0d9488" />
    </nav>
  )
}
