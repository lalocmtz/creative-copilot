

# Plan: Regenerar Imagen + Producto en Mano

## Cambios

### 1. `src/pages/Studio.tsx` — Agregar botón "Regenerar Imagen"
- En la sección donde se muestra la imagen generada (líneas 472-505), agregar un botón "Regenerar Imagen" junto al botón "Aprobar Imagen"
- El botón llama a `generateImage.mutate(render.id)` directamente (el edge function ya acepta status `IMAGE_GENERATED`)
- Mostrar costo estimado (~$0.05) en el botón
- Disabled mientras genera

### 2. `supabase/functions/generate-base-image/index.ts` — Mejorar prompt para producto en mano
- Modificar el prompt (líneas 93-108) para instruir explícitamente que la persona debe estar **sosteniendo el producto en la mano**
- Incluir la `product_image_url` del render como imagen de referencia adicional en el mensaje al AI, para que Gemini vea el producto real y lo integre
- El prompt debe decir algo como: "The person must be holding THIS product in their hand, showing it to the camera naturally"
- Enviar 2 imágenes al AI: thumbnail de referencia + imagen del producto

### 3. `src/hooks/useRender.ts` — Sin cambios
- `useGenerateBaseImage` ya existe y funciona. El edge function ya acepta `IMAGE_GENERATED` como status válido (línea 53), así que regenerar funciona sin cambios en el hook.

