

# Phase 5: Base Image Generation with KIE AI

## Overview
Create an edge function `generate-base-image` that uses the KIE AI API (Flux Kontext or GPT-4o Image model) to generate a base image for the UGC render. Wire it to the Studio page so the "Generar Imagen Base" button actually works end-to-end.

## Secret Required
- **KIE_AI_API_KEY** -- You'll need to provide your KIE AI API key (from https://kie.ai/api-key). I'll prompt you for it during implementation.

## Changes

### 1. Edge Function: `supabase/functions/generate-base-image/index.ts`
- Accept `{ render_id }` from authenticated user
- Validate the render exists, belongs to user's asset, and `render.status = 'DRAFT'`
- Build an image generation prompt from: actor description + scenario prompt + emotional intensity + product context
- Call KIE AI `POST https://api.kie.ai/api/v1/flux/kontext/generate` with the prompt
- Poll `GET https://api.kie.ai/api/v1/flux/kontext/record-info?taskId=...` every 5s until success/fail (max ~2 min)
- Download the generated image, upload to Supabase Storage (`ugc-assets/{user_id}/{asset_id}/base-image-{render_id}.png`)
- Update `renders.base_image_url` with a signed URL
- Update `renders.status` to `IMAGE_GENERATED`
- Create a job record for cost tracking (`type: 'base_image'`)
- Return the image URL + cost info

### 2. Register in `supabase/config.toml`
```text
[functions.generate-base-image]
verify_jwt = false
```

### 3. Wire Studio page (`src/pages/Studio.tsx`)
- Load real asset + render data from Supabase using route param `asset_id`
- "Generar Imagen Base" button calls the edge function with the render ID
- Show polling/loading state while KIE AI generates
- Display the actual generated image (not placeholder)
- "Aprobar Imagen" updates `renders.status` to `IMAGE_APPROVED` and `assets.status` to `IMAGE_APPROVED`
- Create render draft in DB when user first enters Studio (if none exists)

### 4. Create render draft flow
- When Studio loads for an asset with `status >= BLUEPRINT_GENERATED` and no render exists, auto-create a `DRAFT` render record
- Save draft updates (script, actor, voice, intensity, scenario) to the render record

## API Flow (KIE AI)
```text
1. POST https://api.kie.ai/api/v1/flux/kontext/generate
   Headers: Authorization: Bearer {KIE_AI_API_KEY}
   Body: { prompt, aspectRatio: "9:16", model: "flux-kontext-pro" }
   Response: { code: 200, data: { taskId: "..." } }

2. Poll GET .../record-info?taskId=...
   Status 0 = generating, 1 = success, 2 = create failed, 3 = generate failed
   On success: data.info.images[0] has the URL

3. Download image -> upload to Storage -> signed URL -> save to renders
```

## Task Sequence
1. Request KIE_AI_API_KEY secret from user
2. Create `generate-base-image` edge function
3. Update `config.toml` with new function entry
4. Wire Studio page to real data + edge function calls
5. Deploy and test

