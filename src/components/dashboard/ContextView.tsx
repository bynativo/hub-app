import { useEffect, useState } from 'react'
import { useStore } from '../../lib/store'
import { TaskList } from '../tasks/TaskList'
import { KanbanBoard } from './KanbanBoard'
import { ctxLabel, ctxColor, todayISO, nextRecurringDueDate } from '../../lib/helpers'
import { STATUS_COLUMNS, STATUS_ICON, STATUS_COLOR, WAITING_STATES } from '../../lib/constants'
import { RecurrentInstanceCard } from '../tasks/RecurrentInstanceCard'
import { WaitingTaskCard } from '../tasks/WaitingTaskCard'
import { FilterPills, GENERAL_PILLS, PERSONAL_PILLS, matchesGeneralType, matchesPersonalType, generalIncludesRecurrentes, personalIncludesRecurrentes, loadFilters, saveFilters, type GeneralType, type PersonalType } from '../tasks/TypeFilterPills'
import type { Task } from '../../lib/types'

// Filtro local por cliente en la vista de tareas de agencia.
// 'all'  → todas las tareas (agrupadas por cliente cuando hay varios)
// number → solo las del cliente con ese id
// 'none' → solo las tareas sin cliente asignado
type ClientFilter = 'all' | 'none' | number

