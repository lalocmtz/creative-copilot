

# Fix: Handle Source Videos Longer Than 30 Seconds

## Problem
The source TikTok video is 50 seconds. Kling 2.6 Motion Control accepts **3-30 seconds max**. The task creation fails immediately.

## Solution: Intelligent Duration Handling

Since we cannot run FFmpeg in edge functions to trim videos, we'll use a two-pronged approach:

### 1. `generate-final-video` — Add duration check + segmentation
- Read `metadata_json.duration` from the asset
- If duration ≤ 30s → proceed normally
- If duration > 30s → split into segments of max 30s each, process first segment only (MVP)
- Pass `duration` parameter to KIE API if supported, otherwise handle via pre-processing
- For MVP: inform user of the limit and process the first 30 seconds automatically

### 2. `generate-final-video` — Try KIE API trim parameters
Many video generation APIs accept `duration`, `start_time`, or `end_time` parameters. We'll try passing these to the motion control task:
```json
{
  "model": "kling-2.6/motion-control",
  "input": {
    "input_urls": [...],
    "video_urls": [...],
    "character_orientation": "video",
    "mode": "1080p",
    "duration": 30,
    "prompt": "..."
  }
}
```

### 3. Studio.tsx — Show duration warning
- Display the source video duration from asset metadata
- If >30s, show a warning: "El video original dura Xs. Se procesarán los primeros 30 segundos."
- Update cost estimate based on actual duration (capped at 30s)

### 4. Database reset
- Reset stuck render back to `IMAGE_APPROVED`

## Files to Modify
1. **`supabase/functions/generate-final-video/index.ts`** — Add duration detection, try `duration` param, cap at 30s
2. **`src/pages/Studio.tsx`** — Show duration info/warning near the "Iniciar Motion Transfer" button
3. **SQL migration** — Reset stuck render

## Cost Impact
- 30s at 1080p = ~$1.35 (max, capped)
- If original is shorter, cost scales proportionally

