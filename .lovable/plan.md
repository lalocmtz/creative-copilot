

# Phase 1.2 — Authentication (Login / Signup + Protected Routes)

This is the next uncompleted task from tasks.md. Everything else depends on authentication being in place since all tables use RLS with `auth.uid()`.

## What Gets Built

1. **Auth Pages** — `/login` and `/signup` pages with email/password forms, matching the dark "control room" design
2. **Auth Context Provider** — Wraps the app, provides current user session, handles `onAuthStateChange`
3. **Protected Route Wrapper** — Redirects unauthenticated users to `/login`
4. **AppLayout Update** — Shows user email + logout button in the sidebar
5. **Route Wiring** — `/login` and `/signup` as public routes, everything else protected

## No Profile Table Needed (MVP)

For the Solo Creator role (MVP), we only need `auth.users` — no extra profiles table. The `assets` table already references `user_id` from `auth.users`.

---

## Technical Details

### New Files

| File | Purpose |
|------|---------|
| `src/pages/Login.tsx` | Login form (email + password) |
| `src/pages/Signup.tsx` | Signup form (email + password) |
| `src/contexts/AuthContext.tsx` | React context with session state, `useAuth()` hook |
| `src/components/ProtectedRoute.tsx` | Wrapper that redirects to `/login` if no session |

### Modified Files

| File | Change |
|------|--------|
| `src/App.tsx` | Wrap with `AuthProvider`, add `/login` and `/signup` routes outside `ProtectedRoute` |
| `src/components/AppLayout.tsx` | Add user email display + logout button in sidebar footer |

### Auth Context Logic

```typescript
// Uses onAuthStateChange (set up BEFORE getSession)
// Provides: user, session, loading, signOut()
// No auto-confirm — users must verify email
```

### Route Structure

```text
/login          -- public (Login page)
/signup         -- public (Signup page)
/               -- protected (Dashboard)
/ingest         -- protected (Ingest)
/asset/:id/*    -- protected (Blueprint, Studio)
```

### Email Verification

Email auto-confirm will NOT be enabled. Users receive a verification email and must click it before signing in. The login page will show a friendly message if the email isn't verified yet.

### Design

- Forms match the existing dark theme (bg-background, border-border, primary buttons)
- Centered card layout for auth pages
- Friendly error messages per design-guidelines.md
- Smooth transitions with framer-motion

## After This Task

Once approved and implemented, I'll mark tasks 1.2 as complete in tasks.md and move to **Phase 1.3 (Zustand stores)** and **1.4 (React Query hooks)** — which can be done together quickly.

