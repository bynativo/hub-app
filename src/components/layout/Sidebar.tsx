import { useStore } from '../../lib/store'

function NavItem({ label, color, view, count }: { label: string; color: string; view: string; count?: number }) {
  const activeView = useStore(s => s.activeView)
  const setView = useStore(s => s.setView)
  const isActive = activeView === view

  return (
    <div
      onClick={() => setView(view)}
      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg mx-2 my-px cursor-pointer transition-all text-[13px] ${
        isActive ? 'bg-bg3 text-gray-900 font-medium' : 'text-gray-500 hover:bg-bg3 hover:text-gray-900'
      }`}
    >
      <div className="w-[7px] h-[7px] rounded-full shrink-0" style={{ background: color }} />
      {label}
      {count !== undefined && (
        <span className="ml-auto font-mono text-[10px] text-gray-400 bg-bg4 px-1.5 rounded-full">
          {count}
        </span>
      )}
    </div>
  )
}

export function Sidebar() {
  const tasks = useStore(s => s.tasks)
  const projects = useStore(s => s.projects)
  const clients = useStore(s => s.clients)
  const presentations = useStore(s => s.presentations)
  const setActiveClient = useStore(s => s.setActiveClient)
  const setView = useStore(s => s.setView)
  const active = tasks.filter(t => !t.done)
  const banco = active.filter(t => t.context === 'banco').length
  const agencia = active.filter(t => t.context === 'agencia').length
  const personal = active.filter(t => t.context === 'personal').length
  const delegados = active.filter(t => t.status === 'Delegado').length
  const agClients = clients.filter(c => c.context === 'agencia')

  return (
    <aside className="w-[230px] shrink-0 bg-bg2 border-r border-black/7 overflow-y-auto py-3 shadow-sm">
      <div className="font-mono text-[10px] text-gray-400 tracking-wider uppercase px-3.5 pb-1 pt-2.5">Principal</div>
      <NavItem label="Dashboard" color="#a09d98" view="dashboard" count={active.length} />
      <NavItem label="Proyectos" color="#7c3aed" view="proyectos" count={projects.length} />
      <NavItem label="Recurrentes" color="#0d9488" view="recurrentes" />

      <div className="h-px bg-black/7 mx-2.5 my-1.5" />
      <div className="font-mono text-[10px] text-gray-400 tracking-wider uppercase px-3.5 pb-1 pt-2.5">Contextos</div>
      <NavItem label="Banco Falabella" color="#2563eb" view="banco" count={banco} />
      <NavItem label="Agencia" color="#0d9488" view="agencia" count={agencia} />

      {agClients.map(c => (
        <div
          key={c.id}
          onClick={() => { setActiveClient(c.id); setView('agencia') }}
          className="flex items-center gap-1.5 py-1 px-2.5 pl-6 rounded-md mx-2 my-px cursor-pointer text-xs text-gray-400 hover:bg-bg3 hover:text-gray-500"
        >
          ↳ {c.name}
        </div>
      ))}

      {delegados > 0 && (
        <NavItem label="Seguimiento ⚠" color="#d97706" view="seguimiento" count={delegados} />
      )}
      <NavItem label="Personal" color="#d97706" view="personal" count={personal} />

      <div className="h-px bg-black/7 mx-2.5 my-1.5" />
      <div className="font-mono text-[10px] text-gray-400 tracking-wider uppercase px-3.5 pb-1 pt-2.5">Herramientas</div>
      <NavItem label="Presentaciones" color="#7c3aed" view="presentaciones" count={presentations.length} />
      <NavItem label="Grilla / Calendario" color="#2563eb" view="grilla" />
    </aside>
  )
}
