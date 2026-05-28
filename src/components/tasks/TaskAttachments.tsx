import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

interface Attachment {
  id: number
  task_id: number
  name: string
  url: string
  size_kb: number | null
  es_contexto: boolean | null
}

// Ícono/etiqueta según el tipo de archivo o servicio del link.
function fileMeta(url: string, name: string): { icon: string; label: string } {
  const u = (url || '').toLowerCase()
  const n = (name || '').toLowerCase()
  if (u.includes('sharepoint') || u.includes('onedrive') || u.includes('1drv')) return { icon: '🔷', label: 'SharePoint' }
  if (u.includes('drive.google') || u.includes('docs.google')) return { icon: '📁', label: 'Drive' }
  if (u.includes('notion.')) return { icon: '📝', label: 'Notion' }
  if (/\.(png|jpe?g|gif|webp|avif)$/i.test(n) || /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(u)) return { icon: '🖼', label: 'Imagen' }
  if (/\.pdf(\?|$)/i.test(n) || /\.pdf(\?|$)/i.test(u)) return { icon: '📕', label: 'PDF' }
  if (/\.(pptx?|key)(\?|$)/i.test(n) || /\.(pptx?|key)(\?|$)/i.test(u)) return { icon: '📊', label: 'Presentación' }
  if (/^https?:/.test(u)) return { icon: '🔗', label: 'Link' }
  return { icon: '📎', label: 'Archivo' }
}

export function TaskAttachments({ taskId }: { taskId: number }) {
  const [items, setItems] = useState<Attachment[]>([])
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    supabase.from('attachments').select('*').eq('task_id', taskId).order('created_at')
      .then(({ data }) => setItems((data as Attachment[]) || []))
  }, [taskId])

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return
    setUploading(true)
    for (const f of Array.from(files)) {
      const path = `${taskId}/${Date.now()}-${f.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`
      const up = await supabase.storage.from('capturas').upload(path, f, { contentType: f.type || undefined })
      if (up.error) { alert('Error subiendo ' + f.name + ': ' + up.error.message); continue }
      const { data: pub } = supabase.storage.from('capturas').getPublicUrl(path)
      const { data } = await supabase.from('attachments').insert({
        task_id: taskId, name: f.name, url: pub.publicUrl, es_contexto: false, size_kb: Math.round(f.size / 1024),
      }).select().single()
      if (data) setItems(prev => [...prev, data as Attachment])
    }
    setUploading(false)
  }

  async function addLink() {
    const u = url.trim()
    if (!u) return
    const { data } = await supabase.from('attachments').insert({
      task_id: taskId, name: name.trim() || u, url: u, es_contexto: false, size_kb: null,
    }).select().single()
    if (data) { setItems(prev => [...prev, data as Attachment]); setName(''); setUrl('') }
  }

  async function remove(a: Attachment) {
    // Si es un archivo subido al bucket, intentar borrar el objeto también.
    const marker = '/capturas/'
    const idx = a.url.indexOf(marker)
    if (idx >= 0) {
      const path = decodeURIComponent(a.url.slice(idx + marker.length).split('?')[0])
      await supabase.storage.from('capturas').remove([path])
    }
    await supabase.from('attachments').delete().eq('id', a.id)
    setItems(prev => prev.filter(x => x.id !== a.id))
  }

  const fld = 'bg-bg2 border border-black/7 rounded-md px-2.5 py-1.5 text-xs outline-none focus:border-claude/20'

  return (
    <div className="border-t border-black/7 pt-3 mt-1 flex flex-col gap-2.5">
      <div className="text-[11px] font-mono text-gray-400 tracking-wider uppercase">📎 Archivos</div>

      {items.length > 0 && (
        <div className="flex flex-col gap-1">
          {items.map(a => {
            const m = fileMeta(a.url, a.name)
            return (
              <div key={a.id} className="flex items-center gap-2 p-2 rounded-lg border border-black/7 bg-bg2 group">
                <span className="text-[14px] shrink-0">{m.icon}</span>
                <a href={a.url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                  className="text-[13px] flex-1 truncate text-claude hover:underline">{a.name}</a>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg4 text-gray-400 shrink-0">{m.label}</span>
                <button onClick={() => remove(a)} className="text-gray-300 hover:text-danger text-xs cursor-pointer shrink-0 opacity-0 group-hover:opacity-100" title="Eliminar">✕</button>
              </div>
            )
          })}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <label className="text-[12px] text-claude bg-claude/7 border border-claude/20 px-3 py-1.5 rounded-lg cursor-pointer hover:bg-claude/15 w-fit">
          {uploading ? 'Subiendo…' : '⬆ Subir archivo'}
          <input type="file" multiple className="hidden" disabled={uploading} onChange={e => { uploadFiles(e.target.files); e.target.value = '' }} />
        </label>
        <div className="flex gap-2">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre (opcional)" className={fld + ' w-36 shrink-0'} />
          <input value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addLink() }} placeholder="Pegar link externo (SharePoint, Drive, Notion…)" className={fld + ' flex-1'} />
          <button onClick={addLink} disabled={!url.trim()} className="text-xs bg-bg3 border border-black/7 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-bg4 cursor-pointer disabled:opacity-40 shrink-0">+ Link</button>
        </div>
      </div>
    </div>
  )
}
