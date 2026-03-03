

# Plan: Integrar ElevenLabs Directo + Voces por Género Detectado

## Situación Actual
- TTS se genera vía **KIE AI** como intermediario de ElevenLabs — funciona pero agrega latencia y costo intermedio
- Las voces son 3 fijas (Sarah, George, Lily) sin filtrar por género
- El blueprint ya detecta `genero_detectado` ("femenino"/"masculino") del hablante original

## Solución

### 1. `generate-final-video/index.ts` — Llamar ElevenLabs directamente

Reemplazar la llamada a KIE para TTS con una llamada directa a la API de ElevenLabs:
- Usar `ELEVENLABS_API_KEY` (necesitamos agregarla como secret)
- Endpoint: `https://api.elevenlabs.io/v1/text-to-speech/{voiceId}?output_format=mp3_44100_128`
- El audio se genera sincrónicamente (no necesita polling)
- Subir el audio resultante a Supabase Storage
- Luego pasar esa URL al paso de lip-sync (InfiniteTalk vía KIE sigue igual)

Esto **elimina el paso de polling de TTS** — el audio está listo antes de retornar, simplificando el flujo a: Condense → TTS (sync) → Start LipSync → Poll LipSync.

### 2. Ampliar catálogo de voces con género

Actualizar `src/pages/Studio.tsx` con más voces de ElevenLabs, agrupadas por género:

**Femeninas:**
- Sarah (EXAVITQu4vr4xnSDxMaL) — Cálida, natural
- Lily (pFZP5JQG7iQjIQuC4Bku) — Energética
- Jessica (cgSgspJ2msm6clMCkdW9) — Joven, dinámica
- Laura (FGY2WhTYpPnrIDTdsKH5) — Profesional
- Alice (Xb7hH8MSUJpSbSDYk0k2) — Clara, amigable

**Masculinas:**
- George (JBFqnCBsd6RMkjVDRZzb) — Confiable
- Charlie (IKne3meq5aSn9XLyUdCD) — Casual
- Brian (nPczCjzI2devNBz1zQrb) — Firme
- Liam (TX3LPaxmHKxFdv7VOQHJ) — Joven, enérgico
- Eric (cjVigY5qzO86Huf0OWal) — Versátil

### 3. Filtrar voces por género detectado en el blueprint

- Leer `analysis_json.genero_detectado` del blueprint
- Filtrar el selector de voces para mostrar solo las del género correspondiente
- Pre-seleccionar la primera voz del género correcto automáticamente
- Permitir al usuario ver todas si quiere (toggle "Ver todas las voces")

### 4. `poll-render-status/index.ts` — Simplificar

- Ya no necesita Phase 1 (TTS polling) porque el audio se genera sincrónicamente
- Solo necesita Phase 2 (iniciar lip-sync con la URL del audio ya guardada) y Phase 3 (poll lip-sync)

### 5. Secret necesario

- Agregar `ELEVENLABS_API_KEY` como secret del proyecto

## Archivos a modificar
1. `supabase/functions/generate-final-video/index.ts` — ElevenLabs directo + upload audio a storage
2. `supabase/functions/poll-render-status/index.ts` — Simplificar (quitar polling TTS)
3. `src/pages/Studio.tsx` — Ampliar voces, filtrar por género
4. `src/components/RenderProgressPanel.tsx` — Quitar paso "generating_tts" (ahora es instantáneo dentro del kickoff)

