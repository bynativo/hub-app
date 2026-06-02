import { useState, useEffect } from 'react'
import { useStore } from '../../lib/store'
import { supabase } from '../../lib/supabase'
import { ctxLabel } from '../../lib/helpers'
import { STATUS_ICON, STATUS_COLOR } from '../../lib/constants'
import { CaptureModal } from './CaptureModal'
import type { Task } from '../../lib/types'

export function SearchModal({ onClose, onOpenPres }: { onClose: () => void; onOpenPres: (id: number) => void }) {
  const tasks = useStore(s => s.tasks)
  const projects = useStore(s => s.projects)
  const presentations = useStore(s => s.presentations)
  const openDetail = useStore(s => s.openDetail)
  const setView = useStore(s => s.setView)

  const [q, setQ] = useState('')
  const [attachIds, setAttachIds] = useState<Set<number>>(new Set())
  const [template, setTemplate] = useState<Task | null>(null)

  const ql = q.trim().toLowerCase()

  // Búsqueda en attachments (nombre) → ids de tareas vinculadas
  useEffect(() => {
    if (ql.length < 2) { setAttachIds(new Set()); return }
    let cancel = false
    const t = setTimeout(async () => {
      const { data } = await supabase.from('attachments').select('task_id').ilike('name', `%${q.trim()}%`)
      if (!cancel) setAttachIds(new Set((data || []).map((a: { task_id: number }) => a.task_id)))
    }, 200)
    return () => { cancel = true; clearTimeout(t) }
  }, [ql]) // eslint-disable-line react-hooks/exhaustive-deps

  const m = (s?: string | null) => !!s && s.toLowerCase().includes(ql)
  const taskMatch = (t: Task) => m(t.title) || m(t.notes) || m(t.context_readme) || attachIds.has(t.id)

  const activas = ql.length < 2 ? [] : tasks.filter(t => !t.archived_at && !t.done && taskMatch(t)).slice(0, 12)
  const archivadas = ql.length < 2 ? [] : tasks.filter(t => (t.archived_at || t.done) && taskMatch(t)).slice(0, 12)
  const proys = ql.length < 2 ? [] : projects.filter(p => m(p.name) || m(p.description)).slice(0, 8)
  const pres = ql.length < 2 ? [] : presentations.filter(p => m(p.title) || m(p.subtitle)).slice(0, 8)
  const total = activas.length + archivadas.length + proys.length + pres.length

  function goTask(id: number) { openDetail(id); onClose() }
  function goProject(ctx: string) { setView(`${ctx}-proyectos`); onClose() }
  function goPres(id: number) { onOpenPres(id); onClose() }

  function TaskRow({ t, archived }: { t: Task; archived?: boolean }) {
    const stColor = STATUS_COLOR[t.status] || '#6b7280'
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-bg3 cursor-pointer group" onClick={() => goTask(t.id)}>
        {t.parent_task_id && <span className="text-[10px] text-gray-300">↳</span>}
        <span className="text-[13px] flex-1 min-w-0 truncate">{t.title}</span>
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0" style={{ background: stColor + '16', color: stColor }}>{STATUS_ICON[t.status] || '•'} {t.status}</span>
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg4 text-gray-500 shrink-0">{ctxLabel(t.context)}</span>
        {archived && (
          <button onClick={e => { e.stopPropagation(); setTemplate(t) }}
            className="text-[10px] text-claude bg-claude/7 border border-claude/20 px-2 py-0.5 rounded shrink-0 opacity-0 group-hover:opacity-100 hover:bg-claude/15">Usar como plantilla</button>
        )}
      </div>
    )
  }

  const Group = ({ label, count, children }: { label: string; count: number; children: React.ReactNode }) =>
    count > 0 ? (
      <div className="mb-2">
        <div className="text-[10px] font-mono text-gray-400 tracking-wider uppercase px-3 py-1">{label} · {count}</div>
        {children}
      </div>
    ) : null

  return (
    <div className="fixed inset-0 bg-black/40 z-[340] flex items-start justify-center pt-4 md:pt-20 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-bg2 border border-black/7 rounded-2xl w-[calc(100vw-1rem)] md:w-[640px] md:max-w-[94vw] shadow-2xl overflow-hidden flex flex-col max-h-[88vh] md:max-h-[70vh]">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-black/7">
          <span className="text-gray-400">🔍</span>
          <input value={q} onChange={e => setQ(e.target.value)} autoFocus
            placeholder="Buscar en tareas, subtareas, proyectos, presentaciones, adjuntos…"
            className="flex-1 bg-transparent text-[14px] outline-none" />
          <button onClick={onClose} className="text-[10px] font-mono text-gray-400 bg-bg3 border border-black/7 rounded px-1.5 py-0.5 cursor-pointer">esc</button>
        </div>

        <div className="overflow-y-auto p-2 flex-1">
          {ql.length < 2 ? (
            <div className="text-center py-8 text-gray-400 text-[13px]">Escribí al menos 2 caracteres…</div>
          ) : total === 0 ? (
            <div className="text-center py-8 text-gray-400 text-[13px]">Sin resultados para "{q.trim()}"</div>
          ) : (
            <>
              <Group label="Activas" count={activas.length}>{activas.map(t => <TaskRow key={t.id} t={t} />)}</Group>
              <Group label="Archivadas / completadas" count={archivadas.length}>{archivadas.map(t => <TaskRow key={t.id} t={t} archived />)}</Group>
              <Group label="Proyectos" count={proys.length}>
                {proys.map(p => (
                  <div key={p.id} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-bg3 cursor-pointer" onClick={() => goProject(p.context)}>
                    <span className="text-[13px] flex-1 truncate">📁 {p.name}</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg4 text-gray-500">{ctxLabel(p.context)}</span>
                  </div>
                ))}
              </Group>
              <Group label="Presentaciones" count={pres.length}>
                {pres.map(p => (
                  <div key={p.id} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-bg3 cursor-pointer" onClick={() => goPres(p.id)}>
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.kv_color }} />
                    <span className="text-[13px] flex-1 truncate">{p.title}</span>
                    {p.tipo && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-claude/7 text-claude">{p.tipo}</span>}
                  </div>
                ))}
              </Group>
            </>
          )}
        </div>
      </div>

      {template && (
        <CaptureModal
          onClose={() => { setTemplate(null); onClose() }}
          preselectContext={template.context}
          preselectClientId={template.client_id}
          template={{ title: template.title, context: template.context, priority: template.priority, origin: template.origin, notes: template.context_readme || template.notes, estimated_hours: template.estimated_hours, task_type: template.task_type }}
        />
      )}
    </div>
  )
}
