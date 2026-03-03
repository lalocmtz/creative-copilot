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
