import { useEffect, useState } from 'react'
import { useStore } from '../../lib/store'
import { TaskList } from '../tasks/TaskList'
import { KanbanBoard } from './KanbanBoard'
import { RecurrentInstanceCard } from '../tasks/RecurrentInstanceCard'
import { ctxColor, todayISO, clientBadge, nextRecurringDueDate } from '../../lib/helpers'
import { WAITING_STATES } from '../../lib/constants'
import { FilterPills, GENERAL_PILLS, matchesGeneralType, generalIncludesRecurrentes, loadFilters, saveFilters, type GeneralType } from '../tasks/TypeFilterPills'
import { WaitingOverdueRow } from '../tasks/WaitingOverdueRow'
import type { Task } from '../../lib/types'

type AgenciaMode = 'list' | 'porcliente' | 'kanban'
type KanbanClientFilter = 'all' | 'none' | number

const STORAGE_KEY = 'agencia_view_mode'

function loadMode(): AgenciaMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'list' || v === 'porcliente' || v === 'kanban') return v
  } catch { /* ignore */ }
  return 'porcliente'
}

const PRIO_ORDER: Record<string, number> = { alta: 0, media: 1, baja: 2 }

// Orden por prioridad (alta → baja) y luego por fecha (más cercana primero,
// sin fecha al final). Usado en modo Lista y dentro de cada grupo en "Por cliente".
function sortByPrioDate(a: Task, b: Task): number {
  const dp = (PRIO_ORDER[a.priority] ?? 1) - (PRIO_ORDER[b.priority] ?? 1)
  if (dp !== 0) return dp
  if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
  if (a.due_date) return -1
  if (b.due_date) return 1
  return 0
}

