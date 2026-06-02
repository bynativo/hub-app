import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useStore } from '../../lib/store'
import type { Recurrente } from '../../lib/types'

const DAYS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes']

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
  const [title, setTitle] = useState(recurrente?.title ?? '')
  const [context, setContext] = useState(recurrente?.context ?? preselectContext ?? 'banco')
  const [clientId, setClientId] = useState<number | null>(recurrente?.client_id ?? preselectClientId ?? null)
  // project_id no es editable en este modal; viene preseleccionado (al crear desde la
  // vista del proyecto) o se conserva al editar.
  const projectId = recurrente?.project_id ?? preselectProjectId ?? null
  const agClients = clients.filter(c => c.context === 'agencia')
  const [freq, setFreq] = useState(recurrente?.freq ?? 'mensual')
  // El día de la semana (semanal) se guarda en day_of_month, igual que en la vista.
  const [dayOfMonth, setDayOfMonth] = useState(recurrente && recurrente.freq !== 'semanal' ? recurrente.day_of_month : '1')
  const [weekday, setWeekday] = useState(recurrente && recurrente.freq === 'semanal' ? recurrente.day_of_month : 'lunes')
  const [notes, setNotes] = useState(recurrente?.description ?? '')
  const [saving, setSaving] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)
    const row = {
      title: title.trim(),
      context,
      client_id: context === 'agencia' ? clientId : null,
      project_id: projectId,
      freq,
      day_of_month: freq === 'semanal' ? weekday : dayOfMonth,
      description: notes.trim() || null,
    }
    const { error } = isEdit
      ? await supabase.from('recurrentes').update(row).eq('id', recurrente!.id)
      : await supabase.from('recurrentes').insert({ ...row, priority: 'media', active: true, cats: [], time_minutes: 60 })
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
        <div className="font-serif text-xl font-light mb-4">{isEdit ? 'Editar recurrente' : 'Nueva recurrente'}</div>

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

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-[11px] font-mono text-gray-400 tracking-wider uppercase mb-1 block">Contexto</label>
            <select value={context} onChange={e => { setContext(e.target.value); setClientId(null) }} className="w-full bg-bg3 border border-black/7 rounded-lg px-3 py-2 text-[13px] outline-none cursor-pointer">
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
          {isEdit ? (
            <button onClick={() => setConfirmDel(true)}
              className="text-xs text-danger bg-danger/7 border border-danger/25 px-4 py-2 rounded-lg hover:bg-danger/15 transition-colors cursor-pointer">
              🗑 Eliminar recurrente
            </button>
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
              {saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear recurrente'}
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
