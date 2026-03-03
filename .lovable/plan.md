

# Structural Motion Transfer: Paradigm Shift from Script-Based to Motion Cloning

## What Changes

The current pipeline generates a **new video from scratch** using:
1. TTS (text-to-speech from script) → 2. Image-to-Video (Kling v2.1 from static image + prompt)

This produces a **creative reinterpretation** — new gestures, new timing, 5-second duration cap.

The new pipeline performs **motion cloning** using:
1. Original source video as motion reference → 2. Base image as identity target → 3. **Kling 2.6 Motion Control** transfers every gesture, blink, head movement 1:1 → 4. Original audio track preserved as-is

Result: same duration, same rhythm, same gestures — only the identity changes.

## KIE AI Model

**Model**: `kling-2.6/motion-control` (already available on KIE AI, same API key)

**Inputs**:
- `input_urls`: array with the base image URL (new actor identity)
- `video_urls`: array with the source video URL (motion reference)
- `character_orientation`: `"video"` (preserves source video orientation, supports up to 30s)
- `mode`: `"1080p"` for pro quality
- `prompt`: minimal — just describe the scene, motion is inherited

**Pricing**: ~$0.045/second at 1080p (a 20s video = ~$0.90)

**Key requirement**: The source video must be uploaded to KIE AI's file service first (files expire after 3 days). We upload via their URL File Upload endpoint (`POST https://kieai.redpandaai.co/api/file-url-upload`).

## Pipeline Architecture (Kickoff + Poll, same pattern)

```text
Frontend                    Edge Functions                KIE AI
   │                            │                          │
   ├─ POST generate-final-video─┤                          │
   │  (kickoff)                 ├─ Upload source video ───►│ (file-url-upload)
   │                            │  get KIE file URL        │
   │                            ├─ createTask(motion) ────►│ (kling-2.6/motion-control)
   │                            │  save taskId             │
   │◄── { started: true } ─────┤                          │
   │                            │                          │
   ├─ POST poll-render-status ──┤                          │
   │  (every 10s)               ├─ recordInfo(taskId) ───►│
   │◄── { step: "motion_transfer" }                       │
   │                            │                          │
   │  ... (repeat ~3-5 min) ... │                          │
   │                            │                          │
   ├─ POST poll-render-status ──┤                          │
   │                            ├─ Video done!             │
   │                            ├─ Download video          │
   │                            ├─ Download source audio   │
   │                            ├─ Upload final MP4        │
   │                            ├─ Mark DONE               │
   │◄── { status: "DONE" } ────┤                          │
```

**No TTS step** — the original audio from the source video is used directly (already stored in Supabase Storage at `{userId}/{assetId}/source.mp4`).

## Files to Modify

### 1. `supabase/functions/generate-final-video/index.ts` — Complete rewrite
- Remove TTS kickoff logic entirely
- Generate a signed URL for the source video from Supabase Storage
- Upload source video URL to KIE AI file upload service
- Upload base image URL to KIE AI file upload service (if needed, or use direct URL)
- Call `kling-2.6/motion-control` with `input_urls` (base image), `video_urls` (source video), `character_orientation: "video"`, `mode: "1080p"`
- Save `motion_task_id` to `cost_breakdown_json._tasks`
- Return immediately

### 2. `supabase/functions/poll-render-status/index.ts` — Simplify
- Remove TTS-first → Video-second two-phase logic
- Single phase: check motion control task status
- When done: download result video, upload to Supabase Storage
- Extract/reuse original audio from source video (it's the same MP4)
- Mark render as DONE with cost breakdown

### 3. `src/components/RenderProgressPanel.tsx` — Update steps
- Replace TTS/video steps with motion transfer steps:
  - `uploading_reference` → "Subiendo video de referencia"
  - `motion_starting` → "Iniciando transferencia de movimiento"
  - `motion_transferring` → "Transfiriendo movimiento (~3-5 min)"
  - `downloading` → "Descargando resultado"
  - `uploading` → "Subiendo video final"

### 4. `src/pages/Studio.tsx` — Update UI labels
- Change "Generar Video Final" button label context
- Update cost estimate from `~$0.83` to `~$0.90` (20s at 1080p)
- Remove audio (TTS) player from result view since audio comes embedded
- Add note: "Transferencia estructural de movimiento — misma duración y gestos del video original"

### 5. `docs/tasks.md` — Update Phase 6 description

## Cost Model
- No TTS cost (original audio reused)
- Motion control: ~$0.045/s at 1080p
- For typical 15-20s video: $0.68-$0.90
- Simpler pipeline = fewer failure points

## Technical Details

### Source Video Access
The source video is already stored at `{userId}/{assetId}/source.mp4` in the `ugc-assets` bucket during ingestion. We generate a signed URL and upload it to KIE AI's file service.

### Audio Handling
The motion control output video from Kling 2.6 does NOT include the original audio. We need to serve the original source video's audio alongside it. Two options:
- Store final video + original audio as separate files (current pattern)
- Use FFmpeg/server-side merge (complex, deferred)

For MVP: store the source video audio URL alongside the final video, display both in the UI (same as current pattern with separate audio player).

### Database Migration
- Reset stuck render to `IMAGE_APPROVED` for retry with new pipeline

