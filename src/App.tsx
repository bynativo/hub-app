import { useEffect, useState } from 'react'
import { useStore } from './lib/store'
import { Topbar } from './components/layout/Topbar'
import { Sidebar } from './components/layout/Sidebar'
import { BottomNav } from './components/layout/BottomNav'
import { Dashboard } from './components/dashboard/Dashboard'
import { ContextView } from './components/dashboard/ContextView'
import { AgenciaView } from './components/dashboard/AgenciaView'
import { CalendarView } from './components/dashboard/CalendarView'
import { ProjectsView } from './components/dashboard/ProjectsView'
import { RecurrentesView } from './components/dashboard/RecurrentesView'
import { TemplatesView } from './components/dashboard/TemplatesView'
import { SeguimientoView } from './components/dashboard/SeguimientoView'
import { ClientesView } from './components/dashboard/ClientesView'
import { ContactsView } from './components/dashboard/ContactsView'
import { TaskDetail } from './components/tasks/TaskDetail'
import { ProjectDetail } from './components/projects/ProjectDetail'
import { PresentationsView } from './components/presentations/PresentationsView'
import { PresentationDetail } from './components/presentations/PresentationDetail'
import { GrillaView } from './components/grilla/GrillaView'
import { CaptureModal } from './components/modals/CaptureModal'
import { FollowupModal } from './components/modals/FollowupModal'
import { SearchModal } from './components/modals/SearchModal'
import { RecurrenteModal } from './components/modals/RecurrenteModal'
import { SubtaskConvertModal } from './components/modals/SubtaskConvertModal'
import { DuplicarTareaModal } from './components/modals/DuplicarTareaModal'
import { ArchiveProposalModal } from './components/modals/ArchiveProposalModal'
import { Toast } from './components/layout/Toast'
import { PWAUpdatePrompt } from './components/pwa/PWAUpdatePrompt'
import { InstallBanner } from './components/pwa/InstallBanner'
import { NotificationsSubscribe } from './components/pwa/NotificationsSubscribe'

