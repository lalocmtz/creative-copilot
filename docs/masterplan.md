30-Second Elevator Pitch

UGC Scale Engine es un SaaS que transforma videos ganadores de TikTok Shop en blueprints estratégicos estructurados y genera variaciones originales optimizadas, listas para escalar — con control total de costos y sin clonar identidades.

Es como un estudio creativo con copiloto estratégico.

Problem & Mission
Problema

Los media buyers escalan “a ciegas”.

Los equipos repiten ideas sin saber qué parte realmente convierte.

Replicar formatos ganadores implica riesgo legal o pérdida de estructura.

Los costos de generación creativa son opacos.

Misión

Convertir cualquier video ganador en:

🔍 Ingeniería estratégica clara

🎛 Variaciones controladas

🎬 Render original optimizado

💰 Costos transparentes por paso

Sin copiar personas. Sin sorpresas. Sin gasto innecesario.

Target Audience
1️⃣ Media Buyers de TikTok Shop

Escalan productos. Necesitan volumen creativo sin perder estructura.

2️⃣ Equipos UGC In-House

Iteran rápido. Necesitan coherencia estratégica.

3️⃣ Agencias Performance

Exigen trazabilidad, control de costos y compliance.

Core Features
1. Video Ingesta Inteligente

Pegar URL TikTok

Transcripción automática

Cache por hash (anti-gasto)

Stepper con progreso + costo incremental

2. Blueprint Estratégico (LLM)

Hook

Ángulo psicológico

Beats estructurales

Mecanismo de venta

Riesgos de política

3 variaciones transformativas obligatorias

3. Studio de Modulación (3 Columnas)

Nivel de variación (1–3)

Actor + Voz + Intensidad emocional

Escenario + Producto

Estimador de duración automático

4. Aprobación de Imagen Base

Preview obligatorio

Botón “Approve”

Sin render automático

5. Render Final Transparente

TTS → Video → LipSync → Merge

Cost breakdown persistido

Duplicar render sin re-analizar

6. Motor Anti-Clonación (Crítico)

Bloqueo de nombres propios

Bloqueo de frases largas exactas

Umbral de similitud semántica

Forzar transformación estructural

High-Level Tech Stack
Frontend

Next.js (App Router)

Tailwind

Zustand

Backend

Next.js API Routes

Job Queue (BullMQ / Cloud Tasks)

Database

PostgreSQL (Supabase compatible)

Storage

S3 compatible

Integraciones

Apify

Whisper

Gemini

Grok Imagine

Kling/Veo

ElevenLabs

LipSync API

Conceptual Data Model
Asset

Representa el video fuente.

1 Asset → 1 Blueprint

1 Asset → N Renders

Blueprint

Análisis estructural

Variaciones

Riesgos

Render

Configuración creativa

Imagen base

Video final

Cost breakdown

Jobs

Idempotencia

Retries controlados

Dedupe anti-gasto

Entidad raíz: Asset.

UI Design Principles
Emotional Thesis

Se siente como una sala de control creativa precisa y calmada.
Nunca ansiosa. Nunca caótica.

Principios Aplicados

Capítulos claros (Ingesta → Blueprint → Studio → Render)

Botones habilitados por estado

Confirmaciones antes de costos altos

Logs humanos, no técnicos

Errores que explican qué hacer

Kindness = claridad + previsibilidad.

Security & Compliance
Transformación Obligatoria

Nivel 1 solo con derechos confirmados

Comparador de similitud semántica

Bloqueo de nombres propios

Bloqueo de marcas del video fuente

Bloqueo de frases textuales largas

Auditoría

Guardar costos por etapa

Guardar errores en metadata

Historial de regeneraciones

Principio: estructura inspirada, no clonación.

Phased Roadmap
MVP

Ingesta

Transcripción

Blueprint JSON

Studio básico

Render simple

Cost tracking

V1

Similitud semántica automática

Duplicar render

Comparación A/B básica

Dashboard histórico

V2

Batch generation

Presets estructurales

Librería de hooks

Benchmark por industria

Modo línea de producción

Risks & Mitigations
Uso para clonación

Bloqueos automáticos + threshold de similitud.

Costos elevados

Cache + idempotencia + confirmaciones explícitas.

UI compleja

3 columnas claras + stepper persistente.

Dependencia APIs externas

Capa de abstracción + fallback por proveedor.

Future Expansion

Ranking interno de hooks más rentables

Biblioteca privada de blueprints

Auto-optimización basada en ROAS

Integración directa con TikTok Ads

Score predictivo antes de render

Ahora continúo con el segundo documento.

implementation-plan.md
Build Sequence (Micro-Tareas Claras)
Fase 1 — Fundaciones

Crear proyecto Next.js (App Router).

Configurar PostgreSQL.

Definir enums de estados.

Crear tablas: assets, blueprints, renders, jobs.

Configurar S3.

Configurar autenticación básica.

Checkpoint:

Crear asset manual desde DB.

Verificar estados.

Fase 2 — Ingesta

Endpoint POST /api/assets

Crear asset con status PENDING.

Implementar job queue.

Integrar Apify (download).

Guardar video en S3.

Integrar Whisper.

Guardar transcript.

Actualizar status → VIDEO_INGESTED.

Implementar cache por source_hash.

Checkpoint:

Subir 3 URLs.

Confirmar no re-llama Whisper si ya existe transcript.

Fase 3 — Blueprint

Endpoint POST /api/assets/:id/blueprint

Validar status >= VIDEO_INGESTED.

Construir payload Gemini.

Forzar JSON schema validation.

Guardar analysis_json + variations_json.

Guardar token_cost.

Cambiar status → BLUEPRINT_GENERATED.

Manejar regenerate con confirmación.

Checkpoint:

Blueprint reproducible.

No re-llamada si existe.

Fase 4 — Studio + Drafts

Crear página /studio.

Implementar Zustand store.

Guardar draft en renders (status DRAFT).

Implementar contador de palabras.

Implementar estimador duración.

Bloquear Nivel 1 si rights_confirmed = false.

Checkpoint:

Cambiar actor/voz sin romper estado.

Persistencia correcta.

Fase 5 — Imagen Base

Endpoint POST /api/renders/:id/base-image

Construir prompt dinámico.

Llamar Grok Imagine.

Guardar base_image_url.

Status → IMAGE_GENERATED.

Guardar costo.

Endpoint approve-image.

Status → IMAGE_APPROVED.

Checkpoint:

Imagen aprobada manualmente.

No render automático.

Fase 6 — Render Final

Endpoint final-video.

TTS ElevenLabs.

Video Kling/Veo.

LipSync.

Merge.

Subir MP4.

Guardar cost breakdown.

Status → DONE.

Asset.status → VIDEO_RENDERED.

Checkpoint:

Video descargable.

Costos visibles.

Timeline (Realista)

Semana 1–2 → Fundaciones + Ingesta
Semana 3 → Blueprint
Semana 4 → Studio
Semana 5 → Imagen + Render
Semana 6 → Anti-clonación + similitud
Semana 7 → QA + pruebas reales

Team Roles
Founder / Product

Define guardrails legales

Valida UX emocional

Backend Engineer

Pipeline

Idempotencia

Cost tracking

Frontend Engineer

Studio 3 columnas

Stepper

Cost UI

Ritual Clave

Test mensual con 3 media buyers

Log de 3 mayores confusiones

Priorizar claridad antes que features

Optional Integrations

TikTok Ads API

Meta Ads

Slack alert cuando render termine

Webhook para sistemas externos

Stretch Goals

Batch render

Presets por industria

Librería de hooks clasificados

AI score predictivo
