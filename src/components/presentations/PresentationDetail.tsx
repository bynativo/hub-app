import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useStore } from '../../lib/store'
import { PLAT_META, PROD_STATUS, CM_STATUS, REDES, FORMATOS, PUB_TYPES } from '../../lib/constants'
import { addDaysISO, todayISO, splitTitle, ctxLabel, ctxColor, deliveryWarning, pubTypeBadge } from '../../lib/helpers'
import { callClaudeProxy } from '../../lib/claude'
import { exportPresentationPDF } from '../../lib/pdfExport'
import type { Slide, Task } from '../../lib/types'

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

// Detecta el tipo de URL y devuelve la mejor estrategia de embed.
type PreviewKind = 'image' | 'sharepoint' | 'tiktok' | 'instagram' | 'drive' | 'pdf' | 'other'
function detectPreview(url: string): { kind: PreviewKind; embedUrl?: string; fileName?: string } {
  const u = url.toLowerCase()
  if (isImageUrl(url)) return { kind: 'image' }
  if (u.includes('sharepoint.com') || u.includes('onedrive.live') || u.includes('1drv.ms')) {
    const name = decodeURIComponent(url.split('?')[0].split('/').pop() || 'Archivo')
    return { kind: 'sharepoint', fileName: name }
  }
  // TikTok: /@user/video/123  o /video/123
  let m = url.match(/tiktok\.com\/(?:@[^/]+\/)?video\/(\d+)/i)
  if (m) return { kind: 'tiktok', embedUrl: `https://www.tiktok.com/embed/v2/${m[1]}` }
  // Instagram: /p/CODE/  /reel/CODE/  /tv/CODE/
  m = url.match(/instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/i)
  if (m) return { kind: 'instagram', embedUrl: `https://www.instagram.com/p/${m[1]}/embed` }
  // Google Drive: /file/d/ID/...   /document/d/ID/...
  m = url.match(/drive\.google\.com\/file\/d\/([^/]+)/i)
  if (m) return { kind: 'drive', embedUrl: `https://drive.google.com/file/d/${m[1]}/preview` }
  m = url.match(/docs\.google\.com\/(?:document|presentation|spreadsheets)\/d\/([^/]+)/i)
  if (m) {
    const seg = url.includes('/presentation/') ? 'presentation' : url.includes('/spreadsheets/') ? 'spreadsheets' : 'document'
    return { kind: 'drive', embedUrl: `https://docs.google.com/${seg}/d/${m[1]}/preview` }
  }
  if (/\.pdf(\?|$)/i.test(u)) return { kind: 'pdf', embedUrl: url }
  return { kind: 'other' }
}

