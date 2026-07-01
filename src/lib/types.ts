export interface Client {
  id: number
  name: string
  email: string | null
  context: string
  color: string | null
  active: boolean
  created_at: string
  contact_name: string | null
  contact_role: string | null
  service_scope: string | null
  proposal_url: string | null
  drive_folder_url: string | null
  is_internal: boolean | null
  tipo: string | null
  es_agencia_interna: boolean | null
  sigla: string | null
  website_url: string | null
  social_links: Record<string, string> | null
}

export interface Project {
  id: number
  name: string
  context: string
  client_id: number | null
  type: string | null
  description: string | null
  due_date: string | null
  email: string | null
  color: string | null
  status: string | null
  tipo_agencia: string | null
  created_at: string
  presentation_url: string | null
  presentation_type: string | null
  is_content_grid: boolean
  is_ongoing: boolean | null
  es_interno: boolean | null
  clients?: { name: string } | null
}

export interface Task {
  id: number
  title: string
  context: string
  client_id: number | null
  project_id: number | null
  parent_task_id: number | null
  presentation_id: number | null
  priority: string
  status: string
  task_type: string
  origin: string
  due_date: string | null
  publish_date: string | null
  recording_date: string | null
  profile_request_date: string | null
  brief_date: string | null
  num_perfiles: number | null
  notes: string | null
  done: boolean
  cats: string[]
  draft_subject: string | null
  draft_body: string | null
  draft_needs_review: boolean
  draft_sent: boolean
  plan: string[]
  meeting_agenda: string[]
  created_at: string
  updated_at: string
  slide_idea: string | null
  slide_number: number | null
  content_format: string | null
  content_platform: string | null
  delegated_to: string | null
  last_followup_at: string | null
  followup_notes: string | null
  followup_at: string | null
  followup_type: string | null
  estimated_hours: number | null
  kanban_order: number | null
  es_recordatorio: boolean
  recordatorio_at: string | null
  tipo_recordatorio: string | null
  correo_contexto: string | null
  requested_at: string | null
  context_readme: string | null
  archived_at: string | null
  content_pub_type: string | null
  influencer_name: string | null
  influencer_handle: string | null
  influencer_agency: string | null
  // Campaña
  es_campana: boolean | null
  campana_fecha_inicio: string | null
  campana_fecha_fin: string | null
  // Planificación y delegación
  work_date: string | null
  delegation_date: string | null
  delegation_return_date: string | null
  // Para perfiles de "Solicitar influencers": array de tipos con cantidad.
  // Reemplaza al tipo_publicacion scalar (que queda como fallback/compat).
  influencer_tipos: { tipo: string; cantidad: number }[] | null
  // Columnas canónicas para el módulo influencers (las anteriores quedan como legacy):
  es_influencer: boolean | null
  influencer_nombre: string | null
  influencer_agencia: string | null
  tipo_publicacion: string | null
  // Responsable de cierre
  closer_member_id: number | null
  // Delegación nueva (member_id)
  delegated_to_member_id: number | null
  // Instancias de recurrentes
  es_recurrente_instance: boolean | null
  recurrente_id: number | null
  // Delegación recibida
  es_delegada: boolean | null
  origen_delegacion_id: number | null
  // Categoría de contenedor (campana / proyecto / propuesta / padre); null = tarea ejecutable normal
  categoria: string | null
  // Sub-tipo de "En seguimiento": 'esperando' = depende de un tercero, 'feedback' = entregado, esperando OK
  seguimiento_tipo: string | null
  feedback_interno: boolean | null
  feedback_externo: boolean | null
  email_asunto: string | null
  perfil_confirmed_at: string | null
  projects?: { name: string; color: string | null } | null
  clients?: { name: string; email: string | null } | null
  slides?: { id: number; fase: string | null; etapa: string | null }[] | null
}

export interface TaskDelegation {
  id: number
  task_id: number
  delegated_to: string
  stage: string
  return_date: string | null
  note: string | null
  created_task_id: number | null
  created_at: string
  completed_at: string | null
}

export interface Subtask {
  id: number
  task_id: number
  title: string
  done: boolean
  position: number
  status: string | null
  due_date: string | null
  estimated_hours: number | null
  notes: string | null
  link_url: string | null
  created_at: string
}

