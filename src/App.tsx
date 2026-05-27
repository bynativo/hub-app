import { useEffect, useState } from 'react'
import { useStore } from './lib/store'
import { Topbar } from './components/layout/Topbar'
import { Sidebar } from './components/layout/Sidebar'
import { Dashboard } from './components/dashboard/Dashboard'
import { ContextView } from './components/dashboard/ContextView'
import { WeekView } from './components/dashboard/WeekView'
import { CalendarView } from './components/dashboard/CalendarView'
import { ProjectsView } from './components/dashboard/ProjectsView'
import { RecurrentesView } from './components/dashboard/RecurrentesView'
import { SeguimientoView } from './components/dashboard/SeguimientoView'
import { ClientesView } from './components/dashboard/ClientesView'
import { ContactsView } from './components/dashboard/ContactsView'
import { TaskDetail } from './components/tasks/TaskDetail'
import { PresentationsView } from './components/presentations/PresentationsView'
import { PresentationDetail } from './components/presentations/PresentationDetail'
import { GrillaView } from './components/grilla/GrillaView'
import { CaptureModal } from './components/modals/CaptureModal'
import { FollowupModal } from './components/modals/FollowupModal'
import { SearchModal } from './components/modals/SearchModal'

export default function App() {
  const loadAll = useStore(s => s.loadAll)
  const loading = useStore(s => s.loading)
  const activeView = useStore(s => s.activeView)
  const detailOpen = useStore(s => s.detailOpen)
  const captureOpen = useStore(s => s.captureOpen)
  const captureContext = useStore(s => s.captureContext)
  const captureClientId = useStore(s => s.captureClientId)
  const captureProjectId = useStore(s => s.captureProjectId)
  const closeCapture = useStore(s => s.closeCapture)
  const searchOpen = useStore(s => s.searchOpen)
  const openSearch = useStore(s => s.openSearch)
  const closeSearch = useStore(s => s.closeSearch)
  const [openPresId, setOpenPresId] = useState<number | null>(null)

  useEffect(() => { loadAll() }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openSearch])

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-bg">
        <div className="text-center">
          <div className="font-serif text-2xl font-light mb-2">hub<span className="text-claude">·</span>trabajo</div>
          <div className="text-[13px] text-gray-400">Conectando con Supabase...</div>
        </div>
      </div>
    )
  }

  function renderView() {
    switch (activeView) {
      // General
      case 'hoy': return <Dashboard />
      case 'semana': return <WeekView range="esta" />
      case 'proxima-semana': return <WeekView range="proxima" />
      case 'seguimiento': return <SeguimientoView />
      case 'calendario': return <CalendarView />
      case 'recurrentes': return <RecurrentesView />
      case 'contactos': return <ContactsView />
      // Banco Falabella
      case 'banco-tareas': return <ContextView context="banco" />
      case 'banco-proyectos': return <ProjectsView context="banco" onOpenPres={setOpenPresId} />
      case 'banco-equipo': return <ContactsView context="banco" title="Equipo" />
      case 'banco-presentaciones': return <PresentationsView context="banco" onOpen={setOpenPresId} />
      case 'banco-grilla': return <GrillaView context="banco" />
      // Agencia
      case 'agencia-tareas': return <ContextView context="agencia" />
      case 'agencia-clientes': return <ClientesView />
      case 'agencia-equipo': return <ContactsView context="agencia" title="Equipo" />
      case 'agencia-presentaciones': return <PresentationsView context="agencia" onOpen={setOpenPresId} />
      case 'agencia-grilla': return <GrillaView context="agencia" />
      // Personal
      case 'personal-tareas': return <ContextView context="personal" />
      case 'personal-proyectos': return <ProjectsView context="personal" onOpenPres={setOpenPresId} />
      default: return <Dashboard />
    }
  }

  return (
    <>
      <div className="h-screen flex flex-col overflow-hidden">
        <Topbar />
        <div className="flex flex-1 min-h-0">
          <Sidebar />
          <main
            className="flex-1 overflow-y-auto"
            style={{ marginRight: detailOpen ? '540px' : '0', transition: 'margin-right 0.2s' }}
          >
            {renderView()}
          </main>
        </div>
      </div>

      {detailOpen && <TaskDetail />}

      <FollowupModal />

      {captureOpen && (
        <CaptureModal
          onClose={closeCapture}
          preselectContext={captureContext ?? undefined}
          preselectClientId={captureClientId}
          preselectProjectId={captureProjectId}
        />
      )}

      {openPresId !== null && (
        <PresentationDetail presId={openPresId} onClose={() => setOpenPresId(null)} />
      )}

      {searchOpen && <SearchModal onClose={closeSearch} onOpenPres={setOpenPresId} />}
    </>
  )
}
