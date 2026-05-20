import { create } from 'zustand'
import { supabase } from './supabase'
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

  loadAll: () => Promise<void>
  setView: (view: string) => void
  setActiveClient: (id: number | null) => void
  openDetail: (id: number) => void
  closeDetail: () => void
  toggleTask: (id: number) => Promise<void>
  updateTaskStatus: (id: number, status: string) => Promise<void>
}

export const useStore = create<AppState>((set, get) => ({
  tasks: [],
  projects: [],
  clients: [],
  recurrentes: [],
  presentations: [],
  loading: true,
  activeView: 'dashboard',
  activeClientId: null,
  currentTaskId: null,
  detailOpen: false,

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

  toggleTask: async (id) => {
    await supabase.from('tasks').update({ done: true }).eq('id', id)
    set({ tasks: get().tasks.map(t => t.id === id ? { ...t, done: true } : t) })
  },

  updateTaskStatus: async (id, status) => {
    await supabase.from('tasks').update({ status }).eq('id', id)
    set({ tasks: get().tasks.map(t => t.id === id ? { ...t, status } : t) })
  },
}))
