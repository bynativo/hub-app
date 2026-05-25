import { create } from 'zustand'
import { supabase } from './supabase'
import { WAITING_STATES } from './constants'
import type { Task, Project, Client, Recurrente, Presentation } from './types'

interface AppState {
  tasks: Task[]
  projects: Project[]
  clients: Client[]
  recurrentes: Recurrente[]
  presentations: Presentation[]
  loading: boolean
  activeView: string
  activeClientId: number | null
  currentTaskId: number | null
  detailOpen: boolean
  captureOpen: boolean
  captureClientId: number | null
  captureContext: string | null
  captureProjectId: number | null
  pendingFollowupTaskId: number | null

  loadAll: () => Promise<void>
  setView: (view: string) => void
  setActiveClient: (id: number | null) => void
  openDetail: (id: number) => void
  closeDetail: () => void
  openCapture: (opts?: { context?: string; clientId?: number | null; projectId?: number | null }) => void
  closeCapture: () => void
  toggleTask: (id: number) => Promise<void>
  updateTaskStatus: (id: number, status: string) => Promise<void>
  openFollowup: (id: number) => void
  closeFollowup: () => void
  setFollowup: (id: number, at: string | null, type: string) => Promise<void>
}

export const useStore = create<AppState>((set, get) => ({
  tasks: [],
  projects: [],
  clients: [],
  recurrentes: [],
  presentations: [],
  loading: true,
  activeView: 'hoy',
  activeClientId: null,
  currentTaskId: null,
  detailOpen: false,
  captureOpen: false,
  captureClientId: null,
  captureContext: null,
  captureProjectId: null,
  pendingFollowupTaskId: null,

  loadAll: async () => {
    set({ loading: true })
    const [tc, pc, cc, rc, prc] = await Promise.all([
      supabase.from('tasks').select('*,projects(name,color),clients(name,email)').order('created_at', { ascending: false }),
      supabase.from('projects').select('*,clients(name)').order('created_at', { ascending: false }),
      supabase.from('clients').select('*').eq('active', true).order('name'),
      supabase.from('recurrentes').select('*,clients(name)').eq('active', true),
      supabase.from('presentations').select('*').order('created_at', { ascending: false }),
    ])
    set({
      tasks: tc.data || [],
      projects: pc.data || [],
      clients: cc.data || [],
      recurrentes: rc.data || [],
      presentations: prc.data || [],
      loading: false,
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
    await supabase.from('tasks').update({ status }).eq('id', id)
    set({ tasks: get().tasks.map(t => t.id === id ? { ...t, status } : t) })
    // Si la tarea entra a un estado "Esperando" (y no lo estaba), pedir alarma de seguimiento
    const wasWaiting = prev ? WAITING_STATES.includes(prev.status) : false
    if (WAITING_STATES.includes(status) && !wasWaiting) {
      set({ pendingFollowupTaskId: id })
    }
  },

  openFollowup: (id) => set({ pendingFollowupTaskId: id }),
  closeFollowup: () => set({ pendingFollowupTaskId: null }),
  setFollowup: async (id, at, type) => {
    await supabase.from('tasks').update({ followup_at: at, followup_type: type }).eq('id', id)
    set({
      tasks: get().tasks.map(t => t.id === id ? { ...t, followup_at: at, followup_type: type } : t),
      pendingFollowupTaskId: null,
    })
  },
}))
