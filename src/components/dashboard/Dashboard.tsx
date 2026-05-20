import { useStore } from '../../lib/store'
import { getGreeting } from '../../lib/helpers'
import { TaskList } from '../tasks/TaskList'

function StatCard({ label, value, color, borderColor }: { label: string; value: number; color?: string; borderColor?: string }) {
  return (
    <div className="bg-bg2 border border-black/7 rounded-xl p-3.5 shadow-sm" style={borderColor ? { borderColor } : {}}>
      <div className="text-[11px] text-gray-400 font-mono mb-1 tracking-wider">{label}</div>
      <div className="text-2xl font-medium" style={color ? { color } : {}}>{value}</div>
      <div className="text-[11px] text-gray-400 mt-0.5">tareas</div>
    </div>
  )
}

export function Dashboard() {
  const { tasks } = useStore()
  const active = tasks.filter(t => !t.done)
  const banco = active.filter(t => t.context === 'banco')
  const agencia = active.filter(t => t.context === 'agencia')
  const personal = active.filter(t => t.context === 'personal')
  const overdue = active.filter(t => t.due_date && new Date(t.due_date + 'T00:00:00') < new Date(new Date().toDateString())).length

  return (
    <div className="animate-fade-in p-5">
      <h1 className="font-serif text-[26px] font-light mb-0.5">{getGreeting()}</h1>
      <p className="text-gray-500 text-[13px] mb-5">
        {active.length} tareas activas{overdue ? ` · ${overdue} vencidas` : ''}
      </p>

      <div className="grid grid-cols-4 gap-2.5 mb-5">
        <StatCard label="Total activo" value={active.length} />
        <StatCard label="Banco" value={banco.length} color="#2563eb" borderColor="rgba(37,99,235,0.2)" />
        <StatCard label="Agencia" value={agencia.length} color="#0d9488" borderColor="rgba(13,148,136,0.2)" />
        <StatCard label="Propios" value={personal.length} color="#d97706" borderColor="rgba(217,119,6,0.2)" />
      </div>

      <div className="grid grid-cols-[1fr_360px] gap-4 items-start">
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <div className="text-[11px] font-mono text-gray-400 tracking-wider uppercase">🔴 Urgente</div>
          </div>
          <TaskList tasks={active.filter(t => t.priority === 'alta')} emptyText="Sin urgentes" />

          <div className="flex items-center justify-between mb-2.5 mt-5">
            <div className="text-[11px] font-mono text-gray-400 tracking-wider uppercase">🟡 Esta semana</div>
          </div>
          <TaskList tasks={active.filter(t => t.priority === 'media')} emptyText="Sin tareas esta semana" />

          <div className="flex items-center justify-between mb-2.5 mt-5">
            <div className="text-[11px] font-mono text-gray-400 tracking-wider uppercase">🟢 Proximamente</div>
          </div>
          <TaskList tasks={active.filter(t => t.priority === 'baja')} emptyText="Sin tareas proximas" />
        </div>

        {/* Claude Panel */}
        <div className="bg-bg2 border border-black/7 rounded-[14px] overflow-hidden shadow-md">
          <div className="p-3 border-b border-black/7 flex items-center gap-2.5">
            <div className="w-[26px] h-[26px] rounded-full bg-claude/7 border border-claude/20 flex items-center justify-center text-[13px]">✦</div>
            <div>
              <div className="text-[13px] font-medium">Agente Claude</div>
              <div className="text-[11px] text-gray-400">Supabase ✓ · {active.length} tareas activas</div>
            </div>
          </div>
          <div className="p-2.5 border-b border-black/7 flex gap-1.5 flex-wrap">
            {['Priorizar dia', 'Email seguimiento', 'Resumen', 'Tiempo total'].map(chip => (
              <span key={chip} className="text-[11px] text-gray-500 bg-bg3 border border-black/7 px-2 py-1 rounded-full cursor-pointer hover:border-claude/20 hover:text-claude hover:bg-claude/7 font-mono transition-all">
                {chip}
              </span>
            ))}
          </div>
          <div className="h-[230px] overflow-y-auto p-3 flex flex-col gap-2">
            <div className="max-w-[90%] self-start">
              <div className="px-3 py-2 rounded-[10px] text-[13px] leading-relaxed bg-bg3 border border-black/7 rounded-bl-sm">
                Hola. Haz clic en cualquier tarea para abrir una conversacion conmigo sobre ese trabajo especifico. Supabase conectado ✓
              </div>
            </div>
          </div>
          <div className="p-2.5 border-t border-black/7 flex gap-2 bg-bg3">
            <textarea
              className="flex-1 bg-bg2 border border-black/7 rounded-lg px-3 py-2 text-[13px] resize-none outline-none focus:border-claude/20"
              placeholder="Pregunta o pide algo..."
              rows={1}
            />
            <button className="bg-claude text-white px-3.5 py-2 rounded-lg text-[13px] hover:bg-purple-700 transition-colors cursor-pointer">
              ↑
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
