import type { Task } from '../../lib/types'
import { TaskItem } from './TaskItem'

export function TaskList({ tasks, emptyText = 'Sin tareas' }: { tasks: Task[]; emptyText?: string }) {
  if (!tasks.length) {
    return <div className="text-center py-7 text-gray-400 text-[13px]">{emptyText}</div>
  }
  return (
    <div className="flex flex-col gap-1">
      {tasks.map(t => <TaskItem key={t.id} task={t} />)}
    </div>
  )
}
