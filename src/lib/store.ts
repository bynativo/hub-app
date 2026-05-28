import { create } from 'zustand'
import { supabase } from './supabase'
import { WAITING_STATES, CLOSING_STATES } from './constants'
import type { Task, Project, Client, Recurrente, Presentation, Contact, CalendarEvent } from './types'

interface AppState {
  tasks: Task[]
  projects: Project[]
  clients: Client[]
  recurrentes: Recurrente[]
  presentations: Presentation[]
  contacts: Contact[]
  calendarEvents: CalendarEvent[]
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
  pendingFollowupTaskId: number | null
  searchOpen: boolean
  recurrentEditId: number | null
  recurrentCreate: { context?: string; clientId?: number | null } | null

  loadAll: () => Promise<void>
  openSearch: () => void
  closeSearch: () => void
  setView: (view: string) => void
  setActiveClient: (id: number | null) => void
  openDetail: (id: number) => void
  closeDetail: () => void
  openCapture: (opts?: { context?: string; clientId?: number | null; projectId?: number | null }) => void
  closeCapture: () => void
  toggleTask: (id: number) => Promise<void>
  updateTaskStatus: (id: number, status: string) => Promise<void>
  updateTask: (id: number, patch: Partial<Task>) => Promise<void>
  openFollowup: (id: number) => void
  closeFollowup: () => void
  setFollowup: (id: number, at: string | null, type: string) => Promise<void>
  markRecurrentExecuted: (id: number) => Promise<void>
  openRecurrentEdit: (id: number) => void
  closeRecurrentEdit: () => void
  openRecurrentCreate: (opts?: { context?: string; clientId?: number | null }) => void
  closeRecurrentCreate: () => void
}

export const useStore = create<AppState>((set, get) => ({
  tasks: [],
  projects: [],
  clients: [],
  recurrentes: [],
  presentations: [],
  contacts: [],
  calendarEvents: [],
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
  pendingFollowupTaskId: null,
  searchOpen: false,
  recurrentEditId: null,
  recurrentCreate: null,

  openSearch: () => set({ searchOpen: true }),
  closeSearch: () => set({ searchOpen: false }),

  loadAll: async () => {
    // Solo el loader de pantalla completa en la carga inicial; los refrescos
    // tras una mutación son silenciosos (no desmontan el árbol ni resetean estado).
    if (!get().initialized) set({ loading: true })
    const [tc, pc, cc, rc, prc, ct, ce] = await Promise.all([
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
    ])
    // Surface de errores: antes un fallo de query dejaba las listas en [] en silencio.
    const errored = [tc, pc, cc, rc, prc, ct, ce].find(r => r.error)
    if (errored?.error) console.error('[loadAll] Supabase error:', errored.error)
    set({
      tasks: tc.data || [],
      projects: pc.data || [],
      clients: cc.data || [],
      recurrentes: rc.data || [],
      presentations: prc.data || [],
      contacts: ct.data || [],
      calendarEvents: ce.data || [],
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
  }),
  closeCapture: () => set({ captureOpen: false, captureContext: null, captureClientId: null, captureProjectId: null }),

  toggleTask: async (id) => {
    await supabase.from('tasks').update({ done: true }).eq('id', id)
    set({ tasks: get().tasks.map(t => t.id === id ? { ...t, done: true } : t) })
  },

  updateTaskStatus: async (id, status) => {
    const prev = get().tasks.find(t => t.id === id)
    // Al pasar a un estado de cierre se archiva; al reabrir se desarchiva.
    const archived_at = CLOSING_STATES.includes(status) ? new Date().toISOString() : null
    await supabase.from('tasks').update({ status, archived_at }).eq('id', id)
    set({ tasks: get().tasks.map(t => t.id === id ? { ...t, status, archived_at } : t) })
    // Si la tarea entra a un estado "Esperando" (y no lo estaba), pedir alarma de seguimiento
    const wasWaiting = prev ? WAITING_STATES.includes(prev.status) : false
    if (WAITING_STATES.includes(status) && !wasWaiting) {
      set({ pendingFollowupTaskId: id })
    }
  },

  updateTask: async (id, patch) => {
    await supabase.from('tasks').update(patch).eq('id', id)
    set({ tasks: get().tasks.map(t => t.id === id ? { ...t, ...patch } : t) })
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
}))
