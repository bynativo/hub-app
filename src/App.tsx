import { useEffect, useState } from 'react'
import { useStore } from './lib/store'
import { Topbar } from './components/layout/Topbar'
import { Sidebar } from './components/layout/Sidebar'
import { Dashboard } from './components/dashboard/Dashboard'
import { ContextView } from './components/dashboard/ContextView'
import { ProjectsView } from './components/dashboard/ProjectsView'
import { RecurrentesView } from './components/dashboard/RecurrentesView'
import { SeguimientoView } from './components/dashboard/SeguimientoView'
import { TaskDetail } from './components/tasks/TaskDetail'
import { PresentationsView } from './components/presentations/PresentationsView'
import { PresentationDetail } from './components/presentations/PresentationDetail'
import { GrillaView } from './components/grilla/GrillaView'
import { CaptureModal } from './components/modals/CaptureModal'

export default function App() {
  const loadAll = useStore(s => s.loadAll)
  const loading = useStore(s => s.loading)
  const activeView = useStore(s => s.activeView)
  const detailOpen = useStore(s => s.detailOpen)
  const [openPresId, setOpenPresId] = useState<number | null>(null)
  const [captureOpen, setCaptureOpen] = useState(false)

  useEffect(() => { loadAll() }, [])

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
      case 'dashboard': return <Dashboard />
      case 'banco': return <ContextView context="banco" />
      case 'agencia': return <ContextView context="agencia" />
      case 'personal': return <ContextView context="personal" />
      case 'proyectos': return <ProjectsView onOpenPres={setOpenPresId} />
      case 'recurrentes': return <RecurrentesView />
      case 'seguimiento': return <SeguimientoView />
      case 'presentaciones': return <PresentationsView onOpen={setOpenPresId} />
      case 'grilla': return <GrillaView />
      default: return <Dashboard />
    }
  }

  return (
    <>
      <div className="h-screen flex flex-col overflow-hidden">
        <Topbar onCapture={() => setCaptureOpen(true)} />
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

      {captureOpen && <CaptureModal onClose={() => setCaptureOpen(false)} />}

      {openPresId !== null && (
        <PresentationDetail presId={openPresId} onClose={() => setOpenPresId(null)} />
      )}
    </>
  )
}