export interface Checklist {
  id: number
  task_id: number
  title: string
  done: boolean
  position: number
  created_at: string
  // Responsable + fecha de recordatorio. Si due_at está seteado, se crea
  // automáticamente una tarea recordatorio vinculada via reminder_task_id.
  responsable: string | null         // legacy
  responsable_member_id: number | null
  due_at: string | null
  reminder_task_id: number | null
}

export interface Contact {
  id: number
  name: string
  role: string | null
  company: string | null
  context: string | null
  origin: string | null
  email: string | null
  phone: string | null
  created_at: string
}

export interface TeamMember {
  id: number
  nombre: string
  aliases: string[] | null
  email: string | null
  phone: string | null
  avatar_url: string | null
  color: string | null
  contextos: string[]
  rol: string | null
  cargo: string | null
  activo: boolean
  notes: string | null
  created_at: string
}

export interface Thread {
  id: number
  task_id: number
  from_name: string | null
  from_email: string | null
  subject: string | null
  body: string | null
  received_at: string | null
  created_at: string
}

export interface Presentation {
  id: number
  slug: string
  title: string
  subtitle: string | null
  context: string
  client_id: number | null
  project_id: number | null
  kv_style: string | null
  kv_color: string
  month_label: string | null
  share_enabled: boolean
  tipo: string | null
  external_url: string | null
  created_at: string
  updated_at: string
}

export interface Slide {
  id: number
  presentation_id: number | null
  position: number
  title: string
  campana: string | null
  objetivo: string | null
  idea_descripcion: string | null
  problema: string | null
  solucion: string | null
  insight: string | null
  tipo_contenido: string | null
  canales: string[] | null
  perfil_rostro: string | null
  equipo: string | null
  responsable: string | null
  fecha_filmacion: string | null
  fecha_validacion: string | null
  fecha_publicacion: string | null
  status: string | null
  link_guion: string | null
  link_referencia: string | null
  contenido_url_interno: string | null
  contenido_url_externo: string | null
  contenido_embed_type: string | null
  task_id: number | null
  client_variants: unknown[]
  created_at: string
  updated_at: string
  status_prod: string
  status_cm: string
  fase: string | null
  etapa: string | null
  clase_pieza: string | null
  plataformas: string[]
  tipo_pieza: string
  is_aprobada: boolean
  grilla_project_id: number | null
  grilla_date: string | null
  grilla_slot_confirmed: boolean
  campana_nombre: string | null
  producto: string | null
  redes: string[] | null
  formato: string | null
  colab_nombre: string | null
  tiene_guion: boolean | null
  fechas_por_plataforma: Record<string, string> | null
  guion_versiones: { v: number; texto: string; fecha: string }[] | null
  aprobaciones: Record<string, { estado: string; nombre: string; fecha: string; feedback?: string }> | null
  es_texto: boolean
  texto_contenido: string | null
  media_url: string | null
  carrusel_archivos: string[] | null
  content_pub_type: string | null
  influencer_name: string | null
  influencer_handle: string | null
  approval_token: string | null
  es_slide_libre: boolean | null
  canva_design_id: string | null
  canva_preview_url: string | null
  posicion_manual: number | null
  presentations?: Presentation | null
}

export interface CalendarEvent {
  id: number
  title: string
  starts_at: string
  ends_at: string | null
  all_day: boolean
  context: string | null
  calendar: string | null
  source: string
  google_id: string | null
  location: string | null
  created_at: string
}

export interface Template {
  id: number
  name: string
  context: string
  description: string | null
  created_at: string
  updated_at: string | null
}

export interface TemplateTask {
  id: number
  template_id: number | null
  parent_id: number | null
  title: string
  task_type: string | null
  priority: string | null
  estimated_hours: number | null
  day_offset: number | null
  is_reminder: boolean | null
  reminder_type: string | null
  is_recurring: boolean | null
  notes: string | null
  position: number | null
  created_at: string
}

export interface Recurrente {
  id: number
  title: string
  context: string
  client_id: number | null
  project_id: number | null
  cats: string[]
  assign: string | null
  freq: string
  day_of_month: string
  time_minutes: number
  priority: string
  active: boolean
  created_at: string
  description: string | null
  last_executed_at: string | null
  // Nuevos campos para instancias automáticas
  estimated_hours: number | null
  anticipation_days: number | null
  delegate_to: string | null
  delegate_role: string | null
  delegate_return_days: number | null
  campana_id: number | null
  last_instance_date: string | null
  clients?: { name: string } | null
}
