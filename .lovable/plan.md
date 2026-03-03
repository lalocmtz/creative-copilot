

# Fix: TikTok URL Normalization + Robust Logging

## Problem
TikTok shared URLs often contain tracking query parameters (`?q=...&t=...`) that cause RapidAPI to return invalid responses or fail silently. Additionally, the dedupe hash in `create-asset` uses the raw URL, so the same video with different query params creates duplicate assets.

## Changes

### 1. `supabase/functions/ingest-asset/index.ts`
- Add a `normalizeTikTokUrl()` helper that strips query params and trailing slashes
- Use the cleaned URL when calling RapidAPI instead of the raw `asset.source_url`
- Add `console.log` for the original and cleaned URLs to aid debugging

### 2. `supabase/functions/create-asset/index.ts`
- Normalize the `source_url` before hashing (strip query params and trailing slash)
- Store the cleaned URL in the database so the entire pipeline uses consistent URLs

### 3. Database Reset
- Reset the existing asset and delete its jobs so a clean retry is possible

### 4. Redeploy both edge functions

## Technical Detail

The normalization function:
```text
normalizeTikTokUrl(input):
  parse as URL -> clear .search and .hash -> strip trailing slash
  fallback: split on "?" and strip trailing slash
```

Applied in `create-asset` before hashing and inserting, and in `ingest-asset` before calling RapidAPI. This ensures dedupe works correctly and RapidAPI gets a clean URL.