// Previsualización inteligente del contenido de una slide según el tipo de URL.
function ContentPreview({ url }: { url: string }) {
  const p = detectPreview(url)
  if (p.kind === 'image') return <img src={url} alt="" className="w-full h-full object-cover" />
  if (p.kind === 'sharepoint') {
    return (
      <div className="flex flex-col items-center justify-center gap-1.5 p-3 text-center">
        <div className="text-2xl">🔷</div>
        <div className="text-[11px] font-medium text-gray-700 break-all line-clamp-2">{p.fileName}</div>
        <a href={url} target="_blank" rel="noreferrer" className="text-[11px] text-claude bg-claude/7 border border-claude/20 px-2.5 py-1 rounded-md hover:bg-claude/15">Abrir en SharePoint ↗</a>
        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-bg4 text-gray-500 mt-1">Requiere acceso corporativo</span>
      </div>
    )
  }
  if (p.embedUrl) {
    return (
      <iframe src={p.embedUrl} className="w-full h-full border-0" title="preview"
        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; autoplay" allowFullScreen />
    )
  }
  // Drive con link de carpeta o privado, o cualquier otro link → botón
  if (url.includes('drive.google')) {
    return (
      <div className="flex flex-col items-center justify-center gap-1.5 p-3 text-center">
        <div className="text-2xl">📁</div>
        <a href={url} target="_blank" rel="noreferrer" className="text-[11px] text-claude bg-claude/7 border border-claude/20 px-2.5 py-1 rounded-md hover:bg-claude/15">Abrir en Drive ↗</a>
      </div>
    )
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="text-[11px] text-claude px-2 text-center break-all hover:underline">Ver ↗</a>
  )
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
          {url ? <ContentPreview url={url} /> : <span className="text-[10px] text-gray-400">Sin {label.toLowerCase()}</span>}
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

type Entry =
  | { key: string; kind: 'slide'; slide: Slide; pub: string | null }
  | { key: string; kind: 'task'; task: Task; pub: string | null }

export function PresentationDetail({ presId, onClose }: { presId: number; onClose: () => void }) {
  const { presentations } = useStore()
  const loadAll = useStore(s => s.loadAll)
  const allTasks = useStore(s => s.tasks)
  const updateTask = useStore(s => s.updateTask)
  const pres = presentations.find(p => p.id === presId)
  const [slides, setSlides] = useState<Slide[]>([])
  const [activeIdx, setActiveIdx] = useState(0)
  const [loading, setLoading] = useState(true)
  const [approvalKey, setApprovalKey] = useState<string | null>(null)
  // Sugerencias de Claude (mejorar idea / extraer insight)
  const [aiKind, setAiKind] = useState<'idea' | 'insight' | null>(null)
  const [aiText, setAiText] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [ideaVer, setIdeaVer] = useState(0)
  const [insightVer, setInsightVer] = useState(0)
  // Drag & drop, menú "⋯" y eliminación de slide
  const [dragId, setDragId] = useState<number | null>(null)
  const [menuFor, setMenuFor] = useState<number | null>(null)
  const [deletingSlide, setDeletingSlide] = useState<Slide | null>(null)
  const [approverName, setApproverName] = useState('')
  const [feedbackMode, setFeedbackMode] = useState(false)
  const [feedbackText, setFeedbackText] = useState('')
  const [newGuion, setNewGuion] = useState('')

  useEffect(() => {
    loadSlides()
  }, [presId])

  async function loadSlides() {
    setLoading(true)
    const { data } = await supabase
      .from('slides')
      .select('*')
      .eq('presentation_id', presId)
      // La presentación se ordena por fecha de publicación (las sin fecha, al final)
      .order('fecha_publicacion', { ascending: true, nullsFirst: false })
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

  async function addSlide(kind: 'content' | 'canva') {
    const isCanva = kind === 'canva'
    // IMPORTANTE: abrir Canva ANTES de cualquier await — si lo hacemos después
    // el navegador lo trata como popup no iniciado por el usuario y lo bloquea.
    let canvaTab: Window | null = null
    if (isCanva) {
      canvaTab = window.open('https://www.canva.com/design?create&type=Instagram-Story', '_blank', 'noopener,noreferrer')
    }
    const nextPos = (slides[slides.length - 1]?.position || slides.length) + 1
    const { data, error } = await supabase.from('slides').insert({
      presentation_id: presId, position: nextPos,
      title: isCanva ? 'Slide de Canva' : 'Nueva idea',
      es_texto: isCanva, es_slide_libre: isCanva,
    }).select().single()
    if (error || !data) {
      alert('Error creando slide: ' + error?.message)
      canvaTab?.close()
      return
    }
    setSlides(prev => [...prev, data as Slide])
    setActiveIdx(slides.length)
  }

  // Convierte una tarea de contenido vinculada en un slide de producción (rico).
  async function createSlideFromTask(t: Task) {
    const { count } = await supabase.from('slides').select('id', { count: 'exact', head: true }).eq('presentation_id', presId)
    const pt = t.tipo_publicacion || t.content_pub_type || 'propia'
    // 'colab' es el nuevo equivalente del legado 'colab_ig'.
    const isColab = pt === 'colab' || pt === 'colab_ig'
    const { data, error } = await supabase.from('slides').insert({
      presentation_id: presId, title: t.title, task_id: t.id, position: (count || 0) + 1,
      fecha_publicacion: t.publish_date, fecha_validacion: t.due_date, fecha_filmacion: t.recording_date,
      grilla_date: t.publish_date,
      content_pub_type: pt,
      influencer_name: t.influencer_nombre || t.influencer_name,
      influencer_handle: t.influencer_handle,
      // "Colab en nuestra cuenta" → formato = 'Colab' y colab_nombre = handle del influencer.
      formato: isColab ? 'Colab' : (t.content_format || null),
      colab_nombre: isColab ? (t.influencer_handle || null) : null,
    }).select().single()
    if (error || !data) { alert('Error creando slide: ' + error?.message); return }
    setSlides(prev => [...prev, data as Slide])
  }
  async function unlinkTask(t: Task) {
    await updateTask(t.id, { presentation_id: null })
  }

  // Drag & drop en el filmstrip: renumera posicion_manual de TODAS las slides en
  // el orden visual nuevo. Las tareas-entrada se acomodan por publish_date entre las slides.
  async function handleSlideDrop(targetIdx: number) {
    if (dragId == null) return
    const dragIdx = entries.findIndex(e => e.kind === 'slide' && e.slide.id === dragId)
    if (dragIdx < 0) { setDragId(null); return }
    const newOrder = [...entries]
    const [moved] = newOrder.splice(dragIdx, 1)
    const insertIdx = dragIdx < targetIdx ? targetIdx - 1 : targetIdx
    newOrder.splice(insertIdx, 0, moved)
    // Renumerar pm para todos los slides en el nuevo orden
    let i = 0
    const next = [...slides]
    for (const en of newOrder) {
      if (en.kind !== 'slide') continue
      i++
      if (en.slide.posicion_manual !== i) {
        await supabase.from('slides').update({ posicion_manual: i }).eq('id', en.slide.id)
        const idx = next.findIndex(x => x.id === en.slide.id)
        if (idx >= 0) next[idx] = { ...next[idx], posicion_manual: i }
      }
    }
    setSlides(next)
    setDragId(null)
  }

  async function restoreByDate() {
    await supabase.from('slides').update({ posicion_manual: null }).eq('presentation_id', presId)
    setSlides(prev => prev.map(s => ({ ...s, posicion_manual: null })))
  }

  async function deleteSlide() {
    if (!deletingSlide) return
    await supabase.from('slides').delete().eq('id', deletingSlide.id)
    setSlides(prev => prev.filter(s => s.id !== deletingSlide.id))
    setDeletingSlide(null)
    setActiveIdx(0)
  }

  // Mejorar la idea con Claude (reformula más claro y ejecutable)
  async function improveIdea(s: Slide) {
    const text = (s.idea_descripcion || s.title || '').trim()
    if (!text) return
    setAiBusy(true); setAiKind('idea'); setAiText('')
    try {
      const reply = await callClaudeProxy(
        [{ role: 'user', content: `Reformulá esta idea para una pieza de contenido de redes sociales: más clara, ejecutable y directa. Conservá la intención. Tono humano en español. Devolvé solo la versión mejorada, sin preámbulos.\n\nIdea actual:\n${text}` }],
        'Sos un editor de ideas de contenido para redes. Reformulás de forma clara, accionable y directa.'
      )
      setAiText(reply.trim())
    } catch {
      alert('No se pudo mejorar la idea (proxy de Claude no disponible).')
      setAiKind(null)
    } finally { setAiBusy(false) }
  }
  // Extraer el insight subyacente (verdad humana / tensión / motivación)
  async function extractInsight(s: Slide) {
    const text = (s.idea_descripcion || s.title || '').trim()
    if (!text) return
    setAiBusy(true); setAiKind('insight'); setAiText('')
    try {
      const reply = await callClaudeProxy(
        [{ role: 'user', content: `Leé esta idea de contenido y extraé EL INSIGHT subyacente: la verdad humana, tensión o motivación que la hace relevante. En 1 o 2 oraciones, en español, directo, sin preámbulos.\n\nIdea:\n${text}` }],
        'Sos un estratega de contenido. Identificás insights humanos (verdad, tensión, motivación) en una idea.'
      )
      setAiText(reply.trim())
    } catch {
      alert('No se pudo extraer el insight (proxy de Claude no disponible).')
      setAiKind(null)
    } finally { setAiBusy(false) }
  }
  async function applyAiSuggestion(s: Slide) {
    if (!aiKind || !aiText.trim()) return
    if (aiKind === 'idea') { await updateRaw(s.id, { idea_descripcion: aiText.trim() }); setIdeaVer(v => v + 1) }
    else if (aiKind === 'insight') { await updateRaw(s.id, { insight: aiText.trim() }); setInsightVer(v => v + 1) }
    setAiKind(null); setAiText('')
  }
  function dismissAi() { setAiKind(null); setAiText('') }

  if (!pres) return null
  const kv = pres.kv_color || '#16a34a'

  // Entradas de la presentación = slides reales + tareas de contenido vinculadas
  // (tasks.presentation_id) que aún no tienen slide. Ordenadas por fecha de
  // publicación ASC (las sin fecha, al final). Se recalcula en cada render, así
  // que cambiar publish_date (de una slide o tarea) re-ordena automáticamente.
  const linkedTasks = allTasks.filter(t => t.presentation_id === presId && t.task_type === 'contenido' && !t.archived_at && !t.done)
  const slideTaskIds = new Set(slides.filter(s => s.task_id).map(s => s.task_id))
  const pubOfSlide = (s: Slide) => s.task_id ? (allTasks.find(t => t.id === s.task_id)?.publish_date ?? s.fecha_publicacion) : s.fecha_publicacion
  const entries: Entry[] = [
    ...slides.map(s => ({ key: `s${s.id}`, kind: 'slide' as const, slide: s, pub: pubOfSlide(s) })),
    ...linkedTasks.filter(t => !slideTaskIds.has(t.id)).map(t => ({ key: `t${t.id}`, kind: 'task' as const, task: t, pub: t.publish_date })),
  ].sort((a, b) => {
    // Primero, slides con posición manual (en su orden); después por fecha de publicación; fallback a position.
    const apm = a.kind === 'slide' ? a.slide.posicion_manual : null
    const bpm = b.kind === 'slide' ? b.slide.posicion_manual : null
    if (apm != null && bpm != null) return apm - bpm
    if (apm != null) return -1
    if (bpm != null) return 1
    if (a.pub && b.pub) return a.pub.localeCompare(b.pub)
    if (a.pub) return -1
    if (b.pub) return 1
    const ap = a.kind === 'slide' ? (a.slide.position || 0) : 0
    const bp = b.kind === 'slide' ? (b.slide.position || 0) : 0
    return ap - bp
  })
  const entry = entries.length ? entries[Math.min(activeIdx, entries.length - 1)] : undefined
  const slide = entry?.kind === 'slide' ? entry.slide : undefined

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

  // --- Aprobaciones (11c) ---
  const aprob = (slide?.aprobaciones || {}) as Record<string, { estado: string; nombre: string; fecha: string; feedback?: string }>
  const tieneGuion = !!slide?.tiene_guion
  const ideaOk = aprob.idea?.estado === 'aprobado'
  const guionOk = aprob.guion?.estado === 'aprobado'
  const enabledApproval: Record<string, boolean> = {
    idea: true,
    guion: tieneGuion && ideaOk,
    contenido: tieneGuion ? guionOk : ideaOk,
  }

  function openApproval(key: string) {
    if (!enabledApproval[key]) return
    setApprovalKey(key); setApproverName(''); setFeedbackText(''); setFeedbackMode(false)
  }
  async function submitApproval(action: 'aprobar' | 'rechazar' | 'feedback') {
    if (!slide || !approvalKey || !approverName.trim()) return
    const entry = {
      estado: action === 'aprobar' ? 'aprobado' : 'rechazado',
      nombre: approverName.trim(), fecha: todayISO(),
      ...(action === 'feedback' ? { feedback: feedbackText.trim() } : {}),
    }
    const patch: Partial<Slide> = { aprobaciones: { ...aprob, [approvalKey]: entry } }
    if (approvalKey === 'contenido' && action === 'aprobar') patch.is_aprobada = true
    await updateRaw(slide.id, patch)
    if (action === 'feedback' && feedbackText.trim()) {
      await supabase.from('tasks').insert({
        title: `Revisión: ${slide.title}`, context: pres!.context, status: 'Inbox', priority: 'alta',
        origin: 'reunion', task_type: 'contenido', done: false,
        notes: `Feedback de ${approverName.trim()} (aprobación ${approvalKey}): ${feedbackText.trim()}`,
        delegated_to: slide.responsable || null, cats: [], plan: [], meeting_agenda: [],
        slide_idea: slide.title, slide_number: slide.position,
      })
      await loadAll()
    }
    setApprovalKey(null)
  }
  async function addGuionVersion() {
    if (!slide || !newGuion.trim()) return
    const versions = [...(slide.guion_versiones || []), { v: (slide.guion_versiones?.length || 0) + 1, texto: newGuion.trim(), fecha: todayISO() }]
    await updateRaw(slide.id, { guion_versiones: versions })
    setNewGuion('')
  }

  const shareBase = 'https://hub-app-seven.vercel.app'

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
          <div className="text-[11px] text-gray-400 font-mono">{entries.length} ideas · {pres.month_label}</div>
          <button onClick={() => exportPresentationPDF(pres)}
            className="mt-2 w-full text-[11px] text-claude bg-claude/7 border border-claude/20 px-2 py-1 rounded-md cursor-pointer hover:bg-claude/15">
            📄 Exportar PDF
          </button>
        </div>

        <div className="p-2 flex-1">
          {entries.map((e, i) => (
            <div
              key={e.key}
              onClick={() => setActiveIdx(i)}
              draggable={e.kind === 'slide'}
              onDragStart={e.kind === 'slide' ? (evt) => { setDragId(e.slide.id); evt.dataTransfer.setData('text/plain', String(e.slide.id)); evt.dataTransfer.effectAllowed = 'move' } : undefined}
              onDragOver={(evt) => { if (dragId != null) { evt.preventDefault(); evt.dataTransfer.dropEffect = 'move' } }}
              onDrop={(evt) => { evt.preventDefault(); handleSlideDrop(i) }}
              className={`relative flex gap-2 p-2 rounded-lg border-[1.5px] cursor-pointer transition-all mb-1 ${
                i === activeIdx
                  ? 'bg-bg2 border-claude/20 shadow-sm'
                  : 'border-transparent hover:bg-bg3'
              } ${dragId != null && e.kind === 'slide' && e.slide.id === dragId ? 'opacity-40' : ''}`}
            >
              {e.kind === 'slide' && (
                <>
                  <button onClick={(evt) => { evt.stopPropagation(); setMenuFor(menuFor === e.slide.id ? null : e.slide.id) }}
                    className="absolute top-1 right-1 text-gray-300 hover:text-gray-900 cursor-pointer px-1 leading-none text-xs z-[5]" title="Opciones">⋯</button>
                  {menuFor === e.slide.id && (
                    <>
                      <div className="fixed inset-0 z-[5]" onClick={(evt) => { evt.stopPropagation(); setMenuFor(null) }} />
                      <div className="absolute right-1 top-6 bg-bg2 border border-black/7 rounded-md shadow-lg py-1 z-10 w-40" onClick={(evt) => evt.stopPropagation()}>
                        <button onClick={() => { setDeletingSlide(e.slide); setMenuFor(null) }}
                          className="w-full text-left px-2.5 py-1 text-[11px] text-danger hover:bg-danger/10 cursor-pointer">🗑 Eliminar slide</button>
                      </div>
                    </>
                  )}
                </>
              )}
              <div className="text-[10px] font-mono text-gray-400 w-4 shrink-0 pt-0.5 text-right">{i + 1}</div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium leading-snug mb-1 line-clamp-2">{e.kind === 'slide' ? e.slide.title : splitTitle(e.task.title).name}</div>
                <div className="flex gap-1 flex-wrap">
                  {e.kind === 'slide' ? (
                    <>
                      <span className={`text-[9px] font-mono px-1.5 py-px rounded ${PROD_CSS[e.slide.status_prod || 'Pendiente'] || PROD_CSS.Pendiente}`}>
                        {e.slide.status_prod || 'Pendiente'}
                      </span>
                      {e.slide.tipo_contenido && (
                        <span className="text-[9px] font-mono px-1.5 py-px rounded bg-bg4 text-gray-400">{e.slide.tipo_contenido.toUpperCase()}</span>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="text-[9px] font-mono px-1.5 py-px rounded bg-claude/10 text-claude">tarea</span>
                      {e.pub && <span className="text-[9px] font-mono px-1.5 py-px rounded bg-purple-600/10 text-purple-600">Pub {e.pub.slice(5).replace('-', '/')}</span>}
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
          {!entries.length && <div className="text-center py-6 text-gray-300 text-[11px]">Sin contenido aún</div>}
        </div>

        <div className="p-2.5 border-t border-black/7 flex flex-col gap-1.5 shrink-0">
          <button onClick={() => addSlide('content')} className="text-[11px] text-claude bg-claude/7 border border-claude/20 px-2 py-1.5 rounded-md cursor-pointer hover:bg-claude/15">+ Idea de contenido</button>
          <button onClick={() => addSlide('canva')} className="text-[11px] text-gray-500 bg-bg3 border border-black/7 px-2 py-1.5 rounded-md cursor-pointer hover:bg-bg4">🎨 + Slide en Canva</button>
          {slides.some(s => s.posicion_manual != null) && (
            <button onClick={restoreByDate} className="text-[10px] text-gray-400 hover:text-claude cursor-pointer mt-1 text-left">↻ Restaurar orden por fecha</button>
          )}
        </div>
      </div>

      {/* Main area */}
      <div className="overflow-y-auto grid grid-cols-[1fr_300px]">
        {/* Slide document */}
        <div className="p-6 border-r border-black/7">
          {pres.external_url && (
            <div className="mb-4 bg-bg2 border border-black/7 rounded-xl overflow-hidden max-w-[700px] mx-auto">
              <div className="flex items-center justify-between px-3 py-2 border-b border-black/7">
                <span className="text-[10px] font-mono text-gray-400 uppercase tracking-wider">📄 Archivo importado</span>
                <a href={pres.external_url} target="_blank" rel="noreferrer" className="text-[11px] text-claude hover:underline">Abrir ↗</a>
              </div>
              <iframe
                src={/\.pdf(\?|$)/i.test(pres.external_url) ? pres.external_url : `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(pres.external_url)}`}
                className="w-full h-[460px] bg-bg3" title="Archivo importado" />
            </div>
          )}
          {loading ? (
            <div className="text-center py-12 text-gray-400">Cargando...</div>
          ) : !slide ? (
            <div className="text-center py-12 text-gray-400">Sin ideas aun. Agrega la primera.</div>
          ) : slide.es_slide_libre ? (
            <div className="bg-bg2 border border-black/7 rounded-[14px] overflow-hidden shadow-md max-w-[700px] mx-auto">
              <div className="flex items-stretch">
                <div className="w-[5px] shrink-0" style={{ background: kv }} />
                <div className="flex-1 p-3.5 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-mono text-gray-400 mb-0.5">#{slide.position || activeIdx + 1} · 🎨 Slide de Canva</div>
                    <input defaultValue={slide.title} onBlur={e => updateRaw(slide.id, { title: e.target.value })}
                      className="text-xl font-medium w-full bg-transparent outline-none border-b border-transparent focus:border-black/13" />
                  </div>
                  <a href={slide.canva_design_id ? `https://www.canva.com/design/${slide.canva_design_id}/edit` : 'https://www.canva.com/design?create&type=Instagram-Story'}
                    target="_blank" rel="noopener noreferrer"
                    className="text-[11px] text-claude bg-claude/7 border border-claude/20 px-2.5 py-1 rounded-md hover:bg-claude/15 shrink-0">
                    {slide.canva_design_id ? '✎ Abrir en Canva' : '+ Crear en Canva'}
                  </a>
                </div>
              </div>
              <div className="bg-bg4 mx-auto" style={{ maxWidth: 380 }}>
                <div className="aspect-[9/16]">
                  {slide.canva_preview_url ? (
                    <iframe src={slide.canva_design_id ? `https://www.canva.com/design/${slide.canva_design_id}/view?embed` : slide.canva_preview_url}
                      className="w-full h-full border-0" allowFullScreen title="Canva" />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full p-4 text-center gap-2">
                      <div className="text-4xl">🎨</div>
                      <div className="text-[13px] text-gray-500">Editá la slide en Canva y pegá el link de previsualización abajo.</div>
                    </div>
                  )}
                </div>
              </div>
              <div className="p-3 border-t border-black/7 flex flex-col gap-1.5">
                <label className="text-[10px] font-mono text-gray-400 uppercase tracking-wider">Link de previsualización de Canva</label>
                <input defaultValue={slide.canva_preview_url || ''} onBlur={e => {
                  const url = e.target.value.trim()
                  const id = url.match(/canva\.com\/design\/([^/?]+)/i)?.[1] || null
                  updateRaw(slide.id, { canva_preview_url: url || null, canva_design_id: id })
                }} placeholder="https://www.canva.com/design/…/view" className="bg-bg3 border border-black/7 rounded-md px-2.5 py-1.5 text-xs outline-none focus:border-claude/20 font-mono" />
              </div>
              <div className="flex items-center justify-between p-2.5 border-t border-black/7 bg-bg3">
                <button onClick={() => setActiveIdx(i => Math.max(0, i - 1))} className="text-xs text-gray-400 px-2 py-1 rounded-md border border-black/7 bg-bg2 hover:bg-bg4 hover:text-gray-900 cursor-pointer transition-colors">← Anterior</button>
                <span className="font-mono text-[11px] text-gray-400">{activeIdx + 1} / {entries.length}</span>
                <button onClick={() => setActiveIdx(i => Math.min(entries.length - 1, i + 1))} className="text-xs text-gray-400 px-2 py-1 rounded-md border border-black/7 bg-bg2 hover:bg-bg4 hover:text-gray-900 cursor-pointer transition-colors">Siguiente →</button>
              </div>
            </div>
          ) : slide.es_texto ? (
            <div className="bg-bg2 border border-black/7 rounded-[14px] overflow-hidden shadow-md max-w-[700px] mx-auto">
              <div className="flex items-stretch">
                <div className="w-[5px] shrink-0" style={{ background: kv }} />
                <div className="flex-1 p-5">
                  <div className="text-[10px] font-mono text-gray-400 mb-1">#{slide.position || activeIdx + 1} · 📄 Sección de texto</div>
                  <div className="text-2xl font-medium leading-snug mb-3" style={{ color: kv }}>{slide.title}</div>
                  {slide.texto_contenido && <div className="text-[14px] text-gray-700 leading-relaxed whitespace-pre-wrap mb-4">{slide.texto_contenido}</div>}
                  {slide.media_url && (
                    isImageUrl(slide.media_url)
                      ? <img src={slide.media_url} alt="" className="rounded-lg border border-black/10 max-h-[420px] w-full object-contain bg-bg3" />
                      : <div className="aspect-[9/16] max-h-[480px] mx-auto rounded-lg border border-black/10 overflow-hidden bg-bg3">
                          <ContentPreview url={slide.media_url} />
                        </div>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between p-2.5 border-t border-black/7 bg-bg3">
                <button onClick={() => setActiveIdx(i => Math.max(0, i - 1))} className="text-xs text-gray-400 px-2 py-1 rounded-md border border-black/7 bg-bg2 hover:bg-bg4 hover:text-gray-900 cursor-pointer transition-colors">← Anterior</button>
                <span className="font-mono text-[11px] text-gray-400">{activeIdx + 1} / {slides.length}</span>
                <button onClick={() => setActiveIdx(i => Math.min(slides.length - 1, i + 1))} className="text-xs text-gray-400 px-2 py-1 rounded-md border border-black/7 bg-bg2 hover:bg-bg4 hover:text-gray-900 cursor-pointer transition-colors">Siguiente →</button>
              </div>
            </div>
          ) : (
            <div className="bg-bg2 border border-black/7 rounded-[14px] overflow-hidden shadow-md max-w-[700px] mx-auto">
              {/* Header */}
              <div className="flex items-stretch min-h-16">
                <div className="w-[5px] shrink-0" style={{ background: kv }} />
                <div className="flex-1 p-3.5">
                  <div className="text-[10px] font-mono text-gray-400 mb-0.5">#{slide.position || activeIdx + 1} · {pres.month_label}</div>
                  <div className="text-xl font-medium leading-snug mb-2" style={{ color: kv }}>{slide.title}</div>
                  <div className="flex gap-1.5 items-center flex-wrap">
                    {pubTypeBadge(slide.content_pub_type) && (
                      <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full font-medium"
                        style={{ background: pubTypeBadge(slide.content_pub_type)!.color + '18', color: pubTypeBadge(slide.content_pub_type)!.color }}>
                        {pubTypeBadge(slide.content_pub_type)!.label}{slide.influencer_handle ? ` · ${slide.influencer_handle}` : ''}
                      </span>
                    )}
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

              {/* Body 2-col: (Info + Visual) | (Idea + Guión) */}
              <div className="grid grid-cols-2 border-t border-black/7">
                {/* Izquierda: Info + Visual */}
                <div className="border-r border-black/7">
                  <div className="text-[9px] font-mono text-gray-400 uppercase tracking-widest px-3 py-2 border-b border-black/7 bg-bg4">Información</div>
                  {[
                    { k: 'Campaña', v: (slide as Record<string, any>)['campaña'] || (slide as Record<string, any>)['campaña_nombre'] || '' },
                    { k: 'Formato', v: slide.formato ? `${slide.formato}${slide.formato === 'Colab' && slide.colab_nombre ? ` · ${slide.colab_nombre}` : ''}` : '' },
                    { k: 'Redes', v: (slide.redes || []).map(r => REDES.find(x => x.v === r)?.label || r).join(' · ') },
                    { k: 'Influencer', v: (slide.influencer_name || slide.influencer_handle) ? `${slide.influencer_name || ''}${slide.influencer_handle ? ` (${slide.influencer_handle})` : ''}`.trim() : '' },
                    { k: 'Publicación', v: (slide.content_pub_type && slide.content_pub_type !== 'propia') ? (PUB_TYPES.find(p => p.v === slide.content_pub_type)?.label || '') : '' },
                    { k: 'Responsable', v: slide.responsable || '' },
                  ].filter(r => r.v).map(row => (
                    <div key={row.k} className="flex border-b border-black/7">
                      <div className="text-[11px] text-gray-400 p-2 w-24 shrink-0 font-mono">{row.k}</div>
                      <div className="text-xs p-2 flex-1 leading-snug">{row.v}</div>
                    </div>
                  ))}
                  <div className="text-[9px] font-mono text-gray-400 uppercase tracking-widest px-3 py-2 border-b border-t border-black/7 bg-bg4">Visual</div>
                  <div className="p-3">
                    {slide.formato === 'Carrusel' && (slide.carrusel_archivos || []).filter(Boolean).length > 0 ? (
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {(slide.carrusel_archivos || []).filter(Boolean).map((u, i) => (
                          <div key={i} className="shrink-0 w-[88px]">
                            <div className="text-[9px] font-mono text-gray-400 mb-1">#{i + 1}</div>
                            <div className="aspect-[9/16] rounded-md overflow-hidden border border-black/10 bg-bg4 flex items-center justify-center">
                              {isImageUrl(u) ? <img src={u} alt="" className="w-full h-full object-cover" /> : <a href={u} target="_blank" rel="noreferrer" className="text-[10px] text-claude px-1 text-center break-all hover:underline">Ver ↗</a>}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex gap-3">
                        <VisualFrame label="Referencia" url={slide.link_referencia} />
                        <VisualFrame label="Contenido final" url={slide.contenido_url_externo || slide.contenido_url_interno} feedRed={(slide.redes || [])[0]} />
                      </div>
                    )}
                  </div>
                </div>
                {/* Derecha: Idea + Guión */}
                <div className="bg-bg3">
                  <div className="text-[9px] font-mono text-gray-400 uppercase tracking-widest px-3 py-2 border-b border-black/7 bg-bg5">Idea</div>
                  <div className="p-3">
                    {slide.idea_descripcion
                      ? <div className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap">{slide.idea_descripcion}</div>
                      : <div className="text-[11px] text-gray-400 italic">Sin concepto todavía.</div>}
                    {slide.insight && (
                      <div className="bg-claude/7 border border-claude/20 rounded-lg p-2.5 mt-2.5 text-xs leading-relaxed">
                        <div className="text-[9px] font-mono text-claude font-semibold mb-0.5 uppercase tracking-wider">💡 Insight</div>
                        {slide.insight}
                      </div>
                    )}
                  </div>
                  {slide.tiene_guion && (
                    <>
                      <div className="text-[9px] font-mono text-gray-400 uppercase tracking-widest px-3 py-2 border-b border-t border-black/7 bg-bg5">
                        Guión{(slide.guion_versiones || []).length > 0 ? ` · v${(slide.guion_versiones || []).length}` : ''}
                      </div>
                      <div className="p-3">
                        {(slide.guion_versiones || []).length ? (
                          <div className="bg-bg2 border border-black/7 rounded-lg p-2.5 text-xs text-gray-600 whitespace-pre-wrap leading-relaxed max-h-[220px] overflow-y-auto">
                            {(slide.guion_versiones || [])[(slide.guion_versiones || []).length - 1].texto}
                          </div>
                        ) : (
                          <div className="text-[11px] text-gray-400 italic">Sin guión todavía. Agregá una versión en el panel derecho.</div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Aprobaciones */}
              <div className="border-t border-black/7 px-3.5 py-2.5">
                <div className="text-[9px] font-mono text-gray-400 uppercase tracking-wider mb-1.5">Aprobaciones secuenciales</div>
                <div className="flex gap-2 flex-wrap">
                  {([{ k: 'idea', l: 'Idea' }, ...(tieneGuion ? [{ k: 'guion', l: 'Guión' }] : []), { k: 'contenido', l: 'Contenido final' }]).map(a => {
                    const st = aprob[a.k]
                    const en = enabledApproval[a.k]
                    const color = st?.estado === 'aprobado' ? '#16a34a' : st?.estado === 'rechazado' ? '#dc2626' : '#6b7280'
                    const locked = !en && !st
                    return (
                      <button key={a.k} disabled={locked} onClick={() => openApproval(a.k)}
                        className={`text-[11px] font-mono px-2.5 py-1 rounded-full border transition-all ${locked ? 'opacity-50 cursor-not-allowed border-black/7 text-gray-400' : 'cursor-pointer hover:shadow-sm'}`}
                        style={!locked ? { background: color + '14', borderColor: color + '40', color } : {}}>
                        {locked ? '🔒 ' : st?.estado === 'aprobado' ? '✓ ' : st?.estado === 'rechazado' ? '✕ ' : '○ '}{a.l}{st?.nombre ? ` · ${st.nombre}` : ''}
                      </button>
                    )
                  })}
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
          {slide && slide.es_texto && (
            <div className="p-3.5">
              <div className="text-[10px] font-mono text-gray-400 uppercase tracking-wider mb-2.5">Slide de texto</div>
              <span className="text-[10px] font-mono text-gray-400 uppercase block mb-1">Título</span>
              <input defaultValue={slide.title} onBlur={e => updateField(slide.id, 'title', e.target.value)}
                className="w-full bg-bg3 border border-black/7 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-claude/20 mb-3" />
              <span className="text-[10px] font-mono text-gray-400 uppercase block mb-1">Contenido (texto enriquecido)</span>
              <textarea defaultValue={slide.texto_contenido || ''} onBlur={e => updateField(slide.id, 'texto_contenido', e.target.value)} rows={10}
                className="w-full bg-bg3 border border-black/7 rounded-lg px-2.5 py-1.5 text-xs outline-none resize-y focus:border-claude/20 mb-3 leading-relaxed"
                placeholder="Intro, estrategia, contexto… (se respetan los saltos de línea)" />
              <span className="text-[10px] font-mono text-gray-400 uppercase block mb-1">Imagen / video (URL)</span>
              <input defaultValue={slide.media_url || ''} onBlur={e => updateField(slide.id, 'media_url', e.target.value)}
                className="w-full bg-bg3 border border-black/7 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-claude/20 font-mono" placeholder="https://… imagen o link de video" />
              <p className="text-[10px] text-gray-400 mt-2">Las imágenes se previsualizan en la slide; otros links se muestran como botón.</p>
            </div>
          )}
          {slide && !slide.es_texto && (
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
                  <div className="mt-2">
                    <span className="text-[10px] font-mono text-gray-400 uppercase block mb-1">Archivos del carrusel (slider)</span>
                    {(slide.carrusel_archivos || []).map((u, i) => (
                      <div key={i} className="flex gap-1.5 mb-1">
                        <input defaultValue={u} placeholder="https://… imagen o link"
                          onBlur={e => { const next = [...(slide.carrusel_archivos || [])]; next[i] = e.target.value; updateRaw(slide.id, { carrusel_archivos: next }) }}
                          className="flex-1 bg-bg3 border border-black/7 rounded-md px-2 py-1 text-[11px] outline-none font-mono focus:border-claude/20" />
                        <button onClick={() => updateRaw(slide.id, { carrusel_archivos: (slide.carrusel_archivos || []).filter((_, j) => j !== i) })}
                          className="text-[11px] text-danger px-1.5 cursor-pointer hover:bg-danger/10 rounded">✕</button>
                      </div>
                    ))}
                    <button onClick={() => updateRaw(slide.id, { carrusel_archivos: [...(slide.carrusel_archivos || []), ''] })}
                      className="text-[11px] text-claude bg-claude/7 border border-claude/20 px-2 py-1 rounded-md cursor-pointer hover:bg-claude/15 mt-1">+ Agregar archivo</button>
                  </div>
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
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-mono text-gray-400 uppercase">Idea / concepto</span>
                    <button onClick={() => improveIdea(slide)} disabled={aiBusy || !(slide.idea_descripcion || slide.title)}
                      className="text-[10px] text-claude hover:underline disabled:opacity-40 cursor-pointer">
                      {aiBusy && aiKind === 'idea' ? 'Mejorando…' : '✦ Mejorar con Claude'}
                    </button>
                  </div>
                  <textarea
                    key={`idea-${slide.id}-${ideaVer}`}
                    defaultValue={slide.idea_descripcion || ''}
                    onBlur={e => updateField(slide.id, 'idea_descripcion', e.target.value)}
                    rows={3}
                    className="w-full bg-bg3 border border-black/7 rounded-lg px-2.5 py-1.5 text-xs outline-none resize-y focus:border-claude/20"
                  />
                  {aiKind === 'idea' && (
                    <div className="mt-2 bg-claude/5 border border-claude/20 rounded-md p-2">
                      <div className="text-[10px] font-mono text-claude uppercase mb-1.5">✦ Sugerencia — editá si querés</div>
                      <textarea value={aiText} onChange={e => setAiText(e.target.value)} rows={3}
                        className="w-full bg-bg2 border border-black/7 rounded-md px-2 py-1.5 text-xs outline-none mb-2" />
                      <div className="flex gap-1.5">
                        <button onClick={() => applyAiSuggestion(slide)} className="text-[11px] bg-claude text-white px-2.5 py-1 rounded-md cursor-pointer hover:bg-purple-700">Aplicar</button>
                        <button onClick={dismissAi} className="text-[11px] bg-bg3 border border-black/7 text-gray-500 px-2.5 py-1 rounded-md cursor-pointer hover:bg-bg4">Descartar</button>
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-mono text-gray-400 uppercase">Insight</span>
                    <button onClick={() => extractInsight(slide)} disabled={aiBusy || !(slide.idea_descripcion || slide.title)}
                      className="text-[10px] text-claude hover:underline disabled:opacity-40 cursor-pointer">
                      {aiBusy && aiKind === 'insight' ? 'Extrayendo…' : '✦ Extraer de la idea'}
                    </button>
                  </div>
                  <textarea
                    key={`ins-${slide.id}-${insightVer}`}
                    defaultValue={slide.insight || ''}
                    onBlur={e => updateField(slide.id, 'insight', e.target.value)}
                    rows={2}
                    className="w-full bg-bg3 border border-black/7 rounded-lg px-2.5 py-1.5 text-xs outline-none resize-y focus:border-claude/20"
                    placeholder="La verdad humana o tensión que hace relevante este contenido"
                  />
                  {aiKind === 'insight' && (
                    <div className="mt-2 bg-claude/5 border border-claude/20 rounded-md p-2">
                      <div className="text-[10px] font-mono text-claude uppercase mb-1.5">✦ Insight — editá si querés</div>
                      <textarea value={aiText} onChange={e => setAiText(e.target.value)} rows={3}
                        className="w-full bg-bg2 border border-black/7 rounded-md px-2 py-1.5 text-xs outline-none mb-2" />
                      <div className="flex gap-1.5">
                        <button onClick={() => applyAiSuggestion(slide)} className="text-[11px] bg-claude text-white px-2.5 py-1 rounded-md cursor-pointer hover:bg-purple-700">Aplicar</button>
                        <button onClick={dismissAi} className="text-[11px] bg-bg3 border border-black/7 text-gray-500 px-2.5 py-1 rounded-md cursor-pointer hover:bg-bg4">Descartar</button>
                      </div>
                    </div>
                  )}
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

              {slide.tiene_guion && (
                <div className="p-3.5 border-b border-black/7">
                  <div className="text-[10px] font-mono text-gray-400 uppercase tracking-wider mb-2.5">Guión · versiones</div>
                  {(slide.guion_versiones || []).length ? (
                    <div className="flex flex-col gap-1.5 mb-2">
                      {(slide.guion_versiones || []).map(g => (
                        <div key={g.v} className="bg-bg3 border border-black/7 rounded-lg p-2">
                          <div className="text-[10px] font-mono text-claude mb-0.5">v{g.v} · {g.fecha}</div>
                          <div className="text-xs text-gray-600 whitespace-pre-wrap leading-snug">{g.texto}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-gray-400 mb-2">Sin versiones todavía.</div>
                  )}
                  <textarea value={newGuion} onChange={e => setNewGuion(e.target.value)} rows={3}
                    className="w-full bg-bg3 border border-black/7 rounded-lg px-2.5 py-1.5 text-xs outline-none resize-y focus:border-claude/20" placeholder="Pegá la nueva versión del guión…" />
                  <button onClick={addGuionVersion} disabled={!newGuion.trim()}
                    className="mt-1.5 w-full text-[11px] bg-claude/7 border border-claude/20 text-claude px-2 py-1.5 rounded-md cursor-pointer hover:bg-claude/15 disabled:opacity-40">
                    + Agregar versión v{(slide.guion_versiones?.length || 0) + 1}
                  </button>
                </div>
              )}

              <div className="p-3.5 border-b border-black/7">
                <div className="text-[10px] font-mono text-gray-400 uppercase tracking-wider mb-2.5">Links</div>
                {[
                  { l: 'Presentación completa', u: `${shareBase}/presentation/${pres.id}` },
                  { l: 'Slide específica', u: `${shareBase}/presentation/${pres.id}/slide/${slide.id}` },
                  { l: 'Aprobación (sin login)', u: `${shareBase}/approve/${slide.approval_token}` },
                ].map(link => (
                  <div key={link.l} className="flex items-center gap-2 mb-1.5">
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] text-gray-600">{link.l}</div>
                      <div className="text-[10px] font-mono text-gray-400 truncate">{link.u}</div>
                    </div>
                    <button onClick={() => navigator.clipboard?.writeText(link.u)}
                      className="text-[10px] text-claude bg-claude/7 border border-claude/20 px-2 py-1 rounded-md cursor-pointer hover:bg-claude/15 shrink-0">Copiar</button>
                  </div>
                ))}
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

      {/* Panel de tarea de contenido vinculada (sin slide aún) */}
      {entry?.kind === 'task' && (() => {
        const t = entry.task
        const parts = splitTitle(t.title)
        const warn = deliveryWarning(t.due_date, t.publish_date)
        const dcls = 'w-full bg-bg3 border border-black/7 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-claude/20'
        const lcls = 'text-[11px] font-mono text-gray-400 tracking-wider uppercase mb-1 block'
        return (
          <div className="absolute top-0 bottom-0 left-[260px] right-0 bg-bg overflow-y-auto z-10 p-6">
            <div className="max-w-[640px] mx-auto">
              <div className="flex items-start gap-2.5 mb-4">
                <span className="text-[20px] leading-none mt-0.5">🎬</span>
                <div className="flex-1 min-w-0">
                  <div className="font-serif text-xl font-light leading-snug">
                    {parts.prefix && <span className="font-mono text-[13px] text-claude/70 mr-1">{parts.prefix} |</span>}{parts.name}
                  </div>
                  <div className="flex gap-1.5 flex-wrap mt-1.5">
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-claude/7 text-claude">Tarea de contenido</span>
                    {(() => {
                      const b = pubTypeBadge(t.tipo_publicacion || t.content_pub_type)
                      return b ? (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded font-medium" style={{ background: b.color + '18', color: b.color }}>
                          {b.label}{t.influencer_handle ? ` · ${t.influencer_handle}` : ''}
                        </span>
                      ) : null
                    })()}
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: ctxColor(t.context) + '12', color: ctxColor(t.context) }}>{ctxLabel(t.context)}</span>
                    {t.clients && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-agencia/7 text-agencia">{t.clients.name}</span>}
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg4 text-gray-500">{t.status}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-2">
                <div>
                  <label className={lcls}>📤 Entrega a CM</label>
                  <input type="date" value={t.due_date || ''} onChange={e => updateTask(t.id, { due_date: e.target.value || null })} className={dcls} />
                </div>
                <div>
                  <label className={lcls}>📅 Publicación</label>
                  <input type="date" value={t.publish_date || ''} onChange={e => updateTask(t.id, { publish_date: e.target.value || null })} className={dcls} />
                </div>
              </div>
              {warn && (
                <div className="text-[11px] text-warn bg-warn/10 border border-warn/30 rounded-md px-2.5 py-1.5 mb-2">
                  ⚠ La entrega debe ser al menos 24h antes de la publicación. Entrega mínima sugerida: <span className="font-medium">{warn}</span>.
                </div>
              )}

              {t.notes && <div className="bg-bg2 border border-black/7 rounded-lg p-3 text-[13px] leading-relaxed whitespace-pre-wrap mt-2">{t.notes}</div>}

              <div className="flex gap-2 mt-4">
                <button onClick={() => createSlideFromTask(t)}
                  className="text-xs bg-claude border-claude text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors cursor-pointer">
                  + Crear slide de producción
                </button>
                <button onClick={() => unlinkTask(t)}
                  className="text-xs bg-bg3 border border-black/7 text-gray-500 px-4 py-2 rounded-lg hover:bg-bg4 transition-colors cursor-pointer">
                  Quitar de la presentación
                </button>
              </div>
              <p className="text-[11px] text-gray-400 mt-3 leading-snug">
                Tarea de contenido vinculada a esta presentación. Editá sus fechas acá: la presentación se reordena por fecha de publicación. Para producción enriquecida (estados, guión, visuales), creá un slide.
              </p>
            </div>
          </div>
        )
      })()}

      {/* Confirmar eliminación de slide */}
      {deletingSlide && (
        <div className="fixed inset-0 z-[330] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) setDeletingSlide(null) }}>
          <div className="bg-bg2 border border-black/7 rounded-2xl p-5 w-[440px] max-w-[94vw] shadow-lg">
            <div className="font-serif text-lg font-light mb-1">Eliminar slide</div>
            <p className="text-[13px] text-gray-500 mb-4">
              ¿Eliminar esta slide?{deletingSlide.task_id ? ' Si está vinculada a una tarea de contenido, la tarea quedará sin slide asignada.' : ''}
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeletingSlide(null)} className="text-xs bg-bg3 border border-black/7 text-gray-500 px-4 py-2 rounded-lg hover:bg-bg4 cursor-pointer">Cancelar</button>
              <button onClick={deleteSlide} className="text-xs bg-danger text-white px-4 py-2 rounded-lg hover:opacity-90 cursor-pointer">Eliminar slide</button>
            </div>
          </div>
        </div>
      )}

      {/* Popup de aprobación (sobre la slide) */}
      {approvalKey && slide && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) setApprovalKey(null) }}>
          <div className="bg-bg2 border border-black/7 rounded-2xl p-5 w-[380px] max-w-[94vw] shadow-lg">
            <div className="font-serif text-lg font-light mb-1">
              Aprobación: {approvalKey === 'idea' ? 'Idea' : approvalKey === 'guion' ? 'Guión' : 'Contenido final'}
            </div>
            <p className="text-[12px] text-gray-400 mb-3">{slide.title}</p>
            <input value={approverName} onChange={e => setApproverName(e.target.value)} autoFocus placeholder="Tu nombre"
              className="w-full bg-bg3 border border-black/7 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-claude/20 mb-3" />
            {feedbackMode && (
              <textarea value={feedbackText} onChange={e => setFeedbackText(e.target.value)} rows={3} placeholder="¿Qué hay que cambiar?"
                className="w-full bg-bg3 border border-black/7 rounded-lg px-3 py-2 text-[13px] outline-none resize-y focus:border-claude/20 mb-3" />
            )}
            <div className="flex gap-2 justify-end flex-wrap">
              {!feedbackMode ? (
                <>
                  <button onClick={() => submitApproval('aprobar')} disabled={!approverName.trim()}
                    className="text-xs bg-success/10 border border-success/30 text-success px-3 py-2 rounded-lg cursor-pointer hover:bg-success/20 disabled:opacity-40">✓ Aprobar</button>
                  <button onClick={() => submitApproval('rechazar')} disabled={!approverName.trim()}
                    className="text-xs bg-danger/10 border border-danger/30 text-danger px-3 py-2 rounded-lg cursor-pointer hover:bg-danger/20 disabled:opacity-40">✕ Rechazar</button>
                  <button onClick={() => setFeedbackMode(true)}
                    className="text-xs bg-bg3 border border-black/7 text-gray-600 px-3 py-2 rounded-lg cursor-pointer hover:bg-bg4">✦ Enviar feedback</button>
                </>
              ) : (
                <>
                  <button onClick={() => setFeedbackMode(false)} className="text-xs bg-bg3 border border-black/7 text-gray-500 px-3 py-2 rounded-lg cursor-pointer">Volver</button>
                  <button onClick={() => submitApproval('feedback')} disabled={!approverName.trim() || !feedbackText.trim()}
                    className="text-xs bg-claude text-white px-3 py-2 rounded-lg cursor-pointer hover:bg-purple-700 disabled:opacity-40">Enviar → crea tarea de revisión</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
