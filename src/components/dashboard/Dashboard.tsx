import { useState } from 'react'
import { useStore } from '../../lib/store'
import { getGreeting, todayISO, tomorrowISO } from '../../lib/helpers'
import { WAITING_STATES } from '../../lib/constants'
import { TaskList } from '../tasks/TaskList'
import { KanbanBoard } from './KanbanBoard'
import { ClaudeChat } from './ClaudeChat'

function SectionHeader({ icon, label, count }: { icon: string; label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 mb-2.5 mt-5 first:mt-0">
      <span className="text-[11px] font-mono text-gray-400 tracking-wider uppercase">{icon} {label}</span>
      {count > 0 && <span className="font-mono text-[10px] text-gray-400 bg-bg4 px-1.5 rounded-full">{count}</span>}
    </div>
  )
}

export function Dashboard() {
  const tasks = useStore(s => s.tasks)
  const [mode, setMode] = useState<'list' | 'kanban'>('list')

  const active = tasks.filter(t => !t.done && !t.parent_task_id)
  const today = todayISO()
  const tomorrow = tomorrowISO()

  const hoy = active.filter(t => t.due_date === today)
  const manana = active.filter(t => t.due_date === tomorrow)
  const seguimiento = active.filter(t => WAITING_STATES.includes(t.status))

  return (
    <div className="animate-fade-in p-5">
      <h1 className="font-serif text-[26px] font-light mb-0.5">{getGreeting()}</h1>
      <p className="text-gray-500 text-[13px] mb-5">
        {active.length} tareas activas
        {hoy.length ? ` · ${hoy.length} para hoy` : ''}
        {seguimiento.length ? ` · ${seguimiento.length} en seguimiento` : ''}
      </p>

      {/* Toggle Lista / Kanban */}
      <div className="flex items-center gap-2 mb-4">
        <div className="flex bg-bg3 border border-black/7 rounded-lg p-0.5">
          {(['list', 'kanban'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`text-xs px-3 py-1 rounded-md transition-all cursor-pointer ${
                mode === m ? 'bg-bg2 text-gray-900 shadow-sm font-medium' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {m === 'list' ? 'Lista' : 'Kanban'}
            </button>
          ))}
        </div>
      </div>

      {mode === 'kanban' ? (
        <KanbanBoard />
      ) : (
        <div className="max-w-[900px]">
          <SectionHeader icon="📌" label="Hoy" count={hoy.length} />
          <TaskList tasks={hoy} emptyText="Nada vence hoy" />

          <SectionHeader icon="🌅" label="Mañana" count={manana.length} />
          <TaskList tasks={manana} emptyText="Nada para mañana" />

          <SectionHeader icon="⏳" label="Seguimiento" count={seguimiento.length} />
          <TaskList tasks={seguimiento} emptyText="Nada esperando respuesta" />
        </div>
      )}

      <ClaudeChat />
    </div>
  )
}
