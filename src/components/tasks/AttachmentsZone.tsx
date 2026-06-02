import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import { supabase } from '../../lib/supabase'

// Zona unificada de adjuntos: drag&drop visible + lista/grid + links externos.
// Soporta dos targets via props (exclusivos): { taskId } o { projectId }.
// El bucket de Storage sigue siendo 'capturas' por compatibilidad con los
// archivos ya subidos. La carpeta se prefija con t-<id> o p-<id> para
// distinguir.
//
// La API uploadFiles se expone por ref para que el panel contenedor (TaskDetail
// / ProjectDetail) pueda dispararla desde su overlay de drop full-panel.

export interface AttachmentsZoneHandle {
  uploadFiles: (files: FileList | File[]) => Promise<void>
}

interface Attachment {
  id: number
  task_id: number | null
  project_id: number | null
  name: string
  url: string
  size_kb: number | null
  es_contexto: boolean | null
  created_at?: string | null
}

const IMG_EXT = /\.(png|jpe?g|gif|webp|avif|heic|heif|bmp)(\?|$)/i
const PDF_EXT = /\.pdf(\?|$)/i
const DOC_EXT = /\.(docx?)(\?|$)/i
const XLS_EXT = /\.(xlsx?|csv)(\?|$)/i
const PPT_EXT = /\.(pptx?|key)(\?|$)/i

function isImg(name: string, url: string) { return IMG_EXT.test(name) || IMG_EXT.test(url) }
function isPdf(name: string, url: string) { return PDF_EXT.test(name) || PDF_EXT.test(url) }
function isDoc(name: string, url: string) { return DOC_EXT.test(name) || DOC_EXT.test(url) }
function isXls(name: string, url: string) { return XLS_EXT.test(name) || XLS_EXT.test(url) }
function isPpt(name: string, url: string) { return PPT_EXT.test(name) || PPT_EXT.test(url) }

function metaIcon(name: string, url: string): string {
  if (isImg(name, url)) return '🖼'
  if (isPdf(name, url)) return '📕'
  if (isDoc(name, url)) return '📝'
  if (isXls(name, url)) return '📊'
  if (isPpt(name, url)) return '🎞'
  const u = url.toLowerCase()
  if (u.includes('sharepoint') || u.includes('onedrive') || u.includes('1drv')) return '🔷'
  if (u.includes('drive.google') || u.includes('docs.google')) return '📁'
  if (u.includes('notion.')) return '📝'
  if (/^https?:/.test(u)) return '🔗'
  return '📎'
}

function metaLabel(name: string, url: string): string {
  if (isImg(name, url)) return 'Imagen'
  if (isPdf(name, url)) return 'PDF'
  if (isDoc(name, url)) return 'Word'
  if (isXls(name, url)) return 'Excel'
  if (isPpt(name, url)) return 'PPT'
  if (/^https?:/.test(url)) return 'Link'
  return 'Archivo'
}

