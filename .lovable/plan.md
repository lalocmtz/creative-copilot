

# Plan: Rediseño Completo — Workspace Unificado + Sistema de Créditos

Este plan transforma la experiencia de 4 páginas separadas (Dashboard, Ingest, Blueprint, Studio) en un **workspace unificado progresivo** y añade un **sistema de créditos por video** reemplazando la visualización de costos internos.

---

## Parte A: Sistema de Créditos (Backend)

### A1. Migración — Nuevas tablas

```sql
CREATE TABLE public.user_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  total_credits INT NOT NULL DEFAULT 3,
  used_credits INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

CREATE TABLE public.credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('PURCHASE','USAGE','REFUND')),
  credits_delta INT NOT NULL,
  related_render_id UUID REFERENCES public.renders(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

RLS policies: users can SELECT own rows. Service role full access on both. Trigger to auto-create `user_credits` row on first login (via DB function or edge function).

### A2. Credit deduction logic

Create a DB trigger or modify `poll-render-status` edge function: when `render.status` transitions to `DONE`, deduct 1 credit and insert a `credit_transactions` record. If render fails, no deduction.

### A3. Hook `useCredits`

New hook to fetch `user_credits` for current user, with refetch on render completion.

---

## Parte B: Workspace Unificado (Frontend)

### B1. Nueva página `Workspace.tsx`

Reemplaza Ingest + Blueprint + Studio. Una sola página con secciones que se auto-revelan progresivamente:

```text
┌─────────────────────────────────────────────┐
│  SECTION 1: INPUT                           │
│  URL field + rights checkbox + "Analyze"    │
│  Progress stepper (inline)                  │
├─────────────────────────────────────────────┤
│  SECTION 2: BLUEPRINT (auto-visible)        │
│  Transcript (collapsible) + Analysis cards  │
│  Variation tabs (Nivel 1/2/3)               │
├─────────────────────────────────────────────┤
│  SECTION 3: CONTROL PANEL                   │
│  Script editor | Actor+Voice+Intensity      │
│  (2 cols desktop, 1 col mobile)             │
├─────────────────────────────────────────────┤
│  SECTION 4: OUTPUT                          │
│  Image preview + Generate/Approve           │
│  Final video + Generate button              │
└─────────────────────────────────────────────┘
```

Each section is hidden until the previous step completes. Uses existing hooks (`useAsset`, `useBlueprint`, `useRender`, etc.) — **no backend changes** for the pipeline itself.

### B2. Route changes

- Keep Dashboard (`/`) as asset list with "New Video" button
- New route `/workspace` for fresh ingest (no asset yet)
- New route `/workspace/:id` for existing asset (auto-loads to correct section)
- Remove `/ingest`, `/asset/:id/blueprint`, `/asset/:id/studio` routes
- Update Dashboard links to point to `/workspace/:id`

### B3. Credit confirmation modal

Before "Generate Final Video": show `AlertDialog` with "This will use 1 credit. You have X remaining." Cancel / Generate.

### B4. AppLayout update

- Sidebar: replace "$4.20 / $50" with "Credits: X remaining" + "Buy More" button (placeholder)
- Remove CostDisplay from all sections
- Simplify nav: Dashboard + New Video only

---

## Parte C: Overhaul Estético

### C1. CSS tokens update (`index.css`)

```css
--background: 225 50% 4%;    /* #0B0F17 */
--card: 220 45% 7%;          /* #111827 */
--border: 217 33% 12%;       /* #1F2937 */
--primary: 168 60% 50%;      /* #2DD4BF teal */
```

More whitespace: increase card padding from `p-5` to `p-6`, section gaps from `gap-5` to `gap-8`.

### C2. Remove all CostDisplay usage

Replace with clean, cost-free UI. Only credit count in header.

### C3. Mobile responsive

- Workspace sections stack vertically
- Blueprint in accordion
- Sticky "Generate Video" button at bottom
- Voice/actor selectors full-width

---

## Parte D: UX Inteligente

### D1. Voice filtering by detected gender

Already partially implemented. Enhance: auto-select first voice matching detected gender on blueprint load. Remove actor gender mismatch options by default.

### D2. Progressive disclosure

Each section disabled/hidden until prerequisite completes:
- Section 2 hidden until `asset.status >= VIDEO_INGESTED`
- Section 3 hidden until blueprint exists
- Section 4 hidden until draft has script + actor + voice
- "Generate Video" disabled until image approved

### D3. Auto-save drafts

Debounce save on script/actor/voice/intensity changes (no manual "Guardar Borrador" button).

---

## Implementation Order

1. **DB migration**: `user_credits` + `credit_transactions` tables with RLS
2. **`useCredits` hook** + credit deduction in `poll-render-status`
3. **`Workspace.tsx`** — merge Ingest+Blueprint+Studio logic
4. **Route updates** + AppLayout credit display
5. **CSS overhaul** — new tokens + spacing
6. **Remove CostDisplay** everywhere, add credit modal
7. **Mobile responsive** pass
8. **Update `docs/tasks.md`**

## Files to Create
- `src/pages/Workspace.tsx`
- `src/hooks/useCredits.ts`
- `src/components/CreditConfirmModal.tsx`

## Files to Modify
- `src/App.tsx` (routes)
- `src/components/AppLayout.tsx` (sidebar credits)
- `src/index.css` (color tokens)
- `supabase/functions/poll-render-status/index.ts` (credit deduction)
- `docs/tasks.md`

## Files to Remove (or keep as redirects)
- `src/pages/Ingest.tsx` — logic merged into Workspace
- `src/pages/Blueprint.tsx` — logic merged into Workspace
- `src/pages/Studio.tsx` — logic merged into Workspace

