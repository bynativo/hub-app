import { useState } from 'react'
import { useStore } from '../../lib/store'
import { KANBAN_GROUPS, ESTADOS, STATUS_COLOR } from '../../lib/constants'
import { ctxColor } from '../../lib/helpers'
import type { Task } from '../../lib/types'

// Estado destino al soltar una tarea en una columna universal:
// primer estado del grupo que sea válido para el contexto de la tarea.
function targetStatus(context: string, groupStatuses: string[]): string {
  const ctxStates = ESTADOS[context] || ESTADOS.banco
  return groupStatuses.find(s => ctxStates.includes(s)) || groupStatuses[0]
}

function KanbanCard({ task, onDragStart }: { task: Task; onDragStart: (id: number, e: React.DragEvent) => void }) {
  const openDetail = useStore(s => s.openDetail)
  const prioColor = task.priority === 'alta' ? '#dc2626' : task.priority === 'media' ? '#d97706' : '#16a34a'
  return (
    <div
      draggable
      onDragStart={e => onDragStart(task.id, e)}
      onClick={() => openDetail(task.id)}
      className="bg-bg2 border border-black/7 rounded-lg p-2.5 shadow-sm cursor-grab active:cursor-grabbing hover:border-black/13 hover:shadow-md transition-all"
    >
      <div className="flex items-start gap-1.5 mb-1.5">
        <div className="w-[7px] h-[7px] rounded-full shrink-0 mt-1" style={{ background: ctxColor(task.context) }} />
        <div className="text-[13px] leading-snug">{task.title}</div>
      </div>
      <div className="flex items-center gap-1 flex-wrap pl-[13px]">
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded font-medium" style={{ background: prioColor + '14', color: prioColor }}>
          {task.priority === 'alta' ? 'Alta' : task.priority === 'media' ? 'Media' : 'Baja'}
        </span>
        {task.clients && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-agencia/7 text-agencia">{task.clients.name}</span>}
        {task.due_date && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg4 text-gray-400">{task.due_date.slice(5).replace('-', '/')}</span>
        )}
      </div>
    </div>
  )
}

export function KanbanBoard({ items, columns }: { items?: Task[]; columns?: { key: string; label: string; statuses: string[] }[] } = {}) {
  const tasks = useStore(s => s.tasks)
  const updateTaskStatus = useStore(s => s.updateTaskStatus)
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [overCol, setOverCol] = useState<string | null>(null)

  // `columns` = columnas por contexto (1 estado por columna); por defecto las 4 universales.
  const cols = columns || KANBAN_GROUPS
  // Si recibe `items` los usa; si no, todas las tareas activas (sin recordatorios, que viven en Seguimiento).
  const active = items ?? tasks.filter(t => !t.done && !t.parent_task_id && !t.es_recordatorio && !t.archived_at)
  const groupKeyOf = (status: string) => cols.find(g => g.statuses.includes(status))?.key || cols[0].key

  function handleDragStart(id: number, e: React.DragEvent) {
    setDraggingId(id)
    e.dataTransfer.setData('text/plain', String(id))
    e.dataTransfer.effectAllowed = 'move'
  }

  async function handleDrop(groupKey: string, e: React.DragEvent) {
    e.preventDefault()
    setOverCol(null)
    const raw = e.dataTransfer.getData('text/plain')
    const id = raw ? Number(raw) : draggingId
    setDraggingId(null)
    if (id == null || Number.isNaN(id)) return
    const task = tasks.find(t => t.id === id)
    if (!task) return
    const group = cols.find(g => g.key === groupKey)!
    if (group.statuses.includes(task.status)) return // ya está en esta columna
    await updateTaskStatus(id, targetStatus(task.context, group.statuses))
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-3">
      {cols.map(group => {
        const colItems = active.filter(t => groupKeyOf(t.status) === group.key)
        const accent = STATUS_COLOR[group.statuses[0]] || '#6b7280'
        return (
          <div
            key={group.key}
            onDragOver={e => { e.preventDefault(); setOverCol(group.key) }}
            onDragLeave={() => setOverCol(c => c === group.key ? null : c)}
            onDrop={e => handleDrop(group.key, e)}
            className={`flex-1 min-w-[205px] rounded-xl border transition-colors ${
              overCol === group.key ? 'border-claude/40 bg-claude/5' : 'border-black/7 bg-bg3'
            }`}
          >
            <div className="flex items-center gap-1.5 px-3 py-2.5 border-b border-black/7">
              <div className="w-2 h-2 rounded-full" style={{ background: accent }} />
              <span className="text-[12px] font-medium">{group.label}</span>
              <span className="ml-auto font-mono text-[10px] text-gray-400 bg-bg4 px-1.5 rounded-full">{colItems.length}</span>
            </div>
            <div className="flex flex-col gap-1.5 p-2 min-h-[140px]">
              {colItems.map(t => <KanbanCard key={t.id} task={t} onDragStart={handleDragStart} />)}
              {!colItems.length && <div className="text-center py-6 text-gray-300 text-[11px]">—</div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
