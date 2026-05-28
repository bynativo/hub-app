import { useStore } from '../../lib/store'
import { fmtDue, ctxLabel, ctxColor, clientBadge, todayISO } from '../../lib/helpers'
import type { Recurrente } from '../../lib/types'

// Detalle de frecuencia: "Todos los días", "Cada lunes", "Día 5 del mes", etc.
function freqDetail(r: { freq: string; day_of_month: string }) {
  if (r.freq === 'diaria') return 'Todos los días'
  if (r.freq === 'semanal') return `Cada ${r.day_of_month}`
  return r.day_of_month === 'ultimo' ? 'Último día del mes' : `Día ${r.day_of_month} del mes`
}

// Tarjeta para una "instancia próxima" de una recurrente. NO es una Task de DB:
// se calcula al vuelo a partir de la definición. Click abre el modal de edición
// de la recurrente; botón "Marcar completada esta vez" actualiza
// `recurrentes.last_executed_at` y recalcula la siguiente instancia.
export function RecurrentInstanceCard({
  recurrente,
  date,
  variant = 'normal',
}: {
  recurrente: Recurrente
  date: string
  variant?: 'normal' | 'nested'
}) {
  const openRecurrentEdit = useStore(s => s.openRecurrentEdit)
  const markExecuted = useStore(s => s.markRecurrentExecuted)
  const clients = useStore(s => s.clients)
  const due = fmtDue(date)
  const ctx = recurrente.context
  const ctxC = ctxColor(ctx)
  const cb = clientBadge(recurrente.client_id, clients)
  const prioColor = recurrente.priority === 'alta' ? '#dc2626' : recurrente.priority === 'media' ? '#d97706' : '#16a34a'
  const isToday = date === todayISO()

  return (
    <div
      onClick={() => openRecurrentEdit(recurrente.id)}
      className={`flex items-start gap-2.5 p-3 bg-bg2 rounded-[10px] cursor-pointer transition-all shadow-sm hover:shadow-md hover:-translate-y-px ${
        variant === 'nested' ? 'border border-dashed border-claude/25' : 'border border-black/7 hover:border-black/13'
      }`}
    >
      <div className="text-[15px] leading-none shrink-0 mt-0.5" title="Tarea recurrente">🔄</div>

      <div className="flex-1 min-w-0">
        <div className="text-[13px] leading-snug font-medium">{recurrente.title}</div>
        <div className="flex items-center gap-1 mt-1.5 flex-wrap">
          <span className="text-[10px] font-mono px-2 py-0.5 rounded font-medium" style={{ background: '#7c3aed14', color: '#7c3aed' }}>
            🔄 Recurrente
          </span>

          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded font-medium"
            style={{ background: ctxC + '14', color: ctxC }}>{ctxLabel(ctx)}</span>

          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded font-medium"
            style={{ background: prioColor + '14', color: prioColor }}>
            {recurrente.priority === 'alta' ? 'Alta' : recurrente.priority === 'media' ? 'Media' : 'Baja'}
          </span>

          {cb && (
            <span title={cb.name} className="text-[10px] font-mono px-1.5 py-0.5 rounded font-medium"
              style={{ background: cb.color + '14', color: cb.color }}>{cb.sigla}</span>
          )}

          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg4 text-gray-500">
            {freqDetail(recurrente)}
          </span>

          {due && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded font-medium"
              style={{ background: due.urgent ? 'rgba(220,38,38,0.07)' : 'var(--color-bg4)', color: due.urgent ? '#dc2626' : '#6b6860' }}>
              {due.text}
            </span>
          )}
        </div>
      </div>

      {isToday && (
        <button
          onClick={e => { e.stopPropagation(); markExecuted(recurrente.id) }}
          className="text-[11px] text-success bg-success/10 border border-success/25 px-2 py-0.5 rounded-[5px] cursor-pointer hover:bg-success hover:text-white transition-colors shrink-0 font-medium"
          title="Marca esta instancia como hecha (la próxima se recalcula automáticamente)"
        >
          ✓ Hecha
        </button>
      )}
    </div>
  )
}
