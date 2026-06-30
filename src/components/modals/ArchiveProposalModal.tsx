import { useState } from 'react'
import { useStore } from '../../lib/store'
import { ctxLabel } from '../../lib/helpers'
import { STATUS_ICON, STATUS_COLOR } from '../../lib/constants'

function daysAgo(isoStr: string): number {
  return Math.floor((Date.now() - new Date(isoStr).getTime()) / 86400000)
}

export function ArchiveProposalModal() {
  const candidates = useStore(s => s.archiveCandidates)
  const archiveTasks = useStore(s => s.archiveTasks)
  const dismiss = useStore(s => s.dismissArchiveCandidates)
  const [mode, setMode] = useState<'summary' | 'review'>('summary')
  const [selected, setSelected] = useState<Set<number> | null>(null)
  const [archiving, setArchiving] = useState(false)

  if (!candidates || candidates.length === 0) return null

  const sel = selected ?? new Set(candidates.map(t => t.id))
  const selCount = sel.size
  const n = candidates.length

  function toggle(id: number) {
    const next = new Set(sel)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  function toggleAll() {
    setSelected(sel.size === n ? new Set() : new Set(candidates.map(t => t.id)))
  }

  async function handleArchive(ids: number[]) {
    setArchiving(true)
    await archiveTasks(ids)
    setArchiving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-bg2 border border-black/7 rounded-2xl shadow-2xl w-full max-w-[520px] max-h-[85vh] flex flex-col">

        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-black/7 shrink-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">🗄</span>
            <span className="font-serif text-[18px] font-light">
              {n} tarea{n === 1 ? '' : 's'} sin actividad por +30 días
            </span>
          </div>
          <p className="text-[13px] text-gray-500">
            {mode === 'summary'
              ? 'Podés archivarlas todas o revisar la lista para elegir cuáles conservar.'
              : `Seleccioná las que querés archivar (${selCount} de ${n} seleccionadas).`}
          </p>
        </div>

        {/* Lista — solo en modo review */}
        {mode === 'review' && (
          <div className="flex-1 overflow-y-auto px-5 py-3 flex flex-col gap-1">
            <button
              onClick={toggleAll}
              className="text-[11px] text-gray-400 hover:text-gray-600 text-left mb-1 cursor-pointer"
            >
              {sel.size === n ? 'Deseleccionar todas' : 'Seleccionar todas'}
            </button>
            {candidates.map(t => {
              const checked = sel.has(t.id)
              const stColor = STATUS_COLOR[t.status] || '#6b7280'
              const ago = daysAgo(t.updated_at)
              return (
                <label
                  key={t.id}
                  className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors ${
                    checked ? 'bg-amber-50 border border-amber-200' : 'bg-bg3 border border-transparent hover:border-black/7'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(t.id)}
                    className="shrink-0 cursor-pointer accent-amber-600"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] leading-snug truncate">{t.title}</div>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded font-medium"
                        style={{ background: stColor + '16', color: stColor }}>
                        {STATUS_ICON[t.status]} {t.status}
                      </span>
                      <span className="text-[10px] font-mono text-gray-400">{ctxLabel(t.context)}</span>
                      <span className="text-[10px] font-mono text-gray-400">hace {ago}d</span>
                    </div>
                  </div>
                </label>
              )
            })}
          </div>
        )}

        {/* Acciones */}
        <div className="px-5 py-4 border-t border-black/7 flex gap-2 flex-wrap shrink-0">
          {mode === 'summary' ? (
            <>
              <button
                onClick={() => handleArchive(candidates.map(t => t.id))}
                disabled={archiving}
                className="text-[13px] bg-amber-600 text-white px-4 py-2 rounded-lg cursor-pointer hover:bg-amber-700 transition-colors disabled:opacity-50"
              >
                {archiving ? 'Archivando…' : `Archivar todas (${n})`}
              </button>
              <button
                onClick={() => setMode('review')}
                className="text-[13px] bg-bg3 border border-black/7 text-gray-700 px-4 py-2 rounded-lg cursor-pointer hover:bg-bg4 transition-colors"
              >
                Revisar lista
              </button>
              <button
                onClick={dismiss}
                className="text-[13px] text-gray-400 px-3 py-2 rounded-lg cursor-pointer hover:text-gray-600 transition-colors"
              >
                Ahora no
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => handleArchive([...sel])}
                disabled={archiving || selCount === 0}
                className="text-[13px] bg-amber-600 text-white px-4 py-2 rounded-lg cursor-pointer hover:bg-amber-700 transition-colors disabled:opacity-50"
              >
                {archiving ? 'Archivando…' : `Archivar ${selCount} seleccionada${selCount === 1 ? '' : 's'}`}
              </button>
              <button
                onClick={dismiss}
                className="text-[13px] bg-bg3 border border-black/7 text-gray-700 px-4 py-2 rounded-lg cursor-pointer hover:bg-bg4 transition-colors"
              >
                Cancelar
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
