
# Phase 6: Final Video Render Pipeline

## What We Have Now
- Base image generated and approved (Lovable AI / Gemini)
- Script (guion) from blueprint variations
- KIE AI API key already configured (access to Kling, ElevenLabs, and more)
- Render record in DB with all config (actor, voice, intensity, scenario)

## What We Need to Build

The final video pipeline has 3 steps, all using **KIE AI** as the unified API gateway:

### Step 1: TTS (Text-to-Speech) via ElevenLabs through KIE AI
- Send the script text to KIE AI's ElevenLabs endpoint
- Get back audio file URL
- KIE AI handles ElevenLabs integration -- no separate ElevenLabs API key needed

### Step 2: Image-to-Video via Kling through KIE AI
- Send the approved base image + motion prompt to Kling v2.1
- Generate a ~10s video of the person "speaking" / performing
- Async task: create task, then poll for completion

### Step 3: (Future) LipSync + Merge
- For MVP, we skip lipsync and deliver video + audio separately or merged
- LipSync can be added later with Kling 2.6 Motion Control

## Implementation Plan

### 1. Edge Function: `generate-final-video`
Creates a new Supabase Edge Function that orchestrates the pipeline:

```text
Input: render_id
Auth: validate user owns the render

Pipeline:
1. Validate render.status = IMAGE_APPROVED
2. Create job record (type: "final_video", status: RUNNING)
3. Call KIE AI ElevenLabs TTS:
   POST https://api.kie.ai/api/v1/jobs/createTask
   { model: "elevenlabs/tts", input: { text, voice_id } }
4. Poll for TTS completion via GET /api/v1/jobs/recordInfo?taskId=...
5. Call KIE AI Kling image-to-video:
   POST https://api.kie.ai/api/v1/jobs/createTask
   { model: "kling/v2-1-master-image-to-video", input: { image_url, prompt } }
6. Poll for video completion
7. Download both files, upload to Supabase Storage
8. Update render: final_video_url, status = DONE
9. Update asset: status = VIDEO_RENDERED
10. Update job with cost breakdown
```

### 2. Frontend Hook: `useGenerateFinalVideo`
- New mutation in `useRender.ts`
- Calls the edge function with render_id
- Shows loading state + toast notifications

### 3. Studio UI Update
- Enable the "Generar Video Final" button (currently disabled)
- Show progress during generation (polling render status)
- Display video player when final_video_url is available
- Download button for the finished video

### 4. Config Updates
- Add `generate-final-video` function to `supabase/config.toml` with `verify_jwt = false`

## Technical Details

### KIE AI Endpoints Used
- **TTS**: `POST https://api.kie.ai/api/v1/jobs/createTask` with model `elevenlabs/tts`
- **Image-to-Video**: `POST https://api.kie.ai/api/v1/jobs/createTask` with model `kling/v2-1-master-image-to-video`
- **Poll Status**: `GET https://api.kie.ai/api/v1/jobs/recordInfo?taskId=TASK_ID`
- **Download URL**: `POST https://api.kie.ai/api/v1/common/download-url`

### Auth: `Authorization: Bearer KIE_AI_API_KEY`

### Voice Mapping
Map the Studio voice IDs (v1, v2, v3) to actual ElevenLabs voice IDs available through KIE AI.

### Polling Strategy
- Poll every 10 seconds, max 60 attempts (10 minutes timeout)
- Edge function handles the full pipeline synchronously (TTS then Video)
- Frontend shows loading state during the process

### Cost Estimate
- TTS (ElevenLabs): ~$0.10 per generation
- Image-to-Video (Kling v2.1 Master): ~$0.50-1.00 per 10s video
- Total estimated: ~$1.00-2.00 per final render

### Files to Create/Modify
1. **Create** `supabase/functions/generate-final-video/index.ts` -- main pipeline
2. **Edit** `src/hooks/useRender.ts` -- add `useGenerateFinalVideo` hook
3. **Edit** `src/pages/Studio.tsx` -- wire up button, add video preview + download
4. **Edit** `supabase/config.toml` -- register new function (note: cannot edit directly, will need migration approach)
5. **Edit** `docs/tasks.md` -- mark Phase 6 progress
