export const CTX_COLORS: Record<string, string> = {
  banco: '#2563eb',
  agencia: '#0d9488',
  personal: '#d97706',
}

export const CATS: Record<string, string[]> = {
  banco: ['administrativo', 'rrss', 'contenido', 'estrategia', 'proveedores', 'pagos', 'reportes', 'equipo', 'campanas', 'reuniones', 'aprobaciones'],
  agencia: ['estrategia', 'propuesta', 'rrss', 'contenido', 'medios', 'influencer', 'administrativo', 'clientes', 'nuevos-negocios', 'reportes', 'produccion', 'agencia-interna', 'facturacion', 'brief'],
  personal: ['idea', 'prospeccion', 'desarrollo', 'networking', 'formacion', 'vision', 'marca-personal'],
}

export const ORIGIN_LABELS: Record<string, string> = {
  'gmail-agencia': 'Gmail agencia',
  'outlook-banco': 'Outlook banco',
  'gmail-personal': 'Gmail personal',
  'whatsapp': 'WhatsApp',
  'reunion': 'Reunion',
  'propia': 'Propia',
}

// Flujo principal de estados por contexto (orden de avance)
export const ESTADOS_FLOW: Record<string, string[]> = {
  banco: ['Inbox', 'Trabajando', 'Pend. validación', 'Cerrado'],
  agencia: ['Inbox', 'Propuesta', 'En ejecución', 'Revisión interna', 'En revisión cliente', 'Cerrado'],
  personal: ['Inbox', 'Trabajando', 'Cerrado'],
}

// Estados de pausa por contexto (fuera del flujo lineal)
export const ESTADOS_PAUSA: Record<string, string[]> = {
  banco: ['Delegado', 'Bloqueado'],
  agencia: ['Delegado', 'Bloqueado'],
  personal: ['En pausa', 'Delegado'],
}

// Todos los estados seleccionables por contexto (flujo + pausa)
export const ESTADOS: Record<string, string[]> = {
  banco: [...ESTADOS_FLOW.banco, ...ESTADOS_PAUSA.banco],
  agencia: [...ESTADOS_FLOW.agencia, ...ESTADOS_PAUSA.agencia],
  personal: [...ESTADOS_FLOW.personal, ...ESTADOS_PAUSA.personal],
}

// 4 columnas universales del Kanban del dashboard
export const KANBAN_GROUPS: { key: string; label: string; statuses: string[] }[] = [
  { key: 'porhacer', label: 'Por hacer', statuses: ['Inbox'] },
  { key: 'encurso', label: 'En curso', statuses: ['Trabajando', 'En ejecución', 'Revisión interna', 'Propuesta'] },
  { key: 'esperando', label: 'Esperando', statuses: ['Delegado', 'Pend. validación', 'En revisión cliente', 'Bloqueado'] },
  { key: 'cerrado', label: 'Cerrado', statuses: ['Cerrado', 'Entregado', 'Descartado'] },
]

// Estados que disparan alarma de seguimiento ("Esperando")
export const WAITING_STATES = ['Delegado', 'Pend. validación', 'En revisión cliente', 'Bloqueado']

export const STATUS_ICON: Record<string, string> = {
  Inbox: '○', Trabajando: '▶', 'Pend. validación': '⌛', Cerrado: '✓',
  Propuesta: '◎', 'En ejecución': '▶', 'Revisión interna': '◐',
  'En revisión cliente': '⌛', Delegado: '→', Bloqueado: '✕',
  'En pausa': '‖', Entregado: '✓', Descartado: '✕', Planificando: '◈',
}

export const STATUS_COLOR: Record<string, string> = {
  Inbox: '#6b7280', Trabajando: '#2563eb', 'Pend. validación': '#d97706', Cerrado: '#16a34a',
  Propuesta: '#7c3aed', 'En ejecución': '#2563eb', 'Revisión interna': '#7c3aed',
  'En revisión cliente': '#d97706', Delegado: '#d97706', Bloqueado: '#dc2626',
  'En pausa': '#6b7280', Entregado: '#16a34a', Descartado: '#9ca3af', Planificando: '#7c3aed',
}

export const PLAT_META: Record<string, { label: string; css: string; color: string }> = {
  ig_feed: { label: 'IG Feed', css: 'ig', color: '#e1306c' },
  ig_story: { label: 'IG Story', css: 'ig', color: '#e1306c' },
  ig_reels: { label: 'IG Reels', css: 'ig', color: '#e1306c' },
  tiktok: { label: 'TikTok', css: 'tiktok', color: '#333' },
  youtube: { label: 'YouTube', css: 'yt', color: '#ff0000' },
  youtube_shorts: { label: 'YT Shorts', css: 'yt', color: '#ff0000' },
  facebook: { label: 'Facebook', css: 'fb', color: '#1877f2' },
  x: { label: 'X', css: 'x', color: '#333' },
  anuncio_pauta: { label: 'Pauta', css: 'pauta', color: '#7c3aed' },
}

export const TIPO_META: Record<string, { label: string }> = {
  video: { label: 'Video' },
  carrusel: { label: 'Carrusel' },
  reels: { label: 'Reels' },
  story: { label: 'Story' },
  shorts: { label: 'Shorts' },
  imagen: { label: 'Imagen' },
  link_ad: { label: 'Link Ad' },
  texto: { label: 'Texto' },
}

export const PROD_STATUS: Record<string, string[]> = {
  banco: ['Pendiente', 'En grabacion', 'En edicion', 'Entregado a CM'],
  agencia: ['Pendiente', 'En produccion', 'Entregado al cliente'],
}

export const CM_STATUS = ['Pendiente de contenido', 'Listo para programar', 'Programado', 'Publicado']
