

# Plan: Cambiar de Motion Control a Image-to-Video (mas barato y sin limite de duración)

## Problema Actual (2 issues)

1. **KIE rechaza el video** porque dura 50s (límite: 30s). Motion Control requiere un video de referencia y no hay forma de recortarlo en edge functions.
2. **El render está atascado** en status `RENDERING` con `cost_breakdown_json: null`, causando que poll-render-status falle con "No task data found" en loop.

## Solución: Cambiar a `kling-2.6/image-to-video`

En lugar de Motion Control (que requiere subir el video fuente), usaremos **Image-to-Video** que solo necesita:
- La imagen base (ya la tenemos generada y aprobada)
- Un prompt descriptivo
- Duración: `"5"` o `"10"` segundos

**Ventajas:**
- Elimina completamente el problema de duración del video
- No requiere subir el video fuente a KIE (1 upload menos)
- Mas barato (~$0.10-0.15 por video de 5s vs ~$0.45+ motion control)
- Mas simple y confiable
- API spec confirmada: `model: "kling-2.6/image-to-video"`, `input: { prompt, image_urls: [...], duration: "5", sound: false }`

**Trade-off:** No replica los gestos exactos del video original, pero anima la imagen base con un prompt descriptivo basado en el blueprint. El usuario aceptó esto.

## Cambios

### 1. `supabase/functions/generate-final-video/index.ts` — Reescribir
- Eliminar toda la lógica de upload de video fuente (Steps 1-2)
- Solo subir la imagen base a KIE (1 upload)
- Crear task con `model: "kling-2.6/image-to-video"` en vez de `kling-2.6/motion-control`
- Input: `{ prompt, image_urls: [kieImageUrl], duration: "5", sound: false }`
- Guardar task ID en `cost_breakdown_json._tasks` para que poll funcione

### 2. `supabase/functions/poll-render-status/index.ts` — Adaptar
- Actualizar el costo estimado (~$0.10 para 5s)
- Mantener la misma lógica de polling (checkTask → download → upload to storage)
- Manejar `cost_breakdown_json` null gracefully (return error descriptivo en vez de 400)

### 3. `src/pages/Studio.tsx` — Actualizar UI
- Cambiar labels de "Motion Transfer" a "Generar Video"
- Actualizar costo estimado (~$0.10)
- Eliminar la advertencia de duración >30s (ya no aplica)
- Agregar un botón de "Reintentar" para renders atascados en RENDERING

### 4. `src/hooks/useRender.ts` — Agregar hook de reset
- Agregar mutation para resetear un render de RENDERING/FAILED → IMAGE_APPROVED (para reintentar)

### 5. `docs/tasks.md` — Actualizar
- Marcar cambio de modelo y agregar tarea futura para motion-control cuando se resuelva el trimming

