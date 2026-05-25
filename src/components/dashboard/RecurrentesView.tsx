import { useState } from 'react'
import { useStore } from '../../lib/store'
import { ctxColor, ctxLabel } from '../../lib/helpers'
import { RecurrenteModal } from '../modals/RecurrenteModal'

function freqDetail(r: { freq: string; day_of_month: string }) {
  if (r.freq === 'diaria') return 'Todos los días'
  if (r.freq === 'semanal') return `Cada ${r.day_of_month}`
  return r.day_of_month === 'ultimo' ? 'Último día del mes' : `Día ${r.day_of_month} del mes`
}

export function RecurrentesView() {
  const recurrentes = useStore(s => s.recurrentes)
  const [modalOpen, setModalOpen] = useState(false)

  const sorted = [...recurrentes].sort((a, b) => a.context.localeCompare(b.context) || a.title.localeCompare(b.title))

  return (
    <div className="animate-fade-in p-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-serif text-[26px] font-light mb-0.5">Recurrentes</h1>
          <p className="text-gray-500 text-[13px]">Todos los contextos · {recurrentes.length} configuradas</p>
        </div>
        <button onClick={() => setModalOpen(true)}
          className="text-xs bg-claude border-claude text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors cursor-pointer">
          + Nueva recurrente
        </button>
      </div>

      <div className="flex flex-col gap-2 max-w-[760px]">
        {sorted.map(r => (
          <div key={r.id} className="bg-bg2 border border-black/7 rounded-xl p-3.5 shadow-sm flex items-start gap-3">
            <div className="w-2.5 h-2.5 rounded-full shrink-0 mt-1" style={{ background: ctxColor(r.context) }} title={ctxLabel(r.context)} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="text-[13px] font-medium">{r.title}</div>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0" style={{ background: ctxColor(r.context) + '12', color: ctxColor(r.context) }}>{r.freq}</span>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg4 text-gray-500">{ctxLabel(r.context)}</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg4 text-gray-400">{freqDetail(r)} · {r.time_minutes}min</span>
                {r.clients && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-agencia/7 text-agencia">{r.clients.name}</span>}
                {(r.cats || []).slice(0, 3).map(c => (
                  <span key={c} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg4 text-gray-400">#{c}</span>
                ))}
              </div>
            </div>
          </div>
        ))}
        {!recurrentes.length && (
          <div className="text-center py-7 text-gray-400 text-[13px]">Sin recurrentes configuradas</div>
        )}
      </div>

      {modalOpen && <RecurrenteModal onClose={() => setModalOpen(false)} />}
    </div>
  )
}
