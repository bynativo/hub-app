import { useStore } from '../../lib/store'
import { splitTitle } from '../../lib/helpers'
import type { Task } from '../../lib/types'

// Recordatorio mostrado como pseudo-tarea dentro de su tarea padre / proyecto.
// Visualmente distinto de las subtareas reales (campana, borde punteado, fondo suave).
export function ReminderRow({ reminder }: { reminder: Task }) {
  const openDetail = useStore(s => s.openDetail)
  const at = reminder.recordatorio_at
  const overdue = !!at && new Date(at) <= new Date() && !reminder.done
  const when = at
    ? new Date(at).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : 'Sin fecha'
  const { name } = splitTitle(reminder.title)

  return (
    <div
      onClick={() => openDetail(reminder.id)}
      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-dashed cursor-pointer transition-colors ${
        overdue ? 'border-danger/40 bg-danger/5' : 'border-black/15 bg-bg3 hover:bg-bg4'
      } ${reminder.done ? 'opacity-50' : ''}`}
    >
      <span className="text-[13px] shrink-0 leading-none">🔔</span>
      <span className={`text-[12px] flex-1 truncate ${reminder.done ? 'line-through text-gray-400' : 'text-gray-600'}`}>{name}</span>
      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg4 text-gray-500 shrink-0">{when}</span>
      {overdue
        ? <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-danger/10 text-danger shrink-0">Vencido</span>
        : <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-warn/10 text-warn shrink-0">Recordatorio</span>}
    </div>
  )
}
