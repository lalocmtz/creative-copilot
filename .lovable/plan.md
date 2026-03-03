

# Plan: Cambiar a modo económico (720p) + tarea de upgrade

## Cambios

### 1. `supabase/functions/generate-final-video/index.ts`
- Cambiar `mode: "1080p"` → `mode: "720p"` (línea 119)
- Remover los parámetros `duration` y `end_time` que la API no soporta (líneas 122-126)
- Actualizar el costo estimado: 720p es ~50% más barato que 1080p (~$0.023/s → ~$0.69 max por 30s)

### 2. `supabase/functions/poll-render-status/index.ts`
- Actualizar el costo hardcodeado de $0.90 → ~$0.45 para reflejar 720p

### 3. `src/pages/Studio.tsx`
- Actualizar el estimado de costo mostrado al usuario para reflejar 720p

### 4. `docs/tasks.md`
- Agregar nueva tarea en Future Phases: **"Phase 10 — Upgrade a 1080p"** con checklist para elevar calidad una vez el sistema esté estable

