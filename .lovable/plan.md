

# Plan: Pipeline Sora2 I2V + Multi-Model Fallback + TTS Speed Fix

## Problema Actual
1. Solo hay un modelo (Kling 2.6) — si falla, todo falla
2. La voz TTS es lenta y no se siente UGC
3. No hay fallback automático entre modelos

## Solución

### 1. `generate-final-video/index.ts` — Multi-Model Fallback Chain

Reemplazar la llamada única a Kling con un **fallback automático** que prueba hasta 3 modelos en secuencia:

```text
1. kling/v2-1-master/image-to-video  (mejor calidad UGC)
2. kling-2.6/image-to-video          (actual, estable)
3. sora-2-image-to-video             (fallback alternativo)
```

Cada modelo tiene diferente esquema de input en KIE:
- **Kling V2.1 Master**: `image_url` (string), soporta `negative_prompt`, `cfg_scale`
- **Kling 2.6**: `image_urls` (array), `sound`, `duration`
- **Sora2**: `image_urls` (array), `aspect_ratio`, `n_frames`

La función itera la lista. Si un modelo devuelve error (code != 200), logea y prueba el siguiente. El `kling_task_id` y el modelo usado se guardan en `cost_breakdown_json._tasks`.

### 2. TTS Speed Fix

Añadir `speed: 1.15` a los voice_settings de ElevenLabs para que suene más natural/UGC. Bajar `stability` a `0.4` para más variación emocional.

### 3. Prompt I2V mejorado

Hacer el prompt más descriptivo y UGC-específico, referenciando el scenario y el script condensado para que el modelo genere movimiento contextual relevante. Incluir `negative_prompt` donde el modelo lo soporte.

### 4. `poll-render-status/index.ts` — Guardar modelo usado

Añadir el nombre del modelo que se usó en el cost_breakdown final para trazabilidad. La lógica de polling ya es genérica (task ID + checkTask), no necesita cambios estructurales.

### 5. `RenderProgressPanel.tsx` — Sin cambios

Los 3 pasos actuales (`generating_tts`, `animating_image`, `finalizing`) ya son correctos.

### 6. `Workspace.tsx` — Sin cambios

El `VideoWithAudioOverlay` y el polling ya están correctos.

## Archivos a Modificar
- `supabase/functions/generate-final-video/index.ts` — fallback chain + TTS speed
- `supabase/functions/poll-render-status/index.ts` — guardar modelo en breakdown final

## Resultado
- Si Kling V2.1 falla → prueba Kling 2.6 → prueba Sora2 (automático)
- Voz 15% más rápida y natural
- El usuario nunca ve nombres de modelos — solo "Generando video…"
- ~60-90s tiempo total sin cambios

