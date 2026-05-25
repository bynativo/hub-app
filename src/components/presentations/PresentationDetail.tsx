import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useStore } from '../../lib/store'
import { PLAT_META, TIPO_META, PROD_STATUS, CM_STATUS, REDES, FORMATOS } from '../../lib/constants'
import { addDaysISO } from '../../lib/helpers'
import type { Slide } from '../../lib/types'

const PROD_CSS: Record<string, string> = {
  Pendiente: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
  'En grabacion': 'bg-blue-600/10 text-blue-600 border-blue-600/20',
  'En edicion': 'bg-blue-600/10 text-blue-600 border-blue-600/20',
  'Entregado a CM': 'bg-green-700/15 text-green-700 border-green-700/30',
  'En produccion': 'bg-blue-600/10 text-blue-600 border-blue-600/20',
  'Entregado al cliente': 'bg-green-700/15 text-green-700 border-green-700/30',
}
const CM_CSS: Record<string, string> = {
  'Pendiente de contenido': 'bg-gray-500/10 text-gray-500 border-gray-500/20',
  'Listo para programar': 'bg-purple-600/10 text-purple-600 border-purple-600/20',
  Programado: 'bg-blue-600/10 text-blue-600 border-blue-600/20',
  Publicado: 'bg-green-700/15 text-green-700 border-green-700/30',
}

function isImageUrl(u?: string | null) {
  return !!u && /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(u)
}

function VisualFrame({ label, url, feedRed }: { label: string; url?: string | null; feedRed?: string }) {
  const redMeta = feedRed ? REDES.find(x => x.v === feedRed) : undefined
  return (
    <div className="flex-1 min-w-0">
      <div className="text-[9px] font-mono text-gray-400 uppercase tracking-wider mb-1">{label}</div>
      <div className="rounded-lg overflow-hidden border border-black/10 bg-bg2 shadow-sm">
        {feedRed && (
          <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-black/7">
            <div className="w-4 h-4 rounded-full" style={{ background: (redMeta?.color || '#333') }} />
            <span className="text-[10px] font-medium">{redMeta?.label || feedRed}</span>
          </div>
        )}
        <div className="aspect-[9/16] bg-bg4 flex items-center justify-center relative">
          {isImageUrl(url) ? (
            <img src={url!} alt={label} className="w-full h-full object-cover" />
          ) : url ? (
            <a href={url} target="_blank" rel="noreferrer" className="text-[11px] text-claude px-2 text-center break-all hover:underline">Ver ↗</a>
          ) : (
            <span className="text-[10px] text-gray-400">Sin {label.toLowerCase()}</span>
          )}
        </div>
        {feedRed && (
          <div className="px-2 py-1.5">
            <div className="h-1.5 bg-bg4 rounded-full w-3/4 mb-1" />
            <div className="h-1.5 bg-bg4 rounded-full w-1/2" />
          </div>
        )}
      </div>
    </div>
  )
}

