# XP StrikeOut — MVP Implementation Plan (v2, approved)

> Approved plan of record. Design sources: `design-docs/xp-strikeout-architecture.md`, `-tdd.md`, `-gdd.md`.
> Build in vertical slices; each milestone runs via `docker compose up` and is green in CI before the next. **Hard review stop after M1.**

## Approach
- **TypeScript everywhere** (client, game, api) + a **shared package** (§21 constants, types, zod, sim helpers used by both client-prediction and server-authority).
- **Vertical slices**, each testable locally + CI.
- **Testing woven in** per architecture §17.
- **api owns all DB writes**; the game server holds no DB credentials (§8.1).

## Repo structure
```
packages/shared/   services/api/   services/game/   services/bots/
apps/play/   apps/marketing/   apps/admin/   infra/   db/
```

## Milestones

| # | Milestone | Key deliverables | Acceptance |
|---|-----------|------------------|------------|
| **M0** | Foundations & local stack | Monorepo, shared pkg, Dockerfiles, compose, DB migrations + RLS + auth trigger, CI. DEV_AUTH_BYPASS boot guard; api-only DB writes; single regional Redis; `INTERNAL_API_TOKEN` game↔api. | `docker compose up` healthy; CI green; prod build refuses bypass flags |
| **M1** | End-to-end **durable** skeleton *(review gate)* | Dev-login → join (payment stubbed) → join-ticket mint/verify/burn → room → dots move+shoot server-authoritatively → timer ends → game computes results → **idempotent finalize→api→Postgres** → results_locked; **room-crash → reconciliation voids+refunds** | Trivial match plays start→finish; finalize idempotent + killed-room voids (tested); E2E + integration green in CI |
| **M2** | Full gameplay & rules (§21) | Combat, lives+respawn+spawn-protection, spectator, win/tiebreak, spawn selection, power-ups, authority validation, edge cases | Full match vs bots; determinism + edge-case tests green |
| **M3** | Netcode + mobile client | Prediction/reconciliation/interpolation + lag-comp, reconnect, touch joysticks, HUD, player differentiation, Kenney art, bandwidth budget | Playable on a phone browser; reconnect works; budgets met |
| **M4** | Real auth + payments (test mode) | Google OAuth; Paystack test charge + idempotent webhook; payout math + property tests; **payment-to-seat lifecycle: TTL, reconciliation sweep, late-payment refund** | Real login + test payment → play → correct results; money+security suites green |
| **M5** | Admin, results, leaderboards, anti-cheat | Admin console, suspicious flags → payout_pending_review, leaderboards + history + payout status, Paystack Transfers, reconciliation/void state surfaced | Full operational loop minus real money |
| **M6** | Marketing + hardening + load | `xparena.net/games` (SSG/SEO), 20-bot load/soak, graceful-drain, Sentry + metrics + event log, security pass | All DoD items have green owning tests |
| **M7** | Staging + controlled MVP test | Deploy Vercel + Fly `jnb` + Supabase + regional Redis; region spike on real NG handsets; controlled 20-player test | MVP validated vs DoD + real-device pass |

## Gating items (owner: you)
- SaaS accounts + secrets (§14.1) — by M4 (test) / M7 (deploy).
- Paystack live + CAC business + bank account — gates real-money launch (M7).
- Legal/compliance/KYC + age-gate (TDD A.1) — parallel track, gates real money.
- Real NG devices + carriers — region spike + M3/M7 feel testing.
- Milestone sign-offs (hard stop after M1).

## Out of MVP scope
Native app, crypto/NFT, multiple maps/weapons, skins, clans, chat, ranked matchmaking, automated payouts, AI bots in paid matches, withdrawable wallet, entry-only credit.

## Top risks
Netcode feel (iterative, M3) · legal/real-money launch (yours) · liquidity (M7) · Paystack live prerequisites (start CAC early).

---

## Current status
- **M0 + M1 in progress.** Build stops at the M1 review gate for approval before M2.
