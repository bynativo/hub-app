import { useState } from 'react'
import { useStore } from '../../lib/store'
import { ctxColor, ctxLabel } from '../../lib/helpers'
import { RecurrenteModal } from '../modals/RecurrenteModal'
import type { Recurrente } from '../../lib/types'

function freqDetail(r: { freq: string; day_of_month: string }) {
  if (r.freq === 'diaria') return 'Todos los días'
  if (r.freq === 'semanal') return `Cada ${r.day_of_month}`
  return r.day_of_month === 'ultimo' ? 'Último día del mes' : `Día ${r.day_of_month} del mes`
}

// `context` indefinido = vista global (todos los contextos, con filtro por contexto).
// `context` definido = vista por contexto (subconjunto filtrado; agencia agrega filtro por cliente).
export function RecurrentesView({ context }: { context?: string } = {}) {
  const recurrentes = useStore(s => s.recurrentes)
  const clients = useStore(s => s.clients)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Recurrente | null>(null)
  const [ctxFilter, setCtxFilter] = useState('all')
  const [clientFilter, setClientFilter] = useState<number | 'all'>('all')

  // Acotar al contexto si la vista es por contexto
  const scoped = context ? recurrentes.filter(r => r.context === context) : recurrentes
  // En la vista global aplica el filtro por contexto; en la vista por contexto ya está acotado
  const byCtx = context || ctxFilter === 'all' ? scoped : scoped.filter(r => r.context === ctxFilter)
  // Filtro por cliente (solo agencia)
  const base = context === 'agencia' && clientFilter !== 'all' ? byCtx.filter(r => r.client_id === clientFilter) : byCtx
  const sorted = [...base].sort((a, b) => a.context.localeCompare(b.context) || a.title.localeCompare(b.title))

  // Clientes de agencia que tienen recurrentes (para el filtro por cliente)
  const agClients = clients.filter(c => c.context === 'agencia')

  const accent = context ? ctxColor(context) : undefined

  return (
    <div className="animate-fade-in p-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-serif text-[26px] font-light mb-0.5" style={accent ? { color: accent } : {}}>Recurrentes</h1>
          <p className="text-gray-500 text-[13px]">
            {context ? `${ctxLabel(context)} · ` : 'Todos los contextos · '}{scoped.length} configuradas
          </p>
        </div>
        <button onClick={() => setModalOpen(true)}
          className="text-xs bg-claude border-claude text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors cursor-pointer">
          + Nueva recurrente
        </button>
      </div>

      {/* Filtro por contexto: solo en la vista global */}
      {!context && (
        <div className="flex gap-2 mb-4 flex-wrap items-center">
          {[
            { v: 'all', l: 'Todos' },
            { v: 'banco', l: 'Banco Falabella' },
            { v: 'agencia', l: 'Agencia' },
            { v: 'personal', l: 'Personal' },
          ].map(f => {
            const active = ctxFilter === f.v
            const color = f.v === 'all' ? '#7c3aed' : ctxColor(f.v)
            return (
              <button key={f.v} onClick={() => setCtxFilter(f.v)}
                className={`flex items-center gap-1.5 text-xs px-3 py-1 rounded-lg border cursor-pointer transition-all ${active ? 'font-medium' : 'bg-bg3 border-black/7 text-gray-500 hover:bg-bg4'}`}
                style={active ? { background: color + '12', borderColor: color + '33', color } : {}}>
                {f.v !== 'all' && <span className="w-2 h-2 rounded-full" style={{ background: ctxColor(f.v) }} />}
                {f.l}
              </button>
            )
          })}
        </div>
      )}

      {/* Filtro por cliente: solo en la vista de agencia */}
      {context === 'agencia' && agClients.length > 0 && (
        <div className="flex gap-2 mb-4 flex-wrap items-center">
          <button onClick={() => setClientFilter('all')}
            className={`text-xs px-3 py-1 rounded-lg border cursor-pointer transition-all ${clientFilter === 'all' ? 'font-medium border-agencia/33 bg-agencia/12 text-agencia' : 'bg-bg3 border-black/7 text-gray-500 hover:bg-bg4'}`}>
            Todos los clientes
          </button>
          {agClients.map(c => (
            <button key={c.id} onClick={() => setClientFilter(c.id)}
              className={`text-xs px-3 py-1 rounded-lg border cursor-pointer transition-all ${clientFilter === c.id ? 'font-medium border-agencia/33 bg-agencia/12 text-agencia' : 'bg-bg3 border-black/7 text-gray-500 hover:bg-bg4'}`}>
              {c.name}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2 max-w-[760px]">
        {sorted.map(r => (
          <div key={r.id} onClick={() => setEditing(r)}
            className="bg-bg2 border border-black/7 rounded-xl p-3.5 shadow-sm flex items-start gap-3 cursor-pointer hover:border-black/13 hover:shadow-md transition-all">
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
        {!sorted.length && (
          <div className="text-center py-7 text-gray-400 text-[13px]">Sin recurrentes configuradas</div>
        )}
      </div>

      {modalOpen && <RecurrenteModal onClose={() => setModalOpen(false)} preselectContext={context} />}
      {editing && <RecurrenteModal onClose={() => setEditing(null)} recurrente={editing} />}
    </div>
  )
}
