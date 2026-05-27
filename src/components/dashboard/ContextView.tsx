import { useState } from 'react'
import { useStore } from '../../lib/store'
import { TaskList } from '../tasks/TaskList'
import { KanbanBoard } from './KanbanBoard'
import { ctxLabel, ctxColor } from '../../lib/helpers'
import { STATUS_COLUMNS, STATUS_ICON, STATUS_COLOR } from '../../lib/constants'

export function ContextView({ context }: { context: string }) {
  const { tasks, activeClientId } = useStore()
  const [mode, setMode] = useState<'list' | 'kanban'>('list')

  const active = tasks.filter(t => !t.done && t.context === context && !t.parent_task_id && !t.es_recordatorio && !t.archived_at)
  const filtered = context === 'agencia' && activeClientId
    ? active.filter(t => t.client_id === activeClientId)
    : active

  const columns = STATUS_COLUMNS[context] || STATUS_COLUMNS.banco
  const kanbanCols = columns.map(s => ({ key: s, label: s, statuses: [s] }))
  // Estados a mostrar en Lista: las columnas del contexto + cualquier otro estado presente.
  const extra = [...new Set(filtered.map(t => t.status || 'Inbox').filter(s => !columns.includes(s)))]
  const groupOrder = [...columns, ...extra]

  return (
    <div className="animate-fade-in p-5">
      <h1 className="font-serif text-[26px] font-light mb-0.5" style={{ color: ctxColor(context) }}>
        {ctxLabel(context)}
      </h1>
      <p className="text-gray-500 text-[13px] mb-4">{filtered.length} pendientes</p>

      <div className="flex items-center gap-2 mb-4">
        <div className="flex bg-bg3 border border-black/7 rounded-lg p-0.5">
          {(['list', 'kanban'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`text-xs px-3 py-1 rounded-md transition-all cursor-pointer ${
                mode === m ? 'bg-bg2 text-gray-900 shadow-sm font-medium' : 'text-gray-400 hover:text-gray-600'
              }`}>
              {m === 'list' ? 'Lista' : 'Kanban'}
            </button>
          ))}
        </div>
      </div>

      {mode === 'kanban' ? (
        <KanbanBoard items={filtered} columns={kanbanCols} />
      ) : !filtered.length ? (
        <div className="text-center py-7 text-gray-400 text-[13px]">Sin tareas</div>
      ) : (
        <div className="max-w-[860px]">
          {groupOrder.map(st => {
            const group = filtered.filter(t => (t.status || 'Inbox') === st)
            if (!group.length) return null
            const color = STATUS_COLOR[st] || '#6b7280'
            return (
              <div key={st}>
                <div className="flex items-center gap-2 mb-2.5 mt-5 first:mt-0">
                  <span className="text-[11px] font-mono tracking-wider uppercase" style={{ color }}>{STATUS_ICON[st] || '•'} {st}</span>
                  <span className="font-mono text-[10px] text-gray-400 bg-bg4 px-1.5 rounded-full">{group.length}</span>
                </div>
                <TaskList tasks={group} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
