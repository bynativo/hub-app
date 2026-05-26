import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { REDES } from '../../lib/constants'
import { useStore } from '../../lib/store'
import { ctxLabel, ctxColor } from '../../lib/helpers'
import type { Slide } from '../../lib/types'

type GSlide = Slide & { presentations?: { title: string; kv_color: string; context: string; client_id: number | null } | null }

export function GrillaView({ context = 'banco' }: { context?: string }) {
  const clients = useStore(s => s.clients)
  const [redFilter, setRedFilter] = useState('all')
  const [clientFilter, setClientFilter] = useState<'all' | 'interna' | number>('all')
  const [slides, setSlides] = useState<GSlide[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadGrilla() }, [])
  useEffect(() => { setClientFilter('all'); setRedFilter('all') }, [context])

  async function loadGrilla() {
    setLoading(true)
    const { data } = await supabase
      .from('slides')
      .select('*,presentations(title,kv_color,context,client_id)')
      .eq('is_aprobada', true)
      .order('grilla_date')
    setSlides((data as GSlide[]) || [])
    setLoading(false)
  }

  // Solo contenidos del contexto de esta grilla (banco SOLO banco, agencia SOLO agencia)
  const ctxSlides = slides.filter(s => s.presentations?.context === context)

  // Carpetas/clientes de agencia con contenido
  const agClientIds = context === 'agencia'
    ? [...new Set(ctxSlides.filter(s => s.presentations?.client_id).map(s => s.presentations!.client_id as number))]
    : []

  const filtered = ctxSlides
    .filter(s => {
      if (context !== 'agencia' || clientFilter === 'all') return true
      if (clientFilter === 'interna') return !s.presentations?.client_id
      return s.presentations?.client_id === clientFilter
    })
    .filter(s => redFilter === 'all' || (s.redes || []).includes(redFilter))

  // Agrupar por fecha
  const byDate: Record<string, GSlide[]> = {}
  filtered.forEach(s => {
    const d = s.grilla_date || 'sin-fecha'
    if (!byDate[d]) byDate[d] = []
    byDate[d].push(s)
  })

  // Conflicto: misma fecha + misma red
  const conflictDates = new Set<string>()
  Object.entries(byDate).forEach(([d, group]) => {
    if (d === 'sin-fecha') return
    const redCount: Record<string, number> = {}
    group.forEach(s => (s.redes || []).forEach(r => { redCount[r] = (redCount[r] || 0) + 1 }))
    if (Object.values(redCount).some(c => c > 1)) conflictDates.add(d)
  })

  const accent = ctxColor(context)
  const redFilters = [{ v: 'all', label: 'Todas', color: '' }, ...REDES]

  return (
    <div className="animate-fade-in p-5">
      <h1 className="font-serif text-[26px] font-light mb-0.5" style={{ color: accent }}>Calendario RRSS · {ctxLabel(context)}</h1>
      <p className="text-gray-500 text-[13px] mb-4">Calendario de publicaciones · {filtered.length} piezas programadas</p>

      {/* Selector de cliente (solo agencia) */}
      {context === 'agencia' && (
        <div className="flex gap-2 mb-3 flex-wrap items-center">
          <span className="text-xs text-gray-500 font-mono">Cliente:</span>
          {([{ k: 'all', l: 'Todos' }, { k: 'interna', l: 'Agencia interna' }] as { k: 'all' | 'interna'; l: string }[]).map(o => (
            <button key={o.k} onClick={() => setClientFilter(o.k)}
              className={`text-xs px-3 py-1 rounded-lg border cursor-pointer transition-all ${clientFilter === o.k ? 'border-agencia/20 text-agencia bg-agencia/7' : 'bg-bg3 border-black/7 text-gray-500 hover:bg-bg4'}`}>
              {o.l}
            </button>
          ))}
          {agClientIds.map(cid => (
            <button key={cid} onClick={() => setClientFilter(cid)}
              className={`text-xs px-3 py-1 rounded-lg border cursor-pointer transition-all ${clientFilter === cid ? 'border-agencia/20 text-agencia bg-agencia/7' : 'bg-bg3 border-black/7 text-gray-500 hover:bg-bg4'}`}>
              {clients.find(c => c.id === cid)?.name || `Cliente ${cid}`}
            </button>
          ))}
        </div>
      )}

      {/* Filtro por red */}
      <div className="flex gap-2 mb-3.5 flex-wrap items-center">
        <span className="text-xs text-gray-500 font-mono">Plataforma:</span>
        {redFilters.map(f => (
          <button key={f.v} onClick={() => setRedFilter(f.v)}
            className={`text-[11px] font-mono px-2.5 py-1 rounded-full border cursor-pointer transition-all ${redFilter === f.v ? 'font-semibold' : 'border-black/7 text-gray-400 bg-bg3 hover:border-black/13'}`}
            style={redFilter === f.v && f.color ? { background: f.color + '20', borderColor: f.color, color: f.color } : {}}>
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-7 text-gray-400">Cargando grilla...</div>
      ) : !filtered.length ? (
        <div className="text-center py-7 text-gray-400 text-[13px]">
          Sin contenido programado{redFilter !== 'all' ? ' para esta plataforma' : ''}.
        </div>
      ) : (
        <div className="flex flex-col">
          {Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b)).map(([date, group]) => {
            const isConflict = conflictDates.has(date)
            const dateLabel = date === 'sin-fecha'
              ? 'Sin fecha'
              : new Date(date + 'T00:00:00').toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })

            return (
              <div key={date} className="mb-0">
                <div className="flex items-center gap-2 py-2 border-b border-black/7 mb-1.5 sticky top-0 bg-bg z-5">
                  <span className="text-[13px] font-medium capitalize">{dateLabel}</span>
                  <span className="text-[11px] font-mono text-gray-400">{group.length} pieza{group.length > 1 ? 's' : ''}</span>
                  {isConflict && (
                    <span className="text-[10px] font-mono bg-danger/10 text-danger border border-danger/25 px-2 py-px rounded-full">
                      ⚠ Superposición de plataformas
                    </span>
                  )}
                </div>

                {group.map(s => {
                  const reds = s.redes || []
                  const otherSlides = group.filter(x => x.id !== s.id)
                  const hasConflict = otherSlides.some(o => (o.redes || []).some(r => reds.includes(r)))

                  return (
                    <div key={s.id}
                      className={`flex items-start gap-2.5 p-2.5 bg-bg2 border rounded-[9px] mb-1.5 transition-all shadow-sm hover:border-black/13 hover:shadow-md ${hasConflict ? 'border-danger/30 bg-danger/5' : 'border-black/7'}`}>
                      <div className="flex flex-wrap gap-1 shrink-0 w-[70px]">
                        {reds.map(r => {
                          const meta = REDES.find(x => x.v === r)
                          return (
                            <span key={r} className="text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded"
                              style={{ background: (meta?.color || '#333') + '18', color: meta?.color || '#333' }}>
                              {meta?.label || r}
                            </span>
                          )
                        })}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium leading-snug mb-1">{s.title}</div>
                        <div className="flex gap-1.5 flex-wrap items-center">
                          {s.formato && <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-blue-600/10 text-blue-600">{s.formato}</span>}
                          {s.presentations?.client_id && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-agencia/7 text-agencia">{clients.find(c => c.id === s.presentations!.client_id)?.name || 'cliente'}</span>
                          )}
                          {(s as Record<string, unknown>)['campaña_nombre'] ? <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg4 text-gray-400">{String((s as Record<string, unknown>)['campaña_nombre'])}</span> : null}
                          {hasConflict && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-danger/10 text-danger">⚠ Misma red este día</span>}
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="text-[10px] font-mono">{s.status_prod || '—'}</span>
                        <span className="text-[10px] font-mono text-purple-600">{s.status_cm || '—'}</span>
                        <span className="text-[10px] font-mono text-gray-400">{s.equipo || ''}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
