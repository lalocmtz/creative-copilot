

# Plan: Product Image Upload + Audio Fix

## What we know

1. **Product image**: Currently nowhere in the flow. The `generate-base-image` edge function takes a thumbnail reference + `image_prompt` but never receives a product image. The user wants to upload a product photo (drag/drop or paste) on the VariantsPage **before** generating base images, so the AI compositor can render the person holding that specific product realistically.

2. **Audio**: The generated videos have no audio because:
   - Kling 2.6 explicitly sets `sound: false`
   - Most I2V models in the chain don't generate audio by default
   - There's no TTS step being triggered after video generation
   - The system has ElevenLabs configured but never calls it in the animate flow

## Changes (minimal — nothing else moves)

### 1. Product Image Upload on VariantsPage

**Frontend (`src/pages/VariantsPage.tsx`)**:
- Add a product image upload section **above** the "Generar las 3 imagenes base" button
- Support drag-and-drop + click-to-upload + paste from clipboard
- Upload the image to Supabase Storage at `{user_id}/{asset_id}/product.jpg`
- Save the signed URL to `assets.metadata_json.product_image_url`
- Show a thumbnail preview with a remove/replace option
- Disable "Generar imagenes" until product image is uploaded (optional — allow generation without product too)

**Backend (`supabase/functions/generate-base-image/index.ts`)**:
- Read `product_image_url` from `asset.metadata_json`
- If present, include it as an additional `image_url` in the AI prompt content array
- Enhance the system prompt with product integration instructions:
  ```
  PRODUCT INTEGRATION RULES:
  - The person MUST be holding/using the product naturally
  - Product must have correct perspective, scale, and lighting matching the scene
  - Fingers must wrap around the product with natural occlusion (fingers in front)
  - Add contact shadows between hand and product
  - Labels/text on product must follow surface curvature
  - Specular highlights must match scene lighting direction
  - Product should look like a real 3D photographed object, NOT a flat paste
  ```

**New hook function** in `src/hooks/useVariants.ts`:
- `useUploadProductImage()` mutation: uploads file to storage, updates `metadata_json.product_image_url`

### 2. Audio Fix — Enable Sound on KIE Models

**Backend (`supabase/functions/animate-sora/index.ts`)**:
- Kling 2.6: change `sound: false` to `sound: true` — Kling supports native audio generation
- Sora models: add `with_audio: true` if supported by the API schema
- This is the simplest fix — KIE models that support sound will generate it natively

**Backend (`supabase/functions/poll-render-status/index.ts`)**:
- Same change: update the contingency model configs to match (sound: true for Kling)

### Files to modify
- `src/pages/VariantsPage.tsx` — add product image upload UI
- `src/hooks/useVariants.ts` — add `useUploadProductImage` hook
- `supabase/functions/generate-base-image/index.ts` — include product image in AI prompt
- `supabase/functions/animate-sora/index.ts` — enable sound on models that support it
- `supabase/functions/poll-render-status/index.ts` — sync sound settings in contingency configs

