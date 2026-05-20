# HUB · Sistema de trabajo

App de gestion de trabajo personal para contextos multiples: banco, agencia de publicidad y proyectos propios. Dashboard unificado con tareas, presentaciones de contenido, grilla de publicaciones y chat con Claude integrado.

**Produccion:** https://hub-app-seven.vercel.app
**Repo:** https://github.com/bynativo/hub-app

---

## Stack

| Capa | Tecnologia |
|------|-----------|
| Frontend | React 19 + TypeScript + Vite |
| Estilos | Tailwind CSS v4 |
| Estado | Zustand |
| Base de datos | Supabase (PostgreSQL + RLS) |
| API Claude | Vercel Serverless Functions → Anthropic API (claude-sonnet-4-6) |
| Deploy | Vercel (auto-deploy desde GitHub main) |

---

## Supabase

**URL:** `https://ltgdpbmnvpjwwqkirbxw.supabase.co`
**Proyecto:** `ltgdpbmnvpjwwqkirbxw`

### Tablas existentes

| Tabla | Filas | Descripcion |
|-------|-------|-------------|
| `tasks` | 6 | Tareas con contexto, prioridad, status, origen, draft email, plan, meeting |
| `projects` | 7 | Proyectos/campanas con tipo, cliente, fecha entrega |
| `clients` | 3 | Clientes de agencia (activos) |
| `recurrentes` | 4 | Tareas recurrentes con frecuencia y asignacion |
| `subtasks` | 9 | Subtareas vinculadas a tasks |
| `threads` | 3 | Hilos de email vinculados a tasks |
| `attachments` | 0 | Archivos adjuntos a tasks |
| `notes` | 0 | Notas de reuniones |
| `memory` | 2 | Memoria persistente (conversaciones, decisiones, grilla) |
| `presentations` | 2 | Decks de contenido con slug, KV color, mes |
| `slides` | 20 | Ideas/slides con dual status, plataformas, fechas, grilla |

### Relaciones clave

- `tasks` → `projects`, `clients` (FK)
- `subtasks`, `threads`, `attachments` → `tasks` (FK)
- `slides` → `presentations`, `tasks`, `projects` (FK para grilla)
- `presentations` → `projects`, `clients` (FK)

---

## Funcionalidades implementadas

### Dashboard
- Vista principal con tareas agrupadas por prioridad (urgente / esta semana / proximamente)
- Stats cards: total activo, banco, agencia, personal
- Panel de Claude con quick prompts y chat libre

### Navegacion por contexto
- **Banco Falabella** — tareas bancarias (Outlook copia manual)
- **Agencia** — tareas de agencia con sub-navegacion por cliente
- **Personal** — proyectos propios
- **Seguimiento** — tareas delegadas con alerta de follow-up

### Panel de detalle de tarea
- **Tab Chat** — conversacion con Claude con contexto completo de la tarea (titulo, cliente, proyecto, prioridad, origen, notas, plan). Quick actions: plan de ataque, redactar email, ver riesgos, update equipo
- **Tab Info** — categorias, plan de abordaje, subtareas (toggle done), hilos vinculados
- **Tab Email** — visualizacion de borrador (para/cc/asunto/cuerpo) con badge de estado
- **Tab Reunion** — titulo, duracion, agenda
- **Tab Slide** — slide vinculada desde presentacion
- Barra de estados por contexto (Inbox → Trabajando → Delegado → etc.)

### Presentaciones
- Listado con filtro por contexto (banco/agencia)
- Vista de presentacion con filmstrip vertical (navegacion por flechas)
- Documento de slide con header KV color, dual status, fechas, info, idea/insight
- Panel de edicion: plataformas, tipo de contenido, estados, campos de texto, links
- Aprobacion e integracion en grilla

### Slides — Dual status
- **Produccion** (🎬): Pendiente → En grabacion → En edicion → Entregado a CM
- **CM/Calendario RRSS** (📅): Pendiente de contenido → Listo para programar → Programado → Publicado

