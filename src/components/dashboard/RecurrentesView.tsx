import { useState, useEffect } from 'react'
import { useStore } from '../../lib/store'
import { ctxColor, ctxLabel, nextRecurringDueDate, fmtDue, addDaysISO } from '../../lib/helpers'
import { RecurrentInstanceCard } from '../tasks/RecurrentInstanceCard'
import { supabase } from '../../lib/supabase'
import type { Recurrente } from '../../lib/types'

function freqDetail(r: { freq: string; day_of_month: string }) {
  if (r.freq === 'diaria') return 'Todos los días'
  if (r.freq === 'semanal') return `Cada ${r.day_of_month}`
  return r.day_of_month === 'ultimo' ? 'Último día del mes' : `Día ${r.day_of_month} del mes`
}

function fmtHorasShort(h: number | null): string {
  if (!h) return ''
  if (h < 1) return `${Math.round(h * 60)}min`
  return `${h % 1 === 0 ? h : h.toFixed(1)}h`
}

// Calcula la fecha de CREACIÓN de la próxima instancia (= due - anticipation_days)
function nextCreateDate(r: Recurrente): string {
  const due = nextRecurringDueDate(r)
  const anticipation = r.anticipation_days ?? 3
  return addDaysISO(due, -anticipation)
}

interface InstanceInfo {
  task_id: number
  instance_date: string
  task_title: string | null
}

function RecurrenteCard({
  r,
  defaultExpanded,
  lastInstance,
}: {
  r: Recurrente
  defaultExpanded: boolean
  lastInstance: InstanceInfo | null
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const openEdit = useStore(s => s.openRecurrentEdit)
  const openDetail = useStore(s => s.openDetail)
  const accent = ctxColor(r.context)
  const nextDue = nextRecurringDueDate(r)
  const createDate = nextCreateDate(r)
  const dueLabel = fmtDue(nextDue)
  const hasDelegate = !!(r.delegate_to || r.delegate_role)
  const delegateName = r.delegate_to || r.delegate_role || ''

  return (
    <div>
      <div
        onClick={() => openEdit(r.id)}
        className="bg-bg2 border border-black/7 rounded-xl p-3.5 shadow-sm flex items-start gap-3 cursor-pointer hover:border-black/13 hover:shadow-md transition-all"
      >
        <button
          onClick={e => { e.stopPropagation(); setExpanded(x => !x) }}
          className="text-[10px] text-gray-400 hover:text-claude shrink-0 mt-1 w-3 cursor-pointer"
          title={expanded ? 'Contraer próxima instancia' : 'Ver próxima instancia'}
        >
          {expanded ? '▼' : '▶'}
        </button>
        <div className="w-2.5 h-2.5 rounded-full shrink-0 mt-1" style={{ background: accent }} title={ctxLabel(r.context)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="text-[13px] font-medium">{r.title}</div>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0" style={{ background: accent + '12', color: accent }}>{r.freq}</span>
          </div>

          {/* Badges de metadatos */}
          <div className="flex gap-1.5 flex-wrap mb-1.5">
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg4 text-gray-500">{ctxLabel(r.context)}</span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg4 text-gray-400">{freqDetail(r)}</span>
            {r.estimated_hours ? (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg4 text-gray-400">⏱ {fmtHorasShort(r.estimated_hours)}</span>
            ) : null}
            {r.anticipation_days ? (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg4 text-gray-400">
                {r.anticipation_days === 1 ? '1 día antes' : r.anticipation_days === 7 ? '1 sem antes' : r.anticipation_days === 14 ? '2 sem antes' : r.anticipation_days === 30 ? '1 mes antes' : `${r.anticipation_days}d antes`}
              </span>
            ) : null}
            {hasDelegate && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded font-medium"
                style={{ background: '#7c3aed14', color: '#7c3aed' }}>
                👤 Delega → {delegateName}
                {r.delegate_return_days ? ` (${r.delegate_return_days}d antes)` : ''}
              </span>
            )}
            {r.clients && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-agencia/7 text-agencia">{r.clients.name}</span>}
            {(r.cats || []).slice(0, 2).map(c => (
              <span key={c} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg4 text-gray-400">#{c}</span>
            ))}
          </div>

          {/* Próxima instancia + última creada */}
          <div className="flex gap-3 flex-wrap items-center">
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-gray-400">Próxima:</span>
              <span className="text-[10px] font-mono font-medium"
                style={{ color: dueLabel?.urgent ? '#dc2626' : '#6b6860' }}>
                {nextDue} {createDate !== nextDue ? `(crear ${createDate})` : ''}
              </span>
            </div>
            {lastInstance ? (
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-gray-400">Última:</span>
                <button
                  onClick={e => { e.stopPropagation(); openDetail(lastInstance.task_id) }}
                  className="text-[10px] font-mono text-blue-600 hover:text-blue-700 hover:underline cursor-pointer"
                  title={lastInstance.task_title || `Instancia del ${lastInstance.instance_date}`}
                >
                  {lastInstance.instance_date}
                </button>
              </div>
            ) : (
              <span className="text-[10px] text-gray-400">Sin instancias aún</span>
            )}
          </div>
        </div>
      </div>
      {expanded && (
        <div className="ml-6 mt-1 border-l-2 border-claude/15 pl-2.5">
          <RecurrentInstanceCard recurrente={r} date={nextDue} variant="nested" />
        </div>
      )}
    </div>
  )
}

// `context` indefinido = vista global (todos los contextos, con filtro por contexto).
// `context` definido = vista por contexto (subconjunto filtrado; agencia agrega filtro por cliente).
export function RecurrentesView({ context }: { context?: string } = {}) {
  const recurrentes = useStore(s => s.recurrentes)
  const clients = useStore(s => s.clients)
  const openCreate = useStore(s => s.openRecurrentCreate)
  const [ctxFilter, setCtxFilter] = useState('all')
  const [clientFilter, setClientFilter] = useState<number | 'all'>('all')
  const [lastInstances, setLastInstances] = useState<Record<number, InstanceInfo>>({})

  // Cargar la última instancia creada por cada recurrente
  useEffect(() => {
    async function fetchInstances() {
      const { data } = await supabase
        .from('recurrente_instances')
        .select('recurrente_id, task_id, instance_date, tasks(title)')
        .order('instance_date', { ascending: false })
      if (!data) return
      const map: Record<number, InstanceInfo> = {}
      for (const row of data) {
        // Solo guardar la última (primera por orden desc)
        if (!map[row.recurrente_id]) {
          map[row.recurrente_id] = {
            task_id: row.task_id,
            instance_date: row.instance_date,
            task_title: (row as any).tasks?.title ?? null,
          }
        }
      }
      setLastInstances(map)
    }
    fetchInstances()
  }, [recurrentes])

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
        <button onClick={() => openCreate({ context })}
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
          <RecurrenteCard
            key={r.id}
            r={r}
            defaultExpanded={false}
            lastInstance={lastInstances[r.id] ?? null}
          />
        ))}
        {!sorted.length && (
          <div className="text-center py-7 text-gray-400 text-[13px]">Sin recurrentes configuradas</div>
        )}
      </div>
    </div>
  )
}
