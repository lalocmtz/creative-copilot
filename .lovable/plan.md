

# Plan: Video con Audio Integrado + Script Condensado a 10s

## Problema
1. El video se entrega **sin audio** — el TTS viene como archivo separado, no sirve así
2. El guion original es largo (>10s de lectura) pero el video dura 10s — necesita condensarse

## Solución: InfiniteTalk (lip-sync) + Script Condensación con AI

### Nuevo pipeline:
```text
Imagen aprobada + Guion
    ↓
[Paso 0] Condensar guion a ~25-30 palabras (10s) via Gemini/Lovable AI
    ↓
[Paso 1] TTS: Guion condensado → ElevenLabs (vía KIE) → audio.mp3
    ↓
[Paso 2] Lip-Sync: Imagen base + audio TTS → InfiniteTalk (vía KIE)
         → Video con audio YA integrado + labios sincronizados
    ↓
[Poll] Verificar TTS → luego lip-sync → descargar video final
    ↓
[DONE] Un solo archivo MP4 con audio integrado
```

**Ventaja clave**: InfiniteTalk (`infinitalk/from-audio` en KIE) toma imagen + audio y produce un video con lip-sync donde el audio ya está baked in. Elimina el problema de audio separado Y mejora el realismo (labios se mueven con el habla).

No se necesita nueva API — KIE ya tiene InfiniteTalk disponible con la misma API key.

## Cambios

### 1. `supabase/functions/generate-final-video/index.ts` — Reestructurar pipeline

**Paso 0 nuevo — Condensar script:**
- Antes de TTS, llamar a Lovable AI (Gemini) para condensar el guion a ~25-30 palabras
- Prompt: "Condensa este guion UGC a exactamente 10 segundos de lectura (~25-30 palabras). Mantén el hook, la propuesta de valor y el CTA. Mismo tono y energía. Solo devuelve el guion condensado, nada más."
- Guardar script condensado en `_tasks.condensed_script`

**Paso 1 — TTS (sin cambios mayores):**
- Usar el script condensado en vez del original
- Sigue usando ElevenLabs vía KIE

**Paso 2 — Reemplazar image-to-video con InfiniteTalk:**
- Eliminar la llamada a `kling-2.6/image-to-video`
- Nuevo: esperar a que TTS termine (polling dentro del kickoff o en poll-render-status)
- Subir audio TTS a KIE file upload
- Llamar a `infinitalk/from-audio` con: `image_url` (imagen base), `audio_url` (TTS), `prompt` (descripción de movimiento), `resolution: "720p"`
- Guardar `lipsync_task_id` en `_tasks`

### 2. `supabase/functions/poll-render-status/index.ts` — Simplificar a 2 pasos secuenciales

**Nuevo flujo de polling:**
1. Verificar TTS task → cuando esté listo, si no hay `lipsync_task_id` aún, iniciar InfiniteTalk (subir audio + crear task)
2. Verificar lip-sync task → cuando esté listo, descargar video final (ya tiene audio integrado)
3. Guardar un solo archivo MP4 como `final_video_url` — sin `tts_audio_url` separado

**Eliminar:**
- La descarga y upload separado de audio TTS
- El campo `tts_audio_url` en el resultado final

### 3. `src/pages/Studio.tsx` — Simplificar UI de resultado

- Eliminar la sección de "Audio Generado (TTS)" separado (líneas 542-552)
- El video ya tiene audio integrado, solo mostrar el player de video
- Actualizar costo a "~$0.15" (TTS $0.02 + lip-sync ~$0.13)
- Actualizar descripción: "video 10s con voz sincronizada"

### 4. `src/components/RenderProgressPanel.tsx` — Actualizar pasos

- Cambiar paso "generating_video" → "generating_lipsync" con label "Sincronizando labios + audio…"
- Agregar paso "condensing_script" al inicio con label "Condensando guion a 10s…"

### 5. `src/hooks/useRender.ts` — Sin cambios funcionales
- El hook ya envía `{ render_id, script }` correctamente

---

**Costo estimado por render:** ~$0.15 (TTS $0.02 + InfiniteTalk lip-sync ~$0.13)

**Resultado:** Un solo archivo MP4 descargable con audio integrado, labios sincronizados, y guion condensado a 10 segundos.

