

# Plan: Auto-Blueprint After Ingestion + UGC Sales Video Prompt Optimization

## What Changes

### 1. Auto-trigger Blueprint after Ingestion (`src/pages/Workspace.tsx`)
Currently after ingestion completes (line 265), the user sees "Ingesta Completa" but has to manually click "Generar Blueprint". 

**Fix**: After `setIngestPhase("done")` in `handleAnalyze`, automatically call `generateBlueprint.mutate({ assetId: newAsset.id, force: false })` and add a log "Generando blueprint automáticamente…". This eliminates the manual step entirely — the flow becomes: paste URL → click Analyze → ingestion + blueprint happen in sequence automatically.

Also handle the cached asset case (line 251-252): if asset exists but no blueprint yet, auto-trigger blueprint there too.

### 2. Optimize I2V Prompt for UGC Sales Videos (`supabase/functions/generate-final-video/index.ts`)
The current prompt is generic. Enhance it to explicitly instruct:
- This is a **UGC sales/recommendation video for TikTok Shop**
- Must replicate the **exact same camera angle, framing, and shot composition** from the base image
- **Same product** must be visible and featured prominently
- **Different person** (already handled by anti-cloning in image generation)
- Structure: hook → demo/proof → offer → CTA within 10 seconds
- Emphasize authentic selling energy, product interaction, recommendation tone

The prompt will incorporate the blueprint analysis (hook, angle, emotion) and the condensed script to give Sora/Kling maximum context about what the video should convey as a sales piece.

### 3. Use Gemini to Generate a Detailed Sora Prompt (`supabase/functions/generate-final-video/index.ts`)
Add a new step between script condensation and I2V task creation: call Gemini to generate a structured shot-by-shot prompt based on:
- The original transcript
- The blueprint analysis (hook, angle, emotion, beat structure)
- The scenario prompt
- The condensed script

This produces a much more detailed and effective prompt for Sora/Kling, following the user's "Prompt Maestro" pattern with timing beats (0-2s hook, 2-6s proof, 6-8s offer, 8-10s CTA).

## Files to Modify
- `src/pages/Workspace.tsx` — auto-trigger blueprint after ingestion
- `supabase/functions/generate-final-video/index.ts` — Gemini prompt maestro + UGC sales-optimized I2V prompt

## Result
- Zero-click flow from ingestion to blueprint (user only clicks "Analyze Video" once)
- Videos generated with sales-specific UGC prompts optimized for TikTok Shop
- Gemini generates a detailed shot plan that Sora/Kling follows for better output quality

