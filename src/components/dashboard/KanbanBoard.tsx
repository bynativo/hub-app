import { useState } from 'react'
import { useStore } from '../../lib/store'
import { ESTADOS, STATUS_ICON, STATUS_COLOR } from '../../lib/constants'
import { ctxColor } from '../../lib/helpers'
import type { Task } from '../../lib/types'

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
      <div className="text-[13px] leading-snug mb-1.5">{task.title}</div>
      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded font-medium"
          style={{ background: prioColor + '14', color: prioColor }}>
          {task.priority === 'alta' ? 'Alta' : task.priority === 'media' ? 'Media' : 'Baja'}
        </span>
        {task.clients && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-agencia/7 text-agencia">{task.clients.name}</span>
        )}
        {task.due_date && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg4 text-gray-400">
            {task.due_date.slice(5).replace('-', '/')}
          </span>
        )}
      </div>
    </div>
  )
}

export function KanbanBoard({ context }: { context: string }) {
  const tasks = useStore(s => s.tasks)
  const updateTaskStatus = useStore(s => s.updateTaskStatus)
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [overCol, setOverCol] = useState<string | null>(null)

  const cols = ESTADOS[context] || ESTADOS.banco
  const active = tasks.filter(t => !t.done && t.context === context)

  function colTasks(col: string) {
    return active.filter(t => (t.status || 'Inbox') === col)
  }

  function handleDragStart(id: number, e: React.DragEvent) {
    setDraggingId(id)
    e.dataTransfer.setData('text/plain', String(id))
    e.dataTransfer.effectAllowed = 'move'
  }

  async function handleDrop(col: string, e: React.DragEvent) {
    e.preventDefault()
    setOverCol(null)
    const raw = e.dataTransfer.getData('text/plain')
    const id = raw ? Number(raw) : draggingId
    setDraggingId(null)
    if (id == null || Number.isNaN(id)) return
    const task = tasks.find(t => t.id === id)
    if (!task || (task.status || 'Inbox') === col) return
    await updateTaskStatus(id, col)
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-3">
      {cols.map(col => {
        const items = colTasks(col)
        const color = STATUS_COLOR[col] || '#6b7280'
        return (
          <div
            key={col}
            onDragOver={e => { e.preventDefault(); setOverCol(col) }}
            onDragLeave={() => setOverCol(c => c === col ? null : c)}
            onDrop={e => handleDrop(col, e)}
            className={`w-[230px] shrink-0 rounded-xl border transition-colors ${
              overCol === col ? 'border-claude/40 bg-claude/5' : 'border-black/7 bg-bg3'
            }`}
          >
            <div className="flex items-center gap-1.5 px-3 py-2.5 border-b border-black/7">
              <span style={{ color }}>{STATUS_ICON[col] || '○'}</span>
              <span className="text-[12px] font-medium">{col}</span>
              <span className="ml-auto font-mono text-[10px] text-gray-400 bg-bg4 px-1.5 rounded-full">{items.length}</span>
            </div>
            <div className="flex flex-col gap-1.5 p-2 min-h-[120px]">
              {items.map(t => <KanbanCard key={t.id} task={t} onDragStart={handleDragStart} />)}
              {!items.length && (
                <div className="text-center py-6 text-gray-300 text-[11px]">—</div>
              )}
            </div>
          </div>
        )
      })}
      <div className="w-px shrink-0" style={{ borderTop: `2px solid ${ctxColor(context)}00` }} />
    </div>
  )
}
