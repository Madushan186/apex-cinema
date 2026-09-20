# CLAUDE.md — Apex Cinema

Stable project instructions for Claude Code. Read this and `docs/PROGRESS.md` at the start of every session.

## What this is

Apex Cinema (apexcinema.lk) — private cinema/gaming room booking site for a Sri Lankan business. Guest checkout only (no customer accounts). Staff/owner have real accounts with server-enforced roles.

Full product spec: `docs/PROJECT_BRIEF.md`
Architecture & data model: `docs/ARCHITECTURE.md`
Security model: `docs/SECURITY.md`
Decision log + open questions: `docs/DECISIONS.md`
Phase tracker + resume instructions: `docs/PROGRESS.md`

## Non-negotiable rules

1. **One phase at a time.** Read `docs/PROGRESS.md` first. Propose the scope of the next phase, get explicit approval, implement only that, then stop for review. Never build ahead.
2. **No autonomous parallel agents** unless the user explicitly asks for them.
3. **Never deploy, push to a remote, enable billing/paid Firebase services, purchase anything, or run destructive git/infra commands without explicit approval in that turn.**
4. **Never weaken security or disable tests to make a build pass.** Fix the real problem or stop and ask.
5. **Server is the only source of truth.** No client-controlled prices, roles, payment status, or room allocation. Every booking/payment mutation goes through validated Cloud Functions. Firestore rules default-deny; client writes are not trusted.
6. **Keep booking status and payment status as separate state machines** (see `docs/ARCHITECTURE.md`). Never conflate "paid" with "confirmed" without going through the defined transition logic.
7. **Do not invent business policy.** Refunds, deposits, cancellation windows, party session duration, and party notice definition are OWNER decisions, not engineering defaults. Where a default is unavoidable to keep moving, mark it clearly as a proposed default in `docs/DECISIONS.md` and flag it for owner sign-off — don't bury it in code.
8. **Preserve `public/brand/apex-logo.png` unchanged** if/when it's added. Don't crop, recolor, or regenerate it.
9. **No fabricated content** — no placeholder reviews, invented room photos, fake contact details, or made-up legal/policy text. Label any placeholder explicitly (e.g. "PLACEHOLDER — replace before launch").
10. Secrets never go in `VITE_*` env vars or client bundles. Server-side managed secrets only.

## Stack (see ARCHITECTURE.md for detail)

React + Vite + TypeScript, Tailwind + shadcn/ui, Firebase (Hosting, Firestore, Auth, Cloud Functions), PayHere hosted checkout (sandbox first), Firebase Emulator Suite, Vitest, Playwright. No Supabase, no Vercel-specific features, no paid UI kits, no unnecessary microservices.

## Working style

- Explain the scope of a phase in plain terms before writing code.
- After implementing, run the relevant checks (lint/typecheck/tests/emulator) and report actual output — not assumed success.
- Update `docs/PROGRESS.md` with exact resume instructions at the end of every phase.
- Ask before assuming — especially anything touching money, PII, or access control.
