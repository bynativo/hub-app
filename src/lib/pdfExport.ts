import { supabase } from './supabase'
import type { Presentation, Slide } from './types'

// Genera y descarga un PDF de la presentación con todas las slides en orden.
// jsPDF se carga con dynamic import para no engordar el bundle inicial.
export async function exportPresentationPDF(pres: Presentation): Promise<void> {
  const [{ jsPDF }, slidesRes] = await Promise.all([
    import('jspdf'),
    supabase.from('slides').select('*').eq('presentation_id', pres.id)
      .order('fecha_publicacion', { ascending: true, nullsFirst: false })
      .order('position'),
  ])
  const slides: Slide[] = ((slidesRes.data as Slide[]) || []).sort((a, b) => {
    const apm = a.posicion_manual, bpm = b.posicion_manual
    if (apm != null && bpm != null) return apm - bpm
    if (apm != null) return -1
    if (bpm != null) return 1
    if (a.fecha_publicacion && b.fecha_publicacion) return a.fecha_publicacion.localeCompare(b.fecha_publicacion)
    if (a.fecha_publicacion) return -1
    if (b.fecha_publicacion) return 1
    return (a.position || 0) - (b.position || 0)
  })

  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const page = { w: doc.internal.pageSize.getWidth(), h: doc.internal.pageSize.getHeight() }
  const margin = 48
  const maxW = page.w - margin * 2

  // --- Portada ---
  doc.setFont('helvetica', 'normal')
  doc.setFillColor(22, 163, 74)
  doc.rect(0, 0, page.w, 6, 'F')
  doc.setFontSize(28)
  doc.setTextColor(20)
  doc.text(pres.title, margin, 100, { maxWidth: maxW })
  if (pres.subtitle) {
    doc.setFontSize(13); doc.setTextColor(110)
    doc.text(pres.subtitle, margin, 130, { maxWidth: maxW })
  }
  doc.setFontSize(11); doc.setTextColor(130)
  const expFecha = new Date().toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric' })
  doc.text(`Exportado el ${expFecha}`, margin, 160)
  doc.text(`${slides.length} slide${slides.length === 1 ? '' : 's'}`, margin, 178)
  if (pres.month_label) doc.text(`Período: ${pres.month_label}`, margin, 196)

  // --- Slides ---
  slides.forEach((s, idx) => {
    doc.addPage()
    let y = margin + 12

    // Encabezado
    doc.setFontSize(9); doc.setTextColor(150)
    doc.text(`#${idx + 1} de ${slides.length}  ·  ${pres.title}`, margin, margin - 12)

    doc.setFontSize(18); doc.setTextColor(20)
    const titleLines = doc.splitTextToSize(s.title || '(sin título)', maxW)
    doc.text(titleLines, margin, y)
    y += titleLines.length * 22 + 4

    // Metadata
    doc.setFontSize(10); doc.setTextColor(110)
    const meta: string[] = []
    if (s.fecha_publicacion) meta.push(`Publicación: ${s.fecha_publicacion}`)
    if (s.fecha_validacion) meta.push(`Entrega a CM: ${s.fecha_validacion}`)
    if (s.fecha_filmacion) meta.push(`Grabación: ${s.fecha_filmacion}`)
    if (s.formato) meta.push(`Formato: ${s.formato}`)
    if (s.redes && s.redes.length) meta.push(`Redes: ${s.redes.join(', ')}`)
    if (meta.length) {
      const ml = doc.splitTextToSize(meta.join('   ·   '), maxW)
      doc.text(ml, margin, y); y += ml.length * 14 + 4
    }

    // Status
    const status: string[] = []
    if (s.status_prod) status.push(`Producción: ${s.status_prod}`)
    if (s.status_cm) status.push(`CM: ${s.status_cm}`)
    if (s.is_aprobada) status.push('Aprobada')
    if (status.length) {
      doc.setFontSize(10); doc.setTextColor(90)
      const sl = doc.splitTextToSize(status.join('   ·   '), maxW)
      doc.text(sl, margin, y); y += sl.length * 14 + 4
    }

    function block(label: string, text: string) {
      if (!text) return
      if (y > page.h - 90) { doc.addPage(); y = margin }
      y += 10
      doc.setFontSize(11); doc.setTextColor(60)
      doc.text(label, margin, y); y += 16
      doc.setFontSize(10); doc.setTextColor(40)
      const lines = doc.splitTextToSize(text, maxW)
      doc.text(lines, margin, y); y += lines.length * 13
    }
    block('Idea', s.idea_descripcion || '')
    block('Insight', s.insight || '')
    block('Guión', (s as Slide).link_guion || '')

    // Aprobaciones
    const aps = s.aprobaciones && typeof s.aprobaciones === 'object' ? Object.entries(s.aprobaciones as Record<string, { estado?: string; nombre?: string; fecha?: string; feedback?: string }>) : []
    if (aps.length) {
      if (y > page.h - 80) { doc.addPage(); y = margin }
      y += 10
      doc.setFontSize(11); doc.setTextColor(60); doc.text('Aprobaciones', margin, y); y += 16
      doc.setFontSize(9); doc.setTextColor(60)
      for (const [k, v] of aps) {
        const line = `${k}: ${v.estado || '?'} — ${v.nombre || '(sin nombre)'}${v.fecha ? '  (' + v.fecha.slice(0, 10) + ')' : ''}`
        const ll = doc.splitTextToSize(line, maxW)
        doc.text(ll, margin, y); y += ll.length * 12
        if (v.feedback) {
          const fl = doc.splitTextToSize(`“${v.feedback}”`, maxW - 12)
          doc.setTextColor(110); doc.text(fl, margin + 12, y); y += fl.length * 12; doc.setTextColor(60)
        }
      }
    }
  })

  // --- Filename ---
  const safe = (pres.slug || pres.title || 'presentacion').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 50)
  const d = new Date().toISOString().slice(0, 10)
  doc.save(`${safe}-${d}.pdf`)
}
