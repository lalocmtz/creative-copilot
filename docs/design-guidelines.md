Emotional Thesis

Se siente como una sala de control creativa precisa y calmada — profesional, estratégica y humana.
Nunca caótica. Nunca infantil. Siempre bajo control.

Inspirado en los principios de diseño emocional y “kindness in design” descritos en design-tips.md .

Emotional Positioning

UGC Scale Engine no es:

Un generador mágico.

Un juguete creativo.

Un editor improvisado.

Es:

Un laboratorio estratégico.

Un cockpit creativo.

Una herramienta de precisión para escalar.

Palabras clave emocionales:

Preciso · Confiable · Editorial · Controlado · Inteligente · Calmo · Estratégico

Visual System
Typography
Objetivo emocional

Claridad quirúrgica + autoridad profesional.

Typeface Strategy

Headings: Geometric Sans (ej. Inter / Satoshi style)

Body: Clean Sans con alta legibilidad

Technical Data (costos, logs): Monospace secundaria

Typographic Scale (8pt grid)
Element	Size	Weight	Line Height
H1	40px	600	1.2
H2	28px	600	1.25
H3	22px	500	1.3
H4	18px	500	1.4
Body	16px	400	1.6
Caption	14px	400	1.6
Mono Data	13px	500	1.4

Reglas:

Line-height mínimo 1.5 en textos largos.

Máximo 70 caracteres por línea.

Contraste AA+ (≥ 4.5:1).

Color System
Objetivo emocional

Confianza + control + tecnología sin agresividad.

Light Mode

Primary
#111111
rgb(17,17,17)

Secondary
#4F46E5
rgb(79,70,229)

Accent
#0EA5E9
rgb(14,165,233)

Success
#10B981
rgb(16,185,129)

Warning
#F59E0B
rgb(245,158,11)

Error
#EF4444
rgb(239,68,68)

Background
#F9FAFB
rgb(249,250,251)

Surface
#FFFFFF
rgb(255,255,255)

Dark Mode

Primary
#F3F4F6

Background
#0F172A

Surface
#111827

Accent
#22D3EE

Reglas:

Contraste mínimo 4.5:1.

Evitar saturación excesiva.

Accents solo para acciones clave.

Spacing & Layout
Sistema base

8pt grid system.

xs = 8px

sm = 16px

md = 24px

lg = 32px

xl = 48px

Layout principal (Studio)

3 columnas claras

24px entre columnas

Padding interno mínimo 24px

Stepper fijo arriba

Breakpoints

Mobile-first

Tablet: 2 columnas

Desktop: 3 columnas

Wide: + panel de costos lateral opcional

Motion & Interaction

Inspirado en “Kindness in Design”.

Duración:

Microinteracciones: 150–200ms

Transiciones de estado: 200–300ms

Confirmaciones críticas: 250ms + microfeedback

Easing:

ease-out para acciones normales

spring suave para aprobaciones

Microinteracciones clave:

Botón “Approve Image” → glow suave + confirm check animado.

“Generate Final Video” → progress bar real + costo incremental visible.

Nivel bloqueado → tooltip explicativo, no error rojo agresivo.

Empty states:

“Todavía no generaste ningún render. Empieza creando tu primera variación.”

Nunca culpar. Siempre orientar.

Voice & Tone

Personalidad:

Profesional · Directa · Estratégica · Humana

Nunca:

Sarcástica

Infantil

Excesivamente entusiasta

Ejemplos de microcopy:

Onboarding:

“Pegá un video ganador. Extraemos la estructura que convierte.”

Success:

“Imagen aprobada. Estás listo para renderizar.”

Error:

“No pudimos descargar el video. Probá otra URL o reintentá.”

Costo:

“Este paso estimado: $0.42 — confirmá antes de continuar.”

System Consistency

Anclas de estilo:

Layout clarity estilo Linear

Minimalismo estructural tipo Apple

Componentes modulares tipo shadcn/ui

Patrones repetidos:

Stepper persistente en todos los capítulos

Cost panel siempre visible antes de acciones pagas

Confirm modal en acciones irreversibles

Metáfora central:

Capítulos de producción.

Ingesta → Blueprint → Studio → Aprobación → Render

Cada capítulo tiene inicio y cierre claros.

Accessibility

Estructura semántica correcta (H1 único por página).

Navegación por teclado completa.

Focus visible claro.

ARIA labels en botones críticos.

Contraste AA+ en todo el sistema.

No depender solo del color para comunicar estado.

Emotional Audit Checklist

Antes de shipping:

¿Reduce incertidumbre?

¿Muestra costo antes de ejecutar?

¿El usuario siente control?

¿El sistema evita sorpresas?

¿La experiencia se siente profesional y estratégica?

Technical QA Checklist

Escala tipográfica respeta grid.

Contraste mínimo AA+.

Estados hover/active claramente distinguibles.

Motion dentro de 150–300ms.

No hay botones habilitados sin contexto.

Design Snapshot
Color Palette
Primary: #111111
Accent: #4F46E5
Highlight: #0EA5E9
Success: #10B981
Warning: #F59E0B
Error: #EF4444
Background: #F9FAFB
Surface: #FFFFFF
Dark Background: #0F172A
Typographic Scale

H1: 40px / 600
H2: 28px / 600
H3: 22px / 500
Body: 16px / 400
Caption: 14px / 400
Mono Data: 13px / 500

Spacing Summary

8pt grid
24px column gaps
32px section spacing
Stepper fijo persistente

Emotional Thesis (1 frase)

UGC Scale Engine se siente como un laboratorio creativo profesional donde cada decisión es clara, medible y bajo control.

Design Integrity Review

El sistema equilibra precisión técnica con diseño humano.
No infantiliza al usuario.
Reduce ansiedad mostrando estado y costo siempre.

Mejora sugerida futura:
Agregar modo “Comparación A/B lado a lado” visualmente elegante para reforzar la sensación de laboratorio estratégico.
