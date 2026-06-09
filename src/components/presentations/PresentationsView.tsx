import { useRef, useState } from 'react'
import { useStore } from '../../lib/store'
import { supabase } from '../../lib/supabase'
import { ctxLabel, splitTitle } from '../../lib/helpers'
import { NewPresentationModal } from '../modals/NewPresentationModal'
import { exportPresentationPDF } from '../../lib/pdfExport'
import type { Presentation, Task } from '../../lib/types'

function NoPubCard({ task, onAssigned }: { task: Task; onAssigned: () => void }) {
  const [date, setDate] = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { prefix, name } = splitTitle(task.title)
  async function assign() {
    if (!date) return
    setSaving(true)
    await supabase.from('tasks').update({ publish_date: date, publish_date_pending: false }).eq('id', task.id)
    setSaving(false); onAssigned()
  }
  return (
    <div className="bg-bg2 border border-black/7 rounded-lg p-3 flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-[13px] leading-snug">
          {prefix && <span className="font-mono text-[11px] text-gray-400 mr-1">{prefix} |</span>}
          {name}
        </div>
        {task.due_date && <div className="text-[11px] text-gray-500 mt-0.5">Entrega: {task.due_date.slice(5).replace('-', '/')}</div>}
        <span className="inline-block mt-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-warn/10 text-warn">Pendiente de fecha</span>
      </div>
      <div className="shrink-0 flex items-center gap-1.5">
        {!date ? (
          <button onClick={() => { inputRef.current?.showPicker?.(); inputRef.current?.focus() }}
            className="text-[11px] text-claude bg-claude/7 border border-claude/20 px-2.5 py-1 rounded-md cursor-pointer hover:bg-claude/15">
            Asignar fecha
          </button>
        ) : (
          <button onClick={assign} disabled={saving}
            className="text-[11px] text-white bg-claude px-2.5 py-1 rounded-md cursor-pointer hover:bg-purple-700 disabled:opacity-40">
            {saving ? '…' : `✓ ${date.slice(5).replace('-', '/')}`}
          </button>
        )}
        <input ref={inputRef} type="date" value={date} onChange={e => setDate(e.target.value)} className="opacity-0 w-0 h-0 absolute pointer-events-none" />
      </div>
    </div>
  )
}

function slugify(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40) + '-' + Math.random().toString(36).slice(2, 6)
}

