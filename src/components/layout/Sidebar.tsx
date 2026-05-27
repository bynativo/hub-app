import { useState } from 'react'
import { useStore } from '../../lib/store'
import { WAITING_STATES } from '../../lib/constants'
import { todayISO, daysUntil, nextWeekRange } from '../../lib/helpers'

const STORAGE_KEY = 'sidebar_collapsed'
function loadCollapsed(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') } catch { return {} }
}

function NavItem({ label, view, count, indent }: { label: string; view: string; count?: number; indent?: boolean }) {
  const activeView = useStore(s => s.activeView)
  const setView = useStore(s => s.setView)
  const setActiveClient = useStore(s => s.setActiveClient)
  const isActive = activeView === view

  return (
    <div
      onClick={() => { setActiveClient(null); setView(view) }}
      className={`flex items-center gap-2 py-1.5 rounded-lg mx-2 my-px cursor-pointer transition-all text-[13px] ${
        indent ? 'pl-6 pr-2.5' : 'px-2.5'
      } ${
        isActive ? 'bg-bg3 text-gray-900 font-medium' : 'text-gray-500 hover:bg-bg3 hover:text-gray-900'
      }`}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span className="ml-auto font-mono text-[10px] text-gray-400 bg-bg4 px-1.5 rounded-full">
          {count}
        </span>
      )}
    </div>
  )
}

function GroupHeader({ label, color }: { label: string; color?: string }) {
  return (
    <div className="flex items-center gap-1.5 px-3.5 pb-1 pt-3.5">
      {color && <div className="w-[7px] h-[7px] rounded-full" style={{ background: color }} />}
      <span className="font-mono text-[10px] text-gray-400 tracking-wider uppercase">{label}</span>
    </div>
  )
}

function CollapsibleHeader({ label, color, open, onToggle }: { label: string; color: string; open: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} className="w-full flex items-center gap-1.5 px-3.5 pb-1 pt-3.5 cursor-pointer group">
      {color && <div className="w-[7px] h-[7px] rounded-full" style={{ background: color }} />}
      <span className="font-mono text-[10px] text-gray-400 tracking-wider uppercase group-hover:text-gray-600 transition-colors">{label}</span>
      <span className="ml-auto text-[9px] text-gray-400 group-hover:text-gray-600">{open ? '▾' : '▸'}</span>
    </button>
  )
}

export function Sidebar() {
  const tasks = useStore(s => s.tasks)
  const openCapture = useStore(s => s.openCapture)
  const active = tasks.filter(t => !t.done && !t.parent_task_id && !t.archived_at)

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(loadCollapsed)
  function toggle(key: string) {
    setCollapsed(prev => {
      const next = { ...prev, [key]: !prev[key] }
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }

  const today = todayISO()
  const hoyCount = active.filter(t => t.due_date === today).length
  const semanaCount = active.filter(t => {
    const d = daysUntil(t.due_date)
    return d !== null && d >= 0 && d <= 7
  }).length
  const pw = nextWeekRange()
  const proximaCount = active.filter(t => t.due_date && t.due_date >= pw.from && t.due_date <= pw.to).length
  const seguimientoCount = active.filter(t => t.es_recordatorio || WAITING_STATES.includes(t.status)).length

  const ctxCount = (ctx: string) => active.filter(t => t.context === ctx && !t.es_recordatorio).length

  return (
    <aside className="w-[230px] shrink-0 bg-bg2 border-r border-black/7 overflow-y-auto py-3 shadow-sm flex flex-col">
      {/* Capturar destacado (siempre visible) */}
      <div className="px-3 pb-1">
        <button
          onClick={() => openCapture()}
          className="w-full flex items-center justify-center gap-1.5 bg-claude text-white text-[13px] font-medium px-3 py-2 rounded-lg hover:bg-purple-700 transition-colors cursor-pointer shadow-sm"
        >
          <span className="text-base leading-none">+</span> Capturar
        </button>
      </div>

      {/* General (siempre visible) */}
      <GroupHeader label="General" />
      <NavItem label="Hoy" view="hoy" count={hoyCount} />
      <NavItem label="Esta semana" view="semana" count={semanaCount} />
      <NavItem label="Próxima semana" view="proxima-semana" count={proximaCount} />
      <NavItem label="Seguimiento" view="seguimiento" count={seguimientoCount} />
      <NavItem label="Calendario" view="calendario" />
      <NavItem label="Recurrentes" view="recurrentes" />
      <NavItem label="Contactos" view="contactos" />

      <CollapsibleHeader label="Banco Falabella" color="#2563eb" open={!collapsed.banco} onToggle={() => toggle('banco')} />
      {!collapsed.banco && (
        <>
          <NavItem label="Tareas" view="banco-tareas" count={ctxCount('banco')} indent />
          <NavItem label="Proyectos" view="banco-proyectos" indent />
          <NavItem label="Presentaciones" view="banco-presentaciones" indent />
          <NavItem label="Calendario RRSS" view="banco-grilla" indent />
        </>
      )}

      <CollapsibleHeader label="Agencia" color="#0d9488" open={!collapsed.agencia} onToggle={() => toggle('agencia')} />
      {!collapsed.agencia && (
        <>
          <NavItem label="Tareas" view="agencia-tareas" count={ctxCount('agencia')} indent />
          <NavItem label="Clientes" view="agencia-clientes" indent />
          <NavItem label="Equipo" view="agencia-equipo" indent />
          <NavItem label="Presentaciones" view="agencia-presentaciones" indent />
          <NavItem label="Calendario RRSS" view="agencia-grilla" indent />
        </>
      )}

      <CollapsibleHeader label="Personal" color="#d97706" open={!collapsed.personal} onToggle={() => toggle('personal')} />
      {!collapsed.personal && (
        <>
          <NavItem label="Tareas" view="personal-tareas" count={ctxCount('personal')} indent />
          <NavItem label="Proyectos" view="personal-proyectos" indent />
        </>
      )}
    </aside>
  )
}
