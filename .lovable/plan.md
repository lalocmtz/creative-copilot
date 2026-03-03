

# Plan: Reemplazar InfiniteTalk con Kling I2V + Audio Overlay

## Problema
El pipeline actual usa InfiniteTalk lip-sync vía KIE AI, que tarda 5-15 minutos y se queda "zombie". El polling manual en Workspace.tsx usa intervalos de 10s. No hay timeout de protección.

## Solución
Reemplazar InfiniteTalk con **Kling 2.6 Image-to-Video** (30-60s) y entregar el video animado + TTS audio como overlay en el frontend. Agregar timeout de 5 minutos.

## Archivos a Modificar

### 1. `supabase/functions/generate-final-video/index.ts`
- Mantener: condensación de script + ElevenLabs TTS + upload audio a storage
- **Reemplazar** InfiniteTalk (líneas 206-267) con:
  - Upload imagen a KIE (ya existe)
  - Eliminar upload de audio a KIE (no se necesita)
  - Crear tarea `kling/v2.0/image2video` con prompt dinámico basado en scenario + emotional intensity
  - Guardar `kling_task_id` + `tts_audio_url` en `cost_breakdown_json._tasks`
  - Guardar timestamp `_started_at` para timeout
- Progress steps: `condensing_script` → `generating_tts` → `animating_image` (en vez de `starting_lipsync` / `generating_lipsync`)

### 2. `supabase/functions/poll-render-status/index.ts`
- Cambiar lectura de `lipsync_task_id` → `kling_task_id` en `breakdown._tasks`
- Adaptar polling de tarea Kling (mismo `checkTask`, diferente campo)
- Al completar: descargar video Kling, subirlo a storage
- Guardar TANTO `final_video_url` (video sin audio) como `tts_audio_url` en el render
- **Agregar timeout**: si `_started_at` > 5 minutos, auto-marcar como FAILED sin descontar crédito
- Actualizar costos: TTS $0.02 + Kling I2V ~$0.08 = ~$0.10 total

### 3. `src/components/RenderProgressPanel.tsx`
- Simplificar STEPS a 3:
  1. `generating_tts` — "Generando voz…" (15%)
  2. `animating_image` — "Animando imagen (~30-60s)…" (50%)
  3. `finalizing` — "Finalizando video…" (90%)

### 4. `src/pages/Workspace.tsx`
- Línea 170: cambiar polling interval de `10000` → `5000`
- Líneas 602-610: cambiar `<video>` para reproducir video + audio overlay:
  - Si `render.final_video_url` existe, mostrar `<video>` con el video
  - Si `(render.cost_breakdown_json as any)?._tts_audio_url` existe, agregar `<audio>` sincronizado
  - O más simple: almacenar `tts_audio_url` como campo separado en el render record y usar `<video>` + `<audio>` con refs sincronizados

### 5. Schema consideration
- El campo `tts_audio_url` se puede almacenar dentro de `cost_breakdown_json` en el render final (no requiere migración DB), o bien usar el campo existente `final_video_url` para el video y agregar audio URL en el breakdown.

## Prompt para Kling I2V
```
Subtle natural movement, person gently moving and gesturing as if speaking to camera.
UGC style, handheld camera feel, 9:16 vertical format.
{scenario_prompt excerpt}
```
- Modelo: `kling/v2.0/image2video`
- Duración: 10s
- Resolución: 720p

## Resultado Esperado
- Tiempo: ~60-90s (vs 5-15 min)
- Costo: ~$0.10 (vs ~$0.15)
- Sin renders zombie: timeout a 5 min
- Video + voiceover sincronizado en el player

