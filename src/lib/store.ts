import { create } from 'zustand'
import { supabase } from './supabase'
import { WAITING_STATES, CLOSING_STATES } from './constants'
import type { Task, Project, Client, Recurrente, Presentation, Contact, CalendarEvent, Template, TemplateTask } from './types'

// Undo stack: cada entrada describe una acción reciente y una función para
// revertirla. Stack en memoria (no se persiste), tope de 10. Cmd/Ctrl+Z dispara
// la última. Los closures capturan los valores previos al momento de la acción.
const MAX_HISTORY = 10
const DELETE_GRACE_MS = 10_000

type HistoryEntry = {
  id: number
  description: string
  undo: () => Promise<void>
}

type ToastState = {
  id: number
  message: string
  actionLabel?: string
  actionFn?: () => void | Promise<void>
  expiresAt: number
}

let _historyAutoId = 1
let _toastAutoId = 1
let _toastTimer: ReturnType<typeof setTimeout> | null = null

interface AppState {
  tasks: Task[]
  projects: Project[]
  clients: Client[]
  recurrentes: Recurrente[]
  presentations: Presentation[]
  contacts: Contact[]
  calendarEvents: CalendarEvent[]
  templates: Template[]
  templateTasks: TemplateTask[]
  loading: boolean
  initialized: boolean
  activeView: string
  activeClientId: number | null
  currentTaskId: number | null
  detailOpen: boolean
  captureOpen: boolean
  captureClientId: number | null
  captureContext: string | null
  captureProjectId: number | null
  captureReminder: boolean
  pendingFollowupTaskId: number | null
  searchOpen: boolean
  recurrentEditId: number | null
  recurrentCreate: { context?: string; clientId?: number | null; projectId?: number | null } | null
  history: HistoryEntry[]
  toast: ToastState | null

  loadAll: () => Promise<void>
  openSearch: () => void
  closeSearch: () => void
  setView: (view: string) => void
  setActiveClient: (id: number | null) => void
  openDetail: (id: number) => void
  closeDetail: () => void
  openCapture: (opts?: { context?: string; clientId?: number | null; projectId?: number | null; reminder?: boolean }) => void
  closeCapture: () => void
  toggleTask: (id: number) => Promise<void>
  updateTaskStatus: (id: number, status: string) => Promise<void>
  updateTask: (id: number, patch: Partial<Task>, undoDesc?: string) => Promise<void>
  openFollowup: (id: number) => void
  closeFollowup: () => void
  setFollowup: (id: number, at: string | null, type: string) => Promise<void>
  markRecurrentExecuted: (id: number) => Promise<void>
  openRecurrentEdit: (id: number) => void
  closeRecurrentEdit: () => void
  openRecurrentCreate: (opts?: { context?: string; clientId?: number | null; projectId?: number | null }) => void
  closeRecurrentCreate: () => void
  // Undo + toasts
  recordHistory: (description: string, undo: () => Promise<void>) => void
  undoLast: () => Promise<void>
  removeHistoryEntry: (id: number) => void
  showToast: (message: string, opts?: { actionLabel?: string; actionFn?: () => void | Promise<void>; durationMs?: number }) => void
  dismissToast: () => void
  // Delete con gracia de 10s (toast + Cmd+Z); DELETE real al expirar.
  deleteTaskSoft: (id: number) => Promise<void>
}

