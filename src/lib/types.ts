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
  clients?: { name: string } | null
}

export interface Task {
  id: number
  title: string
  context: string
  client_id: number | null
  project_id: number | null
  parent_task_id: number | null
  priority: string
  status: string
  task_type: string
  origin: string
  due_date: string | null
  time_minutes: number
  notes: string | null
  done: boolean
  cats: string[]
  draft_to: string | null
  draft_cc: string | null
  draft_subject: string | null
  draft_body: string | null
  draft_needs_review: boolean
  draft_sent: boolean
  plan: string[]
  meeting_title: string | null
  meeting_duration: string | null
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
  requested_at: string | null
  context_readme: string | null
  archived_at: string | null
  projects?: { name: string; color: string | null } | null
  clients?: { name: string; email: string | null } | null
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
  presentation_id: number
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

export interface Recurrente {
  id: number
  title: string
  context: string
  client_id: number | null
  cats: string[]
  assign: string | null
  freq: string
  day_of_month: string
  time_minutes: number
  priority: string
  active: boolean
  created_at: string
  description: string | null
  clients?: { name: string } | null
}
