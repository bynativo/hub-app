import { useState } from 'react'
import { useStore } from '../../lib/store'
import { ctxColor, ctxLabel } from '../../lib/helpers'
import { STATUS_ICON, STATUS_COLOR } from '../../lib/constants'

export function ProjectsView({ onOpenPres }: { onOpenPres?: (id: number) => void }) {
  const projects = useStore(s => s.projects)
  const tasks = useStore(s => s.tasks)
  const presentations = useStore(s => s.presentations)
  const openDetail = useStore(s => s.openDetail)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const selected = projects.find(p => p.id === selectedId)
  const selectedTasks = selected ? tasks.filter(t => t.project_id === selected.id) : []
  const selectedPres = selected ? presentations.find(pr => pr.project_id === selected.id) : null

  function getPct(projId: number) {
    const all = tasks.filter(t => t.project_id === projId)
    if (!all.length) return 0
    return Math.round(all.filter(t => t.done).length / all.length * 100)
  }

  return (
    <div className="animate-fade-in p-5">
      <h1 className="font-serif text-[26px] font-light mb-0.5">Proyectos</h1>
      <p className="text-gray-500 text-[13px] mb-5">Campanas · Clientes · Always-on</p>

      <div className="grid gap-2.5">
        {projects.map(p => {
          const pct = getPct(p.id)
          const taskCount = tasks.filter(t => t.project_id === p.id).length
          const pendCount = tasks.filter(t => t.project_id === p.id && !t.done).length

          return (
            <div key={p.id} onClick={() => setSelectedId(selectedId === p.id ? null : p.id)}
              className={`bg-bg2 border rounded-xl p-4 cursor-pointer hover:shadow-md hover:-translate-y-px transition-all shadow-sm ${
                selectedId === p.id ? 'border-claude/20 shadow-md' : 'border-black/7 hover:border-black/13'
              }`}>
              <div className="flex items-center justify-between mb-2">
                <div className="text-[15px] font-medium">{p.name}</div>
                <div className="flex items-center gap-2 w-28">
                  <div className="flex-1 h-[5px] bg-bg4 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-400" style={{ width: `${pct}%`, background: ctxColor(p.context) }} />
                  </div>
                  <span className="text-[10px] font-mono text-gray-400">{pct}%</span>
                </div>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                      style={{ background: ctxColor(p.context) + '12', color: ctxColor(p.context) }}>
                  {p.context}
                </span>
                {p.type && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg4 text-gray-400">{p.type}</span>}
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg4 text-gray-400">
                  {taskCount} tareas · {pendCount} pendientes
                </span>
                {p.clients && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-agencia/7 text-agencia">{p.clients.name}</span>}
              </div>
            </div>
          )
        })}
        {!projects.length && (
          <div className="text-center py-7 text-gray-400 text-[13px]">Sin proyectos</div>
        )}
      </div>

      {/* Project detail panel */}
      {selected && (
        <div className="mt-4 bg-bg2 border border-black/7 rounded-xl overflow-hidden shadow-md animate-fade-in">
          <div className="p-4 border-b border-black/7 flex items-start justify-between">
            <div>
              <div className="font-serif text-lg font-light mb-1" style={{ color: ctxColor(selected.context) }}>
                {selected.name}
              </div>
              {selected.description && <div className="text-[13px] text-gray-500 leading-relaxed mb-2">{selected.description}</div>}
              <div className="flex gap-1.5 flex-wrap">
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: ctxColor(selected.context) + '12', color: ctxColor(selected.context) }}>
                  {ctxLabel(selected.context)}
                </span>
                {selected.type && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg4 text-gray-400">{selected.type}</span>}
                {selected.due_date && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-warn/7 text-warn">Entrega: {selected.due_date}</span>}
                {selected.clients && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-agencia/7 text-agencia">{selected.clients.name}</span>}
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              {selectedPres && onOpenPres && (
                <button onClick={() => onOpenPres(selectedPres.id)}
                  className="text-xs bg-claude/7 border border-claude/20 text-claude px-3 py-1.5 rounded-lg hover:bg-claude/15 transition-colors cursor-pointer">
                  Ver presentacion
                </button>
              )}
              <button onClick={() => setSelectedId(null)} className="text-gray-400 hover:text-gray-900 cursor-pointer text-lg">✕</button>
            </div>
          </div>

          {/* Progress */}
          <div className="px-4 py-3 border-b border-black/7 bg-bg3">
            <div className="flex items-center gap-3">
              <div className="text-[11px] font-mono text-gray-400">Progreso</div>
              <div className="flex-1 h-2 bg-bg4 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${getPct(selected.id)}%`, background: ctxColor(selected.context) }} />
              </div>
              <div className="text-[13px] font-medium" style={{ color: ctxColor(selected.context) }}>
                {selectedTasks.filter(t => t.done).length}/{selectedTasks.length}
              </div>
            </div>
          </div>

          {/* Tasks list */}
          <div className="p-4">
            <div className="text-[11px] font-mono text-gray-400 tracking-wider uppercase mb-2">Tareas del proyecto</div>
            {selectedTasks.length ? (
              <div className="flex flex-col gap-1">
                {selectedTasks.map(t => {
                  const stColor = STATUS_COLOR[t.status || 'Inbox'] || '#6b7280'
                  return (
                    <div key={t.id} onClick={() => openDetail(t.id)}
                      className={`flex items-center gap-2.5 p-2.5 rounded-lg border border-black/7 cursor-pointer hover:border-black/13 hover:shadow-sm transition-all ${t.done ? 'opacity-40' : ''}`}>
                      <div className={`w-3.5 h-3.5 rounded border-[1.5px] shrink-0 flex items-center justify-center text-[9px] ${
                        t.done ? 'bg-success border-success text-white' : 'border-black/13'
                      }`}>
                        {t.done && '✓'}
                      </div>
                      <span className={`text-[13px] flex-1 ${t.done ? 'line-through text-gray-400' : ''}`}>{t.title}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: stColor + '16', color: stColor }}>
                        {STATUS_ICON[t.status || 'Inbox']} {t.status || 'Inbox'}
                      </span>
                      {t.priority === 'alta' && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-danger/7 text-danger">Alta</span>}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-xs text-gray-400">Sin tareas vinculadas</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
