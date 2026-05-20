import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { PLAT_META } from '../../lib/constants'
import type { Slide } from '../../lib/types'

const PLAT_FILTERS = [
  { key: 'all', label: 'Todas' },
  { key: 'ig_feed', label: 'IG Feed', color: '#e1306c' },
  { key: 'ig_story', label: 'IG Story', color: '#e1306c' },
  { key: 'ig_reels', label: 'IG Reels', color: '#e1306c' },
  { key: 'tiktok', label: 'TikTok', color: '#333' },
  { key: 'youtube', label: 'YouTube', color: '#ff0000' },
  { key: 'youtube_shorts', label: 'YT Shorts', color: '#ff0000' },
  { key: 'facebook', label: 'Facebook', color: '#1877f2' },
  { key: 'x', label: 'X', color: '#333' },
  { key: 'anuncio_pauta', label: 'Pauta', color: '#7c3aed' },
]

export function GrillaView() {
  const [ctx, setCtx] = useState('banco')
  const [platFilter, setPlatFilter] = useState('all')
  const [slides, setSlides] = useState<(Slide & { presentations?: { title: string; kv_color: string; context: string } | null })[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadGrilla() }, [ctx])

  async function loadGrilla() {
    setLoading(true)
    const { data } = await supabase
      .from('slides')
      .select('*,presentations(title,kv_color,context)')
      .eq('is_aprobada', true)
      .order('grilla_date')
    setSlides(data || [])
    setLoading(false)
  }

  const filtered = slides
    .filter(s => s.presentations?.context === ctx)
    .filter(s => platFilter === 'all' || (s.plataformas || []).includes(platFilter))

  // Group by date
  const byDate: Record<string, typeof filtered> = {}
  filtered.forEach(s => {
    const d = s.grilla_date || 'sin-fecha'
    if (!byDate[d]) byDate[d] = []
    byDate[d].push(s)
  })

  // Detect conflicts
  const conflictDates = new Set<string>()
  Object.entries(byDate).forEach(([d, group]) => {
    if (d === 'sin-fecha') return
    const platCount: Record<string, number> = {}
    group.forEach(s => (s.plataformas || []).forEach(p => { platCount[p] = (platCount[p] || 0) + 1 }))
    if (Object.values(platCount).some(c => c > 1)) conflictDates.add(d)
  })

  return (
    <div className="animate-fade-in p-5">
      <h1 className="font-serif text-[26px] font-light mb-0.5">Grilla · Calendario de publicaciones</h1>
      <p className="text-gray-500 text-[13px] mb-4">Todas las plataformas · Filtrable por canal</p>

      <div className="flex gap-2 mb-3.5 flex-wrap items-center">
        <span className="text-xs text-gray-500 font-mono">Contexto:</span>
        {['banco', 'agencia'].map(c => (
          <button
            key={c}
            onClick={() => setCtx(c)}
            className={`text-xs px-3 py-1 rounded-lg border cursor-pointer transition-all ${
              ctx === c
                ? c === 'banco' ? 'border-banco/20 text-banco bg-banco/7' : 'border-agencia/20 text-agencia bg-agencia/7'
                : 'bg-bg3 border-black/7 text-gray-500 hover:bg-bg4'
            }`}
          >
            {c === 'banco' ? 'Banco Falabella' : 'Agencia'}
          </button>
        ))}

        <span className="text-xs text-gray-500 font-mono ml-2">Plataforma:</span>
        {PLAT_FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setPlatFilter(f.key)}
            className={`text-[11px] font-mono px-2.5 py-1 rounded-full border cursor-pointer transition-all ${
              platFilter === f.key
                ? 'font-semibold'
                : 'border-black/7 text-gray-400 bg-bg3 hover:border-black/13'
            }`}
            style={platFilter === f.key && f.color ? { background: f.color + '20', borderColor: f.color, color: f.color } : {}}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-7 text-gray-400">Cargando grilla...</div>
      ) : !filtered.length ? (
        <div className="text-center py-7 text-gray-400 text-[13px]">
          Sin contenido programado{platFilter !== 'all' ? ' para esta plataforma' : ''}.
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
                  <span className="text-[13px] font-medium">{dateLabel}</span>
                  <span className="text-[11px] font-mono text-gray-400">{group.length} pieza{group.length > 1 ? 's' : ''}</span>
                  {isConflict && (
                    <span className="text-[10px] font-mono bg-danger/10 text-danger border border-danger/25 px-2 py-px rounded-full">
                      ⚠ Superposicion de plataformas
                    </span>
                  )}
                </div>

                {group.map(s => {
                  const plats = s.plataformas || []
                  const otherSlides = group.filter(x => x.id !== s.id)
                  const hasConflict = otherSlides.some(o => (o.plataformas || []).some(p => plats.includes(p)))

                  return (
                    <div
                      key={s.id}
                      className={`flex items-start gap-2.5 p-2.5 bg-bg2 border rounded-[9px] mb-1.5 cursor-pointer transition-all shadow-sm hover:border-black/13 hover:shadow-md ${
                        hasConflict ? 'border-danger/30 bg-danger/3' : 'border-black/7'
                      }`}
                    >
                      <div className="flex flex-col gap-1 shrink-0">
                        {plats.slice(0, 4).map(p => (
                          <span
                            key={p}
                            className="text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded"
                            style={{ background: (PLAT_META[p]?.color || '#333') + '18', color: PLAT_META[p]?.color || '#333' }}
                          >
                            {(PLAT_META[p]?.label || p).split(' ')[0].toUpperCase().slice(0, 4)}
                          </span>
                        ))}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium leading-snug mb-1">{s.title}</div>
                        <div className="flex gap-1.5 flex-wrap items-center">
                          <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-blue-600/10 text-blue-600">
                            {(s.tipo_pieza || s.tipo_contenido || '—').toUpperCase()}
                          </span>
                          {s.campana_nombre && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg4 text-gray-400">{s.campana_nombre}</span>
                          )}
                          {s.producto && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg4 text-gray-400">{s.producto}</span>
                          )}
                          {hasConflict && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-danger/10 text-danger">⚠ Mismo dia</span>
                          )}
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
