import { useStore } from '../../lib/store'
import { TaskList } from '../tasks/TaskList'

export function SeguimientoView() {
  const { tasks } = useStore()
  const delegados = tasks.filter(t => !t.done && t.status === 'Delegado')

  return (
    <div className="animate-fade-in p-5">
      <h1 className="font-serif text-[26px] font-light mb-0.5" style={{ color: '#d97706' }}>
        Seguimiento delegado ⚠
      </h1>
      <p className="text-gray-500 text-[13px] mb-5">
        Todo lo que delegaste · Ordenado por urgencia de seguimiento
      </p>
      <TaskList tasks={delegados} emptyText="Sin tareas delegadas" />
    </div>
  )
}
