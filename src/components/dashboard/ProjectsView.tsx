import { useState } from 'react'
import { useStore } from '../../lib/store'
import { ctxColor, ctxLabel } from '../../lib/helpers'
import { STATUS_ICON, STATUS_COLOR } from '../../lib/constants'
import { NewProjectModal } from '../modals/NewProjectModal'

export function ProjectsView({ context, onOpenPres }: { context?: string; onOpenPres?: (id: number) => void }) {
  const allProjects = useStore(s => s.projects)
  const tasks = useStore(s => s.tasks)
  const presentations = useStore(s => s.presentations)
  const openDetail = useStore(s => s.openDetail)
  const openCapture = useStore(s => s.openCapture)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [newOpen, setNewOpen] = useState(false)

  const projects = context ? allProjects.filter(p => p.context === context) : allProjects
  const selected = projects.find(p => p.id === selectedId)
  const selectedTasks = selected ? tasks.filter(t => t.project_id === selected.id) : []
  const selectedPres = selected ? presentations.find(pr => pr.project_id === selected.id) : null

  const accent = context ? ctxColor(context) : '#7c3aed'

  function getPct(projId: number) {
    const all = tasks.filter(t => t.project_id === projId)
    if (!all.length) return 0
    return Math.round(all.filter(t => t.done).length / all.length * 100)
  }

  return (
    <div className="animate-fade-in p-5">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="font-serif text-[26px] font-light mb-0.5" style={{ color: accent }}>Proyectos</h1>
          <p className="text-gray-500 text-[13px]">{context ? ctxLabel(context) : 'Todos los contextos'} · {projects.length} proyectos</p>
        </div>
        <button onClick={() => setNewOpen(true)}
          className="text-xs bg-claude border-claude text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors cursor-pointer">
          + Nuevo proyecto
        </button>
      </div>

      <div className="grid gap-2.5">
        {projects.map(p => {
          const pct = getPct(p.id)
          const all = tasks.filter(t => t.project_id === p.id)
          const pend = all.filter(t => !t.done).length
          const stColor = STATUS_COLOR[p.status || ''] || '#6b7280'
          return (
            <div key={p.id} onClick={() => setSelectedId(selectedId === p.id ? null : p.id)}
              className={`bg-bg2 border rounded-xl p-4 cursor-pointer hover:shadow-md hover:-translate-y-px transition-all shadow-sm ${
                selectedId === p.id ? 'border-claude/20 shadow-md' : 'border-black/7 hover:border-black/13'
              }`}>
              <div className="flex items-center justify-between mb-1.5 gap-3">
                <div className="text-[15px] font-medium">{p.name}</div>
                <div className="flex items-center gap-2 w-32 shrink-0">
                  <div className="flex-1 h-[5px] bg-bg4 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: ctxColor(p.context) }} />
                  </div>
                  <span className="text-[10px] font-mono text-gray-400">{pct}%</span>
                </div>
              </div>
              {p.description && <div className="text-[12px] text-gray-500 mb-2 leading-snug">{p.description}</div>}
              <div className="flex gap-1.5 flex-wrap">
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded capitalize" style={{ background: stColor + '14', color: stColor }}>{p.status || 'activo'}</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: ctxColor(p.context) + '12', color: ctxColor(p.context) }}>{ctxLabel(p.context)}</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg4 text-gray-400">{all.length} tareas · {pend} pendientes</span>
                {p.clients && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-agencia/7 text-agencia">{p.clients.name}</span>}
                {p.due_date && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-warn/7 text-warn">Entrega: {p.due_date.slice(5).replace('-', '/')}</span>}
              </div>
            </div>
          )
        })}
        {!projects.length && <div className="text-center py-7 text-gray-400 text-[13px]">Sin proyectos en este contexto</div>}
      </div>

      {selected && (
        <div className="mt-4 bg-bg2 border border-black/7 rounded-xl overflow-hidden shadow-md animate-fade-in">
          <div className="p-4 border-b border-black/7 flex items-start justify-between">
            <div>
              <div className="font-serif text-lg font-light mb-1" style={{ color: ctxColor(selected.context) }}>{selected.name}</div>
              {selected.description && <div className="text-[13px] text-gray-500 leading-relaxed mb-2">{selected.description}</div>}
              <div className="flex gap-1.5 flex-wrap">
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded capitalize" style={{ background: (STATUS_COLOR[selected.status || ''] || '#6b7280') + '14', color: STATUS_COLOR[selected.status || ''] || '#6b7280' }}>{selected.status || 'activo'}</span>
                {selected.clients && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-agencia/7 text-agencia">{selected.clients.name}</span>}
                {selected.due_date && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-warn/7 text-warn">Entrega: {selected.due_date}</span>}
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              {selectedPres && onOpenPres && (
                <button onClick={() => onOpenPres(selectedPres.id)} className="text-xs bg-claude/7 border border-claude/20 text-claude px-3 py-1.5 rounded-lg hover:bg-claude/15 cursor-pointer">Ver presentación</button>
              )}
              <button onClick={() => openCapture({ context: selected.context, projectId: selected.id, clientId: selected.client_id })}
                className="text-xs bg-claude border-claude text-white px-3 py-1.5 rounded-lg hover:bg-purple-700 cursor-pointer">+ Nueva tarea</button>
              <button onClick={() => setSelectedId(null)} className="text-gray-400 hover:text-gray-900 cursor-pointer text-lg">✕</button>
            </div>
          </div>

          <div className="px-4 py-3 border-b border-black/7 bg-bg3 flex items-center gap-3">
            <div className="text-[11px] font-mono text-gray-400">Progreso</div>
            <div className="flex-1 h-2 bg-bg4 rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${getPct(selected.id)}%`, background: ctxColor(selected.context) }} />
            </div>
            <div className="text-[13px] font-medium" style={{ color: ctxColor(selected.context) }}>{selectedTasks.filter(t => t.done).length}/{selectedTasks.length}</div>
          </div>

          <div className="p-4">
            <div className="text-[11px] font-mono text-gray-400 tracking-wider uppercase mb-2">Tareas del proyecto</div>
            {selectedTasks.length ? (
              <div className="flex flex-col gap-1">
                {selectedTasks.map(t => {
                  const stColor = STATUS_COLOR[t.status] || '#6b7280'
                  return (
                    <div key={t.id} onClick={() => openDetail(t.id)}
                      className={`flex items-center gap-2.5 p-2.5 rounded-lg border border-black/7 cursor-pointer hover:border-black/13 hover:shadow-sm transition-all ${t.done ? 'opacity-40' : ''}`}>
                      <div className={`w-3.5 h-3.5 rounded border-[1.5px] shrink-0 flex items-center justify-center text-[9px] ${t.done ? 'bg-success border-success text-white' : 'border-black/13'}`}>{t.done && '✓'}</div>
                      <span className={`text-[13px] flex-1 ${t.done ? 'line-through text-gray-400' : ''}`}>{t.title}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: stColor + '16', color: stColor }}>{STATUS_ICON[t.status]} {t.status}</span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-xs text-gray-400">Sin tareas vinculadas. Usá "+ Nueva tarea".</div>
            )}
          </div>
        </div>
      )}

      {newOpen && <NewProjectModal onClose={() => setNewOpen(false)} defaultContext={context || 'banco'} />}
    </div>
  )
}
