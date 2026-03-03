Site Map (Top-Level Pages)
/login
/dashboard
/assets/new
/assets/[id]/blueprint
/assets/[id]/studio
/assets/[id]/renders/[renderId]
/settings
Purpose of Each Page
/login

Autenticación segura del usuario.

/dashboard

Vista general de:

Assets creados

Estado actual (PENDING, BLUEPRINT_GENERATED, etc.)

Últimos renders

Costos acumulados

Sensación: control inmediato.

/assets/new

Capítulo 1 — Ingesta.

Pegar URL

Confirmar derechos (checkbox)

Ver progreso y costo incremental

Propósito: convertir un link en un asset estructurado.

/assets/[id]/blueprint

Capítulo 2 — Cerebro estratégico.

Ver transcript

Generar blueprint

Ver análisis estructural

Ver variaciones

Riesgos de política

Token cost visible

Propósito: entender la fórmula que convierte.

/assets/[id]/studio

Capítulo 3 — Laboratorio creativo.

Layout 3 columnas:

Guion (nivel 1–3 + duración)

Actor + Voz + Intensidad

Escenario + Producto

Incluye:

Generar imagen base

Aprobar imagen

Generar video final

Cost panel persistente

Propósito: modular variaciones con control.

/assets/[id]/renders/[renderId]

Capítulo 4 — Resultado final.

Preview video

Descargar MP4

Ver cost breakdown

Duplicar render

Propósito: cerrar ciclo y escalar.

/settings

Perfil

API keys (si aplica)

Preferencias de duración WPM

Facturación futura

User Roles & Access Levels
1️⃣ Solo Creator (MVP)

Permisos:

Crear assets

Generar blueprints

Generar renders

Ver costos propios

Sin acceso a:

Assets de otros usuarios

2️⃣ Team Member (V1)

Permisos:

Ver assets del workspace

Crear renders

No puede borrar assets

No puede cambiar settings de facturación

3️⃣ Admin (V1+)

Permisos:

Todo lo anterior

Gestionar miembros

Ver costos totales

Configurar límites de gasto

Primary User Journeys (Máximo 3 pasos)
Journey 1 — Escalar un video ganador

Pega URL → espera transcripción.

Genera blueprint → selecciona variación.

Modula en Studio → aprueba imagen → genera video.

Resultado: nueva pieza optimizada lista para ads.

Journey 2 — Iterar múltiples variaciones

Duplicar render existente.

Cambiar actor / intensidad / hook.

Renderizar nueva versión.

Resultado: testing A/B estructurado.

Journey 3 — Analizar sin renderizar

Pega URL.

Genera blueprint.

Exporta insights estratégicos.

Resultado: aprendizaje sin costo de video.

State Flow (Simplificado)
PENDING
→ VIDEO_INGESTED
→ BLUEPRINT_GENERATED
→ IMAGE_APPROVED
→ VIDEO_RENDERED

Reglas críticas:

No hay transición automática sin acción del usuario.

No se re-llama proveedor si existe resultado cacheado.

Nivel 1 bloqueado si no hay confirmación de derechos.

Cost Transparency Flow

Cada acción paga:

Mostrar estimado antes de ejecutar.

Confirmación explícita.

Guardar breakdown en DB.

Mostrar costo histórico en render.

El usuario nunca debe preguntarse:

“¿Cuánto me acaba de costar esto?”

Emotional Flow by Chapter
Capítulo	Emoción buscada
Ingesta	Claridad
Blueprint	Comprensión
Studio	Control
Aprobación	Seguridad
Render	Satisfacción
Scaling Evolution
Modo Laboratorio (Inicio)

Iteración cuidadosa.

Comparación manual.

Modo Línea de Producción (Futuro)

Batch generation.

Presets guardados.

Cola masiva de renders.

Cierre del Sistema

UGC Scale Engine no es un generador aleatorio.

Es un sistema con:

Estados claros

Costos visibles

Transformación obligatoria

Control total del usuario
