import { useState } from 'react'
import { BANCO_ROLES, AGENCIA_ROLES } from '../../lib/constants'
import type { Task } from '../../lib/types'
import { stripPrefix, fmtDue } from '../../lib/helpers'
import { STATUS_COLOR } from '../../lib/constants'

export interface DelegationFormData {
  delegatedTo: string
  tipo: string        // tipo UI: 'espero_devolucion' | 'queda_a_cargo' | 'publicacion'
  returnDate: string
  note: string
  createTask: boolean
}

// Tres tipos de delegación
const DELEGATION_TYPES = [
  {
    v: 'espero_devolucion',
    label: 'Espero devolución',
    sub: 'Me lo devuelve para revisar',
    needsDate: true,
  },
  {
    v: 'queda_a_cargo',
    label: 'Queda a cargo',
    sub: 'No vuelve a mí',
    needsDate: false,
  },
  {
    v: 'publicacion',
    label: 'Publicación',
    sub: 'Publica el contenido directamente',
    needsDate: false,
  },
]

function fmtDate(d: string | null) {
  if (!d) return null
  return d.slice(5).replace('-', '/')
}

export function DelegationModal({
  task,
  onClose,
  onConfirm,
}: {
  task: Task
  onClose: () => void
  onConfirm: (data: DelegationFormData) => Promise<void>
}) {
  const roles = task.context === 'banco'
    ? BANCO_ROLES
    : task.context === 'agencia'
    ? AGENCIA_ROLES
    : []

  const [selectedRole, setSelectedRole] = useState('')
  const [customName, setCustomName] = useState('')
  const [stage, setStage] = useState('')
  const [returnDate, setReturnDate] = useState('')
  const [note, setNote] = useState('')
  const [createTask, setCreateTask] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const resolvedName = selectedRole === 'otro' || !roles.length
    ? customName.trim()
    : (roles.find(r => r.v === selectedRole)?.label ?? customName.trim())

  const cleanTitle = stripPrefix(task.title)
  const dueDate = task.due_date
  const selectedType = DELEGATION_TYPES.find(t => t.v === stage)
  const needsDate = selectedType?.needsDate ?? false

  // Validación: return_date debe ser ESTRICTAMENTE ANTERIOR a due_date
  const returnDateInvalid = needsDate && !!(returnDate && dueDate && returnDate >= dueDate)

  const minDate = (() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()

  async function handleConfirm() {
    if (!resolvedName) { setError('Seleccioná a quién delegás'); return }
    if (!stage) { setError('Seleccioná el tipo de delegación'); return }
    if (needsDate && !returnDate) { setError('Ingresá la fecha de devolución'); return }
    if (returnDateInvalid) {
      const dueFmt = fmtDate(dueDate) || dueDate!
      setError(`La devolución debe ser antes de la entrega (${dueFmt})`)
      return
    }
    setSaving(true)
    setError('')
    try {
      await onConfirm({
        delegatedTo: resolvedName,
        tipo: stage,
        returnDate: needsDate ? returnDate : '',
        note: note.trim(),
        createTask,
      })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
      setSaving(false)
    }
  }

  const lbl = 'text-[10px] font-mono text-gray-400 tracking-wider uppercase block mb-1'
  const fld = 'w-full bg-bg2 border border-black/7 rounded-md px-2.5 py-1.5 text-[13px] outline-none focus:border-claude/20'
  const stColor = STATUS_COLOR[task.status || 'Inbox'] || '#6b7280'

  return (
    <div
      className="fixed inset-0 z-[340] flex items-start justify-center pt-10 bg-black/40 backdrop-blur-sm overflow-y-auto"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-bg2 border border-black/7 rounded-2xl p-5 w-[520px] max-w-[94vw] shadow-lg mb-10">
        <div className="font-serif text-lg font-light mb-3">Delegar tarea</div>

        {/* Panel de info de la tarea — C */}
        <div className="bg-bg3 border border-black/7 rounded-lg px-3 py-2.5 mb-4 flex flex-col gap-1">
          <div className="text-[13px] font-medium text-gray-800 leading-snug">{cleanTitle}</div>
          <div className="flex items-center gap-2 flex-wrap mt-0.5">
            <span
              className="text-[10px] font-mono px-1.5 py-0.5 rounded"
              style={{ background: stColor + '16', color: stColor }}
            >
              {task.status || 'Inbox'}
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg4 text-gray-500">
              {task.context === 'banco' ? 'Banco' : task.context === 'agencia' ? 'Agencia' : 'Personal'}
            </span>
            {task.priority && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg4 text-gray-500">
                {task.priority === 'alta' ? '🔴 Alta' : task.priority === 'media' ? '🟡 Media' : '🟢 Baja'}
              </span>
            )}
            {dueDate && (() => {
              const due = fmtDue(dueDate)
              return (
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${due?.urgent ? 'bg-red-50 text-red-600' : 'bg-bg4 text-gray-500'}`}>
                  📅 Entrega {fmtDate(dueDate)}
                </span>
              )
            })()}
            {task.requested_at && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg4 text-gray-500">
                📨 Pedido {fmtDate(task.requested_at)}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {/* A quién delegás */}
          <div>
            <label className={lbl}>A quién delegás</label>
            {roles.length > 0 && (
              <div className="grid grid-cols-2 gap-1.5 mb-2">
                {roles.map(r => (
                  <button
                    key={r.v}
                    type="button"
                    onClick={() => setSelectedRole(r.v)}
                    className={`flex flex-col items-start px-3 py-2 border rounded-lg cursor-pointer transition-all text-left ${
                      selectedRole === r.v
                        ? 'border-claude/30 bg-claude/7 text-claude'
                        : 'border-black/7 bg-bg3 text-gray-600 hover:bg-bg4'
                    }`}
                  >
                    <span className="text-[13px] font-medium">{r.label}</span>
                    <span className="text-[10px] font-mono opacity-60 mt-0.5">{r.subtitle}</span>
                  </button>
                ))}
              </div>
            )}
            {(selectedRole === 'otro' || !roles.length || task.context === 'personal') && (
              <input
                value={customName}
                onChange={e => setCustomName(e.target.value)}
                placeholder={!roles.length ? 'Nombre de quien recibe' : 'Especificá el nombre'}
                className={fld}
              />
            )}
          </div>

          {/* Tipo de delegación — B */}
          <div>
            <label className={lbl}>Tipo de delegación</label>
            <div className="flex flex-col gap-1.5">
              {DELEGATION_TYPES.map(t => (
                <button
                  key={t.v}
                  type="button"
                  onClick={() => { setStage(t.v); if (!t.needsDate) setReturnDate('') }}
                  className={`flex items-center gap-3 px-3 py-2.5 border rounded-lg cursor-pointer transition-all text-left ${
                    stage === t.v ? 'border-claude/30 bg-claude/7' : 'border-black/7 bg-bg3 hover:bg-bg4'
                  }`}
                >
                  <div className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 flex items-center justify-center ${
                    stage === t.v ? 'border-claude bg-claude' : 'border-gray-300'
                  }`}>
                    {stage === t.v && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                  <div>
                    <div className={`text-[13px] font-medium ${stage === t.v ? 'text-claude' : 'text-gray-700'}`}>{t.label}</div>
                    <div className="text-[11px] text-gray-400">{t.sub}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Fecha de devolución — solo para "Espero devolución" */}
          {needsDate && (
            <div>
              <label className={lbl}>Fecha de devolución *</label>
              <input
                type="date"
                value={returnDate}
                min={minDate}
                onChange={e => setReturnDate(e.target.value)}
                className={fld + (returnDateInvalid ? ' border-danger/50' : '')}
              />
              {returnDateInvalid
                ? <div className="text-[11px] text-danger mt-1">⚠ La devolución debe ser antes de la entrega ({fmtDate(dueDate)})</div>
                : dueDate && returnDate
                  ? <div className="text-[11px] text-gray-400 mt-1">Tu entrega es el {fmtDate(dueDate)} — tenés margen para revisar</div>
                  : null
              }
            </div>
          )}

          {/* Toggle crear tarea */}
          <div className="flex items-center gap-3 p-3 bg-bg3 rounded-lg border border-black/7">
            <button
              type="button"
              onClick={() => setCreateTask(c => !c)}
              className={`w-10 h-5 rounded-full relative transition-colors shrink-0 cursor-pointer ${createTask ? 'bg-claude' : 'bg-bg4'}`}
            >
              <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all shadow-sm ${createTask ? 'left-5.5' : 'left-0.5'}`} />
            </button>
            <div>
              <div className="text-[13px]">Crear tarea para el receptor</div>
              <div className="text-[11px] text-gray-400">
                {createTask
                  ? `"${selectedType?.label || '…'}: ${cleanTitle}" ${needsDate && returnDate ? `— vence ${fmtDate(returnDate)}` : ''}`
                  : 'Solo registra la delegación, sin tarea nueva'}
              </div>
            </div>
          </div>

          {/* Nota */}
          <div>
            <label className={lbl}>Nota para el receptor (opcional)</label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={2}
              placeholder="Instrucciones, contexto adicional…"
              className={fld + ' resize-none'}
            />
          </div>

          {error && (
            <div className="text-[12px] text-danger bg-danger/7 border border-danger/20 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex gap-2 justify-end pt-1">
            <button
              onClick={onClose}
              className="text-xs bg-bg3 border border-black/7 text-gray-500 px-4 py-2 rounded-lg hover:bg-bg4 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              disabled={saving}
              className="text-xs bg-claude text-white px-4 py-2 rounded-lg hover:bg-purple-700 cursor-pointer disabled:opacity-40"
            >
              {saving ? 'Guardando…' : '→ Delegar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