export const useStore = create<AppState>((set, get) => ({
  tasks: [],
  projects: [],
  clients: [],
  recurrentes: [],
  presentations: [],
  contacts: [],
  calendarEvents: [],
  templates: [],
  templateTasks: [],
  loading: true,
  initialized: false,
  activeView: 'hoy',
  activeClientId: null,
  currentTaskId: null,
  detailOpen: false,
  captureOpen: false,
  captureClientId: null,
  captureContext: null,
  captureProjectId: null,
  captureReminder: false,
  pendingFollowupTaskId: null,
  searchOpen: false,
  recurrentEditId: null,
  recurrentCreate: null,
  history: [],
  toast: null,

  openSearch: () => set({ searchOpen: true }),
  closeSearch: () => set({ searchOpen: false }),

  loadAll: async () => {
    // Solo el loader de pantalla completa en la carga inicial; los refrescos
    // tras una mutación son silenciosos (no desmontan el árbol ni resetean estado).
    if (!get().initialized) set({ loading: true })
    const [tc, pc, cc, rc, prc, ct, ce, tmp, tmpt] = await Promise.all([
      // OJO: existen dos FKs entre tasks y projects (tasks.project_id→projects y
      // projects.task_id→tasks), así que el embed `projects(...)` es ambiguo y
      // PostgREST devuelve error (las tareas desaparecían). Desambiguar con el FK.
      supabase.from('tasks').select('*,projects!tasks_project_id_fkey(name,color),clients(name,email)').order('created_at', { ascending: false }),
      supabase.from('projects').select('*,clients(name)').order('created_at', { ascending: false }),
      supabase.from('clients').select('*').eq('active', true).order('name'),
      supabase.from('recurrentes').select('*,clients(name)').eq('active', true),
      supabase.from('presentations').select('*').order('created_at', { ascending: false }),
      supabase.from('contacts').select('*').order('name'),
      supabase.from('calendar_events').select('*').order('starts_at'),
      supabase.from('templates').select('*').order('created_at'),
      supabase.from('template_tasks').select('*').order('position'),
    ])
    // Surface de errores: antes un fallo de query dejaba las listas en [] en silencio.
    const errored = [tc, pc, cc, rc, prc, ct, ce, tmp, tmpt].find(r => r.error)
    if (errored?.error) console.error('[loadAll] Supabase error:', errored.error)
    set({
      tasks: tc.data || [],
      projects: pc.data || [],
      clients: cc.data || [],
      recurrentes: rc.data || [],
      presentations: prc.data || [],
      contacts: ct.data || [],
      calendarEvents: ce.data || [],
      templates: tmp.data || [],
      templateTasks: tmpt.data || [],
      loading: false,
      initialized: true,
    })
  },

  setView: (view) => set({ activeView: view }),
  setActiveClient: (id) => set({ activeClientId: id }),

  openDetail: (id) => set({ currentTaskId: id, detailOpen: true }),
  closeDetail: () => set({ detailOpen: false, currentTaskId: null }),

  openCapture: (opts) => set({
    captureOpen: true,
    captureContext: opts?.context ?? null,
    captureClientId: opts?.clientId ?? null,
    captureProjectId: opts?.projectId ?? null,
    captureReminder: !!opts?.reminder,
  }),
  closeCapture: () => set({ captureOpen: false, captureContext: null, captureClientId: null, captureProjectId: null, captureReminder: false }),

  toggleTask: async (id) => {
    const prev = get().tasks.find(t => t.id === id)
    if (!prev || prev.done) return
    await supabase.from('tasks').update({ done: true }).eq('id', id)
    set({ tasks: get().tasks.map(t => t.id === id ? { ...t, done: true } : t) })
    get().recordHistory(`Tarea marcada como hecha: "${prev.title}"`, async () => {
      await supabase.from('tasks').update({ done: false }).eq('id', id)
      set({ tasks: get().tasks.map(t => t.id === id ? { ...t, done: false } : t) })
    })
  },

  updateTaskStatus: async (id, status) => {
    const prev = get().tasks.find(t => t.id === id)
    if (!prev || prev.status === status) return
    const oldStatus = prev.status
    const oldArchivedAt = prev.archived_at
    // Al pasar a un estado de cierre se archiva; al reabrir se desarchiva.
    const archived_at = CLOSING_STATES.includes(status) ? new Date().toISOString() : null
    await supabase.from('tasks').update({ status, archived_at }).eq('id', id)
    set({ tasks: get().tasks.map(t => t.id === id ? { ...t, status, archived_at } : t) })
    // Si la tarea entra a un estado "Esperando" (y no lo estaba), pedir alarma de seguimiento
    const wasWaiting = WAITING_STATES.includes(oldStatus)
    if (WAITING_STATES.includes(status) && !wasWaiting) {
      set({ pendingFollowupTaskId: id })
    }
    get().recordHistory(`Status: ${oldStatus} → ${status}`, async () => {
      await supabase.from('tasks').update({ status: oldStatus, archived_at: oldArchivedAt }).eq('id', id)
      set({ tasks: get().tasks.map(t => t.id === id ? { ...t, status: oldStatus, archived_at: oldArchivedAt } : t) })
    })
  },

  updateTask: async (id, patch, undoDesc) => {
    const prev = get().tasks.find(t => t.id === id)
    await supabase.from('tasks').update(patch).eq('id', id)
    set({ tasks: get().tasks.map(t => t.id === id ? { ...t, ...patch } : t) })
    if (undoDesc && prev) {
      // Captura los valores ANTERIORES de cada clave parcheada (snapshot).
      const inverse: Record<string, any> = {}
      for (const k of Object.keys(patch)) inverse[k] = (prev as any)[k] ?? null
      get().recordHistory(undoDesc, async () => {
        await supabase.from('tasks').update(inverse).eq('id', id)
        set({ tasks: get().tasks.map(t => t.id === id ? { ...t, ...inverse } : t) })
      })
    }
  },

  markRecurrentExecuted: async (id) => {
    const now = new Date().toISOString()
    await supabase.from('recurrentes').update({ last_executed_at: now }).eq('id', id)
    set({ recurrentes: get().recurrentes.map(r => r.id === id ? { ...r, last_executed_at: now } : r) })
  },

  openRecurrentEdit: (id) => set({ recurrentEditId: id }),
  closeRecurrentEdit: () => set({ recurrentEditId: null }),
  openRecurrentCreate: (opts) => set({ recurrentCreate: opts ?? {} }),
  closeRecurrentCreate: () => set({ recurrentCreate: null }),

  openFollowup: (id) => set({ pendingFollowupTaskId: id }),
  closeFollowup: () => set({ pendingFollowupTaskId: null }),
  setFollowup: async (id, at, type) => {
    // Los recordatorios guardan su alarma en recordatorio_at; las tareas en seguimiento en followup_at.
    const task = get().tasks.find(t => t.id === id)
    const patch = task?.es_recordatorio
      ? { recordatorio_at: at }
      : { followup_at: at, followup_type: type }
    await supabase.from('tasks').update(patch).eq('id', id)
    set({
      tasks: get().tasks.map(t => t.id === id ? { ...t, ...patch } : t),
      pendingFollowupTaskId: null,
    })
  },

  recordHistory: (description, undo) => {
    const entry: HistoryEntry = { id: _historyAutoId++, description, undo }
    const next = [...get().history, entry]
    if (next.length > MAX_HISTORY) next.shift()
    set({ history: next })
  },

  removeHistoryEntry: (id) => {
    set({ history: get().history.filter(e => e.id !== id) })
  },

  undoLast: async () => {
    const h = get().history
    if (!h.length) return
    const last = h[h.length - 1]
    set({ history: h.slice(0, -1) })
    try {
      await last.undo()
      get().showToast(`✓ Deshecho: ${last.description}`, { durationMs: 2500 })
    } catch (e) {
      console.error('[undo] error', e)
      get().showToast('No se pudo deshacer', { durationMs: 2500 })
    }
  },

  showToast: (message, opts) => {
    if (_toastTimer) { clearTimeout(_toastTimer); _toastTimer = null }
    const durationMs = opts?.durationMs ?? 3000
    const t: ToastState = {
      id: _toastAutoId++,
      message,
      actionLabel: opts?.actionLabel,
      actionFn: opts?.actionFn,
      expiresAt: Date.now() + durationMs,
    }
    set({ toast: t })
    _toastTimer = setTimeout(() => {
      // Solo dismiss si sigue siendo el mismo toast (no fue reemplazado).
      if (get().toast?.id === t.id) set({ toast: null })
      _toastTimer = null
    }, durationMs)
  },

  dismissToast: () => {
    if (_toastTimer) { clearTimeout(_toastTimer); _toastTimer = null }
    set({ toast: null })
  },

  // Soft delete: oculta la tarea del estado local, muestra un toast con
  // "Deshacer" 10s, y agenda el DELETE real en Supabase. Si el usuario
  // deshace dentro de la ventana, cancela el timer y restaura. Si no, el
  // timer dispara el DELETE y quita la entrada del historial (para evitar
  // que un Cmd+Z posterior intente "restaurar" una fila ya borrada).
  deleteTaskSoft: async (id) => {
    const task = get().tasks.find(t => t.id === id)
    if (!task) return
    // 1) Si el detail está abierto en esta tarea, lo cerramos.
    if (get().currentTaskId === id) set({ detailOpen: false, currentTaskId: null })
    // 2) Quitar de local y agendar DELETE.
    set({ tasks: get().tasks.filter(t => t.id !== id) })
    let cancelled = false
    let historyEntryId = -1
    const timer = setTimeout(async () => {
      if (cancelled) return
      // DELETE real (CASCADE en DB borra subtareas/checklists/threads/attachments).
      await supabase.from('tasks').delete().eq('id', id)
      // Una vez confirmado, sacamos del historial — la fila ya no existe en DB
      // y no tiene sentido permitir "deshacer" eso.
      if (historyEntryId > 0) get().removeHistoryEntry(historyEntryId)
      if (get().toast?.message.startsWith('Tarea eliminada')) get().dismissToast()
    }, DELETE_GRACE_MS)
    const undo = async () => {
      if (cancelled) return
      cancelled = true
      clearTimeout(timer)
      // Re-insertar al state local (la fila nunca se borró de DB).
      set({ tasks: [task, ...get().tasks] })
      get().dismissToast()
    }
    // 3) Toast con acción Deshacer.
    get().showToast(`Tarea eliminada: "${task.title}"`, {
      actionLabel: 'Deshacer',
      actionFn: undo,
      durationMs: DELETE_GRACE_MS,
    })
    // 4) Registrar en history para que Cmd+Z también revierta.
    const next = [...get().history]
    const entry: HistoryEntry = { id: _historyAutoId++, description: `Eliminación de "${task.title}"`, undo }
    historyEntryId = entry.id
    next.push(entry)
    if (next.length > MAX_HISTORY) next.shift()
    set({ history: next })
  },
}))
