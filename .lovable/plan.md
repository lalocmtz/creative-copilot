

# Plan: Reestructurar Pipeline de Video Final (TTS + Video 10s)

## Problemas Actuales
1. Video de solo 5 segundos — demasiado corto
2. Entrega el audio del video **original** en vez de generar TTS del guion
3. No hay Text-to-Speech — el guion del Studio no se usa para generar voz

## Solución: Pipeline de 2 pasos (TTS → Image-to-Video 10s)

### Flujo corregido:
```text
Imagen aprobada
    ↓
[Paso 1] TTS: Guion → ElevenLabs (vía KIE) → audio.mp3
    ↓
[Paso 2] Image-to-Video: Imagen base → Kling 2.6 (10s, con prompt del guion)
    ↓
[Poll] Verificar ambos tasks → descargar → guardar en storage
    ↓
[DONE] Video 10s + Audio TTS (sin audio original)
```

## Cambios

### 1. `generate-final-video/index.ts` — Agregar TTS + extender a 10s
- **Nuevo Paso 1**: Llamar a KIE para generar TTS con ElevenLabs (`elevenlabs/text-to-speech-turbo-2-5`)
  - Input: script del render (lo leemos del blueprint `variations_json` según `variation_level`)
  - Voice: mapear `voice_id` del render (v1→Sarah, v2→George, v3→Lily) a ElevenLabs voice IDs
- **Paso 2 modificado**: Image-to-video con `duration: "10"` (en vez de `"5"`)
  - Prompt mejorado: incorporar contenido del guion para que los movimientos del video sean coherentes con lo que se dice
- Guardar **ambos** task IDs en `cost_breakdown_json._tasks` (`tts_task_id` + `video_task_id`)
- Guardar el script usado en `_tasks` para referencia

### 2. `poll-render-status/index.ts` — Manejar 2 tasks + eliminar audio original
- Verificar TTS task primero → cuando esté listo, verificar video task
- Cuando ambos estén completados: descargar audio TTS + video, subir ambos a storage
- **Eliminar** la línea que genera signed URL del source.mp4 (audio original)
- Guardar `tts_audio_url` en vez de `audio_url`
- Actualizar costo (~$0.12 total: ~$0.02 TTS + ~$0.10 video 10s)

### 3. `src/pages/Studio.tsx` — Actualizar UI
- Cambiar label de costo a "~$0.12" y descripción a "video 10s + voz generada"
- Cuando el video está DONE: mostrar video + audio TTS juntos (en vez de "Audio Original")
- Cambiar texto "Audio Original" → "Audio Generado (TTS)"
- El script del guion se envía al backend como parte del request

### 4. `src/hooks/useRender.ts` — Enviar script en el request
- Modificar `useGenerateFinalVideo` para enviar `{ render_id, script }` al edge function
- El script viene del state del Studio

### 5. `src/components/RenderProgressPanel.tsx` — Agregar paso TTS
- Agregar step "generating_tts" con label "Generando voz…" entre "video_starting" y "generating_video"

---

**Limitación conocida:** Kling image-to-video soporta máximo 10s. Para videos de ~20s como el original, se necesitaría encadenar múltiples clips (futuro). Por ahora entregamos 10s de video con la voz generada.

