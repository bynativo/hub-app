// Edge function send-push
//
// Que hace:
//   1) Lee tareas no cerradas, no archivadas, donde:
//      - es_recordatorio = true Y recordatorio_at <= now()       → push de recordatorio
//      - followup_at IS NOT NULL Y followup_at <= now()          → push de seguimiento
//   2) Para cada una arma un payload {title, body, data} y manda push a TODAS
//      las suscripciones registradas en push_subscriptions.
//   3) Marca cada tarea procesada con un flag (last_push_sent_at) para no
//      mandar el mismo push muchas veces.
//
// Como dispararla:
//   - pg_cron cada 5 min (recomendado, requiere extension cron + http en Supabase):
//       select cron.schedule('hub_send_push', '*/5 * * * *',
//         $$ select net.http_post('https://<proj>.supabase.co/functions/v1/send-push',
//             '{}'::jsonb, '{"Authorization":"Bearer <SERVICE_ROLE>"}'::jsonb) $$);
//   - O Vercel Cron / GitHub Action haciendo POST a la URL.
//   - O invocar manual para test: curl -X POST https://<proj>.supabase.co/functions/v1/send-push
//
// Secrets requeridos en Supabase (Project Settings > Edge Functions > Secrets):
//   VAPID_PUBLIC_KEY  (mismo valor que el cliente)
//   VAPID_PRIVATE_KEY
//   VAPID_SUBJECT     (mailto:tu@email.com — requerido por el spec Web Push)
//   SUPABASE_URL      (se inyecta solo)
//   SUPABASE_SERVICE_ROLE_KEY (se inyecta solo)
//
// El web-push de Deno usa la libreria `npm:web-push` que firma los JWTs VAPID.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const VAPID_PUBLIC_KEY  = Deno.env.get('VAPID_PUBLIC_KEY')  || ''
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') || ''
const VAPID_SUBJECT     = Deno.env.get('VAPID_SUBJECT')     || 'mailto:hub@bynativo.com'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

function ctxLabel(ctx: string) {
  if (ctx === 'banco') return 'Banco'
  if (ctx === 'agencia') return 'Agencia'
  if (ctx === 'personal') return 'Personal'
  return ctx
}

interface TaskRow {
  id: number
  title: string
  context: string
  status: string
  es_recordatorio: boolean | null
  tipo_recordatorio: string | null
  recordatorio_at: string | null
  followup_at: string | null
  last_push_sent_at: string | null
}

interface SubRow {
  id: number
  endpoint: string
  p256dh: string
  auth: string
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return jsonResp({ error: 'VAPID keys not configured (set VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY in Edge Function secrets).' }, 500)
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

  // Tareas debido a notificar: recordatorios vencidos o tareas con followup vencido,
  // que no esten cerradas/archivadas y que no se hayan notificado todavia (o cuyo
  // ultimo aviso sea anterior a la fecha actual de alarma — para detectar resnoozes).
  const nowIso = new Date().toISOString()
  const { data: dueTasks, error: qErr } = await supabase
    .from('tasks')
    .select('id,title,context,status,es_recordatorio,tipo_recordatorio,recordatorio_at,followup_at,last_push_sent_at')
    .eq('done', false)
    .is('archived_at', null)
    .or(`recordatorio_at.lte.${nowIso},followup_at.lte.${nowIso}`)

  if (qErr) return jsonResp({ error: qErr.message }, 500)

  const pending: TaskRow[] = []
  for (const t of (dueTasks || []) as TaskRow[]) {
    const isRem = !!t.es_recordatorio
    const alarm = isRem ? t.recordatorio_at : t.followup_at
    if (!alarm) continue
    if (new Date(alarm).getTime() > Date.now()) continue
    // Si ya mandamos un push despues de esta alarma, lo salteamos.
    if (t.last_push_sent_at && new Date(t.last_push_sent_at) >= new Date(alarm)) continue
    pending.push(t)
  }

  if (pending.length === 0) return jsonResp({ sent: 0, message: 'nada pendiente' })

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('id,endpoint,p256dh,auth')

  if (!subs || subs.length === 0) return jsonResp({ sent: 0, message: 'sin suscripciones' })

  let totalSent = 0
  const failedSubIds: number[] = []
  const sentTaskIds: number[] = []

  for (const t of pending) {
    const isRem = !!t.es_recordatorio
    const kind = isRem ? (t.tipo_recordatorio || 'recordatorio') : 'seguimiento'
    const payload = JSON.stringify({
      title: `🔔 ${t.title}`,
      body: `${kind.replace('_', ' ')} · ${ctxLabel(t.context)}${t.status ? ' · ' + t.status : ''}`,
      tag: `hub-task-${t.id}`,
      data: { taskId: t.id, url: `/?task=${t.id}` },
    })

    for (const s of (subs as SubRow[])) {
      try {
        await webpush.sendNotification({
          endpoint: s.endpoint,
          keys: { p256dh: s.p256dh, auth: s.auth },
        }, payload)
        totalSent += 1
      } catch (e) {
        const code = (e as { statusCode?: number })?.statusCode
        if (code === 404 || code === 410) failedSubIds.push(s.id)
      }
    }
    sentTaskIds.push(t.id)
  }

  // Marcamos las tareas notificadas para no repetir.
  if (sentTaskIds.length) {
    await supabase.from('tasks').update({ last_push_sent_at: nowIso }).in('id', sentTaskIds)
  }

  // Limpiamos suscripciones muertas (endpoint 404/410).
  if (failedSubIds.length) {
    await supabase.from('push_subscriptions').delete().in('id', failedSubIds)
  }

  return jsonResp({
    sent: totalSent,
    tasksNotified: sentTaskIds.length,
    deadSubsRemoved: failedSubIds.length,
  })
})
