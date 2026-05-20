import { useStore } from '../../lib/store'
import { ctxColor } from '../../lib/helpers'

export function ProjectsView() {
  const { projects, tasks } = useStore()

  function getPct(projId: number) {
    const all = tasks.filter(t => t.project_id === projId)
    if (!all.length) return 0
    return Math.round(all.filter(t => t.done).length / all.length * 100)
  }

  return (
    <div className="animate-fade-in p-5">
      <h1 className="font-serif text-[26px] font-light mb-0.5">Proyectos</h1>
      <p className="text-gray-500 text-[13px] mb-5">Campanas · Clientes · Always-on</p>

      <div className="grid gap-2.5">
        {projects.map(p => {
          const pct = getPct(p.id)
          const taskCount = tasks.filter(t => t.project_id === p.id).length
          const pendCount = tasks.filter(t => t.project_id === p.id && !t.done).length

          return (
            <div key={p.id} className="bg-bg2 border border-black/7 rounded-xl p-4 cursor-pointer hover:border-black/13 hover:shadow-md hover:-translate-y-px transition-all shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[15px] font-medium">{p.name}</div>
                <div className="flex items-center gap-2 w-28">
                  <div className="flex-1 h-[5px] bg-bg4 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-400" style={{ width: `${pct}%`, background: ctxColor(p.context) }} />
                  </div>
                  <span className="text-[10px] font-mono text-gray-400">{pct}%</span>
                </div>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                      style={{ background: ctxColor(p.context) + '12', color: ctxColor(p.context) }}>
                  {p.context}
                </span>
                {p.type && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg4 text-gray-400">{p.type}</span>
                )}
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg4 text-gray-400">
                  {taskCount} tareas · {pendCount} pendientes
                </span>
                {p.clients && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-agencia/7 text-agencia">{p.clients.name}</span>
                )}
              </div>
            </div>
          )
        })}
        {!projects.length && (
          <div className="text-center py-7 text-gray-400 text-[13px]">Sin proyectos</div>
        )}
      </div>
    </div>
  )
}
