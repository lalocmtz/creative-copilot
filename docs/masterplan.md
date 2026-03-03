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

Core Features (Escaneable)
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

High-Level Tech Stack (y por qué)
Frontend

Next.js (App Router) → Flujo por capítulos claro.

Tailwind → Control visual quirúrgico.

Zustand → Estado local estricto sin caos.

Backend

Next.js API Routes → Simplicidad.

Job Queue (BullMQ / Cloud Tasks) → Pipeline controlado.

DB

PostgreSQL (Supabase compatible) → JSONB flexible para blueprints.

Storage

S3 compatible → Assets pesados, escalable.

Integraciones

Apify → Download seguro

Whisper → Transcripción precisa

Gemini → Análisis estructural

Grok Imagine → Imagen base

Kling/Veo → Video

ElevenLabs → Voz

LipSync API → Sincronización

Conceptual Data Model (ERD en palabras)

Asset

Representa el video fuente

1 Asset → 1 Blueprint

1 Asset → N Renders

Blueprint

JSON estructural

Variaciones

Riesgos

Render

Configuración creativa específica

Imagen base

Video final

Cost breakdown

Jobs

Idempotencia

Control de retries

Dedupe anti-gasto

Relación central:
Asset es la entidad raíz. Todo gira alrededor.

UI Design Principles (inspirado en design-tips.md )
Emotional Thesis

Se siente como una sala de control creativa precisa y calmada.
Nunca ansiosa. Nunca caótica.

Aplicación práctica

Capítulos claros (Ingesta → Blueprint → Studio → Render)

Botones que se habilitan por estado

Confirmación antes de costos altos

Logs humanos, no técnicos

Errores que guían, no culpan

Kindness ≠ suavidad infantil.
Kindness = claridad + previsibilidad.

Security & Compliance
Transformación obligatoria

Nivel 1 solo con derechos confirmados.

Comparador de similitud semántica automático.

Bloqueo de:

nombres propios

marcas del video original

frases textuales largas

Auditoría

Guardar cost_breakdown_json

Guardar metadata_json.error

Historial de regeneraciones

Principio clave

La plataforma genera estructura inspirada, no clonación.

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

Presets de estructura

Librería de hooks

Benchmark por industria

Modo “línea de producción”

Risks & Mitigations
Riesgo: Uso para clonación

Mitigación: Bloqueos automáticos + similitud threshold.

Riesgo: Costos explosivos

Mitigación: Cache + idempotency + confirmaciones.

Riesgo: UI compleja

Mitigación: 3 columnas claras + stepper persistente.

Riesgo: Dependencia de APIs externas

Mitigación: Abstracción por proveedor + fallback.

Future Expansion Ideas

Ranking interno de hooks más rentables

Biblioteca privada de blueprints

Auto-optimización basada en ROAS

Integración directa con TikTok Ads

Score predictivo antes de render
