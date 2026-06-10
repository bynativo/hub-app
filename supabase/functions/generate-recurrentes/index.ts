// Edge Function: generate-recurrentes
//
// Corre diariamente a las 11:00 UTC (07:00 hora Chile UTC-4) via pg_cron.
// Por cada recurrente activa, calcula si hoy corresponde crear una instancia:
//   today == due_date - anticipation_days → crear tarea instancia
//
// Si la recurrente tiene delegación configurada:
//   - La tarea instancia se crea con status "Delegado"
//   - Se crea subtarea para el delegado con due_date = due - delegate_return_days
//   - Se crea recordatorio de seguimiento para Felipe (9am del día de devolución)
//
// Registro en recurrente_instances para evitar duplicados.

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

// ── Fecha helpers (Chile = UTC-4; la función corre en UTC) ─────────────────
function todayChile(): string {
  const now = new Date()
  // Chile UTC-4 (sin DST en invierno; con DST puede ser UTC-3; usamos UTC-4 fijo)
  const chile = new Date(now.getTime() - 4 * 60 * 60 * 1000)
  return chile.toISOString().slice(0, 10)
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
}

// Calcula el ISO de la PRÓXIMA fecha de vencimiento de la recurrente
// (misma lógica que nextRecurringDueDate del cliente, pero en UTC-4 = Chile).
function calcNextDueDate(r: {
  freq: string
  day_of_month: string
  last_executed_at: string | null
  last_instance_date: string | null
}): string {
  const today = todayChile()

  // Para el cálculo usamos last_instance_date (última instancia generada) en
  // lugar de last_executed_at (que es cuando Felipe la marcó como ejecutada).
  // Esto evita que si Felipe aún no marcó una instancia se genere otra.
  const lastInstance = r.last_instance_date ? r.last_instance_date.slice(0, 10) : null

  if (r.freq === 'diaria') {
    return lastInstance === today ? addDays(today, 1) : today
  }

  if (r.freq === 'semanal') {
    const dayMap: Record<string, number> = {
      domingo: 0, lunes: 1, martes: 2, miercoles: 3, miércoles: 3,
      jueves: 4, viernes: 5, sabado: 6, sábado: 6,
    }
    const target = dayMap[(r.day_of_month || '').toLowerCase()] ?? 1
    const todayDate = new Date(today + 'T00:00:00Z')
    const todayDow = todayDate.getUTCDay()
    let diff = target - todayDow
    if (diff < 0) diff += 7
    if (diff === 0 && lastInstance === today) diff = 7
    return addDays(today, diff)
  }

  if (r.freq === 'mensual') {
    const todayDate = new Date(today + 'T00:00:00Z')
    const y = todayDate.getUTCFullYear()
    const m = todayDate.getUTCMonth()

    const buildIso = (year: number, month: number): string => {
      if (r.day_of_month === 'ultimo') {
        const last = lastDayOfMonth(year, month)
        return `${year}-${String(month + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`
      }
      const day = Math.min(parseInt(r.day_of_month, 10) || 1, lastDayOfMonth(year, month))
      return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }

    const candIso = buildIso(y, m)
    const sameMonthInstance = lastInstance && lastInstance.slice(0, 7) === candIso.slice(0, 7) && lastInstance >= candIso
    if (candIso > today || (candIso === today && !sameMonthInstance)) return candIso
    // Mes siguiente
    const nm = m + 1
    return buildIso(nm > 11 ? y + 1 : y, nm > 11 ? 0 : nm)
  }

  return today
}

// ── Nombres de período según frecuencia ────────────────────────────────────
const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                   'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

function getWeekNumber(isoDate: string): number {
  const d = new Date(isoDate + 'T00:00:00Z')
  const startOfYear = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const days = Math.floor((d.getTime() - startOfYear.getTime()) / 86400000)
  return Math.ceil((days + startOfYear.getUTCDay() + 1) / 7)
}

