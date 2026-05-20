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

export const ESTADOS: Record<string, string[]> = {
  banco: ['Inbox', 'Trabajando', 'Planificando', 'Delegado', 'Bloqueado'],
  agencia: ['Inbox', 'Propuesta', 'En ejecucion', 'En revision cliente', 'Delegado', 'Cerrado'],
  personal: ['Inbox', 'Trabajando', 'En pausa', 'Delegado'],
}

export const STATUS_ICON: Record<string, string> = {
  Inbox: '○', Trabajando: '▶', Planificando: '◈', Delegado: '→',
  Bloqueado: '✕', Propuesta: '◎', 'En ejecucion': '▶',
  'En revision cliente': '⌛', Cerrado: '✓', 'En pausa': '‖',
}

export const STATUS_COLOR: Record<string, string> = {
  Inbox: '#6b7280', Trabajando: '#2563eb', Planificando: '#7c3aed',
  Delegado: '#d97706', Bloqueado: '#dc2626', Propuesta: '#7c3aed',
  'En ejecucion': '#2563eb', 'En revision cliente': '#d97706',
  Cerrado: '#16a34a', 'En pausa': '#6b7280',
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
