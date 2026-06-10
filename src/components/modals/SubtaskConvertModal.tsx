import { useState } from 'react'
import { useStore } from '../../lib/store'
import { splitTitle } from '../../lib/helpers'

export function SubtaskConvertModal() {
  const subtaskConvert = useStore(s => s.subtaskConvert)
  const closeSubtaskConvert = useStore(s => s.closeSubtaskConvert)
  const tasks = useStore(s => s.tasks)
  const updateTask = useStore(s => s.updateTask)
  const loadAll = useStore(s => s.loadAll)
  const showToast = useStore(s => s.showToast)
  const [saving, setSaving] = useState(false)

  if (!subtaskConvert) return null

  const dragTask = tasks.find(t => t.id === subtaskConvert.dragId)
  const targetTask = tasks.find(t => t.id === subtaskConvert.targetId)

  if (!dragTask || !targetTask) return null

  const { name: dragName } = splitTitle(dragTask.title)
  const { name: targetName } = splitTitle(targetTask.title)

  const alreadyHasParent = !!dragTask.parent_task_id
  const oldParent = alreadyHasParent ? tasks.find(t => t.id === dragTask.parent_task_id) : null

  async function handleConfirm() {
    if (!subtaskConvert) return
    setSaving(true)
    try {
      await updateTask(subtaskConvert.dragId, { parent_task_id: subtaskConvert.targetId })
      await loadAll()
      showToast(`✓ "${dragName}" ahora es subtarea de "${targetName}"`, { durationMs: 3000 })
      closeSubtaskConvert()
    } catch {
      showToast('No se pudo convertir — verificá que ambas tareas sean del mismo contexto', { durationMs: 4000 })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-[400] flex items-center justify-center backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) closeSubtaskConvert() }}
    >
      <div className="bg-bg2 border border-black/7 rounded-2xl p-5 w-[420px] max-w-[94vw] shadow-xl">
        <div className="font-serif text-lg font-light mb-1">Convertir en subtarea</div>
        <p className="text-[13px] text-gray-500 mb-4">
          ¿Convertir{' '}
          <span className="font-medium text-gray-800">"{dragName}"</span>
          {' '}en subtarea de{' '}
          <span className="font-medium text-gray-800">"{targetName}"</span>?
        </p>

        {alreadyHasParent && (
          <div className="mb-4 text-[12px] text-warn bg-warn/10 border border-warn/25 rounded-lg px-3 py-2">
            ⚠ Esta tarea ya es subtarea de "{splitTitle(oldParent?.title ?? '').name || oldParent?.title}". Cambiar su padre la reasignará.
          </div>
        )}

        <div className="flex items-center gap-2 bg-bg3 border border-black/7 rounded-lg p-3 mb-4">
          <div className="flex-1 min-w-0">
            <div className="text-[11px] text-gray-400 mb-0.5">Tarea</div>
            <div className="text-[13px] font-medium truncate">{dragName}</div>
          </div>
          <span className="text-gray-400 text-lg">→</span>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] text-gray-400 mb-0.5">Nueva tarea padre</div>
            <div className="text-[13px] font-medium truncate">{targetName}</div>
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <button
            onClick={closeSubtaskConvert}
            className="text-xs bg-bg3 border border-black/7 text-gray-500 px-4 py-2 rounded-lg hover:bg-bg4 cursor-pointer"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving}
            className="text-xs bg-claude text-white px-4 py-2 rounded-lg hover:bg-purple-700 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? 'Convirtiendo…' : 'Convertir en subtarea'}
          </button>
        </div>
      </div>
    </div>
  )
}
