import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useStore } from '../../lib/store'
import type { Task } from '../../lib/types'

function DuplicarTareaInner({ task }: { task: Task }) {
  const closeDuplicateTask = useStore(s => s.closeDuplicateTask)
  const allTasks = useStore(s => s.tasks)
  const clients = useStore(s => s.clients)
  const loadAll = useStore(s => s.loadAll)
  const openDetail = useStore(s => s.openDetail)
  const showToast = useStore(s => s.showToast)

  const [title, setTitle] = useState(`${task.title} — copia`)
  const [context, setContext] = useState(task.context ?? 'banco')
  const [clientId, setClientId] = useState<number | null>(task.client_id ?? null)
  const [copySubtasks, setCopySubtasks] = useState(true)
  const [copyReminders, setCopyReminders] = useState(true)
  const [saving, setSaving] = useState(false)

  const agClients = clients.filter(c => c.context === 'agencia')

  async function handleDuplicate() {
    setSaving(true)
    try {
      // Build new task payload — copy original but reset transient/temporal fields
      const payload: Record<string, unknown> = {
        title: title.trim() || `${task.title} — copia`,
        context,
        client_id: context === 'agencia' ? clientId : null,
        project_id: task.project_id,
        presentation_id: task.presentation_id,
        priority: task.priority,
        status: 'Inbox',
        task_type: task.task_type,
        origin: task.origin,
        time_minutes: task.time_minutes,
        estimated_hours: task.estimated_hours,
        notes: task.notes,
        done: false,
        cats: task.cats ?? [],
        plan: task.plan ?? [],
        meeting_title: task.meeting_title,
        meeting_duration: task.meeting_duration,
        meeting_agenda: task.meeting_agenda ?? [],
        content_format: task.content_format,
        content_platform: task.content_platform,
        content_pub_type: task.content_pub_type,
        tipo_publicacion: task.tipo_publicacion,
        es_influencer: task.es_influencer,
        influencer_nombre: task.influencer_nombre,
        influencer_agencia: task.influencer_agencia,
        influencer_handle: task.influencer_handle,
        influencer_tipos: task.influencer_tipos,
        // Reset all temporal/delegation/recurrence fields
        due_date: null,
        archived_at: null,
        followup_at: null,
        followup_notes: null,
        last_followup_at: null,
        delegated_to: null,
        draft_sent: false,
        parent_task_id: null,
        kanban_order: null,
        recordatorio_at: null,
        requested_at: null,
      }

      const { data: newTask, error } = await supabase
        .from('tasks')
        .insert(payload)
        .select('id')
        .single()

      if (error || !newTask) {
        alert('Error al duplicar: ' + (error?.message ?? 'sin datos'))
        setSaving(false)
        return
      }

      const newTaskId = newTask.id

      // Recursive subtask copy helper
      async function copyChildren(originalId: number, newParentId: number) {
        const directChildren = allTasks.filter(
          t => t.parent_task_id === originalId && !t.es_recordatorio && !t.done
        )
        for (const child of directChildren) {
          const childPayload = {
            title: child.title,
            context: child.context,
            client_id: child.client_id,
            project_id: child.project_id,
            priority: child.priority,
            status: 'Inbox' as const,
            task_type: child.task_type,
            origin: child.origin,
            time_minutes: child.time_minutes,
            estimated_hours: child.estimated_hours,
            notes: child.notes,
            done: false,
            cats: child.cats ?? [],
            plan: child.plan ?? [],
            meeting_agenda: child.meeting_agenda ?? [],
            parent_task_id: newParentId,
            due_date: null,
            work_date: null,
            archived_at: null,
            es_recurrente_instance: false,
            recurrente_id: null,
            kanban_order: null,
          }
          const { data: newChild } = await supabase
            .from('tasks')
            .insert(childPayload)
            .select('id')
            .single()
          if (newChild) {
            await copyChildren(child.id, newChild.id)
          }
        }
      }

      if (copySubtasks) {
        await copyChildren(task.id, newTaskId)
      }

      if (copyReminders) {
        const reminders = allTasks.filter(
          t => t.parent_task_id === task.id && t.es_recordatorio === true
        )
        for (const reminder of reminders) {
          await supabase.from('tasks').insert({
            title: reminder.title,
            context: reminder.context,
            client_id: reminder.client_id,
            project_id: reminder.project_id,
            priority: reminder.priority,
            status: 'Inbox',
            task_type: reminder.task_type,
            origin: reminder.origin,
            time_minutes: reminder.time_minutes,
            done: false,
            cats: reminder.cats ?? [],
            plan: reminder.plan ?? [],
            meeting_agenda: reminder.meeting_agenda ?? [],
            es_recordatorio: true,
            tipo_recordatorio: reminder.tipo_recordatorio,
            correo_contexto: reminder.correo_contexto,
            parent_task_id: newTaskId,
            recordatorio_at: null, // user sets later
          })
        }
      }

      await loadAll()

      const finalTitle = title.trim() || `${task.title} — copia`
      showToast(`✓ Tarea duplicada — "${finalTitle}"`, {
        actionLabel: 'Abrir',
        actionFn: () => openDetail(newTaskId),
        durationMs: 5000,
      })

      closeDuplicateTask()
    } catch (e) {
      console.error('[DuplicarTareaModal]', e)
      alert('Error inesperado al duplicar')
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-[300] flex items-end md:items-start justify-center md:pt-8 overflow-y-auto backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) closeDuplicateTask() }}
    >
      <div className="bg-bg2 border border-black/7 rounded-t-2xl md:rounded-2xl p-5 md:p-6 w-full md:w-[480px] md:max-w-[96vw] md:mb-10 shadow-lg pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="font-serif text-xl font-light mb-4">Duplicar tarea</div>

        {/* Título */}
        <div className="mb-3">
          <label className="text-[11px] font-mono text-gray-400 tracking-wider uppercase mb-1 block">Título</label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="w-full bg-bg3 border border-black/7 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-claude/20 focus:bg-bg2 focus:shadow-[0_0_0_3px_rgba(124,58,237,0.07)]"
            autoFocus
          />
        </div>

        {/* Contexto */}
        <div className="mb-3">
          <label className="text-[11px] font-mono text-gray-400 tracking-wider uppercase mb-1 block">Contexto</label>
          <select
            value={context}
            onChange={e => { setContext(e.target.value); setClientId(null) }}
            className="w-full bg-bg3 border border-black/7 rounded-lg px-3 py-2 text-[13px] outline-none cursor-pointer"
          >
            <option value="banco">Banco Falabella</option>
            <option value="agencia">Agencia</option>
            <option value="personal">Personal</option>
          </select>
        </div>

        {/* Cliente (solo agencia) */}
        {context === 'agencia' && (
          <div className="mb-3">
            <label className="text-[11px] font-mono text-gray-400 tracking-wider uppercase mb-1 block">Cliente</label>
            <select
              value={clientId ?? ''}
              onChange={e => setClientId(e.target.value ? Number(e.target.value) : null)}
              className="w-full bg-bg3 border border-black/7 rounded-lg px-3 py-2 text-[13px] outline-none cursor-pointer"
            >
              <option value="">Agencia interna</option>
              {agClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}

        {/* Toggles */}
        <div className="mb-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-gray-600">Copiar subtareas</span>
            <button
              onClick={() => setCopySubtasks(x => !x)}
              className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${copySubtasks ? 'bg-claude' : 'bg-gray-200'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${copySubtasks ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-gray-600">Copiar recordatorios</span>
            <button
              onClick={() => setCopyReminders(x => !x)}
              className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${copyReminders ? 'bg-claude' : 'bg-gray-200'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${copyReminders ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
          </div>
        </div>

        {/* Botones */}
        <div className="flex gap-2 justify-end">
          <button
            onClick={closeDuplicateTask}
            className="text-xs bg-bg3 border border-black/7 text-gray-500 px-4 py-2 rounded-lg hover:bg-bg4 transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            onClick={handleDuplicate}
            disabled={saving}
            className="text-xs bg-claude border-claude text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? 'Duplicando...' : 'Duplicar tarea'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function DuplicarTareaModal() {
  const duplicateTask = useStore(s => s.duplicateTask)
  const allTasks = useStore(s => s.tasks)

  if (!duplicateTask) return null
  const task = allTasks.find(t => t.id === duplicateTask.taskId)
  if (!task) return null

  // key={task.id} forces remount with fresh state each time a different task is opened
  return <DuplicarTareaInner key={task.id} task={task} />
}
