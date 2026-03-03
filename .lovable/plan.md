

# Plan: Fix Image Prompt to Avoid Cloning Person/Environment

## Problem
The current prompt tells the AI to "Copy the background type" and "Match the exact framing from IMAGE 1" — this causes it to literally clone the person's face, room, furniture, and even small details like the trash can. This is a plagiarism risk.

## What Needs to Change
Only the prompt text in `supabase/functions/generate-base-image/index.ts` (lines 102-165). No UI or hook changes.

## Key Prompt Adjustments

### 1. System Prompt — Add anti-cloning rule
Add to ABSOLUTE RULES:
- "NEVER replicate the reference person's face. Generate a COMPLETELY DIFFERENT person with only similar demographic traits (age range, gender, build, facial hair style)."
- "NEVER copy the exact room/background. Create a DIFFERENT environment of the same general type."

### 2. Image Labeling — Change IMAGE 1 instructions
Currently says: "Copy the camera angle, distance, framing, **background type**, and lighting direction"

Change to: "Use as **inspiration only** for camera angle and distance. Do NOT copy the room, furniture, wall colors, or any identifiable background elements. Create a completely different environment of the same general type (indoor/outdoor)."

### 3. User Prompt — PERSON section
Currently: "New person (different identity from reference)"

Change to: "A COMPLETELY DIFFERENT person — different face, different hair, different skin tone variation. Only preserve broad traits: same gender, similar age range, similar build, similar facial hair style (if any). The person must NOT be recognizable as the same individual."

### 4. User Prompt — COMPOSITION section  
Currently: "Match the exact camera distance, angle, background type, and framing from IMAGE 1"

Change to: "Similar camera distance and framing style as IMAGE 1, but in a DIFFERENT room/location. Change wall color, furniture, floor, decorations. Keep the same general vibe (e.g., casual indoor) but make the space clearly distinct."

### 5. FORBIDDEN section — Add
- "Copying the reference person's face or distinctive features"
- "Replicating the exact room, furniture placement, or background details from the reference"