### Grilla / Calendario de publicaciones
- Timeline agrupado por fecha
- Filtro por contexto (banco/agencia) y plataforma (IG Feed, IG Story, IG Reels, TikTok, YouTube, YT Shorts, Facebook, X, Pauta)
- Deteccion de superposicion: badge de conflicto cuando hay multiples piezas en la misma plataforma el mismo dia
- Metadata por pieza: tipo, campana, producto, equipo, status prod/cm

### Chat con Claude (API real)
- Serverless function en `/api/chat` (Vercel) → Anthropic API
- API key server-side, nunca expuesta al frontend
- System prompt dinamico con contexto completo de tareas o tarea individual
- Typing indicator animado
- Historial de conversacion (ultimos 12 mensajes)

---

## Funcionalidades pendientes

### Autenticacion y roles
- [ ] Login con Supabase Auth (magic link o Google OAuth)
- [ ] Roles: admin (yo), viewer (cliente ve solo su presentacion), editor (equipo agencia)
- [ ] RLS policies basadas en `auth.uid()` en lugar de anon key abierta
- [ ] Compartir presentacion con link restringido (solo lectura, sin navegacion al hub)

### Plataforma banco separada
- [ ] Vista dedicada Banco Falabella con flujo Outlook (copia manual → cortafuegos corporativo)
- [ ] Integracion con SharePoint para contenido final
- [ ] Dashboard de RRSS banco con metricas
- [ ] Flujo de aprobacion interno banco (gerencia → CM → publicacion)

### Integracion herramientas agencia
- [ ] Gmail API para envio directo de emails desde el hub
- [ ] Google Drive API para vincular contenido final automaticamente
- [ ] WhatsApp Business API para updates al equipo
- [ ] Google Calendar API para crear reuniones desde tab Reunion
- [ ] Notificaciones push (tareas vencidas, follow-up delegados)

### Features de producto
- [ ] Modal de captura de tarea (procesar con Claude → auto-categorizar + plan + borrador)
- [ ] Vista Kanban (drag & drop por estado)
- [ ] Modo foco (plan del dia generado por Claude)
- [ ] Busqueda global en memoria (Supabase full-text)
- [ ] Notas y reuniones (grabacion → transcripcion → extraccion de tareas)
- [ ] Tarea recurrente: generacion automatica mensual
- [ ] Crear/editar proyectos y presentaciones desde la UI
- [ ] Crear/editar slides desde modal
- [ ] Flujo completo: idea aprobada → asignar a grilla con deteccion de conflictos
- [ ] Export de grilla (PDF / compartir link)

---

## Estructura del proyecto

```
hub-app/
├── api/
│   └── chat.ts              # Vercel serverless → Anthropic API
├── src/
│   ├── lib/
│   │   ├── supabase.ts       # Cliente Supabase
│   │   ├── store.ts          # Zustand store (estado global)
│   │   ├── types.ts          # TypeScript interfaces
│   │   ├── constants.ts      # Colores, estados, plataformas, categorias
│   │   ├── helpers.ts        # Formateo de fechas, labels
│   │   └── claude.ts         # Helper para llamar /api/chat
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Topbar.tsx
│   │   │   └── Sidebar.tsx
│   │   ├── dashboard/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── ContextView.tsx
│   │   │   ├── ProjectsView.tsx
│   │   │   ├── RecurrentesView.tsx
│   │   │   └── SeguimientoView.tsx
│   │   ├── tasks/
│   │   │   ├── TaskItem.tsx
│   │   │   ├── TaskList.tsx
│   │   │   └── TaskDetail.tsx
│   │   ├── presentations/
│   │   │   ├── PresentationsView.tsx
│   │   │   └── PresentationDetail.tsx
│   │   └── grilla/
│   │       └── GrillaView.tsx
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── index.html
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

## Flujo de trabajo

```
Claude.ai (diseno y arquitectura)
    │
    ▼
