

# Replace Apify with RapidAPI TikTok Download Video

## Summary

Swap the Apify TikTok scraper in `ingest-asset` for the RapidAPI "tiktok download video" service (`tiktok-download-video1.p.rapidapi.com`), and add the two missing API secrets (`RAPIDAPI_KEY` and `OPENAI_API_KEY`) so the ingestion pipeline becomes fully functional.

## Changes

### 1. Add Secrets

Two secrets need to be configured before the pipeline can run:

- **RAPIDAPI_KEY** -- Your RapidAPI key (visible in the screenshot: `b0957fb32fm...`). Replaces the old `APIFY_API_KEY`.
- **OPENAI_API_KEY** -- For Whisper transcription (you mentioned you already connected this one via "OpenCloud").

### 2. Update `supabase/functions/ingest-asset/index.ts`

Replace the Apify download block (lines 83-140 approximately) with a RapidAPI call:

- **Endpoint**: `GET https://tiktok-download-video1.p.rapidapi.com/getVideo?url={encoded_tiktok_url}&hd=1`
- **Headers**: `x-rapidapi-host: tiktok-download-video1.p.rapidapi.com` + `x-rapidapi-key: {RAPIDAPI_KEY}`
- **Response parsing**: Extract video URL from `data.hdplay` (HD no watermark) or fallback to `data.play`
- **Metadata**: Extract duration from `data.duration`, author from `data.author.nickname`
- Everything else stays the same (storage upload, job tracking, idempotency, transcription)

### 3. Update `docs/tasks.md`

- Change line 293 from `APIFY_API_KEY` to `RAPIDAPI_KEY` and mark secrets as configured once added
- Mark `OPENAI_API_KEY` as configured if already present

## Technical Detail

```text
Old flow:  POST Apify scraper -> wait for run -> get videoUrl from result[0]
New flow:  GET RapidAPI /getVideo?url=...&hd=1 -> get data.hdplay from JSON response
```

The RapidAPI call is simpler (single GET, instant response) vs Apify (POST + polling). No other files change -- the frontend, job tracking, and Whisper transcription remain identical.

## Sequence

1. Request RAPIDAPI_KEY secret from user
2. Request OPENAI_API_KEY secret from user (if not yet added)
3. Update the edge function code
4. Deploy and test
5. Update tasks.md

