

# Plan: Fix Stuck Rendering — Diagnostic Logging + Faster Timeouts

## Problem
The poll-render-status function checks KIE task status every 5 seconds but **never logs the response**. We have zero visibility into what KIE returns. Additionally, the kie-callback webhook has **zero logs** — KIE is not sending callbacks, so we rely entirely on polling. The 8-minute timeout is too long.

## Changes

### 1. Add diagnostic logging to `poll-render-status/index.ts`

After `checkTask()` (line 399), log the actual KIE response:
```typescript
console.log(`[POLL] Task ${taskId} state: ${taskStatus.state}, failMsg: ${taskStatus.failMsg || "none"}`);
```

Also wrap the `checkTask` call in try/catch to handle silent network failures — if checkTask throws, log the error and keep polling instead of crashing with 500.

### 2. Reduce timeout from 8 min to 5 min

Change `TIMEOUT_MS` from `8 * 60 * 1000` to `5 * 60 * 1000`. Sora 2 Pro takes 1-3 min typically. 5 min is generous enough while avoiding long waits.

### 3. Handle ALL failure states in contingency (not just transient)

Currently line 402-430: contingency only triggers for `isTransientFailure`. But if Sora Pro fails for ANY reason during rendering, we should try the next model. Change logic so ALL rendering failures trigger the fallback chain (not just "heavy load" messages).

### 4. Fix callback URL — ensure `kie-callback` is deployed and reachable

Verify the callback function is in `supabase/config.toml`. Add a health-check log on boot so we can confirm deployment.

### 5. Add elapsed time to polling response

Return `elapsed_seconds` in the polling response so the UI can show "Animando… (45s)" giving the user visibility that progress is happening.

### Files to modify
- `supabase/functions/poll-render-status/index.ts` — logging, timeout, contingency logic, elapsed time
- `src/pages/RenderPage.tsx` — show elapsed time in progress panel

## Expected Result
- Logs will show exactly what KIE returns on each poll
- Faster failover (5 min instead of 8)
- Any rendering failure triggers contingency (not just transient)
- User sees elapsed time so they know it's not stuck