Claude Code (ejecucion)
    │
    ├── Lee index.html original como referencia de funcionalidad
    ├── Consulta schema Supabase via MCP
    ├── Crea proyecto Vite + React + TS + Tailwind
    ├── Construye componente por componente
    ├── Verifica con Playwright (screenshots automaticos)
    ├── Deploy a Vercel
    └── Conecta GitHub para auto-deploy
```

### Desarrollo local

```bash
npm install
npm run dev        # http://localhost:5173
```

### Variables de entorno (Vercel)

| Variable | Descripcion |
|----------|-------------|
| `ANTHROPIC_API_KEY` | API key de Anthropic para chat con Claude |

Las credenciales de Supabase estan hardcodeadas en `src/lib/supabase.ts` (anon key publica, protegida por RLS).

---

## Decisiones tecnicas

- **Flex layout para app shell** — el grid original (`grid-cols-[230px_1fr] grid-rows-[52px_1fr]`) causaba problemas de asignacion de celdas. Cambiado a flex column (topbar) + flex row (sidebar + main) que es mas predecible.
- **Zustand: selectores individuales** — usar `useStore(s => ({ a: s.a, b: s.b }))` crea un objeto nuevo cada render y causa loop infinito (React error #185). Siempre usar `useStore(s => s.field)` por separado.
- **Tailwind v4 con `@theme`** — colores custom (bg, bg2, bg3, claude, banco, agencia, etc.) definidos en `@theme` de `index.css`. Soporta opacity modifiers (`bg-claude/7`, `border-black/13`).
- **Claude model ID** — la API key del proyecto tiene acceso a `claude-sonnet-4-6`. Otros model IDs como `claude-sonnet-4-20250514` o `claude-3-5-sonnet-20241022` no estan disponibles para esta key.
- **Serverless proxy** — `/api/chat` (Vercel function) hace proxy a Anthropic API para mantener la key server-side. No se usa SDK, es fetch directo.
- **Supabase anon key publica** — hardcodeada en frontend, protegida por RLS. Pendiente migrar a Supabase Auth para RLS basado en `auth.uid()`.

---

## Changelog

### 2026-05-20 — Sesion 1: Reescritura completa

**Hecho:**
1. Creado proyecto Vite + React + TS + Tailwind v4 desde cero
2. Leido `index.html` original (2266 lineas) como referencia de funcionalidad
3. Consultado schema Supabase via MCP (11 tablas, relaciones, datos reales)
4. Construidos 15 componentes organizados en 5 modulos (layout, dashboard, tasks, presentations, grilla)
5. Zustand store con carga paralela de 5 tablas desde Supabase
6. Deploy a Vercel con auto-deploy desde GitHub
7. Fix de layout (grid → flex) y loop infinito de zustand
8. Integrado Claude API real via serverless function (`/api/chat`)
9. Chat funcional en Dashboard (contexto global de tareas) y TaskDetail (contexto de tarea individual)
10. Quick prompts, typing indicator, historial de 12 mensajes
11. README completo con documentacion del proyecto

**Commits:**
- `Initial hub-app: Vite + React + TypeScript + Tailwind`
- `Fix layout: flex layout + zustand selector infinite loop`
- `Add Claude API integration via Vercel serverless function`
- `Fix Claude model ID to claude-sonnet-4-6`
- `Add comprehensive README with stack, DB schema, features and roadmap`

**Verificado con Playwright:** screenshots automaticos confirmaron layout correcto y chat con Claude funcionando en produccion.

---

## Origen

Reescritura completa de un `index.html` monolitico de 200KB (HTML+CSS+JS en un solo archivo) que estaba roto en produccion por conflictos de JavaScript. El archivo original sirvio como referencia de funcionalidad y datos, no de codigo.
