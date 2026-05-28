import { useState } from 'react'
import { useStore } from '../../lib/store'
import { todayISO, addDaysISO, nextWeekRange, nextRecurringDueDate } from '../../lib/helpers'
import { TaskList } from '../tasks/TaskList'
import { KanbanBoard } from './KanbanBoard'
import { RecurrentInstanceCard } from '../tasks/RecurrentInstanceCard'
import type { Task, Recurrente } from '../../lib/types'

function dayLabel(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })
}
function shortDate(iso: string): string {
  return iso.slice(5).replace('-', '/')
}

export function WeekView({ range }: { range: 'esta' | 'proxima' }) {
  const tasks = useStore(s => s.tasks)
  const recurrentes = useStore(s => s.recurrentes)
  const [mode, setMode] = useState<'list' | 'kanban'>('list')

  const { from, to, title } = range === 'esta'
    ? { from: todayISO(), to: addDaysISO(todayISO(), 7), title: 'Esta semana' }
    : { ...nextWeekRange(), title: 'Próxima semana' }

  // Incluye subtareas: tienen su propio due_date y deben aparecer en el día que vencen.
  const active = tasks.filter(t => !t.done && !t.es_recordatorio && !t.archived_at)
  const weekTasks = active.filter(t => t.due_date && t.due_date >= from && t.due_date <= to)

  // Instancias de recurrentes cuya próxima fecha cae en el rango.
  const recInRange = recurrentes
    .map(r => ({ rec: r, date: nextRecurringDueDate(r) }))
    .filter(i => i.date >= from && i.date <= to)

  // Agrupar tasks + recurrentes por día (solo días con algo).
  const byDay: Record<string, { tasks: Task[]; recs: { rec: Recurrente; date: string }[] }> = {}
  weekTasks.forEach(t => { (byDay[t.due_date!] ||= { tasks: [], recs: [] }).tasks.push(t) })
  recInRange.forEach(i => { (byDay[i.date] ||= { tasks: [], recs: [] }).recs.push(i) })
  const days = Object.keys(byDay).sort()

  const totalCount = weekTasks.length + recInRange.length

  return (
    <div className="animate-fade-in p-5">
      <h1 className="font-serif text-[26px] font-light mb-0.5" style={{ color: '#7c3aed' }}>{title}</h1>
      <p className="text-gray-500 text-[13px] mb-4">
        {totalCount} {totalCount === 1 ? 'tarea' : 'tareas'} · {shortDate(from)} → {shortDate(to)}
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
        <KanbanBoard items={weekTasks} />
      ) : !days.length ? (
        <div className="text-center py-10 text-gray-400 text-[13px]">Sin tareas con fecha en este rango.</div>
      ) : (
        <div className="max-w-[900px]">
          {days.map(d => {
            const day = byDay[d]
            const total = day.tasks.length + day.recs.length
            return (
              <div key={d}>
                <div className="flex items-center gap-2 mb-2.5 mt-5 first:mt-0">
                  <span className="text-[11px] font-mono text-gray-400 tracking-wider uppercase capitalize">{dayLabel(d)}</span>
                  <span className="font-mono text-[10px] text-gray-400 bg-bg4 px-1.5 rounded-full">{total}</span>
                </div>
                {day.tasks.length > 0 && <TaskList tasks={day.tasks} />}
                {day.recs.length > 0 && (
                  <div className={`flex flex-col gap-1 ${day.tasks.length ? 'mt-1' : ''}`}>
                    {day.recs.map(i => <RecurrentInstanceCard key={i.rec.id} recurrente={i.rec} date={i.date} />)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
