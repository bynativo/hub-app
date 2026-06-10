import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useStore } from '../../lib/store'
import type { Recurrente } from '../../lib/types'

const DAYS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes']

const HOURS_OPTIONS = [
  { v: 0.5, label: '30min' },
  { v: 1, label: '1h' },
  { v: 1.5, label: '1.5h' },
  { v: 2, label: '2h' },
  { v: 3, label: '3h' },
  { v: 4, label: '4h' },
  { v: 6, label: '6h' },
  { v: 8, label: '8h' },
]

const ANTICIPATION_OPTIONS = [
  { v: 1, label: '1 día antes' },
  { v: 2, label: '2 días antes' },
  { v: 3, label: '3 días antes' },
  { v: 7, label: '1 semana antes' },
  { v: 14, label: '2 semanas antes' },
  { v: 30, label: '1 mes antes' },
]

const BANCO_ROLES = ['Gonza', 'Jani', 'Palta', 'Pauli', 'Otro']
const AGENCIA_ROLES = ['Gonza', 'Jani', 'Palta', 'Pauli', 'Otro']

export function RecurrenteModal({ onClose, preselectContext, preselectClientId, preselectProjectId, recurrente }: {
  onClose: () => void
  preselectContext?: string
  preselectClientId?: number | null
  preselectProjectId?: number | null
  recurrente?: Recurrente
}) {
  const isEdit = !!recurrente
  const loadAll = useStore(s => s.loadAll)
  const clients = useStore(s => s.clients)
  const tasks = useStore(s => s.tasks)
  const [title, setTitle] = useState(recurrente?.title ?? '')
  const [context, setContext] = useState(recurrente?.context ?? preselectContext ?? 'banco')
  const [clientId, setClientId] = useState<number | null>(recurrente?.client_id ?? preselectClientId ?? null)
  const projectId = recurrente?.project_id ?? preselectProjectId ?? null
  const agClients = clients.filter(c => c.context === 'agencia')
  const [freq, setFreq] = useState(recurrente?.freq ?? 'mensual')
  const [dayOfMonth, setDayOfMonth] = useState(recurrente && recurrente.freq !== 'semanal' ? recurrente.day_of_month : '1')
  const [weekday, setWeekday] = useState(recurrente && recurrente.freq === 'semanal' ? recurrente.day_of_month : 'lunes')
  const [notes, setNotes] = useState(recurrente?.description ?? '')

  // Nuevos campos
  const [estimatedHours, setEstimatedHours] = useState<number>(recurrente?.estimated_hours ?? 1)
  const [anticipationDays, setAnticipationDays] = useState<number>(recurrente?.anticipation_days ?? 3)
  const [delegaActive, setDelegaActive] = useState<boolean>(!!(recurrente?.delegate_to || recurrente?.delegate_role))
  const [delegateRole, setDelegateRole] = useState<string>(recurrente?.delegate_role ?? '')
  const [delegateTo, setDelegateTo] = useState<string>(recurrente?.delegate_to ?? '')
  const [delegateReturnDays, setDelegateReturnDays] = useState<number>(recurrente?.delegate_return_days ?? 3)
  const [campanaId, setCampanaId] = useState<number | null>(recurrente?.campana_id ?? null)

  const [saving, setSaving] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [isDuplicating, setIsDuplicating] = useState(false)

  // Campañas disponibles del mismo contexto
  const campanas = tasks.filter(t => t.es_campana && t.context === context && !t.done && !t.archived_at)

  // Roles de delegación según contexto
  const delegaRoles = context === 'banco' ? BANCO_ROLES : context === 'agencia' ? AGENCIA_ROLES : []
  const delegaPersonal = context === 'personal'

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)

    const finalDelegateTo = delegaActive
      ? (delegaPersonal ? delegateTo : (delegateRole === 'Otro' ? delegateTo : delegateRole))
      : null
    const finalDelegateRole = delegaActive && !delegaPersonal ? delegateRole : null

    const row = {
      title: title.trim(),
      context,
      client_id: context === 'agencia' ? clientId : null,
      project_id: projectId,
      freq,
      day_of_month: freq === 'semanal' ? weekday : dayOfMonth,
      description: notes.trim() || null,
      estimated_hours: estimatedHours,
      anticipation_days: anticipationDays,
      delegate_to: finalDelegateTo,
      delegate_role: finalDelegateRole,
      delegate_return_days: delegaActive ? delegateReturnDays : null,
      campana_id: campanaId,
    }
    const { error } = (isEdit && !isDuplicating)
      ? await supabase.from('recurrentes').update(row).eq('id', recurrente!.id)
      : await supabase.from('recurrentes').insert({ ...row, priority: 'media', active: true, cats: [], time_minutes: Math.round(estimatedHours * 60) })
    if (error) { alert('Error: ' + error.message); setSaving(false); return }
    await loadAll()
    onClose()
  }

  async function handleDelete() {
    if (!recurrente) return
    setDeleting(true)
    const { error } = await supabase.from('recurrentes').delete().eq('id', recurrente.id)
    if (error) { alert('Error: ' + error.message); setDeleting(false); return }
    await loadAll()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-[300] flex items-end md:items-start justify-center md:pt-8 overflow-y-auto backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-bg2 border border-black/7 rounded-t-2xl md:rounded-2xl p-5 md:p-6 w-full md:w-[520px] md:max-w-[96vw] md:mb-10 shadow-lg pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="font-serif text-xl font-light mb-4">
          {isDuplicating ? 'Duplicar como nueva recurrente' : isEdit ? 'Editar recurrente' : 'Nueva recurrente'}
        </div>

        {/* Título */}
        <div className="mb-3">
          <label className="text-[11px] font-mono text-gray-400 tracking-wider uppercase mb-1 block">Titulo *</label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="w-full bg-bg3 border border-black/7 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-claude/20 focus:bg-bg2 focus:shadow-[0_0_0_3px_rgba(124,58,237,0.07)]"
            placeholder="Ej: Reporte mensual RRSS"
            autoFocus
          />
        </div>

        {/* Contexto + Frecuencia */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-[11px] font-mono text-gray-400 tracking-wider uppercase mb-1 block">Contexto</label>
            <select value={context} onChange={e => { setContext(e.target.value); setClientId(null); setCampanaId(null) }} className="w-full bg-bg3 border border-black/7 rounded-lg px-3 py-2 text-[13px] outline-none cursor-pointer">
              <option value="banco">Banco Falabella</option>
              <option value="agencia">Agencia</option>
              <option value="personal">Personal</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] font-mono text-gray-400 tracking-wider uppercase mb-1 block">Frecuencia</label>
            <select value={freq} onChange={e => setFreq(e.target.value)} className="w-full bg-bg3 border border-black/7 rounded-lg px-3 py-2 text-[13px] outline-none cursor-pointer">
              <option value="diaria">Diaria</option>
              <option value="semanal">Semanal</option>
              <option value="mensual">Mensual</option>
            </select>
          </div>
        </div>

        {/* Cliente (solo agencia) */}
        {context === 'agencia' && (
          <div className="mb-3">
            <label className="text-[11px] font-mono text-gray-400 tracking-wider uppercase mb-1 block">Cliente</label>
            <select value={clientId ?? ''} onChange={e => setClientId(e.target.value ? Number(e.target.value) : null)}
              className="w-full bg-bg3 border border-black/7 rounded-lg px-3 py-2 text-[13px] outline-none cursor-pointer">
              <option value="">Agencia interna</option>
              {agClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}

        {/* Día de la semana (semanal) */}
        {freq === 'semanal' && (
          <div className="mb-3">
            <label className="text-[11px] font-mono text-gray-400 tracking-wider uppercase mb-1 block">Dia de la semana</label>
            <div className="flex gap-2">
              {DAYS.map(d => (
                <button
                  key={d}
                  onClick={() => setWeekday(d)}
                  className={`flex-1 py-2 border rounded-lg text-[11px] text-center cursor-pointer transition-all capitalize ${
                    weekday === d
                      ? 'border-claude/20 text-claude bg-claude/7'
                      : 'border-black/7 text-gray-500 bg-bg3 hover:bg-bg4'
                  }`}
                >
                  {d.slice(0, 3)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Día del mes (mensual) */}
        {freq === 'mensual' && (
          <div className="mb-3">
            <label className="text-[11px] font-mono text-gray-400 tracking-wider uppercase mb-1 block">Dia del mes</label>
            <select value={dayOfMonth} onChange={e => setDayOfMonth(e.target.value)} className="w-full bg-bg3 border border-black/7 rounded-lg px-3 py-2 text-[13px] outline-none cursor-pointer">
              {['1', '5', '10', '15', '20', '25', 'ultimo'].map(d => (
                <option key={d} value={d}>{d === 'ultimo' ? 'Ultimo dia' : `Dia ${d}`}</option>
              ))}
            </select>
          </div>
        )}

        {/* Estimado de horas + Anticipación */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-[11px] font-mono text-gray-400 tracking-wider uppercase mb-1 block">Estimado de horas</label>
            <select value={estimatedHours} onChange={e => setEstimatedHours(Number(e.target.value))}
              className="w-full bg-bg3 border border-black/7 rounded-lg px-3 py-2 text-[13px] outline-none cursor-pointer">
              {HOURS_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-mono text-gray-400 tracking-wider uppercase mb-1 block">Crear con anticipacion</label>
            <select value={anticipationDays} onChange={e => setAnticipationDays(Number(e.target.value))}
              className="w-full bg-bg3 border border-black/7 rounded-lg px-3 py-2 text-[13px] outline-none cursor-pointer">
              {ANTICIPATION_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
            </select>
          </div>
        </div>

        {/* ¿Se delega? */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-2">
            <label className="text-[11px] font-mono text-gray-400 tracking-wider uppercase">¿Se delega?</label>
            <button
              onClick={() => setDelegaActive(x => !x)}
              className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${delegaActive ? 'bg-claude' : 'bg-gray-200'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${delegaActive ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
          </div>
          {delegaActive && (
            <div className="bg-bg3 border border-black/7 rounded-lg p-3 flex flex-col gap-2.5">
              {delegaPersonal ? (
                <div>
                  <label className="text-[10px] font-mono text-gray-400 uppercase mb-1 block">A quién</label>
                  <input
                    value={delegateTo}
                    onChange={e => setDelegateTo(e.target.value)}
                    placeholder="Nombre de la persona"
                    className="w-full bg-bg2 border border-black/7 rounded-lg px-3 py-1.5 text-[13px] outline-none"
                  />
                </div>
              ) : (
                <div>
                  <label className="text-[10px] font-mono text-gray-400 uppercase mb-1 block">A quién</label>
                  <div className="flex gap-1.5 flex-wrap">
                    {delegaRoles.map(r => (
                      <button
                        key={r}
                        onClick={() => { setDelegateRole(r); if (r !== 'Otro') setDelegateTo(r) }}
                        className={`text-[11px] px-2.5 py-1 rounded-lg border cursor-pointer transition-all ${
                          delegateRole === r ? 'bg-claude/10 border-claude/25 text-claude font-medium' : 'bg-bg2 border-black/7 text-gray-500 hover:bg-bg4'
                        }`}
                      >{r}</button>
                    ))}
                  </div>
                  {delegateRole === 'Otro' && (
                    <input
                      value={delegateTo}
                      onChange={e => setDelegateTo(e.target.value)}
                      placeholder="Nombre o rol"
                      className="mt-2 w-full bg-bg2 border border-black/7 rounded-lg px-3 py-1.5 text-[13px] outline-none"
                    />
                  )}
                </div>
              )}
              <div>
                <label className="text-[10px] font-mono text-gray-400 uppercase mb-1 block">
                  Días para devolver (antes del vencimiento)
                </label>
                <div className="flex gap-1.5 flex-wrap">
                  {[1, 2, 3, 5, 7].map(d => (
                    <button
                      key={d}
                      onClick={() => setDelegateReturnDays(d)}
                      className={`text-[11px] px-2.5 py-1 rounded-lg border cursor-pointer transition-all ${
                        delegateReturnDays === d ? 'bg-claude/10 border-claude/25 text-claude font-medium' : 'bg-bg2 border-black/7 text-gray-500 hover:bg-bg4'
                      }`}
                    >{d}d antes</button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Campaña vinculada (opcional) */}
        {campanas.length > 0 && (
          <div className="mb-3">
            <label className="text-[11px] font-mono text-gray-400 tracking-wider uppercase mb-1 block">Campaña vinculada (opcional)</label>
            <select value={campanaId ?? ''} onChange={e => setCampanaId(e.target.value ? Number(e.target.value) : null)}
              className="w-full bg-bg3 border border-black/7 rounded-lg px-3 py-2 text-[13px] outline-none cursor-pointer">
              <option value="">Sin campaña</option>
              {campanas.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </div>
        )}

        {/* Descripción */}
        <div className="mb-4">
          <label className="text-[11px] font-mono text-gray-400 tracking-wider uppercase mb-1 block">Descripcion (opcional)</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="w-full bg-bg3 border border-black/7 rounded-lg px-3 py-2 text-[13px] outline-none resize-y focus:border-claude/20 focus:bg-bg2 focus:shadow-[0_0_0_3px_rgba(124,58,237,0.07)]"
            placeholder="Detalles sobre esta tarea recurrente..."
            rows={3}
          />
        </div>

        <div className="flex gap-2 justify-between items-center">
          {isEdit && !isDuplicating ? (
            <div className="flex gap-2">
              <button onClick={() => setConfirmDel(true)}
                className="text-xs text-danger bg-danger/7 border border-danger/25 px-4 py-2 rounded-lg hover:bg-danger/15 transition-colors cursor-pointer">
                🗑 Eliminar recurrente
              </button>
              <button
                onClick={() => { setTitle(t => t + ' — copia'); setIsDuplicating(true) }}
                className="text-xs bg-bg3 border border-black/7 text-gray-600 px-4 py-2 rounded-lg hover:bg-bg4 transition-colors cursor-pointer"
              >📋 Duplicar</button>
            </div>
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="text-xs bg-bg3 border border-black/7 text-gray-500 px-4 py-2 rounded-lg hover:bg-bg4 transition-colors cursor-pointer">
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={!title.trim() || saving}
              className="text-xs bg-claude border-claude text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? 'Guardando...' : (isDuplicating ? 'Crear recurrente' : isEdit ? 'Guardar cambios' : 'Crear recurrente')}
            </button>
          </div>
        </div>
      </div>

      {confirmDel && recurrente && (
        <div className="fixed inset-0 z-[330] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) setConfirmDel(false) }}>
          <div className="bg-bg2 border border-black/7 rounded-2xl p-5 w-[400px] max-w-[94vw] shadow-lg">
            <div className="font-serif text-lg font-light mb-1">Eliminar recurrente</div>
            <p className="text-[13px] text-gray-500 mb-4">¿Eliminar esta recurrente permanentemente? "<span className="font-medium text-gray-700">{recurrente.title}</span>" no se puede recuperar.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDel(false)} className="text-xs bg-bg3 border border-black/7 text-gray-500 px-4 py-2 rounded-lg hover:bg-bg4 cursor-pointer">Cancelar</button>
              <button onClick={handleDelete} disabled={deleting} className="text-xs bg-danger text-white px-4 py-2 rounded-lg hover:opacity-90 cursor-pointer disabled:opacity-40">
                {deleting ? 'Eliminando…' : 'Eliminar permanentemente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