export function PresentationsView({ context, onOpen }: { context?: string; onOpen: (id: number) => void }) {
  const presentations = useStore(s => s.presentations)
  const clients = useStore(s => s.clients)
  const tasks = useStore(s => s.tasks)
  const loadAll = useStore(s => s.loadAll)
  const [newOpen, setNewOpen] = useState<{ context: string; clientId: number | null } | null>(null)
  const [noPubCollapsed, setNoPubCollapsed] = useState(false)

  // Tareas de contenido sin fecha de publicación para el contexto actual
  const noPubDate = tasks.filter(t =>
    !t.done && !t.archived_at && !t.es_recordatorio &&
    (t.task_type === 'contenido' || !!t.es_influencer) &&
    !t.publish_date &&
    (!context || t.context === context)
  )
  const [menuFor, setMenuFor] = useState<number | null>(null)
  const [renaming, setRenaming] = useState<{ id: number; title: string } | null>(null)
  const [deleting, setDeleting] = useState<Presentation | null>(null)
  const [busy, setBusy] = useState(false)

  async function saveTitle() {
    if (!renaming || !renaming.title.trim()) return
    setBusy(true)
    await supabase.from('presentations').update({ title: renaming.title.trim() }).eq('id', renaming.id)
    await loadAll(); setBusy(false); setRenaming(null)
  }
  async function importFile(files: FileList | null) {
    const f = files?.[0]
    if (!f) return
    setBusy(true)
    const path = `pres/${Date.now()}-${f.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`
    const up = await supabase.storage.from('capturas').upload(path, f, { contentType: f.type || undefined })
    if (up.error) { alert('Error subiendo: ' + up.error.message); setBusy(false); return }
    const { data: pub } = supabase.storage.from('capturas').getPublicUrl(path)
    const baseName = f.name.replace(/\.(pdf|pptx?|key)$/i, '')
    const ctx = context === 'agencia' ? 'agencia' : (context || 'banco')
    const { data, error } = await supabase.from('presentations').insert({
      slug: slugify(baseName), title: baseName, context: ctx,
      tipo: 'General (link externo)', external_url: pub.publicUrl, share_enabled: false,
    }).select().single()
    if (error || !data) { alert('Error: ' + error?.message); setBusy(false); return }
    await loadAll(); setBusy(false); onOpen(data.id)
  }

  const importBtn = (
    <label className="text-xs bg-bg3 border border-black/7 text-gray-600 px-4 py-2 rounded-lg hover:bg-bg4 transition-colors cursor-pointer">
      {busy ? 'Importando…' : '+ Importar PDF o PPT'}
      <input type="file" accept=".pdf,.ppt,.pptx,.key" className="hidden" disabled={busy} onChange={e => { importFile(e.target.files); e.target.value = '' }} />
    </label>
  )

  async function deletePres() {
    if (!deleting) return
    setBusy(true)
    // Las tareas de contenido vinculadas quedan sin presentación; las slides se borran.
    await supabase.from('tasks').update({ presentation_id: null }).eq('presentation_id', deleting.id)
    await supabase.from('slides').delete().eq('presentation_id', deleting.id)
    const { error } = await supabase.from('presentations').delete().eq('id', deleting.id)
    if (error) { alert('Error: ' + error.message); setBusy(false); return }
    await loadAll(); setBusy(false); setDeleting(null)
  }

  const modals = (
    <>
      {renaming && (
        <div className="fixed inset-0 z-[330] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) setRenaming(null) }}>
          <div className="bg-bg2 border border-black/7 rounded-2xl p-5 w-[420px] max-w-[94vw] shadow-lg">
            <div className="font-serif text-lg font-light mb-3">Editar título</div>
            <input value={renaming.title} autoFocus onChange={e => setRenaming({ ...renaming, title: e.target.value })}
              onKeyDown={e => { if (e.key === 'Enter') saveTitle() }}
              className="w-full bg-bg3 border border-black/7 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-claude/20 mb-4" />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setRenaming(null)} className="text-xs bg-bg3 border border-black/7 text-gray-500 px-4 py-2 rounded-lg hover:bg-bg4 cursor-pointer">Cancelar</button>
              <button onClick={saveTitle} disabled={!renaming.title.trim() || busy} className="text-xs bg-claude text-white px-4 py-2 rounded-lg hover:bg-purple-700 cursor-pointer disabled:opacity-40">{busy ? 'Guardando…' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}
      {deleting && (
        <div className="fixed inset-0 z-[330] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) setDeleting(null) }}>
          <div className="bg-bg2 border border-black/7 rounded-2xl p-5 w-[420px] max-w-[94vw] shadow-lg">
            <div className="font-serif text-lg font-light mb-1">Eliminar presentación</div>
            <p className="text-[13px] text-gray-500 mb-4">
              ¿Eliminar esta presentación permanentemente? Las slides vinculadas también se eliminarán. Las tareas de contenido vinculadas quedarán sin presentación asignada.
              <br/><span className="block mt-2 text-gray-700 font-medium">"{deleting.title}"</span>
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleting(null)} className="text-xs bg-bg3 border border-black/7 text-gray-500 px-4 py-2 rounded-lg hover:bg-bg4 cursor-pointer">Cancelar</button>
              <button onClick={deletePres} disabled={busy} className="text-xs bg-danger text-white px-4 py-2 rounded-lg hover:opacity-90 cursor-pointer disabled:opacity-40">{busy ? 'Eliminando…' : 'Eliminar presentación'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )

  const list = context ? presentations.filter(p => p.context === context) : presentations
  const accent = context === 'agencia' ? '#0d9488' : context === 'banco' ? '#2563eb' : '#7c3aed'
  const newBtnCtx = context === 'agencia' ? 'agencia' : 'banco'

  const renderCard = (p: Presentation) => (
    <div
      key={p.id}
      onClick={() => onOpen(p.id)}
      className="relative bg-bg2 border border-black/7 rounded-xl cursor-pointer hover:border-black/13 hover:shadow-md hover:-translate-y-px transition-all shadow-sm"
    >
      <div className="h-2 rounded-t-xl" style={{ background: p.kv_color }} />
      <button onClick={e => { e.stopPropagation(); setMenuFor(menuFor === p.id ? null : p.id) }}
        className="absolute top-3 right-2 w-6 h-6 flex items-center justify-center rounded-md bg-bg2/80 backdrop-blur-sm border border-black/7 text-gray-500 hover:text-gray-900 hover:bg-bg3 cursor-pointer leading-none text-lg z-[6] shadow-sm" title="Opciones">⋯</button>
      {menuFor === p.id && (
        <>
          <div className="fixed inset-0 z-[5]" onClick={e => { e.stopPropagation(); setMenuFor(null) }} />
          <div className="absolute right-1.5 top-9 bg-bg2 border border-black/7 rounded-lg shadow-lg py-1 z-10 w-44" onClick={e => e.stopPropagation()}>
            <button onClick={() => { setRenaming({ id: p.id, title: p.title }); setMenuFor(null) }}
              className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-bg3 cursor-pointer">✎ Editar título</button>
            <button onClick={() => { exportPresentationPDF(p); setMenuFor(null) }}
              className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-bg3 cursor-pointer">📄 Exportar PDF</button>
            <div className="my-0.5 mx-2 border-t border-black/7" />
            <button onClick={() => { setDeleting(p); setMenuFor(null) }}
              className="w-full text-left px-3 py-1.5 text-[13px] text-danger hover:bg-danger/10 cursor-pointer">🗑 Eliminar presentación</button>
          </div>
        </>
      )}
      <div className="p-3.5">
        <div className="text-[13px] font-medium mb-1 pr-5">{p.title}</div>
        {p.subtitle && <div className="text-[11px] text-gray-400 mb-2">{p.subtitle}</div>}
        <div className="flex gap-1.5 flex-wrap">
          {p.tipo && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-claude/7 text-claude">{p.tipo}</span>}
          {p.month_label && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg4 text-gray-400">{p.month_label}</span>}
          {p.external_url && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg4 text-gray-400">↗ externo</span>}
        </div>
      </div>
    </div>
  )

  const gridCls = 'grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3'
  const newBtnCls = 'text-[11px] text-claude bg-claude/7 border border-claude/20 px-2.5 py-1 rounded-md cursor-pointer hover:bg-claude/15 transition-colors'

  // === Vista Agencia: carpetas por cliente + Agencia interna ===
  if (context === 'agencia') {
    const interna = list.filter(p => !p.client_id)
    const clientIds = [...new Set(list.filter(p => p.client_id).map(p => p.client_id as number))]
    const folders: { key: string; label: string; clientId: number | null; items: Presentation[] }[] = [
      { key: 'interna', label: 'Agencia interna', clientId: null, items: interna },
      ...clientIds.map(cid => ({
        key: `c${cid}`,
        label: clients.find(c => c.id === cid)?.name || `Cliente ${cid}`,
        clientId: cid,
        items: list.filter(p => p.client_id === cid),
      })),
    ]

    return (
      <div className="animate-fade-in p-5">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h1 className="font-serif text-[26px] font-light mb-0.5" style={{ color: accent }}>Presentaciones · Agencia</h1>
            <p className="text-gray-500 text-[13px]">{list.length} presentaciones · carpetas por cliente</p>
          </div>
          <div className="flex gap-2">
            {importBtn}
            <button onClick={() => setNewOpen({ context: 'agencia', clientId: null })}
              className="text-xs bg-claude border-claude text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors cursor-pointer">
              + Nueva presentación
            </button>
          </div>
        </div>

        {/* Sin fecha de publicación — agencia */}
        {noPubDate.length > 0 && (
          <div className="mb-5 border border-warn/25 bg-warn/5 rounded-xl overflow-hidden">
            <button onClick={() => setNoPubCollapsed(c => !c)} className="w-full flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-warn/10 transition-colors">
              <span className="text-[12px] font-mono text-warn tracking-wider uppercase">📋 Sin fecha de publicación · {noPubDate.length} contenido{noPubDate.length !== 1 ? 's' : ''}</span>
              <span className="text-[10px] text-warn">{noPubCollapsed ? '▶' : '▼'}</span>
            </button>
            {!noPubCollapsed && (
              <div className="px-3 pb-3 flex flex-col gap-2">
                {noPubDate.map(t => <NoPubCard key={t.id} task={t} onAssigned={loadAll} />)}
              </div>
            )}
          </div>
        )}

        {folders.map(f => (
          <div key={f.key} className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] font-mono text-gray-400 tracking-wider uppercase">📁 {f.label} · {f.items.length}</div>
              <button onClick={() => setNewOpen({ context: 'agencia', clientId: f.clientId })} className={newBtnCls}>+ Nueva presentación</button>
            </div>
            {f.items.length
              ? <div className={gridCls}>{f.items.map(renderCard)}</div>
              : <div className="text-xs text-gray-400">Sin presentaciones en esta carpeta</div>}
          </div>
        ))}

        {newOpen && (
          <NewPresentationModal onClose={() => setNewOpen(null)} onCreated={onOpen}
            defaultContext={newOpen.context} defaultClientId={newOpen.clientId} />
        )}
        {modals}
      </div>
    )
  }

  // === Vista Banco / general ===
  return (
    <div className="animate-fade-in p-5">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="font-serif text-[26px] font-light mb-0.5" style={{ color: accent }}>
            Presentaciones{context ? ` · ${ctxLabel(context)}` : ''}
          </h1>
          <p className="text-gray-500 text-[13px]">{list.length} decks de contenido</p>
        </div>
        <div className="flex gap-2">
          {importBtn}
          <button onClick={() => setNewOpen({ context: newBtnCtx, clientId: null })}
            className="text-xs bg-claude border-claude text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors cursor-pointer">
            + Nueva presentación
          </button>
        </div>
      </div>

      {/* Sin fecha de publicación — banco/general */}
      {noPubDate.length > 0 && (
        <div className="mb-5 border border-warn/25 bg-warn/5 rounded-xl overflow-hidden">
          <button onClick={() => setNoPubCollapsed(c => !c)} className="w-full flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-warn/10 transition-colors">
            <span className="text-[12px] font-mono text-warn tracking-wider uppercase">📋 Sin fecha de publicación · {noPubDate.length} contenido{noPubDate.length !== 1 ? 's' : ''}</span>
            <span className="text-[10px] text-warn">{noPubCollapsed ? '▶' : '▼'}</span>
          </button>
          {!noPubCollapsed && (
            <div className="px-3 pb-3 flex flex-col gap-2">
              {noPubDate.map(t => <NoPubCard key={t.id} task={t} onAssigned={loadAll} />)}
            </div>
          )}
        </div>
      )}

      {list.length
        ? <div className={gridCls}>{list.map(renderCard)}</div>
        : <div className="text-center py-7 text-gray-400 text-[13px]">Sin presentaciones</div>}

      {newOpen && (
        <NewPresentationModal onClose={() => setNewOpen(null)} onCreated={onOpen}
          defaultContext={newOpen.context} defaultClientId={newOpen.clientId} />
      )}
      {modals}
    </div>
  )
}
