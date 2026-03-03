

# Visual-Faithful Image Generation: Replicate Original Video Scene

## Problem
Currently, the image generation creates generic UGC-style photos because:
1. The blueprint's scenario prompt is generated from **text-only** (transcript) -- Gemini never sees the actual video
2. The image generator (KIE AI) uses a vague text prompt like "Professional UGC-style photo of a person in a modern interior"
3. Result: hyper-realistic but completely unrelated to the original video's composition, background, camera angle, distance, etc.

## Solution: Two-Part Visual Analysis Pipeline

### Part 1: Blueprint Enhancement -- Send Video Frame to Gemini
During blueprint generation, extract a signed URL for the stored video and send it to Gemini as a **visual input** alongside the transcript. This way Gemini can:
- See exactly how the person is framed (selfie, mirror, arm's length, etc.)
- Describe the background precisely (bathroom tiles, bedroom, kitchen counter)
- Note lighting conditions (warm bathroom light, natural window light, ring light)
- Capture camera distance, angle, and composition
- Detect clothing style, accessories, and body positioning

The `escenario_sugerido` field will become an **extremely specific image generation prompt** that replicates the exact visual composition.

### Part 2: Image Generation -- Switch from KIE AI to Lovable AI with Reference Frame
Replace KIE AI with Lovable AI's image generation model (`google/gemini-3-pro-image-preview`), which supports **image input as reference**. The function will:
1. Download the original video frame from storage
2. Send it as a reference image to the AI along with the ultra-detailed scene prompt
3. Instruct the model to replicate the exact composition, distance, background, and lighting but with a **different person**

This produces images that match the original video's visual feel instead of generic stock-UGC photos.

## Technical Changes

### File 1: `supabase/functions/generate-blueprint/index.ts`
- After fetching the asset, generate a signed URL for the stored video
- Add the video frame as an `image_url` content block in the Gemini prompt (Gemini supports video/image URLs)
- Update the system prompt to emphasize: "You are looking at the actual video. Describe the EXACT visual scene — camera distance, angle, background details, lighting, person's position relative to camera. The goal is to replicate this scene with a different person."
- The `escenario_sugerido` output will now be a frame-accurate description

### File 2: `supabase/functions/generate-base-image/index.ts`
- Replace KIE AI with Lovable AI image generation (`google/gemini-3-pro-image-preview`)
- Fetch the original video's stored frame/thumbnail as reference
- Send the reference image + detailed scenario prompt to the AI
- Instruction: "Replicate this exact scene composition, camera angle, distance, background, and lighting. Change ONLY the person. Keep everything else identical."
- Download the resulting base64 image, upload to Supabase Storage, update the render record
- Remove KIE AI dependency entirely

### File 3: `src/pages/Studio.tsx`
- No major changes needed -- the scenario field already displays and allows editing the prompt
- The auto-populated prompt will simply be much more detailed and accurate now

### File 4: `docs/tasks.md`
- Mark visual analysis integration as completed

## Expected Result
When a user ingests a TikTok video of a woman filming herself in a bathroom mirror at arm's length with warm lighting, the generated image will show a **different woman** in a **similar bathroom**, at the **same distance from camera**, with **similar lighting and composition** -- not a random studio photo.

