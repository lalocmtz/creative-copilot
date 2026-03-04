

# Plan: Fix Video Generation — Correct Model IDs + Add More Fallbacks

## Root Cause (from edge function logs)

The logs tell the full story:

```text
[CONTINGENCY] ❌ kling/v2-1-master-image-to-video: Credits insufficient
[CONTINGENCY] ❌ wan-2.6-image-to-video: model name not supported
[CONTINGENCY] ❌ bytedance-v1-pro-fast-image-to-video: model name not supported
```

**3 of 5 fallback models are broken:**
- Wan 2.6: wrong model ID (we use `wan-2.6-image-to-video`, correct is `wan/2-6-image-to-video`)
- Bytedance: wrong model ID (we use `bytedance-v1-pro-fast-image-to-video`, correct is `bytedance/seedance-1.5-pro`)
- Kling V2.1: wrong model ID (`kling/v2-1-master-image-to-video`, correct is `kling-2.6/image-to-video`) AND credits issue on KIE account

The input schemas are also wrong — Wan and Kling 2.6 use `image_urls` (array), not `image_url` (string). Bytedance Seedance uses `input_urls` (array).

## Changes

### 1. Fix `animate-sora/index.ts` — Correct all model IDs + inputs

Replace the `I2V_MODELS` array with verified models from KIE docs:

```text
Fallback chain (5 models, all verified):
1. sora-2-pro-image-to-video  → image_urls: [url], aspect_ratio, n_frames
2. sora-2-image-to-video       → image_urls: [url], aspect_ratio, n_frames  
3. kling-2.6/image-to-video    → image_urls: [url], prompt, sound: false, duration: "10"
4. wan/2-6-image-to-video      → image_urls: [url], prompt, duration: "10", resolution: "720p"
5. hailuo/02-image-to-video-pro → image_url: url (string), prompt
6. bytedance/seedance-1.5-pro  → input_urls: [url], prompt
```

6 models now (added Hailuo Pro as position 5). Each with the exact `buildInput` matching KIE's documented API schema.

### 2. Fix `poll-render-status/index.ts` — Same model ID corrections

Update `ALL_MODELS` list and `MODEL_CONFIGS` with the same corrected IDs and input builders, so contingency retries during rendering also use correct models.

### 3. Both files: retry logic in contingency

The `retryWithNextModel` function currently tries each remaining model once with no retry. Add per-model retry with backoff (same as `tryAllModels` does), so contingency is equally resilient.

## Files to Modify
- `supabase/functions/animate-sora/index.ts` — fix I2V_MODELS array
- `supabase/functions/poll-render-status/index.ts` — fix ALL_MODELS + MODEL_CONFIGS

## Important Note for User
Your KIE account may have insufficient credits for some models (Kling showed "Credits insufficient"). Top up your KIE account balance to ensure all fallback models are available. With the corrected model IDs, at minimum Wan 2.6 and Bytedance Seedance should work immediately.

