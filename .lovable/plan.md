

# Plan: Multi-Platform Video Fallback Chain

## Problem
Currently only 2 Sora models in the fallback chain. Sora 2 Pro fails (credits insufficient) and Sora 2 works — but if Sora 2 also fails, there's no backup. Need 2-3 additional platforms.

## Solution

### Expand `animate-sora/index.ts` fallback chain to 5 models

Based on the KIE API models available (from your screenshots), add these I2V models after the two Sora entries:

```text
1. sora-2-pro-image-to-video     (Sora 2 Pro — best quality)
2. sora-2-image-to-video          (Sora 2 — current working fallback)
3. kling/v2-1-master-image-to-video (Kling V2.1 Master — high quality UGC)
4. wan-2.6-image-to-video          (Wan 2.6 — fast, reliable)
5. bytedance-v1-pro-fast-image-to-video (Bytedance Fast — speed priority)
```

Each model has different input schemas on KIE:
- **Sora**: `image_urls` (array), `aspect_ratio`, `n_frames`
- **Kling V2.1 Master**: `image_url` (string), `negative_prompt`, `cfg_scale`, `duration`
- **Wan 2.6**: `image_url` (string), `prompt`, `ratio`
- **Bytedance Fast**: `image_url` (string), `prompt`, `aspect_ratio`

The `tryCreateI2VTask` function already iterates and catches errors per model — just need to add the new entries to `I2V_MODELS` with their specific `buildInput` functions.

### Update `poll-render-status/index.ts`

When polling detects a `fail` state, instead of immediately returning FAILED, **auto-retry with the next model** in the chain. Store the failed model in the job's `cost_json` so the retry skips it. This creates a "contingency protocol" where failures during rendering also trigger fallbacks, not just at creation time.

### Files to Modify
- `supabase/functions/animate-sora/index.ts` — add 3 new model entries to `I2V_MODELS`
- `supabase/functions/poll-render-status/index.ts` — add auto-retry on fail with next model

## Result
- 5 models deep fallback: if all Sora models fail, Kling, Wan, and Bytedance take over automatically
- Both at task creation AND during rendering (if a task fails mid-process)
- User sees no difference — just "Animando…" until video arrives

