import { useState } from 'react'
import { useStore } from '../../lib/store'
import { supabase } from '../../lib/supabase'
import { todayISO, addDaysISO, ctxColor } from '../../lib/helpers'
import type { CalendarEvent } from '../../lib/types'

const PROXY = 'https://ltgdpbmnvpjwwqkirbxw.supabase.co/functions/v1/calendar-proxy'
const DAY_START = 8
const DAY_END = 20

function fmtTime(d: Date) { return d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) }
function dayLabel(iso: string) { return new Date(iso + 'T00:00:00').toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'short' }) }
function mondayOf(iso: string): string {
  const dow = new Date(iso + 'T00:00:00').getDay() // 0=dom..6=sab
  return addDaysISO(iso, -((dow + 6) % 7))
}

export function CalendarView() {
  const events = useStore(s => s.calendarEvents)
  const tasks = useStore(s => s.tasks)
  const loadAll = useStore(s => s.loadAll)
  const openDetail = useStore(s => s.openDetail)

  const [view, setView] = useState<'week' | 'day'>('week')
  const [anchor, setAnchor] = useState(todayISO())
  const [syncing, setSyncing] = useState(false)
  const [creating, setCreating] = useState(false)
  const [evTitle, setEvTitle] = useState('')
  const [evDate, setEvDate] = useState(todayISO())
  const [evStart, setEvStart] = useState('09:00')
  const [evEnd, setEvEnd] = useState('10:00')
  const [evCtx, setEvCtx] = useState('banco')

  const days = view === 'day' ? [anchor] : Array.from({ length: 7 }, (_, i) => addDaysISO(mondayOf(anchor), i))

  const eventsOfDay = (iso: string) => events.filter(e => (e.starts_at || '').slice(0, 10) === iso)
    .sort((a, b) => (a.starts_at || '').localeCompare(b.starts_at || ''))
  const tasksOfDay = (iso: string) => tasks.filter(t => !t.done && !t.parent_task_id && t.due_date === iso)

  function freeGaps(iso: string, dayEvents: CalendarEvent[]) {
    const slots = dayEvents.filter(e => !e.all_day && e.ends_at)
      .map(e => ({ s: new Date(e.starts_at), e: new Date(e.ends_at as string) }))
      .sort((a, b) => a.s.getTime() - b.s.getTime())
    const gaps: { from: string; to: string; mins: number }[] = []
    const cursor = new Date(iso + 'T00:00:00'); cursor.setHours(DAY_START, 0, 0, 0)
    const dayEnd = new Date(iso + 'T00:00:00'); dayEnd.setHours(DAY_END, 0, 0, 0)
    let c = cursor
    for (const sl of slots) {
      if (sl.s.getTime() > c.getTime()) {
        const mins = (sl.s.getTime() - c.getTime()) / 60000
        if (mins >= 30) gaps.push({ from: fmtTime(c), to: fmtTime(sl.s), mins })
      }
      if (sl.e.getTime() > c.getTime()) c = sl.e
    }
    if (dayEnd.getTime() > c.getTime()) {
      const mins = (dayEnd.getTime() - c.getTime()) / 60000
      if (mins >= 30) gaps.push({ from: fmtTime(c), to: fmtTime(dayEnd), mins })
    }
    return gaps
  }

  async function sync() {
    setSyncing(true)
    try {
      const from = new Date(days[0] + 'T00:00:00').toISOString()
      const to = new Date(addDaysISO(days[days.length - 1], 1) + 'T00:00:00').toISOString()
      const r = await fetch(PROXY, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to }) })
      const d = await r.json()
      await loadAll()
      alert(d.connected ? `✓ Sincronizados ${d.synced} eventos de Google Calendar.` : (d.note || 'Google Calendar aún no está conectado.'))
    } catch { alert('Error al sincronizar.') } finally { setSyncing(false) }
  }

  async function createEvent() {
    if (!evTitle.trim()) return
    const starts = new Date(`${evDate}T${evStart}`).toISOString()
    const ends = new Date(`${evDate}T${evEnd}`).toISOString()
    const { error } = await supabase.from('calendar_events').insert({
      title: evTitle.trim(), starts_at: starts, ends_at: ends, context: evCtx, source: 'manual', calendar: 'hub',
    })
    if (error) { alert('Error: ' + error.message); return }
    setEvTitle(''); setCreating(false)
    await loadAll()
  }

  const fieldCls = 'bg-bg3 border border-black/7 rounded-md px-2 py-1.5 text-xs outline-none focus:border-claude/20'

  return (
    <div className="animate-fade-in p-5">
      <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
        <div>
          <h1 className="font-serif text-[26px] font-light mb-0.5" style={{ color: '#7c3aed' }}>Calendario</h1>
          <p className="text-gray-500 text-[13px]">Agenda + tareas con fecha · reuniones de Google Calendar</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-bg3 border border-black/7 rounded-lg p-0.5">
            {(['week', 'day'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`text-xs px-3 py-1 rounded-md cursor-pointer transition-all ${view === v ? 'bg-bg2 text-gray-900 shadow-sm font-medium' : 'text-gray-400 hover:text-gray-600'}`}>
                {v === 'week' ? 'Semana' : 'Día'}
              </button>
            ))}
          </div>
          <button onClick={sync} disabled={syncing}
            className="text-xs bg-bg3 border border-black/7 text-gray-500 px-3 py-1.5 rounded-lg hover:bg-bg4 cursor-pointer disabled:opacity-40">
            {syncing ? 'Sincronizando…' : '↻ Google'}
          </button>
          <button onClick={() => setCreating(c => !c)}
            className="text-xs bg-claude text-white px-3 py-1.5 rounded-lg hover:bg-purple-700 cursor-pointer">+ Evento</button>
        </div>
      </div>

      {/* Navegación de rango */}
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => setAnchor(addDaysISO(anchor, view === 'day' ? -1 : -7))} className="text-xs px-2 py-1 rounded-md border border-black/7 bg-bg3 hover:bg-bg4 cursor-pointer">←</button>
        <span className="text-[12px] font-mono text-gray-500 capitalize">{view === 'day' ? dayLabel(anchor) : `${dayLabel(days[0])} → ${dayLabel(days[6])}`}</span>
        <button onClick={() => setAnchor(addDaysISO(anchor, view === 'day' ? 1 : 7))} className="text-xs px-2 py-1 rounded-md border border-black/7 bg-bg3 hover:bg-bg4 cursor-pointer">→</button>
        <button onClick={() => setAnchor(todayISO())} className="text-xs px-2 py-1 rounded-md border border-black/7 bg-bg3 hover:bg-bg4 cursor-pointer">Hoy</button>
      </div>

      {creating && (
        <div className="bg-bg2 border border-black/7 rounded-lg p-3 mb-3 flex flex-wrap items-end gap-2">
          <input value={evTitle} onChange={e => setEvTitle(e.target.value)} placeholder="Título del evento" className={fieldCls + ' flex-1 min-w-[160px]'} autoFocus />
          <input type="date" value={evDate} onChange={e => setEvDate(e.target.value)} className={fieldCls} />
          <input type="time" value={evStart} onChange={e => setEvStart(e.target.value)} className={fieldCls} />
          <input type="time" value={evEnd} onChange={e => setEvEnd(e.target.value)} className={fieldCls} />
          <select value={evCtx} onChange={e => setEvCtx(e.target.value)} className={fieldCls}>
            <option value="banco">Banco</option><option value="agencia">Agencia</option><option value="personal">Personal</option>
          </select>
          <button onClick={createEvent} disabled={!evTitle.trim()} className="text-xs bg-claude text-white px-3 py-1.5 rounded-md cursor-pointer hover:bg-purple-700 disabled:opacity-40">Crear</button>
        </div>
      )}

      <div className={view === 'week' ? 'grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3' : 'max-w-[560px]'}>
        {days.map(iso => {
          const evs = eventsOfDay(iso)
          const dayTasks = tasksOfDay(iso)
          const gaps = freeGaps(iso, evs)
          const isToday = iso === todayISO()
          return (
            <div key={iso} className={`bg-bg2 border rounded-xl overflow-hidden ${isToday ? 'border-claude/30' : 'border-black/7'}`}>
              <div className={`px-3 py-2 border-b border-black/7 text-[12px] font-medium capitalize ${isToday ? 'text-claude' : 'text-gray-600'}`}>
                {dayLabel(iso)}{isToday ? ' · hoy' : ''}
              </div>
              <div className="p-2.5 flex flex-col gap-1.5 min-h-[60px]">
                {evs.map(e => (
                  <div key={e.id} className="flex items-start gap-2 text-[12px]">
                    <span className="font-mono text-gray-400 shrink-0 w-[78px]">{e.all_day ? 'todo el día' : `${fmtTime(new Date(e.starts_at))}${e.ends_at ? '–' + fmtTime(new Date(e.ends_at)) : ''}`}</span>
                    <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: e.context ? ctxColor(e.context) : '#7c3aed' }} />
                    <span className="flex-1 leading-snug">{e.title}{e.source === 'google' ? ' ' : ''}{e.source === 'google' && <span className="text-[9px] text-gray-400">G</span>}</span>
                  </div>
                ))}
                {dayTasks.map(t => (
                  <div key={'t' + t.id} onClick={() => openDetail(t.id)} className="flex items-center gap-2 text-[12px] cursor-pointer hover:text-claude">
                    <span className="font-mono text-gray-400 shrink-0 w-[78px]">tarea</span>
                    <span className="w-1.5 h-1.5 rounded-full mt-0 shrink-0 bg-claude" />
                    <span className="flex-1 leading-snug">📌 {t.title}</span>
                  </div>
                ))}
                {gaps.map((g, i) => (
                  <div key={'g' + i} className="text-[10px] font-mono text-gray-300 pl-[86px]">libre {g.from}–{g.to} ({Math.round(g.mins / 60 * 10) / 10}h)</div>
                ))}
                {!evs.length && !dayTasks.length && <div className="text-[11px] text-gray-300 italic">sin agenda</div>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
