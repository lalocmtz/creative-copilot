

# Fix: Video Pipeline Timeout

## Root Cause
Supabase Edge Functions timeout after ~60-150 seconds. The current `generate-final-video` function tries to poll KIE AI for 3-5 minutes synchronously inside a single function call — it gets killed by the platform before the video finishes.

The render `b0461426` has been stuck at `RENDERING` / `video_generating` since the function timed out.

## Solution: Split into Kickoff + Poll

### 1. Refactor `generate-final-video` (Kickoff Only)
- Validate render, start TTS task via KIE AI
- Save the TTS `taskId` into `cost_breakdown_json._tasks`
- Return immediately with `{ started: true }`
- Total execution: ~2-3 seconds

### 2. New Edge Function: `poll-render-status`
Lightweight function the frontend calls every 10 seconds:
- Reads saved task IDs from `cost_breakdown_json._tasks`
- Checks KIE AI task status
- When TTS completes → starts Video task, saves new taskId
- When Video completes → downloads files, uploads to storage, marks DONE
- Each call: ~1-3 seconds (single API check)

### 3. Frontend Changes (`useRender.ts` + `Studio.tsx`)
- After kickoff, frontend polls `poll-render-status` every 10 seconds
- Each poll response includes current step/progress
- When poll returns `status: "DONE"`, stop polling and show video

### 4. Database Reset
- Reset the stuck render back to `IMAGE_APPROVED` so user can retry

## Files to Create/Modify
1. **Refactor** `supabase/functions/generate-final-video/index.ts` — kickoff only
2. **Create** `supabase/functions/poll-render-status/index.ts` — stateless poll + finalize
3. **Edit** `src/hooks/useRender.ts` — add polling mutation
4. **Edit** `src/pages/Studio.tsx` — wire up polling loop
5. **Edit** `supabase/config.toml` — register new function
6. **SQL migration** — reset stuck render

## Architecture Diagram
```text
Frontend                    Edge Functions              KIE AI
   │                            │                         │
   ├─ POST generate-final-video─┤                         │
   │  (kickoff)                 ├─ createTask(TTS) ──────►│
   │                            │  save taskId            │
   │◄── { started: true } ─────┤                         │
   │                            │                         │
   ├─ POST poll-render-status ──┤                         │
   │  (every 10s)               ├─ recordInfo(ttsId) ───►│
   │◄── { step: "tts" } ───────┤                         │
   │                            │                         │
   ├─ POST poll-render-status ──┤                         │
   │                            ├─ recordInfo(ttsId) ───►│
   │                            │  TTS done!              │
   │                            ├─ createTask(Video) ───►│
   │◄── { step: "video" } ─────┤  save videoTaskId       │
   │                            │                         │
   │  ... (repeat polls) ...    │                         │
   │                            │                         │
   ├─ POST poll-render-status ──┤                         │
   │                            ├─ recordInfo(videoId) ─►│
   │                            │  Video done!            │
   │                            ├─ download + upload      │
   │                            ├─ update DB: DONE        │
   │◄── { status: "DONE" } ────┤                         │
   │                            │                         │
   └─ Show video player         │                         │
```

