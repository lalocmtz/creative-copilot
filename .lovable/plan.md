

# Plan: Mejorar Prompt de Generación para Producto Fotorrealista en Mano

## Problema
Las imágenes generadas no se ven lo suficientemente realistas — el producto parece "pegado" en vez de integrado naturalmente con iluminación, perspectiva y sombras correctas.

## Solución
Reescribir el prompt en `generate-base-image/index.ts` usando la estrategia de "compositor realista" que el usuario proporcionó: reconstruir el producto como objeto fotográfico real con luz, perspectiva, sombras y agarre natural.

## Cambios

### 1. `supabase/functions/generate-base-image/index.ts` — Prompt mejorado

Reemplazar el bloque de prompt (líneas 95-124) con un prompt de 2 capas:

**System prompt** (en el mensaje): instrucciones de compositor realista — prohibiciones explícitas (no pegar mockup, no deformar manos, no duplicar objetos, no cambiar identidad) + reglas de coherencia física.

**User prompt** mejorado:
- Instrucciones explícitas de reconstrucción fotográfica del producto (luz, perspectiva, sombras de contacto, oclusión por dedos, reflejos especulares)
- Negative prompt integrado en las instrucciones (no mockup plano, no glow irreal, no dedos extra, no escala incorrecta)
- Separar claramente las 2 imágenes de referencia: "IMAGE 1 = scene reference (composición/luz)", "IMAGE 2 = product to hold (forma/textura/etiqueta)"
- Instrucciones de curvatura de etiqueta, material (plástico/vidrio), y grain natural de cámara

**Prompt final será algo como:**
```
SYSTEM: You are a photorealistic image compositor. Your job is to create a photo where a person naturally holds a real product. NEVER paste a flat mockup. The product must look like a real photographed object with correct perspective, lighting, shadows, and finger occlusion.

USER: [image1: scene ref] [image2: product ref]
Generate a new UGC-style photo. New person, same composition as reference.
The person MUST hold the EXACT product from image 2.
- Reconstruct product as real 3D object (not flat mockup)
- Match scene lighting direction and color temperature
- Add contact shadows where fingers grip the product
- Correct finger overlap/occlusion in front of product
- Realistic specular highlights on product surface
- Label should look printed with slight curvature, not flat
FORBIDDEN: flat pasted look, extra fingers, duplicated products, wrong scale, CGI look
Format: Portrait 9:16, natural phone camera quality with grain
```

### 2. Sin cambios en UI ni hooks
El botón "Regenerar" ya funciona. Solo mejoramos la calidad del output.

