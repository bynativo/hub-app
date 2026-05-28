import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { REDES } from '../../lib/constants'
import type { Slide, Presentation } from '../../lib/types'

// Visor público (sin login) para los links de compartir:
//   /presentation/:id
//   /presentation/:presId/slide/:slideId
//   /approve/:token
function isImageUrl(u?: string | null) {
  return !!u && /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(u)
}

function sortSlides(a: Slide, b: Slide): number {
  const am = a.posicion_manual, bm = b.posicion_manual
  if (am != null && bm != null) return am - bm
  const ap = a.fecha_publicacion, bp = b.fecha_publicacion
  if (ap && bp) return ap.localeCompare(bp)
  if (ap) return -1
  if (bp) return 1
  return (a.position || 0) - (b.position || 0)
}

function SlideCard({ slide, kv, highlight }: { slide: Slide; kv: string; highlight?: boolean }) {
  const reds = (slide.redes || []).map(r => REDES.find(x => x.v === r)?.label || r)
  const visual = slide.media_url || slide.contenido_url_externo || slide.canva_preview_url
  return (
    <div className={`bg-white border rounded-xl overflow-hidden shadow-sm ${highlight ? 'border-claude/40 ring-2 ring-claude/15' : 'border-black/10'}`}>
      <div className="flex">
        <div className="w-[5px] shrink-0" style={{ background: kv }} />
        <div className="flex-1 p-4">
          <div className="text-[17px] font-medium leading-snug mb-1.5" style={{ color: kv }}>{slide.title}</div>
          <div className="flex gap-1.5 flex-wrap mb-2">
            {slide.formato && <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{slide.formato}</span>}
            {reds.map(r => <span key={r} className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{r}</span>)}
            {slide.fecha_publicacion && <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">📅 {slide.fecha_publicacion}</span>}
          </div>
          {slide.idea_descripcion && <div className="text-[14px] text-gray-700 leading-relaxed whitespace-pre-wrap mb-2">{slide.idea_descripcion}</div>}
          {slide.texto_contenido && <div className="text-[14px] text-gray-700 leading-relaxed whitespace-pre-wrap mb-2">{slide.texto_contenido}</div>}
          {slide.canva_preview_url ? (
            <iframe src={slide.canva_preview_url} className="w-full rounded-lg border border-black/10 aspect-[9/16] max-h-[480px]" title={slide.title} />
          ) : isImageUrl(visual) ? (
            <img src={visual!} alt={slide.title} className="rounded-lg border border-black/10 max-h-[480px] w-full object-contain bg-gray-50" />
          ) : visual ? (
            <a href={visual} target="_blank" rel="noreferrer" className="inline-block text-[13px] text-claude border border-claude/30 bg-claude/5 px-3 py-1.5 rounded-md hover:bg-claude/10 break-all">Ver contenido ↗</a>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f6f5f3] text-gray-900">
      <div className="max-w-[760px] mx-auto px-4 py-8">{children}</div>
    </div>
  )
}

export function PublicView() {
  const path = window.location.pathname
  const [loading, setLoading] = useState(true)
  const [pres, setPres] = useState<Presentation | null>(null)
  const [slides, setSlides] = useState<Slide[]>([])
  const [approveSlide, setApproveSlide] = useState<Slide | null>(null)
  const [notFound, setNotFound] = useState(false)

  // Aprobación
  const [name, setName] = useState('')
  const [feedback, setFeedback] = useState('')
  const [sent, setSent] = useState<'aprobado' | 'cambios' | null>(null)

  const presMatch = path.match(/^\/presentation\/(\d+)(?:\/slide\/(\d+))?/)
  const approveMatch = path.match(/^\/approve\/([^/]+)/)
  const focusSlideId = presMatch?.[2] ? Number(presMatch[2]) : null

  useEffect(() => {
    (async () => {
      setLoading(true)
      if (approveMatch) {
        const token = decodeURIComponent(approveMatch[1])
        const { data } = await supabase.from('slides').select('*,presentations(*)').eq('approval_token', token).limit(1)
        const s = data?.[0] as (Slide & { presentations?: Presentation }) | undefined
        if (s) { setApproveSlide(s); setPres((s.presentations as Presentation) || null) } else setNotFound(true)
      } else if (presMatch) {
        const id = Number(presMatch[1])
        const { data: p } = await supabase.from('presentations').select('*').eq('id', id).limit(1)
        if (p?.[0]) {
          setPres(p[0] as Presentation)
          const { data: sl } = await supabase.from('slides').select('*').eq('presentation_id', id)
          setSlides(((sl as Slide[]) || []).sort(sortSlides))
        } else setNotFound(true)
      } else setNotFound(true)
      setLoading(false)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function submitApproval(estado: 'aprobado' | 'cambios') {
    if (!approveSlide || !name.trim()) return
    const prev = (approveSlide.aprobaciones || {}) as Record<string, unknown>
    const aprobaciones = { ...prev, revision: { estado, nombre: name.trim(), fecha: new Date().toISOString(), feedback: feedback.trim() || undefined } }
    await supabase.from('slides').update({
      aprobaciones,
      ...(estado === 'aprobado' ? { is_aprobada: true } : {}),
    }).eq('id', approveSlide.id)
    setSent(estado)
  }

  if (loading) return <Shell><div className="text-center py-20 text-gray-400">Cargando…</div></Shell>
  if (notFound) return <Shell><div className="text-center py-20 text-gray-400">No se encontró el contenido o el link expiró.</div></Shell>

  const kv = pres?.kv_color || '#16a34a'

  // ---- Aprobación ----
  if (approveSlide) {
    return (
      <Shell>
        <div className="text-[11px] font-mono text-gray-400 uppercase tracking-wider mb-1">Aprobación de contenido</div>
        <h1 className="font-serif text-2xl font-light mb-5" style={{ color: kv }}>{pres?.title || 'Contenido'}</h1>
        <SlideCard slide={approveSlide} kv={kv} highlight />
        <div className="mt-5 bg-white border border-black/10 rounded-xl p-4">
          {sent ? (
            <div className={`text-center py-3 font-medium ${sent === 'aprobado' ? 'text-green-700' : 'text-amber-600'}`}>
              {sent === 'aprobado' ? '✓ ¡Aprobado! Gracias.' : '✓ Enviaste tu feedback. Gracias.'}
            </div>
          ) : (
            <>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Tu nombre"
                className="w-full bg-gray-50 border border-black/10 rounded-lg px-3 py-2 text-[14px] outline-none mb-2.5" />
              <textarea value={feedback} onChange={e => setFeedback(e.target.value)} rows={3} placeholder="Comentarios o cambios (opcional)"
                className="w-full bg-gray-50 border border-black/10 rounded-lg px-3 py-2 text-[14px] outline-none resize-y mb-3" />
              <div className="flex gap-2">
                <button onClick={() => submitApproval('aprobado')} disabled={!name.trim()}
                  className="flex-1 text-sm bg-green-600 text-white px-4 py-2.5 rounded-lg cursor-pointer hover:opacity-90 disabled:opacity-40">✓ Aprobar</button>
                <button onClick={() => submitApproval('cambios')} disabled={!name.trim()}
                  className="flex-1 text-sm bg-white border border-black/15 text-gray-700 px-4 py-2.5 rounded-lg cursor-pointer hover:bg-gray-50 disabled:opacity-40">Pedir cambios</button>
              </div>
            </>
          )}
        </div>
      </Shell>
    )
  }

  // ---- Presentación / slide ----
  const shown = focusSlideId ? slides.filter(s => s.id === focusSlideId) : slides
  return (
    <Shell>
      <div className="h-2 rounded-full mb-4" style={{ background: kv }} />
      <h1 className="font-serif text-3xl font-light mb-1" style={{ color: kv }}>{pres?.title}</h1>
      {pres?.subtitle && <div className="text-gray-500 mb-1">{pres.subtitle}</div>}
      <div className="text-[12px] text-gray-400 mb-6">{focusSlideId ? '1 slide' : `${slides.length} slides`}{pres?.month_label ? ` · ${pres.month_label}` : ''}</div>
      {focusSlideId && (
        <a href={`/presentation/${pres?.id}`} className="inline-block text-[12px] text-claude mb-3 hover:underline">← Ver presentación completa</a>
      )}
      <div className="flex flex-col gap-3">
        {shown.map(s => <SlideCard key={s.id} slide={s} kv={kv} highlight={s.id === focusSlideId} />)}
        {!shown.length && <div className="text-center py-10 text-gray-400">Sin contenido todavía.</div>}
      </div>
    </Shell>
  )
}
