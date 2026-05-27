import { useState } from 'react'
import { useStore } from '../../lib/store'
import { todayISO, addDaysISO, nextWeekRange } from '../../lib/helpers'
import { TaskList } from '../tasks/TaskList'
import { KanbanBoard } from './KanbanBoard'
import type { Task } from '../../lib/types'

function dayLabel(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })
}
function shortDate(iso: string): string {
  return iso.slice(5).replace('-', '/')
}

export function WeekView({ range }: { range: 'esta' | 'proxima' }) {
  const tasks = useStore(s => s.tasks)
  const [mode, setMode] = useState<'list' | 'kanban'>('list')

  const { from, to, title } = range === 'esta'
    ? { from: todayISO(), to: addDaysISO(todayISO(), 7), title: 'Esta semana' }
    : { ...nextWeekRange(), title: 'Próxima semana' }

  // Incluye subtareas: tienen su propio due_date y deben aparecer en el día que vencen.
  const active = tasks.filter(t => !t.done && !t.es_recordatorio && !t.archived_at)
  const weekTasks = active.filter(t => t.due_date && t.due_date >= from && t.due_date <= to)

  // Agrupar por día (solo días con tareas)
  const byDay: Record<string, Task[]> = {}
  weekTasks.forEach(t => { (byDay[t.due_date!] ||= []).push(t) })
  const days = Object.keys(byDay).sort()

  return (
    <div className="animate-fade-in p-5">
      <h1 className="font-serif text-[26px] font-light mb-0.5" style={{ color: '#7c3aed' }}>{title}</h1>
      <p className="text-gray-500 text-[13px] mb-4">
        {weekTasks.length} tarea{weekTasks.length !== 1 ? 's' : ''} · {shortDate(from)} → {shortDate(to)}
      </p>

      {/* Toggle Lista / Kanban */}
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
        <KanbanBoard items={weekTasks.filter(t => !t.parent_task_id)} />
      ) : !days.length ? (
        <div className="text-center py-10 text-gray-400 text-[13px]">Sin tareas con fecha en este rango.</div>
      ) : (
        <div className="max-w-[900px]">
          {days.map(d => (
            <div key={d}>
              <div className="flex items-center gap-2 mb-2.5 mt-5 first:mt-0">
                <span className="text-[11px] font-mono text-gray-400 tracking-wider uppercase capitalize">{dayLabel(d)}</span>
                <span className="font-mono text-[10px] text-gray-400 bg-bg4 px-1.5 rounded-full">{byDay[d].length}</span>
              </div>
              <TaskList tasks={byDay[d]} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