export function ContextView({ context }: { context: string }) {
  const tasks = useStore(s => s.tasks)
  const clients = useStore(s => s.clients)
  const recurrentes = useStore(s => s.recurrentes)
  const [mode, setMode] = useState<'list' | 'kanban'>('list')
  const [clientFilter, setClientFilter] = useState<ClientFilter>('all')
  // Pills distintos según contexto. Personal no tiene Contenido ni Influencer.
  const isPersonal = context === 'personal'
  const filterStorageKey = `${context}_type_filters`
  // Cada contexto tiene su propia clave en localStorage. El estado se carga
  // bajo demanda y se reinicia al cambiar de contexto (useEffect abajo).
  const [typeFiltersGeneral, setTypeFiltersGeneral] = useState<Set<GeneralType>>(() => loadFilters<GeneralType>(filterStorageKey))
  const [typeFiltersPersonal, setTypeFiltersPersonal] = useState<Set<PersonalType>>(() => loadFilters<PersonalType>(filterStorageKey))

  // Reset al cambiar de contexto (banco↔personal sin desmontar). Releemos
  // del localStorage del nuevo contexto.
  useEffect(() => {
    setClientFilter('all')
    if (isPersonal) setTypeFiltersPersonal(loadFilters<PersonalType>(`${context}_type_filters`))
    else setTypeFiltersGeneral(loadFilters<GeneralType>(`${context}_type_filters`))
  }, [context, isPersonal])

  useEffect(() => {
    if (isPersonal) saveFilters(filterStorageKey, typeFiltersPersonal)
    else saveFilters(filterStorageKey, typeFiltersGeneral)
  }, [typeFiltersGeneral, typeFiltersPersonal, filterStorageKey, isPersonal])

  const active = tasks.filter(t => !t.done && t.context === context && !t.parent_task_id && !t.es_recordatorio && !t.archived_at
    && (isPersonal ? matchesPersonalType(t, typeFiltersPersonal) : matchesGeneralType(t, typeFiltersGeneral)))
  const showRecurrentes = isPersonal ? personalIncludesRecurrentes(typeFiltersPersonal) : generalIncludesRecurrentes(typeFiltersGeneral)

  const agClients = clients.filter(c => c.context === 'agencia').sort((a, b) => a.name.localeCompare(b.name))
  const selectedClient = typeof clientFilter === 'number' ? agClients.find(c => c.id === clientFilter) : null

  // En agencia aplicamos el filtro local. Otros contextos: sin filtro.
  const filtered = context !== 'agencia' || clientFilter === 'all'
    ? active
    : clientFilter === 'none'
      ? active.filter(t => !t.client_id)
      : active.filter(t => t.client_id === clientFilter)

  // Atrasadas: due_date < hoy. Se splittean en dos secciones (depende de vos
  // vs esperando respuesta vencida) y se excluyen del agrupado por status/cliente
  // para no duplicar.
  const today = todayISO()
  const overdueAll = filtered.filter(t => t.due_date && t.due_date < today)
    .sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1))
  const atrasadasDependeVos = overdueAll.filter(t => !WAITING_STATES.includes(t.status))
  const esperandoVencidas = overdueAll.filter(t => WAITING_STATES.includes(t.status))
  const restFiltered = filtered.filter(t => !(t.due_date && t.due_date < today))

  // Recurrentes del contexto (respetando el filtro por cliente en agencia)
  // ordenadas por su próxima fecha. Sección dedicada arriba — no se agrupan
  // por status porque las instancias virtuales no tienen status.
  const recScope = recurrentes.filter(r => r.context === context)
  const recForClient = context !== 'agencia' || clientFilter === 'all'
    ? recScope
    : clientFilter === 'none'
      ? recScope.filter(r => !r.client_id)
      : recScope.filter(r => r.client_id === clientFilter)
  const recInstances = showRecurrentes
    ? recForClient.map(r => ({ rec: r, date: nextRecurringDueDate(r) }))
        .sort((a, b) => a.date.localeCompare(b.date))
    : []

  const columns = STATUS_COLUMNS[context] || STATUS_COLUMNS.banco
  const kanbanCols = columns.map(s => ({ key: s, label: s, statuses: [s] }))
  // Estados a mostrar en Lista: las columnas del contexto + cualquier otro estado presente.
  const extra = [...new Set(restFiltered.map(t => t.status || 'Inbox').filter(s => !columns.includes(s)))]
  const groupOrder = [...columns, ...extra]

  // Agrupamos por cliente solo en agencia con filtro = 'all' (mostrar todas).
  const groupByClient = context === 'agencia' && clientFilter === 'all'
  const clientEntries = (() => {
    if (!groupByClient) return null
    const byClient = new Map<number | null, Task[]>()
    for (const t of restFiltered) {
      const key = t.client_id ?? null
      const arr = byClient.get(key)
      if (arr) arr.push(t)
      else byClient.set(key, [t])
    }
    return [...byClient.entries()]
      .map(([cid, ts]) => ({
        cid,
        name: cid ? (agClients.find(c => c.id === cid)?.name || `Cliente ${cid}`) : 'Sin cliente asignado',
        tasks: ts,
      }))
      .sort((a, b) => a.cid == null ? 1 : b.cid == null ? -1 : a.name.localeCompare(b.name))
  })()

  function renderStatusGroups(group: Task[]) {
    return groupOrder.map(st => {
      const sub = group.filter(t => (t.status || 'Inbox') === st)
      if (!sub.length) return null
      const color = STATUS_COLOR[st] || '#6b7280'
      return (
        <div key={st}>
          <div className="flex items-center gap-2 mb-2.5 mt-4 first:mt-0">
            <span className="text-[11px] font-mono tracking-wider uppercase" style={{ color }}>{STATUS_ICON[st] || '•'} {st}</span>
            <span className="font-mono text-[10px] text-gray-400 bg-bg4 px-1.5 rounded-full">{sub.length}</span>
          </div>
          <TaskList tasks={sub} />
        </div>
      )
    })
  }

  const headerTitle = context === 'agencia' && selectedClient
    ? `Tareas · ${selectedClient.name}`
    : context === 'agencia' && clientFilter === 'none'
      ? 'Tareas · Sin cliente asignado'
      : ctxLabel(context)

  return (
    <div className="animate-fade-in p-5">
      <h1 className="font-serif text-[26px] font-light mb-0.5" style={{ color: ctxColor(context) }}>
        {headerTitle}
      </h1>
      <p className="text-gray-500 text-[13px] mb-4">{filtered.length} pendientes</p>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
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

        {context === 'agencia' && (
          <div className="flex items-center gap-1.5 ml-1">
            <span className="text-[11px] font-mono text-gray-400 tracking-wider uppercase">Ver cliente</span>
            <select
              value={clientFilter === 'all' ? '__all__' : clientFilter === 'none' ? '__none__' : String(clientFilter)}
              onChange={e => {
                const v = e.target.value
                if (v === '__all__') setClientFilter('all')
                else if (v === '__none__') setClientFilter('none')
                else setClientFilter(Number(v))
              }}
              className="text-xs bg-bg2 border border-black/7 rounded-md px-2 py-1 cursor-pointer outline-none focus:border-claude/20"
            >
              <option value="__all__">Todos los clientes</option>
              <option value="__none__">Sin cliente asignado</option>
              {agClients.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {clientFilter !== 'all' && (
              <button onClick={() => setClientFilter('all')}
                className="text-[11px] text-gray-400 hover:text-claude cursor-pointer px-1.5"
                title="Limpiar filtro">×</button>
            )}
          </div>
        )}

        {/* Filtros de tipo (pills). Personal usa un set reducido. */}
        <div className="basis-full">
          {isPersonal
            ? <FilterPills value={typeFiltersPersonal} onChange={setTypeFiltersPersonal} pills={PERSONAL_PILLS} />
            : <FilterPills value={typeFiltersGeneral} onChange={setTypeFiltersGeneral} pills={GENERAL_PILLS} />}
        </div>
      </div>

      {mode === 'kanban' ? (
        <KanbanBoard items={filtered} columns={kanbanCols} />
      ) : !filtered.length && !recInstances.length ? (
        <div className="text-center py-7 text-gray-400 text-[13px]">Sin tareas</div>
      ) : (
        <div className="max-w-[860px]">
          {atrasadasDependeVos.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2.5">
                <span className="text-[11px] font-mono tracking-wider uppercase text-danger">🔴 Atrasadas — requieren tu acción</span>
                <span className="font-mono text-[10px] text-gray-400 bg-bg4 px-1.5 rounded-full">{atrasadasDependeVos.length}</span>
              </div>
              <TaskList tasks={atrasadasDependeVos} />
            </div>
          )}

          {esperandoVencidas.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2.5">
                <span className="text-[11px] font-mono tracking-wider uppercase text-warn">🟡 Esperando respuesta vencida — hacé seguimiento</span>
                <span className="font-mono text-[10px] text-gray-400 bg-bg4 px-1.5 rounded-full">{esperandoVencidas.length}</span>
              </div>
              <div className="flex flex-col gap-1.5">
                {esperandoVencidas.map(t => <WaitingTaskCard key={t.id} task={t} today={today} />)}
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
          {groupByClient && clientEntries ? (
            clientEntries.map(({ cid, name, tasks: clientTasks }) => (
              <div key={cid ?? 'sin'} className="mb-6">
                <div className="flex items-center gap-2 mb-3 pb-1.5 border-b border-black/13">
                  <span className="text-[13px] font-medium" style={{ color: cid ? '#0d9488' : '#6b7280' }}>
                    {cid ? `📁 ${name}` : '○ Sin cliente asignado'}
                  </span>
                  <span className="font-mono text-[10px] text-gray-400 bg-bg4 px-1.5 rounded-full">{clientTasks.length}</span>
                </div>
                {renderStatusGroups(clientTasks)}
              </div>
            ))
          ) : (
            renderStatusGroups(restFiltered)
          )}
        </div>
      )}
    </div>
  )
}
