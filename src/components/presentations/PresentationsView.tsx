import { useState } from 'react'
import { useStore } from '../../lib/store'
import { supabase } from '../../lib/supabase'
import { ctxLabel } from '../../lib/helpers'
import { NewPresentationModal } from '../modals/NewPresentationModal'
import type { Presentation } from '../../lib/types'

function slugify(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40) + '-' + Math.random().toString(36).slice(2, 6)
}

export function PresentationsView({ context, onOpen }: { context?: string; onOpen: (id: number) => void }) {
  const presentations = useStore(s => s.presentations)
  const clients = useStore(s => s.clients)
  const loadAll = useStore(s => s.loadAll)
  const [newOpen, setNewOpen] = useState<{ context: string; clientId: number | null } | null>(null)
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
            <p className="text-[13px] text-gray-500 mb-4">¿Eliminar "<span className="font-medium text-gray-700">{deleting.title}</span>"? Se borran sus slides. Las tareas de contenido vinculadas quedan sin presentación asignada.</p>
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
      className="relative bg-bg2 border border-black/7 rounded-xl overflow-hidden cursor-pointer hover:border-black/13 hover:shadow-md hover:-translate-y-px transition-all shadow-sm"
    >
      <div className="h-2" style={{ background: p.kv_color }} />
      <button onClick={e => { e.stopPropagation(); setMenuFor(menuFor === p.id ? null : p.id) }}
        className="absolute top-3 right-1.5 text-gray-400 hover:text-gray-900 cursor-pointer px-1.5 leading-none text-lg z-[6]" title="Opciones">⋯</button>
      {menuFor === p.id && (
        <>
          <div className="fixed inset-0 z-[5]" onClick={e => { e.stopPropagation(); setMenuFor(null) }} />
          <div className="absolute right-1.5 top-9 bg-bg2 border border-black/7 rounded-lg shadow-lg py-1 z-10 w-44" onClick={e => e.stopPropagation()}>
            <button onClick={() => { setRenaming({ id: p.id, title: p.title }); setMenuFor(null) }}
              className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-bg3 cursor-pointer">✎ Editar título</button>
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