export function AgenciaView() {
  const tasks = useStore(s => s.tasks)
  const clients = useStore(s => s.clients)
  const recurrentes = useStore(s => s.recurrentes)
  const openCapture = useStore(s => s.openCapture)
  const [mode, setMode] = useState<AgenciaMode>(loadMode)
  // Filtro por cliente del modo Kanban (no persiste — solo dentro de la visita).
  const [kanbanClient, setKanbanClient] = useState<KanbanClientFilter>('all')
  // Estado de colapso por cliente en modo "Por cliente" (transient).
  const [collapsedClients, setCollapsedClients] = useState<Record<string, boolean>>({})
  // Filtros de tipo (pills) — persiste en localStorage (clave propia).
  // Combinable con el filtro de cliente del Kanban.
  const [typeFilters, setTypeFilters] = useState<Set<GeneralType>>(() => loadFilters<GeneralType>('agencia_type_filters'))

  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, mode) } catch { /* ignore */ } }, [mode])
  useEffect(() => { saveFilters('agencia_type_filters', typeFilters) }, [typeFilters])

  const active = tasks.filter(t => !t.done && t.context === 'agencia' && !t.parent_task_id && !t.es_recordatorio && !t.archived_at && matchesGeneralType(t, typeFilters))
  const agClients = clients.filter(c => c.context === 'agencia').sort((a, b) => a.name.localeCompare(b.name))
  const showRecurrentes = generalIncludesRecurrentes(typeFilters)

  // Atrasadas (común a Lista / Por cliente). Se separan en dos buckets:
  // depende_vos vs esperando_vencida (status en WAITING_STATES).
  const today = todayISO()
  const overdueAll = active.filter(t => t.due_date && t.due_date < today)
    .sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1))
  const atrasadas = overdueAll.filter(t => !WAITING_STATES.includes(t.status))
  const esperandoVencidas = overdueAll.filter(t => WAITING_STATES.includes(t.status))

  // Recurrentes de agencia con su próxima fecha calculada
  const recInstances = showRecurrentes
    ? recurrentes.filter(r => r.context === 'agencia')
        .map(r => ({ rec: r, date: nextRecurringDueDate(r) }))
        .sort((a, b) => a.date.localeCompare(b.date))
    : []

  // ---- Kanban: tareas filtradas por el dropdown
  const kanbanFiltered = kanbanClient === 'all'
    ? active
    : kanbanClient === 'none'
      ? active.filter(t => !t.client_id)
      : active.filter(t => t.client_id === kanbanClient)
  const kanbanClientName = typeof kanbanClient === 'number'
    ? (agClients.find(c => c.id === kanbanClient)?.name || `Cliente ${kanbanClient}`)
    : kanbanClient === 'none' ? 'Sin cliente asignado' : null

  const headerTitle = mode === 'kanban' && kanbanClientName
    ? `Kanban · ${kanbanClientName}`
    : 'Agencia'

  function toggleCollapse(key: string) {
    setCollapsedClients(prev => ({ ...prev, [key]: !prev[key] }))
  }

  // Lista plana (modo "Lista"): excluye ambos buckets de vencidas
  const listSorted = active.filter(t => !overdueAll.includes(t)).sort(sortByPrioDate)

  // Agrupado por cliente (modo "Por cliente"): excluye ambos buckets para no duplicar.
  const restForGroups = active.filter(t => !overdueAll.includes(t))
  const groupsMap = new Map<number | null, Task[]>()
  for (const t of restForGroups) {
    const key = t.client_id ?? null
    const arr = groupsMap.get(key)
    if (arr) arr.push(t)
    else groupsMap.set(key, [t])
  }
  const groupEntries = [...groupsMap.entries()]
    .map(([cid, ts]) => ({ cid, tasks: [...ts].sort(sortByPrioDate) }))
    .sort((a, b) => {
      if (a.cid == null) return 1
      if (b.cid == null) return -1
      const an = agClients.find(c => c.id === a.cid)?.name || ''
      const bn = agClients.find(c => c.id === b.cid)?.name || ''
      return an.localeCompare(bn)
    })

  return (
    <div className="animate-fade-in p-5">
      <h1 className="font-serif text-[26px] font-light mb-0.5" style={{ color: ctxColor('agencia') }}>
        {headerTitle}
      </h1>
      <p className="text-gray-500 text-[13px] mb-4">{active.length} pendientes</p>

      {/* Toggle de 3 modos (persiste en localStorage) */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="flex bg-bg3 border border-black/7 rounded-lg p-0.5">
          {([
            { v: 'list', l: 'Lista' },
            { v: 'porcliente', l: 'Por cliente' },
            { v: 'kanban', l: 'Kanban' },
          ] as { v: AgenciaMode; l: string }[]).map(o => (
            <button key={o.v} onClick={() => setMode(o.v)}
              className={`text-xs px-3 py-1 rounded-md transition-all cursor-pointer ${
                mode === o.v ? 'bg-bg2 text-gray-900 shadow-sm font-medium' : 'text-gray-400 hover:text-gray-600'
              }`}>
              {o.l}
            </button>
          ))}
        </div>

        {/* Filtro por cliente: solo en modo Kanban */}
        {mode === 'kanban' && (
          <div className="flex items-center gap-1.5 ml-1">
            <span className="text-[11px] font-mono text-gray-400 tracking-wider uppercase">Ver cliente</span>
            <select
              value={kanbanClient === 'all' ? '__all__' : kanbanClient === 'none' ? '__none__' : String(kanbanClient)}
              onChange={e => {
                const v = e.target.value
                if (v === '__all__') setKanbanClient('all')
                else if (v === '__none__') setKanbanClient('none')
                else setKanbanClient(Number(v))
              }}
              className="text-xs bg-bg2 border border-black/7 rounded-md px-2 py-1 cursor-pointer outline-none focus:border-claude/20"
            >
              <option value="__all__">Todos los clientes</option>
              <option value="__none__">Sin cliente asignado</option>
              {agClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {kanbanClient !== 'all' && (
              <button onClick={() => setKanbanClient('all')}
                className="text-[11px] text-gray-400 hover:text-claude cursor-pointer px-1.5"
                title="Limpiar filtro">×</button>
            )}
          </div>
        )}

        {/* Filtros de tipo (pills). Combinable con el filtro de cliente. */}
        <div className="basis-full">
          <FilterPills value={typeFilters} onChange={setTypeFilters} pills={GENERAL_PILLS} />
        </div>
      </div>

      {mode === 'kanban' ? (
        <KanbanBoard items={kanbanFiltered} />
      ) : (
        <div className="max-w-[860px]">
          {atrasadas.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2.5">
                <span className="text-[11px] font-mono tracking-wider uppercase text-danger">🔴 Atrasadas — depende de vos</span>
                <span className="font-mono text-[10px] text-gray-400">· {atrasadas.length} requieren tu acción</span>
              </div>
              <TaskList tasks={atrasadas} />
            </div>
          )}

          {esperandoVencidas.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2.5">
                <span className="text-[11px] font-mono tracking-wider uppercase text-warn">🟡 Esperando respuesta vencida — depende de otro</span>
                <span className="font-mono text-[10px] text-gray-400">· {esperandoVencidas.length} esperando — hacé seguimiento</span>
              </div>
              <div className="flex flex-col gap-1.5">
                {esperandoVencidas.map(t => <WaitingOverdueRow key={t.id} task={t} today={today} />)}
              </div>
            </div>
          )}

          {recInstances.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2.5">
                <span className="text-[11px] font-mono tracking-wider uppercase text-claude">🔄 Recurrentes próximas</span>
                <span className="font-mono text-[10px] text-gray-400 bg-bg4 px-1.5 rounded-full">{recInstances.length}</span>
              </div>
              <div className="flex flex-col gap-1">
                {recInstances.map(i => <RecurrentInstanceCard key={i.rec.id} recurrente={i.rec} date={i.date} />)}
              </div>
            </div>
          )}

          {mode === 'list' ? (
            listSorted.length > 0
              ? <TaskList tasks={listSorted} />
              : !atrasadas.length && !recInstances.length && <div className="text-center py-7 text-gray-400 text-[13px]">Sin tareas</div>
          ) : (
            // Por cliente
            <>
              {groupEntries.map(({ cid, tasks: cts }) => {
                const cb = clientBadge(cid, clients)
                const color = cb?.color || '#6b7280'
                const sigla = cb?.sigla
                const name = cid ? (agClients.find(c => c.id === cid)?.name || `Cliente ${cid}`) : 'Sin cliente asignado'
                const key = cid ?? 'none'
                const isCollapsed = !!collapsedClients[String(key)]
                return (
                  <div key={key} className="mb-5">
                    <div
                      onClick={() => toggleCollapse(String(key))}
                      className="flex items-center gap-2 mb-2.5 pb-1.5 border-b border-black/13 cursor-pointer"
                    >
                      <span className="text-[10px] text-gray-400 w-3" title={isCollapsed ? 'Expandir' : 'Colapsar'}>{isCollapsed ? '▶' : '▼'}</span>
                      {sigla && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded font-medium"
                          style={{ background: color + '14', color }}>{sigla}</span>
                      )}
                      <span className="text-[13px] font-medium" style={{ color }}>{cid ? name : '○ ' + name}</span>
                      <span className="font-mono text-[10px] text-gray-400 bg-bg4 px-1.5 rounded-full">{cts.length}</span>
                      {cid && (
                        <button
                          onClick={e => { e.stopPropagation(); openCapture({ context: 'agencia', clientId: cid }) }}
                          className="ml-auto text-[11px] text-claude bg-claude/7 border border-claude/20 px-2 py-0.5 rounded cursor-pointer hover:bg-claude hover:text-white transition-colors"
                          title="Crear tarea para este cliente"
                        >+ Nueva tarea</button>
                      )}
                    </div>
                    {!isCollapsed && <TaskList tasks={cts} />}
                  </div>
                )
              })}
              {!groupEntries.length && !atrasadas.length && !recInstances.length && (
                <div className="text-center py-7 text-gray-400 text-[13px]">Sin tareas</div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
