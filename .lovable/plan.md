

# Plan: MVP Rebuild — Simplified Pipeline (Sora2 + Nano Banana)

## Overview

Complete restructure: from a complex multi-step pipeline (TTS + Kling + lipsync + merge) to a clean 2-step pipeline:
1. **Nano Banana** generates base image
2. **Sora2 Pro I2V** animates it into a 10-15s UGC video

No TTS, no lipsync, no audio merge in MVP. 3 variants (A/B/C) per asset. 3 pages.

---

## Database Changes (Migration)

### New asset_status enum values
Replace current enum with: `PENDING → DOWNLOADING → DOWNLOADED → TRANSCRIBING → UNDERSTANDING → VARIANTS_READY → IMAGE_READY → RENDERING → DONE → FAILED`

### New job_type enum values
Replace current with: `download_video, transcribe, understand, build_variants, generate_base_image, animate_sora`

### Add columns to `assets`
- `understanding_json JSONB DEFAULT '{}'` — LLM analysis of structure/scenes
- `variants_json JSONB DEFAULT '[]'` — Array of 3 variant objects (A/B/C) with shotlist, prompts, image URLs, video URLs
- `credits_estimate_json JSONB DEFAULT '{}'`
- `error_json JSONB DEFAULT '{}'`

### Add column to `jobs`
- `variant_id TEXT` — nullable, for A/B/C tracking

### Keep existing tables
- `assets` — enhanced with new columns + enum
- `jobs` — enhanced with variant_id
- `user_credits` + `credit_transactions` — unchanged
- `blueprints` — keep but unused (legacy data); new flow writes to `assets.variants_json`
- `renders` — keep but unused; variants track their own base_image_url + final_video_url inside `variants_json`

---

## Edge Functions (6 functions, replacing current 7)

### 1. `create-asset` — Keep (minor update)
- Same logic, just return new status flow

### 2. `ingest-asset` — Rewrite
- **DOWNLOAD**: Download video + thumbnail → storage → status `DOWNLOADED`
- **TRANSCRIBE**: Whisper → status `TRANSCRIBING` → `DOWNLOADED` with transcript
- **UNDERSTAND** (new): Call Gemini to analyze transcript + thumbnail → produce `understanding_json` with hook, angle, emotion, beat structure, visual description → status `UNDERSTANDING`
- **BUILD_VARIANTS** (new): Call Gemini with Prompt Maestro system prompt → produce `variants_json` with 3 variants (A/B/C) each containing actor_profile, scene_type, shotlist, script, image_prompt, video_motion_prompt, negative_rules → status `VARIANTS_READY`
- All 4 steps run sequentially in one edge function call, with idempotency per step
- Auto-redirect to variants page on completion

### 3. `generate-base-image` — Rewrite
- Accept `{ asset_id, variant_id }` (not render_id)
- Read `variants_json[variant_id].image_prompt`
- Call Nano Banana (`google/gemini-2.5-flash-image`) via Lovable AI gateway
- Upload to storage, get **public signed URL** (Kie needs public URL)
- Update `variants_json[variant_id].base_image_url`
- If all 3 variants have approved images → status `IMAGE_READY`

### 4. `animate-sora` — New (replaces generate-final-video)
- Accept `{ asset_id, variant_id, n_frames }` (default 15)
- Validate `base_image_approved === true` for that variant
- Upload base image to KIE via file-url-upload
- Call Sora2 Pro I2V (`sora-2-pro-image-to-video`) with `video_motion_prompt` from variant
- Fallback chain: `sora-2-pro-image-to-video` → `sora-2-image-to-video`
- Save KIE taskId to job + `cost_breakdown_json`
- Status `RENDERING`

### 5. `poll-render-status` — Rewrite
- Accept `{ asset_id, variant_id }`
- Check KIE task status via taskId from job
- On success: download video, upload to storage, update `variants_json[variant_id].final_video_url`, mark job DONE
- Deduct 1 credit per successful video
- On all variants done → asset status `DONE`

### 6. `fetch-thumbnail` — Keep as-is

**Delete**: `generate-blueprint` (merged into ingest), `generate-final-video` (replaced by animate-sora)

---

## Frontend (3 Pages)

### Page A: `/assets/new` (Ingesta)
- Input: TikTok URL + rights checkbox
- Single CTA: "Download & Analyze"
- Stepper: Descargando → Transcribiendo → Entendiendo estructura → Variantes listas
- Cost panel per step
- On complete: auto-redirect to `/assets/[id]/variants`

### Page B: `/assets/[id]/variants` (Variantes A/B/C)
- Tabs: Variante A / B / C
- Each tab shows:
  - Beat Timeline (4 blocks: Hook/Demo/Proof/CTA) from shotlist
  - Actor profile display (read from variant)
  - Scene type display
  - Script editor (textarea if voiceover, "Silent" label if silent_visual)
  - **CTA**: "Generate Base Image" → calls edge function
  - Image preview when available + Approve/Regenerate buttons
- Batch button: "Generate all 3 base images"

### Page C: `/assets/[id]/render` (Animación)
- Variant selector: A / B / C (only approved ones enabled)
- Toggle: Short (10 frames) / Long (15 frames, default)
- CTA: "Animate (Sora2)" — with credit confirm modal
- Progress panel (polling every 5s)
- Video preview + download when done
- Regenerate button with cost confirmation

### Routes Update (`App.tsx`)
```
/assets/new        → IngestPage
/assets/:id/variants → VariantsPage
/assets/:id/render   → RenderPage
/                    → Dashboard (keep)
```

---

## Hooks Rewrite

### `useSupabaseQueries.ts` — Update
- `useAsset(id)` — keep
- `useAssets()` — keep
- Remove `useBlueprint` (data now in asset.variants_json)
- Remove `useGenerateBlueprint` (merged into ingest)

### `useVariants.ts` — New
- `useGenerateBaseImage(assetId, variantId)`
- `useApproveImage(assetId, variantId)`
- `useGenerateAllBaseImages(assetId)`

### `useRender.ts` — Rewrite
- `useAnimateSora(assetId, variantId, nFrames)`
- `usePollVariantRender(assetId, variantId)`
- `useResetVariantRender(assetId, variantId)`

---

## LLM Prompt Maestro (in ingest-asset, BUILD_VARIANTS step)

System prompt instructs Gemini to output **JSON only** with `variants: [A, B, C]` following the exact schema from the user's spec:
- variant_id, format, variant (actor_profile, scene_type, scene_constraints, wardrobe)
- shotlist with 4 beats (hook/demo/proof/cta) with camera, action, on_screen_text, emotion
- script (mode: voiceover|silent_visual, language, lines)
- image_prompt (for Nano Banana)
- video_motion_prompt (for Sora2)
- negative_rules

---

## Defaults (hardcoded, no user prompts)
- 3 variants A/B/C
- `sora-2-pro-image-to-video`, portrait, n_frames=15, size=high
- Paraphrased scripts (never exact copy)
- Different background layout always

---

## Implementation Order (7 tasks)

1. **DB migration**: New enum values + new columns on assets + variant_id on jobs
2. **Rewrite ingest-asset**: 4-step sequential pipeline (download → transcribe → understand → build_variants)
3. **Rewrite generate-base-image**: Accept asset_id + variant_id, use Nano Banana, update variants_json
4. **New animate-sora function**: Sora2 Pro I2V with fallback
5. **Rewrite poll-render-status**: Variant-aware polling
6. **Frontend Page A (Ingesta)**: New dedicated page with 4-step stepper
7. **Frontend Pages B+C (Variants + Render)**: Tabbed variants view + animation page + routing