export default function App() {
  const loadAll = useStore(s => s.loadAll)
  const loading = useStore(s => s.loading)
  const activeView = useStore(s => s.activeView)
  const detailOpen = useStore(s => s.detailOpen)
  const projectDetailOpen = useStore(s => s.projectDetailOpen)
  const captureOpen = useStore(s => s.captureOpen)
  const captureContext = useStore(s => s.captureContext)
  const captureClientId = useStore(s => s.captureClientId)
  const captureProjectId = useStore(s => s.captureProjectId)
  const captureReminder = useStore(s => s.captureReminder)
  const closeCapture = useStore(s => s.closeCapture)
  const searchOpen = useStore(s => s.searchOpen)
  const openSearch = useStore(s => s.openSearch)
  const closeSearch = useStore(s => s.closeSearch)
  const recurrentEditId = useStore(s => s.recurrentEditId)
  const closeRecurrentEdit = useStore(s => s.closeRecurrentEdit)
  const recurrentCreate = useStore(s => s.recurrentCreate)
  const closeRecurrentCreate = useStore(s => s.closeRecurrentCreate)
  const recurrentes = useStore(s => s.recurrentes)
  const undoLast = useStore(s => s.undoLast)
  const initialized = useStore(s => s.initialized)
  const checkArchiveCandidates = useStore(s => s.checkArchiveCandidates)
  const [openPresId, setOpenPresId] = useState<number | null>(null)

  useEffect(() => { loadAll() }, [])
  useEffect(() => { if (initialized) checkArchiveCandidates() }, [initialized])

  // Polling silencioso del calendario cada 5 min mientras la app está abierta.
  // También dispara un refresh al volver a focus si pasaron 5 min, para que
  // cuando uno vuelve a la pestaña la agenda esté fresca.
  useEffect(() => {
    const POLL_MS = 5 * 60 * 1000
    function defaultRange() {
      // Ventana amplia: ayer hasta +60 días — cubre reuniones pasadas con cambios
      // y futuras razonables.
      const from = new Date(); from.setDate(from.getDate() - 1); from.setHours(0, 0, 0, 0)
      const to = new Date(); to.setDate(to.getDate() + 60); to.setHours(23, 59, 59, 999)
      return { from: from.toISOString(), to: to.toISOString() }
    }
    function shouldSync() {
      const last = useStore.getState().calendarLastSync
      return !last || (Date.now() - last) > POLL_MS
    }
    function poll() {
      const { from, to } = defaultRange()
      useStore.getState().refreshCalendar({ from, to, silent: true })
    }
    function onVis() {
      if (document.visibilityState === 'visible' && shouldSync()) poll()
    }
    const interval = setInterval(poll, POLL_MS)
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', onVis) }
  }, [])

  // URL actions desde shortcuts del manifest (PWA). ?action=capture abre el
  // modal Capturar; ?action=reminder lo abre con el toggle reminder activo.
  // Limpiamos el query al consumir para no re-disparar.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const action = params.get('action')
    if (action === 'capture') {
      useStore.getState().openCapture({})
      window.history.replaceState({}, '', window.location.pathname)
    } else if (action === 'reminder') {
      useStore.getState().openCapture({ reminder: true })
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  // Click en una notificacion push: el SW manda postMessage OPEN_TASK al
  // cliente. Abrimos el detalle de esa tarea.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    function onMsg(e: MessageEvent) {
      if (e.data?.type === 'OPEN_TASK' && typeof e.data.taskId === 'number') {
        useStore.getState().openDetail(e.data.taskId)
      }
    }
    navigator.serviceWorker.addEventListener('message', onMsg)
    return () => navigator.serviceWorker.removeEventListener('message', onMsg)
  }, [])

  useEffect(() => {
    function isTypingTarget(t: EventTarget | null): boolean {
      if (!(t instanceof HTMLElement)) return false
      const tag = t.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
      if (t.isContentEditable) return true
      return false
    }
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); return }
      // Cmd+Z / Ctrl+Z (sin shift) → undoLast. Ignoramos cuando el foco está en
      // un input/textarea para no romper el undo nativo del campo.
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        if (isTypingTarget(e.target)) return
        e.preventDefault()
        undoLast()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openSearch, undoLast])

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
      case 'mis-tareas': return <Dashboard />
      case 'hoy': return <Dashboard /> // alias legacy
      case 'seguimiento': return <SeguimientoView />
      case 'calendario': return <CalendarView />
      case 'recurrentes': return <RecurrentesView />
      case 'plantillas': return <TemplatesView />
      case 'contactos': return <ContactsView />
      // Banco Falabella
      case 'banco-tareas': return <ContextView context="banco" />
      case 'banco-proyectos': return <ProjectsView context="banco" onOpenPres={setOpenPresId} />
      case 'banco-equipo': return <ContactsView context="banco" title="Equipo" />
      case 'banco-recurrentes': return <RecurrentesView context="banco" />
      case 'banco-presentaciones': return <PresentationsView context="banco" onOpen={setOpenPresId} />
      case 'banco-grilla': return <GrillaView context="banco" />
      // Agencia
      case 'agencia-tareas': return <AgenciaView />
      case 'agencia-clientes': return <ClientesView />
      case 'agencia-proyectos': return <ProjectsView context="agencia" onOpenPres={setOpenPresId} />
      case 'agencia-equipo': return <ContactsView context="agencia" title="Equipo" />
      case 'agencia-recurrentes': return <RecurrentesView context="agencia" />
      case 'agencia-presentaciones': return <PresentationsView context="agencia" onOpen={setOpenPresId} />
      case 'agencia-grilla': return <GrillaView context="agencia" />
      // Personal
      case 'personal-tareas': return <ContextView context="personal" />
      case 'personal-proyectos': return <ProjectsView context="personal" onOpenPres={setOpenPresId} />
      case 'personal-recurrentes': return <RecurrentesView context="personal" />
      default: return <Dashboard />
    }
  }

  // En mobile (<md) los paneles de detalle son full-screen — no aplicamos
  // margin-right (Tailwind md:mr-[540px] solo se activa desde md, así que en
  // mobile naturalmente queda en 0).
  const detailOpenAny = detailOpen || projectDetailOpen

  return (
    <>
      <div className="h-screen flex flex-col overflow-hidden">
        <Topbar />
        <div className="flex flex-1 min-h-0">
          <Sidebar />
          <main
            className={`flex-1 overflow-y-auto pb-16 md:pb-0 transition-[margin] duration-200 ${detailOpenAny ? 'md:mr-[540px]' : 'mr-0'}`}
          >
            {renderView()}
          </main>
        </div>
        <BottomNav />
      </div>

      {detailOpen && <TaskDetail />}
      {projectDetailOpen && <ProjectDetail />}

      <FollowupModal />

      {captureOpen && (
        <CaptureModal
          onClose={closeCapture}
          preselectContext={captureContext ?? undefined}
          preselectClientId={captureClientId}
          preselectProjectId={captureProjectId}
          preselectReminder={captureReminder}
        />
      )}

      {openPresId !== null && (
        <PresentationDetail presId={openPresId} onClose={() => setOpenPresId(null)} />
      )}

      {searchOpen && <SearchModal onClose={closeSearch} onOpenPres={setOpenPresId} />}

      {recurrentEditId !== null && (() => {
        const rec = recurrentes.find(r => r.id === recurrentEditId)
        return rec ? <RecurrenteModal onClose={closeRecurrentEdit} recurrente={rec} /> : null
      })()}

      {recurrentCreate && (
        <RecurrenteModal onClose={closeRecurrentCreate}
          preselectContext={recurrentCreate.context}
          preselectClientId={recurrentCreate.clientId ?? null}
          preselectProjectId={recurrentCreate.projectId ?? null} />
      )}

      <SubtaskConvertModal />
      <DuplicarTareaModal />
      <ArchiveProposalModal />
      <Toast />
      <PWAUpdatePrompt />
      <InstallBanner />
      <NotificationsSubscribe />
    </>
  )
}