export function PresentationDetail({ presId, onClose }: { presId: number; onClose: () => void }) {
  const { presentations } = useStore()
  const pres = presentations.find(p => p.id === presId)
  const [slides, setSlides] = useState<Slide[]>([])
  const [activeIdx, setActiveIdx] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadSlides()
  }, [presId])

  async function loadSlides() {
    setLoading(true)
    const { data } = await supabase
      .from('slides')
      .select('*')
      .eq('presentation_id', presId)
      .order('position')
    setSlides(data || [])
    setActiveIdx(0)
    setLoading(false)
  }

  async function updateStatus(slideId: number, field: string, value: string) {
    await supabase.from('slides').update({ [field]: value }).eq('id', slideId)
    setSlides(prev => prev.map(s => s.id === slideId ? { ...s, [field]: value } : s))
  }

  async function updateField(slideId: number, field: string, value: string) {
    await supabase.from('slides').update({ [field]: value }).eq('id', slideId)
    setSlides(prev => prev.map(s => s.id === slideId ? { ...s, [field]: value } : s))
  }

  async function updateRaw(slideId: number, patch: Partial<Slide>) {
    await supabase.from('slides').update(patch).eq('id', slideId)
    setSlides(prev => prev.map(s => s.id === slideId ? { ...s, ...patch } : s))
  }

  if (!pres) return null
  const kv = pres.kv_color || '#16a34a'
  const slide = slides[activeIdx]
  const prodOpts = PROD_STATUS[pres.context] || PROD_STATUS.banco

  // --- Reglas de fechas (11b) ---
  const pub = slide?.fecha_publicacion || ''
  const entrega = slide?.fecha_validacion || ''
  const grab = slide?.fecha_filmacion || ''
  const maxEntrega = pub ? addDaysISO(pub, -1) : ''       // entrega >=24h antes de pub
  const maxGrab = entrega ? addDaysISO(entrega, -1) : ''  // grabación >=24h antes de entrega
  const entregaBad = !!(pub && entrega && entrega > maxEntrega)
  const grabBad = !!(entrega && grab && grab > maxGrab)
  const platDates = (slide?.fechas_por_plataforma || {}) as Record<string, string>

  async function setPub(v: string) {
    if (!slide) return
    const patch: Partial<Slide> = { fecha_publicacion: v || null }
    if (v && !entrega) patch.fecha_validacion = addDaysISO(v, -1) // entrega auto = pub - 24h, editable
    await updateRaw(slide.id, patch)
  }
  async function setPlatDate(red: string, v: string) {
    if (!slide) return
    const next = { ...platDates }
    if (v) next[red] = v; else delete next[red]
    await updateRaw(slide.id, { fechas_por_plataforma: next })
  }

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') setActiveIdx(i => Math.max(0, i - 1))
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') setActiveIdx(i => Math.min(slides.length - 1, i + 1))
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [slides.length, onClose])

  return (
    <div className="fixed inset-0 top-[52px] z-60 bg-bg grid grid-cols-[260px_1fr]">
      {/* Filmstrip */}
      <div className="bg-bg2 border-r border-black/13 overflow-y-auto flex flex-col">
        <div className="p-3.5 border-b border-black/7 shrink-0 bg-bg2">
          <button onClick={onClose} className="text-[11px] font-mono text-gray-400 cursor-pointer mb-2 flex items-center gap-1.5 hover:text-claude">
            ← Volver al hub
          </button>
          <div className="font-serif text-base font-light leading-snug mb-0.5" style={{ color: kv }}>{pres.title}</div>
          <div className="text-[11px] text-gray-400 font-mono">{slides.length} ideas · {pres.month_label}</div>
        </div>

        <div className="p-2 flex-1">
          {slides.map((s, i) => (
            <div
              key={s.id}
              onClick={() => setActiveIdx(i)}
              className={`flex gap-2 p-2 rounded-lg border-[1.5px] cursor-pointer transition-all mb-1 ${
                i === activeIdx
                  ? 'bg-bg2 border-claude/20 shadow-sm'
                  : 'border-transparent hover:bg-bg3'
              }`}
            >
              <div className="text-[10px] font-mono text-gray-400 w-4 shrink-0 pt-0.5 text-right">{s.position || i + 1}</div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium leading-snug mb-1 line-clamp-2">{s.title}</div>
                <div className="flex gap-1 flex-wrap">
                  <span className={`text-[9px] font-mono px-1.5 py-px rounded ${PROD_CSS[s.status_prod || 'Pendiente'] || PROD_CSS.Pendiente}`}>
                    {s.status_prod || 'Pendiente'}
                  </span>
                  {s.tipo_contenido && (
                    <span className="text-[9px] font-mono px-1.5 py-px rounded bg-bg4 text-gray-400">{s.tipo_contenido.toUpperCase()}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main area */}
      <div className="overflow-y-auto grid grid-cols-[1fr_300px]">
        {/* Slide document */}
        <div className="p-6 border-r border-black/7">
          {loading ? (
            <div className="text-center py-12 text-gray-400">Cargando...</div>
          ) : !slide ? (
            <div className="text-center py-12 text-gray-400">Sin ideas aun. Agrega la primera.</div>
          ) : (
            <div className="bg-bg2 border border-black/7 rounded-[14px] overflow-hidden shadow-md max-w-[700px] mx-auto">
              {/* Header */}
              <div className="flex items-stretch min-h-16">
                <div className="w-[5px] shrink-0" style={{ background: kv }} />
                <div className="flex-1 p-3.5">
                  <div className="text-[10px] font-mono text-gray-400 mb-0.5">#{slide.position || activeIdx + 1} · {pres.month_label}</div>
                  <div className="text-xl font-medium leading-snug mb-2" style={{ color: kv }}>{slide.title}</div>
                  <div className="flex gap-1.5 items-center flex-wrap">
                    <span className={`text-[11px] font-mono px-2.5 py-0.5 rounded-full border font-medium ${PROD_CSS[slide.status_prod || 'Pendiente'] || PROD_CSS.Pendiente}`}>
                      🎬 {slide.status_prod || 'Pendiente'}
                    </span>
                    <span className="text-gray-400 text-xs">·</span>
                    <span className={`text-[11px] font-mono px-2.5 py-0.5 rounded-full border font-medium ${CM_CSS[slide.status_cm || 'Pendiente de contenido'] || CM_CSS['Pendiente de contenido']}`}>
                      📅 {slide.status_cm || 'Pendiente de contenido'}
                    </span>
                    {slide.equipo && (
                      <>
                        <span className="text-gray-400 text-xs">·</span>
                        <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full" style={{ background: kv + '1a', color: kv, border: `1px solid ${kv}40` }}>
                          {slide.equipo}
                        </span>
                      </>
                    )}
                    {(slide.plataformas || []).map(pl => (
                      <span key={pl} className="text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded"
                            style={{ background: (PLAT_META[pl]?.color || '#333') + '18', color: PLAT_META[pl]?.color || '#333' }}>
                        {PLAT_META[pl]?.label || pl}
                      </span>
                    ))}
                  </div>
                  {(slide.formato || (slide.redes && slide.redes.length > 0)) && (
                    <div className="flex gap-1.5 items-center flex-wrap mt-1.5">
                      {slide.formato && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-bg4 text-gray-600 border border-black/7">
                          {slide.formato}{slide.formato === 'Colab' && slide.colab_nombre ? ` · ${slide.colab_nombre}` : ''}
                        </span>
                      )}
                      {(slide.redes || []).map(rv => {
                        const meta = REDES.find(x => x.v === rv)
                        return (
                          <span key={rv} className="text-[10px] font-mono px-2 py-0.5 rounded-full"
                                style={{ background: (meta?.color || '#333') + '14', color: meta?.color || '#333' }}>
                            {meta?.label || rv}
                          </span>
                        )
                      })}
                      {slide.tiene_guion && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-claude/10 text-claude">📝 con guión</span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Dates bar (editable, con reglas) */}
              <div className="border-t border-black/7">
                <div className="grid grid-cols-3">
                  <div className="p-2.5 border-r border-black/7">
                    <div className="text-[9px] font-mono text-gray-400 uppercase tracking-wider mb-1">🎬 Grabación</div>
                    <input type="date" value={grab} max={maxGrab || undefined} onChange={e => updateRaw(slide.id, { fecha_filmacion: e.target.value || null })}
                      className={`w-full bg-bg3 border rounded-md px-2 py-1 text-xs outline-none ${grabBad ? 'border-danger text-danger' : 'border-black/7'}`} />
                    {grabBad && <div className="text-[10px] text-danger mt-1">Máx {maxGrab} (24h antes de entrega)</div>}
                  </div>
                  <div className="p-2.5 border-r border-black/7">
                    <div className="text-[9px] font-mono text-gray-400 uppercase tracking-wider mb-1">📤 Entrega a CM</div>
                    <input type="date" value={entrega} max={maxEntrega || undefined} onChange={e => updateRaw(slide.id, { fecha_validacion: e.target.value || null })}
                      className={`w-full bg-bg3 border rounded-md px-2 py-1 text-xs outline-none ${entregaBad ? 'border-danger text-danger' : 'border-black/7'}`} />
                    {entregaBad && <div className="text-[10px] text-danger mt-1">Máx {maxEntrega} (24h antes de pub)</div>}
                  </div>
                  <div className="p-2.5">
                    <div className="text-[9px] font-mono text-gray-400 uppercase tracking-wider mb-1">📅 Publicación</div>
                    <input type="date" value={pub} onChange={e => setPub(e.target.value)}
                      className="w-full bg-bg3 border border-black/7 rounded-md px-2 py-1 text-xs outline-none" />
                  </div>
                </div>
                {(slide.redes || []).length > 0 && (
                  <div className="px-2.5 pb-2.5 pt-1 border-t border-black/7 bg-bg3/50">
                    <div className="text-[9px] font-mono text-gray-400 uppercase tracking-wider mb-1.5">Fecha por red (opcional)</div>
                    <div className="flex flex-wrap gap-2">
                      {(slide.redes || []).map(rv => {
                        const meta = REDES.find(x => x.v === rv)
                        return (
                          <div key={rv} className="flex items-center gap-1.5">
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: (meta?.color || '#333') + '14', color: meta?.color || '#333' }}>{meta?.label || rv}</span>
                            <input type="date" value={platDates[rv] || ''} onChange={e => setPlatDate(rv, e.target.value)}
                              className="bg-bg2 border border-black/7 rounded-md px-1.5 py-0.5 text-[11px] outline-none" />
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Body 2-col: Info + Visual */}
              <div className="grid grid-cols-2 border-t border-black/7">
                {/* Info col */}
                <div className="border-r border-black/7">
                  <div className="text-[9px] font-mono text-gray-400 uppercase tracking-widest px-3 py-2 border-b border-black/7 bg-bg4">Información</div>
                  {[
                    { k: 'Campaña', v: (slide as Record<string, any>)['campaña'] || (slide as Record<string, any>)['campaña_nombre'] || '' },
                    { k: 'Formato', v: slide.formato || '' },
                    { k: 'Redes', v: (slide.redes || []).map(r => REDES.find(x => x.v === r)?.label || r).join(' · ') },
                    { k: 'Responsable', v: slide.responsable || '' },
                  ].filter(r => r.v).map(row => (
                    <div key={row.k} className="flex border-b border-black/7">
                      <div className="text-[11px] text-gray-400 p-2 w-24 shrink-0 font-mono">{row.k}</div>
                      <div className="text-xs p-2 flex-1 leading-snug">{row.v}</div>
                    </div>
                  ))}
                  <div className="p-3">
                    {slide.idea_descripcion && (
                      <>
                        <div className="text-[9px] font-mono text-gray-400 uppercase tracking-wider mb-1">Concepto</div>
                        <div className="text-xs text-gray-500 leading-relaxed">{slide.idea_descripcion}</div>
                      </>
                    )}
                    {slide.insight && (
                      <div className="bg-claude/7 border border-claude/20 rounded-lg p-2.5 mt-2.5 text-xs leading-relaxed">
                        <div className="text-[9px] font-mono text-claude font-semibold mb-0.5 uppercase tracking-wider">💡 Insight</div>
                        {slide.insight}
                      </div>
                    )}
                  </div>
                </div>
                {/* Visual col */}
                <div className="bg-bg3">
                  <div className="text-[9px] font-mono text-gray-400 uppercase tracking-widest px-3 py-2 border-b border-black/7 bg-bg5">Visual</div>
                  <div className="p-3 flex gap-3">
                    <VisualFrame label="Referencia" url={slide.link_referencia} />
                    <VisualFrame label="Contenido final" url={slide.contenido_url_externo || slide.contenido_url_interno} feedRed={(slide.redes || [])[0]} />
                  </div>
                </div>
              </div>

              {/* Footer nav */}
              <div className="flex items-center justify-between p-2.5 border-t border-black/7 bg-bg3">
                <button
                  onClick={() => setActiveIdx(i => Math.max(0, i - 1))}
                  className="text-xs text-gray-400 px-2 py-1 rounded-md border border-black/7 bg-bg2 hover:bg-bg4 hover:text-gray-900 cursor-pointer transition-colors"
                >
                  ← Anterior
                </button>
                <span className="font-mono text-[11px] text-gray-400">{activeIdx + 1} / {slides.length}</span>
                <button
                  onClick={() => setActiveIdx(i => Math.min(slides.length - 1, i + 1))}
                  className="text-xs text-gray-400 px-2 py-1 rounded-md border border-black/7 bg-bg2 hover:bg-bg4 hover:text-gray-900 cursor-pointer transition-colors"
                >
                  Siguiente →
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Edit panel */}
        <div className="overflow-y-auto bg-bg2">
          {slide && (
            <>
              <div className="p-3.5 border-b border-black/7">
                <div className="text-[10px] font-mono text-gray-400 uppercase tracking-wider mb-2.5">Redes y formato</div>
                <span className="text-[10px] font-mono text-gray-400 uppercase block mb-1">Redes</span>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {REDES.map(r => {
                    const sel = (slide.redes || []).includes(r.v)
                    return (
                      <span key={r.v}
                        onClick={() => {
                          const next = sel ? (slide.redes || []).filter(x => x !== r.v) : [...(slide.redes || []), r.v]
                          updateRaw(slide.id, { redes: next })
                        }}
                        className={`text-[11px] font-mono px-2.5 py-1 rounded-[5px] border cursor-pointer transition-all ${sel ? 'font-semibold' : 'border-black/7 text-gray-400 bg-bg3 hover:border-black/13'}`}
                        style={sel ? { background: r.color + '20', borderColor: r.color, color: r.color } : {}}>
                        {r.label}
                      </span>
                    )
                  })}
                </div>
                <span className="text-[10px] font-mono text-gray-400 uppercase block mb-1">Formato</span>
                <select value={slide.formato || ''} onChange={e => updateRaw(slide.id, { formato: e.target.value || null })}
                  className="w-full bg-bg3 border border-black/7 rounded-lg px-2.5 py-1.5 text-xs outline-none cursor-pointer">
                  <option value="">Sin definir</option>
                  {FORMATOS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
                {slide.formato === 'Colab' && (
                  <input defaultValue={slide.colab_nombre || ''} onBlur={e => updateRaw(slide.id, { colab_nombre: e.target.value || null })}
                    placeholder="Nombre del colaborador" className="w-full bg-bg3 border border-black/7 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-claude/20 mt-2" />
                )}
                {slide.formato === 'Carrusel' && (
                  <div className="text-[10px] text-gray-400 mt-2">El slider de múltiples archivos del carrusel se gestiona en el body (paso 11b).</div>
                )}
                <div className="flex items-center gap-2 mt-3">
                  <button onClick={() => updateRaw(slide.id, { tiene_guion: !slide.tiene_guion })}
                    className={`w-9 h-5 rounded-full relative transition-colors ${slide.tiene_guion ? 'bg-claude' : 'bg-bg4'}`}>
                    <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all shadow-sm ${slide.tiene_guion ? 'left-[18px]' : 'left-0.5'}`} />
                  </button>
                  <span className="text-xs">Tiene guión <span className="text-gray-400">(habilita aprobación de guión)</span></span>
                </div>
              </div>

              <div className="p-3.5 border-b border-black/7">
                <div className="text-[10px] font-mono text-gray-400 uppercase tracking-wider mb-2.5">Plataformas y tipo</div>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {Object.entries(PLAT_META).map(([k, v]) => {
                    const sel = (slide.plataformas || []).includes(k)
                    return (
                      <span
                        key={k}
                        onClick={async () => {
                          const plats = sel
                            ? (slide.plataformas || []).filter(p => p !== k)
                            : [...(slide.plataformas || []), k]
                          await updateField(slide.id, 'plataformas', plats as unknown as string)
                          setSlides(prev => prev.map(s => s.id === slide.id ? { ...s, plataformas: plats } : s))
                        }}
                        className={`text-[11px] font-mono px-2.5 py-1 rounded-[5px] border cursor-pointer transition-all ${
                          sel ? 'font-semibold' : 'border-black/7 text-gray-400 bg-bg3 hover:border-black/13'
                        }`}
                        style={sel ? { background: v.color + '20', borderColor: v.color, color: v.color } : {}}
                      >
                        {v.label}
                      </span>
                    )
                  })}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(TIPO_META).map(([k, v]) => (
                    <span
                      key={k}
                      onClick={() => updateField(slide.id, 'tipo_pieza', k)}
                      className={`text-[11px] font-mono px-2 py-1 rounded-[5px] border cursor-pointer transition-all ${
                        (slide.tipo_pieza || slide.tipo_contenido) === k
                          ? 'bg-bg4 border-black/13 text-gray-900 font-semibold'
                          : 'border-black/7 text-gray-400 bg-bg3 hover:border-black/13'
                      }`}
                    >
                      {v.label}
                    </span>
                  ))}
                </div>
              </div>

              <div className="p-3.5 border-b border-black/7">
                <div className="text-[10px] font-mono text-gray-400 uppercase tracking-wider mb-2.5">Estados</div>
                <div className="mb-2">
                  <span className="text-[10px] font-mono text-gray-400 uppercase block mb-1">🎬 Produccion</span>
                  <select
                    value={slide.status_prod || 'Pendiente'}
                    onChange={e => updateStatus(slide.id, 'status_prod', e.target.value)}
                    className="w-full bg-bg3 border border-black/7 rounded-lg px-2.5 py-1.5 text-xs outline-none cursor-pointer"
                    style={{ borderColor: kv + '40' }}
                  >
                    {prodOpts.map(st => <option key={st}>{st}</option>)}
                  </select>
                </div>
                <div>
                  <span className="text-[10px] font-mono text-gray-400 uppercase block mb-1">📅 CM / Calendario RRSS</span>
                  <select
                    value={slide.status_cm || 'Pendiente de contenido'}
                    onChange={e => updateStatus(slide.id, 'status_cm', e.target.value)}
                    className="w-full bg-bg3 border border-black/7 rounded-lg px-2.5 py-1.5 text-xs outline-none cursor-pointer"
                    style={{ borderColor: 'rgba(124,58,237,0.3)' }}
                  >
                    {CM_STATUS.map(st => <option key={st}>{st}</option>)}
                  </select>
                </div>
              </div>

              <div className="p-3.5 border-b border-black/7">
                <div className="text-[10px] font-mono text-gray-400 uppercase tracking-wider mb-2.5">Editar idea</div>
                {[
                  { label: 'Titulo', field: 'title', value: slide.title },
                  { label: 'Campana', field: 'campana', value: slide.campana || '' },
                  { label: 'Responsable', field: 'responsable', value: slide.responsable || '' },
                  { label: 'Perfil / Rostro', field: 'perfil_rostro', value: slide.perfil_rostro || '' },
                ].map(f => (
                  <div key={f.field} className="mb-2">
                    <span className="text-[10px] font-mono text-gray-400 uppercase block mb-1">{f.label}</span>
                    <input
                      defaultValue={f.value}
                      onBlur={e => updateField(slide.id, f.field, e.target.value)}
                      className="w-full bg-bg3 border border-black/7 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-claude/20"
                    />
                  </div>
                ))}
                <div className="mb-2">
                  <span className="text-[10px] font-mono text-gray-400 uppercase block mb-1">Idea / concepto</span>
                  <textarea
                    defaultValue={slide.idea_descripcion || ''}
                    onBlur={e => updateField(slide.id, 'idea_descripcion', e.target.value)}
                    rows={3}
                    className="w-full bg-bg3 border border-black/7 rounded-lg px-2.5 py-1.5 text-xs outline-none resize-y focus:border-claude/20"
                  />
                </div>
                <div>
                  <span className="text-[10px] font-mono text-gray-400 uppercase block mb-1">Insight (opcional)</span>
                  <input
                    defaultValue={slide.insight || ''}
                    onBlur={e => updateField(slide.id, 'insight', e.target.value)}
                    className="w-full bg-bg3 border border-black/7 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-claude/20"
                    placeholder="Solo si aporta al concepto"
                  />
                </div>
              </div>

              <div className="p-3.5 border-b border-black/7">
                <div className="text-[10px] font-mono text-gray-400 uppercase tracking-wider mb-2.5">Visual</div>
                <div className="mb-2">
                  <span className="text-[10px] font-mono text-gray-400 uppercase block mb-1">URL referencia (9:16)</span>
                  <input defaultValue={slide.link_referencia || ''} onBlur={e => updateField(slide.id, 'link_referencia', e.target.value)}
                    className="w-full bg-bg3 border border-black/7 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-claude/20 font-mono" placeholder="https://… imagen o link" />
                </div>
                <div>
                  <span className="text-[10px] font-mono text-gray-400 uppercase block mb-1">URL contenido final (9:16)</span>
                  <input defaultValue={slide.contenido_url_externo || ''} onBlur={e => updateField(slide.id, 'contenido_url_externo', e.target.value)}
                    className="w-full bg-bg3 border border-black/7 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-claude/20 font-mono" placeholder="https://… imagen o link" />
                </div>
              </div>

              <div className="p-3.5">
                {slide.is_aprobada ? (
                  <div className="text-xs bg-green-700/15 border border-green-700/30 text-green-700 px-3.5 py-2 rounded-lg text-center font-medium">
                    ✓ Aprobada · En grilla {slide.grilla_date && `(${slide.grilla_date.slice(5).replace('-', '/')})`}
                  </div>
                ) : (
                  <button
                    onClick={async () => {
                      const date = prompt('Fecha de publicacion (YYYY-MM-DD):')
                      if (!date) return
                      await supabase.from('slides').update({ is_aprobada: true, grilla_date: date }).eq('id', slide.id)
                      setSlides(prev => prev.map(s => s.id === slide.id ? { ...s, is_aprobada: true, grilla_date: date } : s))
                    }}
                    className="w-full text-xs bg-success/10 border border-success/30 text-success px-3.5 py-2 rounded-lg cursor-pointer font-medium hover:bg-success/18 transition-colors"
                  >
                    ✓ Aprobar e integrar en grilla
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
