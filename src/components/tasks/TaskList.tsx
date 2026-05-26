import type { Task } from '../../lib/types'
import { TaskItem } from './TaskItem'

export function TaskList({ tasks, emptyText = 'Sin tareas', compactEmpty = false }: { tasks: Task[]; emptyText?: string; compactEmpty?: boolean }) {
  if (!tasks.length) {
    if (compactEmpty) {
      return <div className="text-gray-300 text-[12px] italic pl-1 pb-1">{emptyText}</div>
    }
    return <div className="text-center py-7 text-gray-400 text-[13px]">{emptyText}</div>
  }
  return (
    <div className="flex flex-col gap-1">
      {tasks.map(t => <TaskItem key={t.id} task={t} />)}
    </div>
  )
}