function periodLabel(freq: string, dueDateIso: string): string {
  const d = new Date(dueDateIso + 'T00:00:00Z')
  if (freq === 'mensual') return `${MONTHS_ES[d.getUTCMonth()]} ${d.getUTCFullYear()}`
  if (freq === 'semanal') return `Semana ${getWeekNumber(dueDateIso)}`
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`
}

// ── Construcción del título de instancia ──────────────────────────────────
function buildInstanceTitle(
  recurrente: { title: string; context: string; freq: string },
  client: { name: string; sigla?: string | null } | null,
  campana: { title: string } | null,
  dueDate: string,
): string {
  const period = periodLabel(recurrente.freq, dueDate)
  const base = `${recurrente.title} — ${period}`

  if (recurrente.context === 'banco') {
    if (campana) {
      const camTitle = campana.title.replace(/^BF\s*\|\s*/i, '').replace(/^Campaña:\s*/i, '').trim()
      return `BF | Campaña: ${camTitle} | ${recurrente.title} — ${period}`
    }
    return `BF | ${base}`
  }

  if (recurrente.context === 'agencia') {
    if (client) {
      const sigla = (client.sigla?.trim() || client.name.slice(0, 3)).toUpperCase()
      return `INF | ${sigla} | ${base}`
    }
    return `INF | ${base}`
  }

  // personal
  return base
}

// ── Handler principal ──────────────────────────────────────────────────────
Deno.serve(async (_req) => {
  try {
    const today = todayChile()
    console.log(`[generate-recurrentes] Ejecutando para ${today}`)

    // Cargar todas las recurrentes activas con sus clientes
    const { data: recurrentes, error: recErr } = await supabase
      .from('recurrentes')
      .select('*, clients(name, sigla)')
      .eq('active', true)

    if (recErr) throw recErr
    if (!recurrentes?.length) {
      return new Response(JSON.stringify({ ok: true, generated: 0, message: 'Sin recurrentes activas' }), { status: 200 })
    }

    // Instancias ya creadas hoy (para no duplicar si se llama más de una vez)
    const { data: existingInstances } = await supabase
      .from('recurrente_instances')
      .select('recurrente_id, instance_date')

    const alreadyCreated = new Set<string>(
      (existingInstances || []).map((i: { recurrente_id: number; instance_date: string }) => `${i.recurrente_id}:${i.instance_date}`)
    )

    let generated = 0
    const results: string[] = []

    for (const r of recurrentes) {
      const dueDate = calcNextDueDate(r)
      const anticipation = r.anticipation_days ?? 3
      const triggerDate = addDays(dueDate, -anticipation)

      // ¿Hoy es el día de crear la instancia?
      if (today !== triggerDate) continue

      // ¿Ya existe instancia para este período?
      const instanceKey = `${r.id}:${dueDate}`
      if (alreadyCreated.has(instanceKey)) {
        console.log(`[generate-recurrentes] Ya existe instancia para recurrente ${r.id} (${dueDate})`)
        continue
      }

      // Obtener campaña vinculada si aplica
      let campana: { title: string } | null = null
      if (r.campana_id) {
        const { data: ct } = await supabase.from('tasks').select('title').eq('id', r.campana_id).maybeSingle()
        campana = ct
      }

      const client = (r.clients as { name: string; sigla?: string | null } | null) ?? null
      const title = buildInstanceTitle(r, client, campana, dueDate)

      const hasDelegate = !!(r.delegate_to || r.delegate_role)
      const taskStatus = hasDelegate ? 'Delegado' : 'Inbox'

      // Crear la tarea instancia
      const { data: newTask, error: taskErr } = await supabase
        .from('tasks')
        .insert({
          title,
          context: r.context,
          client_id: r.client_id ?? null,
          project_id: r.project_id ?? null,
          priority: r.priority || 'media',
          status: taskStatus,
          task_type: 'independiente',
          origin: 'propia',
          due_date: dueDate,
          estimated_hours: r.estimated_hours ?? null,
          delegated_to: hasDelegate ? (r.delegate_to || r.delegate_role) : null,
          es_recurrente_instance: true,
          recurrente_id: r.id,
          done: false,
          cats: r.cats || [],
          plan: [],
          meeting_agenda: [],
        })
        .select('id')
        .single()

      if (taskErr) {
        console.error(`[generate-recurrentes] Error creando tarea para recurrente ${r.id}:`, taskErr)
        continue
      }

      const taskId = newTask.id

      // Registrar en recurrente_instances
      await supabase.from('recurrente_instances').insert({
        recurrente_id: r.id,
        task_id: taskId,
        instance_date: dueDate,
      })

      // Actualizar last_instance_date en la recurrente
      await supabase.from('recurrentes').update({ last_instance_date: dueDate }).eq('id', r.id)

      // Si tiene delegación: crear subtarea para el delegado + recordatorio de seguimiento
      if (hasDelegate && r.delegate_return_days) {
        const returnDate = addDays(dueDate, -r.delegate_return_days)
        const delegateName = r.delegate_to || r.delegate_role || 'Delegado'
        const period = periodLabel(r.freq, dueDate)
        const subtaskTitle = `${r.title} — ${period}`

        // Subtarea para el delegado
        await supabase.from('tasks').insert({
          title: subtaskTitle,
          context: r.context,
          client_id: r.client_id ?? null,
          project_id: r.project_id ?? null,
          parent_task_id: taskId,
          priority: r.priority || 'media',
          status: 'Inbox',
          task_type: 'independiente',
          origin: 'propia',
          due_date: returnDate,
          delegated_to: delegateName,
          done: false,
          cats: [],
          plan: [],
          meeting_agenda: [],
        })

        // Recordatorio de seguimiento para Felipe (9am Chile = 13:00 UTC en horario UTC-4)
        const reminderAt = `${returnDate}T13:00:00Z`
        await supabase.from('tasks').insert({
          title: `Hoy vence la devolución de ${r.title}`,
          context: r.context,
          client_id: r.client_id ?? null,
          parent_task_id: taskId,
          priority: 'alta',
          status: 'Inbox',
          task_type: 'independiente',
          origin: 'propia',
          es_recordatorio: true,
          recordatorio_at: reminderAt,
          tipo_recordatorio: 'seguimiento_delegacion',
          done: false,
          cats: [],
          plan: [],
          meeting_agenda: [],
        })
      }

      generated++
      results.push(`✓ ${title} (due: ${dueDate})`)
      console.log(`[generate-recurrentes] Creada: ${title}`)
    }

    console.log(`[generate-recurrentes] Finalizado: ${generated} instancias creadas`)
    return new Response(JSON.stringify({ ok: true, generated, results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (e) {
    console.error('[generate-recurrentes] Error fatal:', e)
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
