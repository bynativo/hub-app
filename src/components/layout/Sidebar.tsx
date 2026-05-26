import { useStore } from '../../lib/store'
import { WAITING_STATES } from '../../lib/constants'
import { todayISO, daysUntil } from '../../lib/helpers'

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

export function Sidebar() {
  const tasks = useStore(s => s.tasks)
  const openCapture = useStore(s => s.openCapture)
  const active = tasks.filter(t => !t.done && !t.parent_task_id)

  const today = todayISO()
  const hoyCount = active.filter(t => t.due_date === today).length
  const semanaCount = active.filter(t => {
    const d = daysUntil(t.due_date)
    return d !== null && d >= 0 && d <= 7
  }).length
  const seguimientoCount = active.filter(t => WAITING_STATES.includes(t.status)).length

  const ctxCount = (ctx: string) => active.filter(t => t.context === ctx).length

  return (
    <aside className="w-[230px] shrink-0 bg-bg2 border-r border-black/7 overflow-y-auto py-3 shadow-sm flex flex-col">
      {/* Capturar destacado */}
      <div className="px-3 pb-1">
        <button
          onClick={() => openCapture()}
          className="w-full flex items-center justify-center gap-1.5 bg-claude text-white text-[13px] font-medium px-3 py-2 rounded-lg hover:bg-purple-700 transition-colors cursor-pointer shadow-sm"
        >
          <span className="text-base leading-none">+</span> Capturar
        </button>
      </div>

      <GroupHeader label="General" />
      <NavItem label="Hoy" view="hoy" count={hoyCount} />
      <NavItem label="Esta semana" view="semana" count={semanaCount} />
      <NavItem label="Seguimiento" view="seguimiento" count={seguimientoCount} />
      <NavItem label="Recurrentes" view="recurrentes" />
      <NavItem label="Contactos" view="contactos" />

      <GroupHeader label="Banco Falabella" color="#2563eb" />
      <NavItem label="Tareas" view="banco-tareas" count={ctxCount('banco')} indent />
      <NavItem label="Proyectos" view="banco-proyectos" indent />
      <NavItem label="Presentaciones" view="banco-presentaciones" indent />
      <NavItem label="Grilla mayo" view="banco-grilla" indent />

      <GroupHeader label="Agencia" color="#0d9488" />
      <NavItem label="Tareas" view="agencia-tareas" count={ctxCount('agencia')} indent />
      <NavItem label="Clientes" view="agencia-clientes" indent />
      <NavItem label="Equipo" view="agencia-equipo" indent />
      <NavItem label="Presentaciones" view="agencia-presentaciones" indent />

      <GroupHeader label="Personal" color="#d97706" />
      <NavItem label="Tareas" view="personal-tareas" count={ctxCount('personal')} indent />
    </aside>
  )
}