function fmtSize(kb: number | null): string {
  if (!kb) return ''
  if (kb < 1024) return `${kb} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}

export const AttachmentsZone = forwardRef<AttachmentsZoneHandle, {
  taskId?: number
  projectId?: number
}>(function AttachmentsZone({ taskId, projectId }, ref) {
  const [items, setItems] = useState<Attachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [linkName, setLinkName] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [confirmDel, setConfirmDel] = useState<number | null>(null)

  // Carga inicial — uno de los dos filtros siempre presente.
  useEffect(() => {
    const q = supabase.from('attachments').select('*').order('created_at')
    const filtered = taskId ? q.eq('task_id', taskId) : projectId ? q.eq('project_id', projectId) : null
    if (!filtered) return
    filtered.then(({ data }) => setItems((data as Attachment[]) || []))
  }, [taskId, projectId])

  async function uploadFiles(input: FileList | File[]) {
    const files = Array.from(input as ArrayLike<File>)
    if (!files.length || (!taskId && !projectId)) return
    setUploading(true)
    const folder = taskId ? `t-${taskId}` : `p-${projectId}`
    for (const f of files) {
      const path = `${folder}/${Date.now()}-${f.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`
      const up = await supabase.storage.from('capturas').upload(path, f, { contentType: f.type || undefined })
      if (up.error) { alert(`Error subiendo ${f.name}: ${up.error.message}`); continue }
      const { data: pub } = supabase.storage.from('capturas').getPublicUrl(path)
      const insert = {
        task_id: taskId ?? null,
        project_id: projectId ?? null,
        name: f.name,
        url: pub.publicUrl,
        es_contexto: false,
        size_kb: Math.round(f.size / 1024),
      }
      const { data } = await supabase.from('attachments').insert(insert).select().single()
      if (data) setItems(prev => [...prev, data as Attachment])
    }
    setUploading(false)
  }

  useImperativeHandle(ref, () => ({ uploadFiles }), [taskId, projectId])

  async function addLink() {
    const u = linkUrl.trim()
    if (!u || (!taskId && !projectId)) return
    const insert = {
      task_id: taskId ?? null,
      project_id: projectId ?? null,
      name: linkName.trim() || u,
      url: u,
      es_contexto: false,
      size_kb: null,
    }
    const { data } = await supabase.from('attachments').insert(insert).select().single()
    if (data) { setItems(prev => [...prev, data as Attachment]); setLinkName(''); setLinkUrl('') }
  }

  async function remove(a: Attachment) {
    const marker = '/capturas/'
    const idx = a.url.indexOf(marker)
    if (idx >= 0) {
      const path = decodeURIComponent(a.url.slice(idx + marker.length).split('?')[0])
      await supabase.storage.from('capturas').remove([path])
    }
    await supabase.from('attachments').delete().eq('id', a.id)
    setItems(prev => prev.filter(x => x.id !== a.id))
    setConfirmDel(null)
  }

  async function toggleContexto(a: Attachment) {
    const newVal = !a.es_contexto
    await supabase.from('attachments').update({ es_contexto: newVal }).eq('id', a.id)
    setItems(prev => prev.map(x => x.id === a.id ? { ...x, es_contexto: newVal } : x))
  }

  function onZoneDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files?.length) uploadFiles(e.dataTransfer.files)
  }

  const images = items.filter(a => isImg(a.name, a.url))
  const others = items.filter(a => !isImg(a.name, a.url))

  const fld = 'bg-bg2 border border-black/7 rounded-md px-2.5 py-1.5 text-xs outline-none focus:border-claude/20'

  return (
    <div className="border-t border-black/7 pt-3 mt-1 flex flex-col gap-2.5">
      <div className="text-[11px] font-mono text-gray-400 tracking-wider uppercase">📎 Archivos</div>

      {/* Zona drop visible — siempre presente */}
      <label
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onZoneDrop}
        className={`flex flex-col items-center justify-center gap-1 border-2 border-dashed rounded-lg py-5 px-3 cursor-pointer transition-all ${
          dragOver ? 'border-claude bg-claude/10 text-claude' : 'border-black/13 bg-bg3 text-gray-400 hover:border-claude/40 hover:bg-claude/5 hover:text-claude'
        }`}
      >
        <span className="text-[22px] leading-none">{uploading ? '⏳' : '📥'}</span>
        <span className="text-[12px] font-medium">
          {uploading ? 'Subiendo…' : 'Arrastrá archivos aquí o hacé click para seleccionar'}
        </span>
        <span className="text-[10px] text-gray-400">PDF, imágenes, docs — múltiple OK</span>
        <input type="file" multiple className="hidden" disabled={uploading}
          onChange={e => { if (e.target.files) uploadFiles(e.target.files); e.target.value = '' }} />
      </label>

      {/* Grid de imágenes */}
      {images.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {images.map(a => (
            <div key={a.id} className="relative group rounded-lg overflow-hidden border border-black/7 bg-bg2 aspect-square">
              <a href={a.url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                className="block w-full h-full">
                <img src={a.url} alt={a.name} loading="lazy" className="w-full h-full object-cover" />
              </a>
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent text-white text-[10px] px-1.5 py-1 truncate">
                {a.name}
              </div>
              <div className="absolute top-1 right-1 flex gap-1">
                <button
                  onClick={(e) => { e.stopPropagation(); toggleContexto(a) }}
                  title={a.es_contexto ? 'Dejar de usar como contexto Claude' : 'Usar como contexto Claude'}
                  className={`text-[10px] px-1 py-0.5 rounded backdrop-blur-sm ${a.es_contexto ? 'bg-claude text-white' : 'bg-black/40 text-white/80 opacity-0 group-hover:opacity-100'}`}
                >✨</button>
                {confirmDel === a.id ? (
                  <button onClick={(e) => { e.stopPropagation(); remove(a) }}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-danger text-white">borrar?</button>
                ) : (
                  <button onClick={(e) => { e.stopPropagation(); setConfirmDel(a.id) }}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-black/40 text-white opacity-0 group-hover:opacity-100 backdrop-blur-sm hover:bg-danger">×</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lista para PDFs / docs / links */}
      {others.length > 0 && (
        <div className="flex flex-col gap-1">
          {others.map(a => {
            const isLink = !a.size_kb && /^https?:/.test(a.url) && !isPdf(a.name, a.url) && !isDoc(a.name, a.url)
            const supportsContext = isPdf(a.name, a.url) || isImg(a.name, a.url)
            return (
              <div key={a.id} className="flex items-center gap-2 p-2 rounded-lg border border-black/7 bg-bg2 group">
                <span className="text-[15px] shrink-0">{metaIcon(a.name, a.url)}</span>
                <a href={a.url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                  className="text-[13px] flex-1 truncate text-claude hover:underline">{a.name}</a>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg4 text-gray-400 shrink-0">{metaLabel(a.name, a.url)}</span>
                {!isLink && a.size_kb && (
                  <span className="text-[10px] font-mono text-gray-400 shrink-0">{fmtSize(a.size_kb)}</span>
                )}
                {supportsContext && (
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleContexto(a) }}
                    title={a.es_contexto ? 'Dejar de usar como contexto Claude' : 'Usar como contexto Claude'}
                    className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${a.es_contexto ? 'bg-claude/15 text-claude border border-claude/30' : 'text-gray-400 border border-transparent hover:border-claude/20 hover:text-claude opacity-0 group-hover:opacity-100'}`}
                  >✨ {a.es_contexto ? 'contexto' : 'contexto'}</button>
                )}
                {confirmDel === a.id ? (
                  <>
                    <button onClick={(e) => { e.stopPropagation(); remove(a) }}
                      className="text-[11px] px-2 py-0.5 rounded bg-danger text-white shrink-0">¿Borrar?</button>
                    <button onClick={(e) => { e.stopPropagation(); setConfirmDel(null) }}
                      className="text-[11px] text-gray-400 px-1.5 shrink-0">×</button>
                  </>
                ) : (
                  <button onClick={(e) => { e.stopPropagation(); setConfirmDel(a.id) }}
                    className="text-gray-300 hover:text-danger text-xs cursor-pointer shrink-0 opacity-0 group-hover:opacity-100" title="Eliminar">✕</button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Agregar link externo */}
      <div className="flex gap-2">
        <input value={linkName} onChange={e => setLinkName(e.target.value)} placeholder="Nombre (opcional)" className={fld + ' w-36 shrink-0'} />
        <input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addLink() }} placeholder="Pegar link externo (SharePoint, Drive, Notion…)" className={fld + ' flex-1'} />
        <button onClick={addLink} disabled={!linkUrl.trim()} className="text-xs bg-bg3 border border-black/7 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-bg4 cursor-pointer disabled:opacity-40 shrink-0">+ Link</button>
      </div>
    </div>
  )
})
