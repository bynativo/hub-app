import { useStore } from '../../lib/store'
import { TaskList } from '../tasks/TaskList'
import { ctxLabel, ctxColor } from '../../lib/helpers'

export function ContextView({ context }: { context: string }) {
  const { tasks, activeClientId } = useStore()
  const active = tasks.filter(t => !t.done && t.context === context)
  const filtered = context === 'agencia' && activeClientId
    ? active.filter(t => t.client_id === activeClientId)
    : active

  return (
    <div className="animate-fade-in p-5">
      <h1 className="font-serif text-[26px] font-light mb-0.5" style={{ color: ctxColor(context) }}>
        {ctxLabel(context)}
      </h1>
      <p className="text-gray-500 text-[13px] mb-5">
        {filtered.length} pendientes
      </p>
      <div className="flex items-center justify-between mb-2.5">
        <div className="text-[11px] font-mono text-gray-400 tracking-wider uppercase">Pendientes</div>
      </div>
      <TaskList tasks={filtered} />
    </div>
  )
}
