# XP StrikeOut — Technical Architecture (Nigerian-first, Mobile-browser-first)

> **Owner:** Principal Engineer / Architect.
> **Scope:** The single source of truth for system topology, hosting/region strategy, service boundaries, authentication, room admission, the realtime game path, payments, and ops.
> Optimised for two hard constraints: **(1) players are in Nigeria on mid/low-end Android over metered, lossy mobile data; (2) most managed hosts have no African region.**
> Legal/compliance intentionally out of scope here (tracked in `xp-strikeout-tdd.md` Appendix A).

**Contents**
1. Guiding principles
2. Domain & subdomain topology
3. The region problem
4. High-level system diagram
5. Service responsibilities
6. Authentication (Google OAuth via Supabase)
7. Should `api` be separate?
8. Match lifecycle across services
9. Join ticket — room admission
10. Realtime server design
11. Mobile-browser client engineering
12. Payments & payouts
13. Auth/identity data model
14. Environment / config
15. Observability & ops
16. Local development & testing (Docker Compose)
17. Testing strategy
18. Build order
19. Art & assets

---

## 1. Guiding principles

1. **Put the realtime server as close to Lagos as possible.** Every 50 ms of RTT is felt in a shooter. This single decision dominates perceived quality.
2. **Keep the hot loop off the database.** Supabase lives in Europe; the game server must never block on it mid-match. DB is touched at match *end* only.
3. **Spend bytes like they cost money — because they do.** Binary state, delta updates, small asset bundles. Nigerian mobile data is expensive and capped.
4. **Assume the connection drops.** Reconnect-into-match is a first-class feature, not an edge case.
5. **Mobile browser first — no native app for MVP.** Players play in the mobile browser (PWA + add-to-home-screen, no app-store download/approval friction). A native app is **deferred until the MVP proves traction** (see *Platform & roadmap* below); the architecture is kept client-agnostic so a later native app can reuse the same API, WebSocket protocol, and Supabase backend.
6. **One identity, two credentials.** A Supabase JWT proves *who you are*; a single-use join ticket proves *you paid for this match*. The game server only ever trusts the latter.

**Platform & roadmap.** MVP target is the **mobile web browser on Android** (Chrome), playable at `play.xparena.net`. Desktop browser works for internal testing/admin. **Native iOS/Android apps are explicitly post-MVP** — built only after traction, and deliberately not on the critical path now. Nothing in this design forecloses them: the realtime path (Colyseus WebSocket), the REST API, and Supabase (Auth + Postgres) all have first-class mobile-native SDKs, so a future app is a new client over the same backend, not a re-platform.

---

## 2. Domain & subdomain topology

| Subdomain | Purpose | Stack | Host / Region | Auth |
|-----------|---------|-------|---------------|------|
| `xparena.net/games` + `/games/strikeout` | Marketing catalog + per-title landing (SEO, rules, trust) | Next.js **SSG/ISR** | Vercel (global CDN) | public |
| `play.xparena.net` + `/strikeout` | Authenticated launcher hub + the game app (lobby + Phaser client) | Next.js + React + Phaser | Vercel | Supabase JWT (Google) |
| `game.xparena.net` | **Realtime game server** (WebSocket) | Node + Colyseus | **Fly.io — `jnb` (Johannesburg)** | signed join ticket |
| `api.xparena.net` | Backend API: matchmaking, payments, results, payouts | Node/Fastify | Fly.io `jnb` (co-located) | Supabase JWT / service role |
| `admin.xparena.net` | Internal admin & payout review | Next.js | Vercel | admin role + IP allowlist |

**Why split `play` from `xparena.net`:** the marketing site is cache-everything static (great Core Web Vitals, SEO); the app is authenticated, JS-heavy, and ships the Phaser bundle. Different caching, deploy cadence, and bundle budgets — keep them apart.

**Route scheme (XP Arena is multi-game; StrikeOut is one title):**

```
xparena.net (public marketing, anonymous)        play.xparena.net (authenticated app)
  /games                 catalog index (SEO)        /                 launcher hub: title tiles  ← entry point
  /games/strikeout       StrikeOut landing + Play    /strikeout        lobby → gameplay → results
  /about, /how-it-works                              /strikeout/leaderboard
                                                     /onboarding, /auth/callback
```
- **Marketing namespaces under `/games`** — gives a catalog index page and keeps brand pages clean as titles are added.
- **Play stays flat** (`/strikeout`, not `/games/strikeout`) — the subdomain already means "play," so the prefix would be redundant.
- A "Play" tap from `xparena.net/games/strikeout` deep-links to `play.xparena.net/strikeout`; if there's no session the Google gate fires first and returns the user to `/strikeout` (§6).

---

## 3. The region problem (the most important section)

Managed hosts and their African coverage:

| Service | Africa region? | Decision |
|---------|----------------|----------|
| **Fly.io** | ✅ **Johannesburg (`jnb`)** | **Game server + API here.** Lagos→JNB beats Lagos→Europe for most NG ISPs. |
| Render | ❌ (US/EU/Singapore) | Rejected for realtime; fallback only. |
| Supabase | ❌ (closest: London / Frankfurt) | **London**, kept off the hot path. |
| Vercel | ❌ (edge CDN global; functions pin `fra1`/`lhr`) | Static + the three Next.js apps. |
| Upstash Redis | ✅ global / EU | Presence, join-ticket nonces, rate-limit. EU region. |

**Approximate RTT from Lagos (measure before committing — NG routing is cable-dependent):**

```
Lagos → Johannesburg (Fly jnb)     ~  ?  (often best; verify per ISP — MTN/Glo/Airtel differ)
Lagos → London/Amsterdam           ~ 80–150 ms typical
Lagos → US East                    ~ 150–250 ms  (do NOT host realtime here)
```

> **Action (do first):** run a 1-day RTT/packet-loss test from real NG handsets on MTN, Glo, Airtel, and 9mobile to `jnb` vs `lhr`. Pick the winner by the *median*, not the best case. Half a day of work that de-risks the entire product.

**Hosting decision — MVP is single-region Fly `jnb` (managed); NG-local is a Phase-2 trigger, not a plan.**

For the MVP the realtime server runs on **Fly.io `jnb` (Johannesburg), single region, no failover standby.** Rationale:

- The MVP exists to prove *traction* (do players pay, enjoy, return?), which is a product question — not a latency-benchmark question. "Good enough + stable" beats "lowest possible RTT."
- This is a 2D top-down shooter, not a 128-tick FPS. With our netcode — client prediction, ~100 ms interpolation buffer, and bounded server-side lag compensation (§10) — ~60–100 ms to `jnb` is very playable; the lag comp exists precisely to make high-ping shots register fairly.
- Self-hosting in Nigeria (even a rented VM in a Lagos data center) front-loads power, redundant-uplink, DDoS, single-point-of-failure, and ops burden at the stage with the least money and focus.
- **Deferring is nearly free:** the Colyseus server is containerized and the rest of the system (Vercel, Supabase) is location-agnostic, so moving it to a Lagos box later is a redeploy + DNS change, not a re-architecture.

**Phase 2 — move the realtime server to a Lagos data center (colo or rented VM) only when *all three* hold:**
1. **Traction is proven** (the MVP cleared its success criteria).
2. **Measured latency pain** — player complaints *plus* p50/p95 RTT/jitter telemetry (§15) showing `jnb` is the actual bottleneck.
3. **Scale/cost/data-residency case** — egress or capacity at volume, or KYC/regulatory data-residency once the legal track (A.1) is underway.

When that happens, prefer a **Tier-III carrier-neutral Lagos DC peered at IXPN** (e.g. Rack Centre, Equinix LG1/MDXi) over literal on-prem — same NG-local latency and control, but the DC supplies redundant power/cooling/uplinks, physical security, and DDoS scrubbing. The latency win is **conditional on IXPN peering with the major carriers**; verify with `traceroute` (path must stay in-country) before committing. Optionally keep Fly `jnb` as a failover standby the matchmaker can route to. Until those triggers fire, this stays a documented option, not built.

> **MVP instrumentation hedge:** ship p50/p95 RTT-per-carrier metrics (§15) from day one so the Phase-2 decision is driven by data, not a guess. If `jnb` numbers come back strong, the Lagos box may never be needed.

**Consequence of the split (game in JNB, DB in London):** ~150 ms between game server and Supabase. Fine, **because we never write to the DB during a match** — only at `results_locked` (see §8).

**Why Supabase (stack decision).** Supabase = managed **Postgres + Auth + Storage + RLS** in one service. Reasons it's the right fit here, and the alternatives weighed:

- **Postgres, because this is a money product.** Payouts demand ACID transactions, `numeric` money types, and a single-transaction "write all results at `results_locked`" guarantee (§8, A.2). A relational schema (users ↔ matches ↔ match_players ↔ payments ↔ payouts) is exactly our shape, and admin/payout reporting is plain SQL.
- **Auth is bundled and gives us Google OAuth out of the box** (§6) — issuing the very JWT we already chain into the API and join tickets. We don't build OAuth, session handling, JWT minting, or refresh rotation ourselves.
- **RLS** enforces "users see only their own rows" declaratively; admin/payout tables stay service-role only.
- **Small-team leverage:** one managed vendor for DB+Auth+Storage(avatars), generous low-cost tier — right for an MVP that must run cheap.
- **Low lock-in:** it's *standard Postgres* underneath — migratable to Neon/RDS/self-hosted later. Auth is the stickier piece, but Google identities are portable.
- **Doesn't block the future native app:** Supabase has first-class mobile SDKs.

**Alternatives rejected:** *Firebase/Firestore* — NoSQL is a poor fit for transactional payout math and SQL payout reporting. *Roll-your-own Postgres + Auth.js/Clerk* — more infra to build/run, or a second paid auth vendor, for no MVP benefit. *Plain Postgres only* — we'd still have to build auth; Supabase *is* Postgres plus that.

> The realtime hot path does **not** use Supabase — the Colyseus server keeps match state in memory and only the API touches Postgres (reads for matchmaking/results, one write at match end). So Supabase's EU location never affects gameplay latency.

---

## 4. High-level system diagram

```text
                         ┌─────────────────────────────┐
   Android / Chrome      │   Vercel CDN (global edge)   │
   (Lagos, mobile data)  │  xparena.net/games (SSG)     │
        │                │  play.xparena.net (app+Phaser)│
        │  HTTPS (static, app shell, PWA)                │
        │                └─────────────────────────────┘
        │
        │   Google OAuth (Supabase)                WebSocket (binary, 10–30 Hz)
        │   REST (join, pay, results) + Bearer JWT       │
        ▼                                              ▼
 ┌───────────────────────┐                  ┌───────────────────────────┐
 │  api.xparena.net       │  signed ticket   │  game.xparena.net          │
 │  Node/Fastify          │ ───────────────► │  Colyseus rooms (Fly jnb)  │
 │  (Fly jnb)             │                  │  server-authoritative sim  │
 └─────────┬──────────────┘                  └─────────────┬─────────────┘
           │                                                │ results at match end only
           │ matchmaking/presence/rate-limit                ▼
           ▼                                   ┌───────────────────────────┐
 ┌───────────────────┐                         │  Supabase (EU)            │
 │  Redis (Upstash)  │ ◄───────────────────────┤  Auth (Google) + Postgres │
 │  presence, tickets│                         │  users, matches, results, │
 └───────────────────┘                         │  payments, payouts, audit │
                                               └─────────────┬─────────────┘
   ┌──────────────────────┐                                  │ webhooks
   │  Paystack (NG)        │ ◄────────────── api ─────────────┘
   │  charge + transfers   │
   └──────────────────────┘
                                       admin.xparena.net (Vercel) ──► api/Supabase
```

---

## 5. Service responsibilities

**`xparena.net/games` (marketing)** — static catalog (`/games`) + per-title landing (`/games/strikeout`): SEO, "how payouts work," fairness/trust copy, Play CTA. No auth, no game code. SSG/ISR.

**`play.xparena.net` (app + game client)**
- **Launcher hub** at `/` — authenticated tiles for the available titles; `/strikeout` is StrikeOut's lobby/gameplay.
- **Auth boundary** — landing on a title route (e.g. `/strikeout`) with no session triggers Google sign-in, then returns to that title (§6).
- Lobby, profile, results, leaderboard UI (React).
- Phaser canvas on a dedicated route, **landscape-locked**.
- Client prediction + interpolation; renders state, never decides truth.
- PWA shell (offline-cached UI, add-to-home-screen).

**`api.xparena.net` (backend API)**
- Resource server: validates the Supabase JWT (Bearer) on every request; never initiates login.
- Profile provisioning, gamer tag.
- **Matchmaking intent** → assigns player to a match, mints the **join ticket** (§9).
- Payments: Paystack charge init + webhook handler (idempotent).
- Results read, payout records, admin endpoints.

**`game.xparena.net` (Colyseus)**
- One **room per match**. Server-authoritative movement/shooting/damage/takedowns/timer.
- Verifies the join ticket on `onAuth` — **no ticket, no entry**.
- Emits final results to `api`/Supabase once, then locks.

**Redis (Upstash)** — matchmaking/presence, join-ticket nonces (one-time use), rate limiting, reconnection slots. Enables multi-machine scaling via the Colyseus Redis driver.

---

## 6. Authentication (Google OAuth via Supabase)

**Decision: Google OAuth only for MVP**, brokered by **Supabase Auth** using **Authorization Code + PKCE** in **redirect mode**, triggered at `play.xparena.net` when a user clicks a game title.

**Rationale**
- Virtually every Android device in NG has a signed-in Google account → one-tap entry, no password, no SMS-OTP cost/deliverability pain.
- Fastest "tap title → in lobby"; hesitation kills conversion in a money game.
- Verified Google email + stable `sub` strengthens (not replaces) anti-multi-account signals.
- **Trade-off accepted:** users without a Google account are excluded in MVP. The data model (§13) does not assume a single provider, so Apple/email can be added later.
- **Redirect, not popup:** popups are unreliable on mobile browsers and blocked in many in-app webviews. PKCE is correct for a public client (no secret on device).

**Where auth happens:** marketing is anonymous; `play` is the auth boundary; `api` only *validates* the JWT (Bearer); `admin` uses the same login gated by `role = admin` + IP allowlist.

**Session cookie scope:** Supabase session cookies on parent domain **`.xparena.net`** (via `@supabase/ssr`) so a session on `play` is also valid on `admin` and for SSR. `api` does **not** rely on the cookie — clients send `Authorization: Bearer <jwt>`, keeping the API stateless and CORS-simple.

**Flow ("click game title" → in lobby):**
```text
[xparena.net/games/strikeout] tap "Play"  → https://play.xparena.net/strikeout
   (or from the play hub itself: play.xparena.net/ → tap StrikeOut tile)
        │  no session?
        ▼  "Continue with Google"  (signInWithOAuth: provider google, redirectTo /auth/callback,
        │                            prompt=select_account; intended path saved in state/cookie)
[accounts.google.com] account chooser → consent (first time)
        │  → https://<project-ref>.supabase.co/auth/v1/callback  (Supabase exchanges code)
        ▼
[play.xparena.net/auth/callback] exchangeCodeForSession → JWT + refresh
        │  ensure profile (§13); no gamer_tag → /onboarding ; else restore intended path
        ▼
[play.xparena.net/strikeout] authenticated → Join → pay → join ticket → game.xparena.net
```
**Deep-link preservation:** store the clicked game path before redirect and restore it in the callback, so the user returns to the exact game — not a generic home page.

**Token chain to the rest of the system:** Supabase issues a short-lived JWT (~1h) + rotating refresh token. The JWT's **`sub` = our canonical `user_id`** everywhere (matches, results, payouts, **join-ticket `sub`**). `api` verifies the JWT (Supabase JWKS) → derives `user_id`; the join-ticket mint requires a valid JWT *and* `payment_status = paid`.

**Google Cloud / Supabase config**
- Google OAuth Web client → **Authorized JS origins:** `https://play.xparena.net`, `https://admin.xparena.net`; **Authorized redirect URI:** `https://<project-ref>.supabase.co/auth/v1/callback`. Publish the consent screen (avoid the "unverified app" warning on a money product).
- Supabase Auth: enable Google; **Site URL** `https://play.xparena.net`; add redirect URLs for `/auth/callback` on `play` + `admin` and preview/local; access-token TTL ~1h with refresh rotation.

**Mobile/NG-specific auth risks**

| Risk | Handling |
|------|----------|
| **In-app webview blocks Google OAuth** (FB/IG/TikTok → `disallowed_useragent`) | Detect in-app webview → prompt **"Open in Chrome/Safari"** with a copyable link. The #1 real-world auth failure for NG social traffic — must handle in MVP. |
| Redirect loses context | Preserve intended game path (above). |
| Flaky network mid-OAuth | Idempotent callback; on failure return to the gate with retry, never a dead end. |
| Multiple Google accounts on a shared phone | `prompt=select_account` forces the chooser. |
| Token theft via XSS | `@supabase/ssr` httpOnly cookies, not `localStorage`. |

**Logout:** `signOut()` clears `.xparena.net` cookies across all subdomains; refresh-token rotation revokes a session on reuse.

---

## 7. Should `api` be separate?

**Decision: `api` is a thin Fastify service co-located with the game server on Fly `jnb`** — *not* Vercel serverless.
- Vercel functions have **no African region**; every call round-trips to Europe/US → sluggish lobby/join on NG mobile.
- Co-location keeps auth/join/results fast and near the realtime server.
- Payment **webhooks** want a stable always-on endpoint (serverless cold starts + retries are a bad combo).

Keep the boundary clean (separate subdomain) so `api` can move to its own service/region later without touching clients. A v0 fallback of Next.js API routes pinned to `fra1` is acceptable but pays a latency tax.

---

## 8. Match lifecycle across services

```text
1. Player taps "Join" on play.xparena.net (authenticated via Google, §6)
2. api: verify JWT → create/assign match_player (payment_status=pending)
3. api: Paystack charge (card / bank transfer / USSD / Opay)
4. Paystack webhook → api: payment_status=paid (idempotent on provider_reference)
5. api: mint JOIN TICKET (JWT, ~60s TTL, nonce in Redis) — §9
6. Client opens WS to game.xparena.net with ticket
7. game: onAuth verifies ticket + burns nonce → admit to room
8. Countdown → active → server simulates (NO db writes in this phase)
9. Match ends (timer or last alive) → server computes results ONCE
10. game → api → Supabase: write match + match_players + results (single txn)
11. Room → results_locked; clients fetch results from api
12. Admin reviews flags → approves payout → Paystack Transfers API (later: automated)
```
**Key property:** step 8 is pure in-memory simulation in `jnb`; EU database latency never touches gameplay. The only cross-region hop is the single results write at step 10.

---

## 9. Join ticket — room admission

A short-lived, single-use credential proving a player **paid for a specific match**. The game server admits **no one** without a valid, unburned ticket — this closes the "unpaid/spoofed socket joins a room" hole. Issued by `api` (HS256, shared `JOIN_TICKET_SECRET`), **verified only** by `game`. No DB call on the join path.

**Why a separate ticket (not just the JWT):** the Supabase JWT proves identity, not *paid-for-match-X-right-now*. The ticket is match-scoped, payment-bound, ~60s-lived, and single-use.

**Claims**
```json
{
  "iss": "api.xparena.net", "aud": "game.xparena.net",
  "sub": "<user_id>",            // == Supabase user id
  "match_id": "<match_id>", "room_id": "<colyseus_room_id>",
  "gamer_tag": "<tag>", "paid": true, "entry_fee_naira": 2000,
  "jti": "<uuid-v4>",            // one-time nonce, burned on use
  "iat": <now>, "nbf": <now>, "exp": <now + 60s>
}
```
**TTL 60s** comfortably covers "client gets ticket → opens WS → onAuth" even on 3G, while keeping the replay window tiny. Need longer (reconnect)? Re-issue, don't lengthen.

**Issuance (`api`, `POST /api/matches/join`)**
```text
1. Verify Supabase JWT → user_id.
2. Require match_player.payment_status == 'paid'   else 402
3. Require match status in {waiting, countdown}    else 409
4. Resolve room_id (matchmaker / Redis).
5. jti = uuid_v4(); Redis SET join_ticket:<jti> EX 60 NX  (guards double-issue)
6. Sign JWT (exp = now+60s); return { ws_url, token, room_id }.
```

**Verification (`game`, Colyseus `onAuth`)**
```text
1. Verify HS256 signature (JOIN_TICKET_SECRET).        else reject
2. Verify iss/aud.                                      else reject
3. Verify exp/nbf (±30s skew).                          else reject (expired)
4. Verify room_id/match_id == this room.               else reject
5. Verify paid == true.                                 else reject
6. BURN nonce: Redis DEL join_ticket:<jti> must return 1 (single-use). else reject
7. One live socket per (user_id, room): reject duplicate (or replace on resume, below).
8. Return auth = { user_id, gamer_tag } → onJoin.
```
Steps 1–5 are signature/claim checks (no I/O); step 6 (Redis `DEL`) is the only external call and is what makes the ticket single-use across machines.

**Threats handled:** unpaid socket (no ticket), replay (TTL + nonce burn), one-entry-two-players (nonce + one-socket rule), wrong-room reuse (room binding), forgery (HS256), clock skew (±30s), joining a running match (status check at issue), tampered claims (signature). *Out of scope:* in-game cheating (server-authoritative sim + anti-cheat), multi-accounting across different paid entries (KYC/device signals).

**Reconnection:** on disconnect the room holds the slot for the idle window (10s) keyed by `user_id`. `POST /api/matches/:id/resume` issues a **resume ticket** (same format, `"resume": true`, fresh `jti`); `onAuth` step 7 **replaces** a held slot instead of rejecting, but rejects if the slot is still live (no double-connect).

**Secret rotation:** support two valid secrets (current + previous) during a short overlap; since tickets live only 60s, rotation is effectively instant.

---

## 10. Realtime server design (Colyseus on Fly)

- **Topology:** single Fly app, region `jnb`, 1+ machines; one machine hosts many 20-player rooms. Scale by enabling the Colyseus **Redis presence/driver** then `fly scale count` — matchmaking stays correct across machines.
- **Sticky by nature:** a WS connection pins to one machine; matchmaking (which machine gets a new room) goes through Redis.
- **Tick / broadcast:** simulate **20–30 Hz**, broadcast **10–15 Hz** with ~100 ms client interpolation buffer. Binary state via Colyseus schema (no hand-rolled JSON).
- **Lag compensation:** bounded server-side rewind (≤250 ms) so high-ping NG players' shots register — essential for *perceived* fairness with money on the line.
- **Graceful drain on deploy:** flip `/health` to 503 on SIGTERM (stop taking new rooms), let active matches (≤5 min) finish, then exit. Never kill a machine mid-match. (Enforced in `infra/fly.game.toml`: `auto_stop_machines=false`, `kill_timeout=600s`, bluegreen.)
- **Reconnection:** hold the slot for the 10s idle window; client resumes with a fresh resume ticket (§9) + full state resync. Track `disconnect_count` per player.

---

## 11. Mobile-browser client engineering (Nigerian devices)

Targeting mid/low-end Android + **Chrome mobile browser** on metered data (no native app in MVP).

**Performance** — object-pool projectiles; cap particles; texture atlases; avoid per-frame allocations. Design for **30 fps on low-end**, 60 where available; cap pixel ratio. Landscape-locked canvas at a fixed logical resolution.

**Data & loading** — small initial bundle; lazy-load the Phaser scene only on the play route; code-split marketing vs app. Aggressive PWA caching (service worker, immutable hashes) so returning players re-download almost nothing. Binary WS only; budget and log per-client kbps.

**Network resilience** — detect WiFi↔4G↔3G handoffs; auto-reconnect with backoff into the held match slot (§9); show honest "reconnecting…" state; degrade interpolation gracefully on 3G rather than hard rubber-banding.

**Input/UX** — touch joysticks with thumb-tuned dead-zones; auto-fire when aiming; pause/disconnect cleanly on tab background (mobile browsers throttle background tabs hard).

---

## 12. Payments & payouts (Nigerian-first)

- **Provider: Paystack** as primary (NG-native; cards, **bank transfer, USSD, Opay**). Flutterwave as fallback.
- **Charge:** init from `api`, confirm via **webhook** (idempotent on `provider_reference`). Never trust client-side "payment success."
- **Payout:** **Paystack Transfers API** to NUBAN accounts. MVP = admin-approved manual trigger; automate after trust is established.
- Webhook endpoint on the always-on `api` service (not serverless) for retry reliability.
- **Entry is reserved per match seat, consumed only at match start.** A paid entry whose seat is never *consumed* (match didn't start with that player) is returned, not kept. **MVP returns to source (refund); no wallet.** Entry-only (non-withdrawable) credit is a post-MVP fast-follow; a withdrawable wallet is deferred (CBN e-money licensing). Full state machine + scenario table in **TDD Appendix A.2**.

---

## 13. Auth/identity data model

Supabase owns `auth.users`. We keep a 1:1 `public.users` row (`id = auth.uid()`), provisioned on first Google sign-in via a trigger, plus `player_profiles` for the gamer tag.

```sql
-- public.users  (id == auth.uid())
id uuid primary key
name text
email text
email_verified boolean default false
provider text            -- 'google' (future: 'apple','email')
provider_sub text        -- Google `sub`, stable per-account id
avatar_url text
phone text               -- nullable; collected later at payout/KYC, NOT at signup
role text                -- 'player' | 'admin'
last_login_at timestamp
created_at timestamp
```
```sql
-- gamer tag unique, case-insensitive
create unique index if not exists player_profiles_gamer_tag_unique
  on player_profiles (lower(gamer_tag));
```
```sql
-- idempotent provisioning on first sign-in
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.users (id, email, provider, provider_sub, avatar_url, email_verified, created_at)
  values (
    new.id, new.email,
    coalesce(new.raw_app_meta_data->>'provider','google'),
    new.raw_user_meta_data->>'sub',
    new.raw_user_meta_data->>'avatar_url',
    coalesce((new.raw_user_meta_data->>'email_verified')::boolean,false),
    now()
  ) on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created
  after insert on auth.users for each row
  execute function public.handle_new_auth_user();
```
**RLS:** users read/update only their own `users`/`player_profiles` row (`auth.uid() = id` / `= user_id`); admin/payout tables are service-role only. Profile provisioning: first login creates the rows; missing `gamer_tag` → `/onboarding` (unique, profanity-filtered); name/email/avatar come from Google; phone deferred to payout/KYC to keep the entry funnel to one tap + tag.

---

## 14. Environment / config layout

```
# Client (play.xparena.net)
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_GAME_WS_URL    = wss://game.xparena.net
NEXT_PUBLIC_API_URL        = https://api.xparena.net
NEXT_PUBLIC_AUTH_REDIRECT  = https://play.xparena.net/auth/callback
SUPABASE_COOKIE_DOMAIN     = .xparena.net   # shared session across subdomains

# Google OAuth (set in Supabase Auth dashboard, not shipped to client):
#   GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET
#   Google authorized redirect URI = https://<project-ref>.supabase.co/auth/v1/callback

# api.xparena.net
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_JWT_SECRET          # verify incoming user JWTs
JOIN_TICKET_SECRET           # signs join tickets (shared with game; verify-only there)
JOIN_TICKET_TTL_SECONDS  = 60
JOIN_TICKET_SKEW_SECONDS = 30
REDIS_URL                    # Upstash
PAYSTACK_SECRET_KEY
PAYSTACK_WEBHOOK_SECRET

# game.xparena.net
JOIN_TICKET_SECRET           # same secret, verify only
REDIS_URL
SUPABASE_SERVICE_ROLE_KEY    # results write only, at match end
FLY_REGION = jnb
```

---

## 15. Observability & ops

- **Sentry** on client + `api` + `game`.
- **Per-match event log** (every shot/hit/takedown) retained for dispute review — written to Supabase `audit_logs` / object storage at match end, not live.
- **Realtime metrics:** rooms active, players connected, tick duration, broadcast kbps/client, reconnect rate, p50/p95 RTT per region — these signal when to add a Fly machine and whether NG latency is acceptable.
- **Synthetic load:** internal headless test bots validate a 20-player room in `jnb` before real money (also doubles as practice-mode opponents; see `xp-strikeout-tdd.md` Appendix A).
- **Deploy configs:** `infra/fly.game.toml`, `infra/fly.api.toml`, `infra/README.md`. **Local stack:** `infra/docker-compose.yml` (§16).

---

## 16. Local development & testing (Docker Compose)

**Goal: one command brings up the whole backend locally and lets you play — and load-test — a full match, mirroring the production *service boundaries* and the exact join-ticket flow.** Lives at `infra/docker-compose.yml`.

```
docker compose -f infra/docker-compose.yml up --build              # postgres + redis + api + game
docker compose -f infra/docker-compose.yml --profile bots up --build  # + 20 simulated players (full-match test)
```

**Services (mirror prod boundaries, not its hosting):**

| Service | Image / build | Stands in for | Local port |
|---|---|---|---|
| `postgres` | `postgres:16` (+ `db/init` migrations/seed) | Supabase Postgres (EU) | 5432 |
| `redis` | `redis:7` | Upstash (presence, join-ticket nonces, rate-limit) | 6379 |
| `api` | build `services/api` | `api.xparena.net` | 8080 |
| `game` | build `services/game` | `game.xparena.net` (Colyseus) | 2567 |
| `bots` *(profile `bots`)* | build `services/bots` | internal headless players for 20-player load tests / practice | — |

The **web apps** (`play`, marketing, admin) run on the host via `npm run dev` against `http://localhost:8080` / `ws://localhost:2567` (fast hot-reload), or can be added as compose services later.

**Auth locally (Google OAuth can't run offline):**
- **Fast inner loop / CI:** `DEV_AUTH_BYPASS=true` on `api` mints Supabase-shaped JWTs (signed with the local `SUPABASE_JWT_SECRET`) from a dev login route — no Google round-trip. **Never enabled outside local/CI.**
- **Full-fidelity auth:** run the **Supabase CLI** (`supabase start`) — it spins up GoTrue + Postgres + Studio in Docker, so the real Google-OAuth → JWT path works locally. Use this when testing the actual sign-in flow; use the bypass for everything else.

**Payments locally:** Paystack **test-mode** keys. For the webhook, either tunnel (`cloudflared`/`ngrok`) to `api`'s webhook route, or hit a dev-only "simulate webhook" endpoint to drive `payment_status=paid`. Same idempotency path as prod.

**What "bypass" means — stub the third-party *edge*, never our own *logic*.** We bypass Google's OAuth round-trip and real money movement, but the JWT stays real (signed + verified) and the payment **state machine stays live** (webhook → idempotent `paid` → reserved → consumed/refunded). The parts most likely to break — token verification, idempotent webhook, consumed-vs-refund, join-ticket replay/burn — are exercised in *every* mode.

| Mode | Auth | Payment | Use for |
|------|------|---------|---------|
| **1. Inner loop** | `DEV_AUTH_BYPASS` mints a real signed JWT | dev route marks `paid` | gameplay/netcode iteration; the fast loop |
| **2. Integration** | real Google path via **Supabase CLI** | Paystack **test mode** + simulated/tunneled webhook | validating the actual sign-in + payment chain; **what CI runs** |
| **3. Staging/prod** | real | real | **nothing bypassed** |

**Fail-closed safety rule (non-negotiable for a money game).** `DEV_AUTH_BYPASS` and the simulate-webhook route are **dev/CI only**: the service must **refuse to boot** if either is set while `NODE_ENV=production`, and neither flag may appear in any prod/Fly config (only in `docker-compose.yml` / CI). An auth bypass reaching prod is catastrophic, so it's gated by a hard startup assertion, not convention.

**Why this matters here:** the join-ticket handshake (api mints → game verifies → Redis nonce burn), the server-authoritative tick loop, and the match→results→Postgres write are exactly the parts most likely to break in integration. Compose lets us exercise the *whole* chain — including a 20-bot match — on a laptop and in **CI** before anything touches Fly/Supabase.

**Parity caveats (call them out so no one is surprised):** compose reproduces service *boundaries and contracts*, **not** hosting or geography — no Fly/Vercel, no region latency, no Supabase RLS/Auth unless using the Supabase CLI. Treat green-locally as "logic correct," not "prod-ready"; latency/region is validated by the region spike and staging.

---

## 17. Testing strategy

> §16 is *how to run* tests (compose, modes, bots); this is *what we test, at which layer, and what gates a release.* Because this is a **real-money realtime** product, the priority is **correctness of money + security + authority invariants**, not a coverage percentage. Acceptance maps to the TDD Definition of Done (§20).

### 17.1 Test pyramid

| Layer | Scope | Tooling (suggested) | Runs |
|-------|-------|---------------------|------|
| **Unit** | Pure logic: payout math, tick/physics helpers, ticket sign/verify, validators | Vitest/Jest, **fast-check** (property-based) for money math | every commit |
| **Integration** | A service against real Postgres + Redis (via compose): API routes, webhook handler, ticket mint→burn | Vitest + supertest, Colyseus test client | every commit (CI) |
| **Contract** | API ↔ game ↔ client message shapes (join ticket claims, room state schema) stay in sync | shared types + schema assertions | CI |
| **E2E** | Full chain in compose: dev-login → join → pay(stub) → room → match → results in Postgres | Playwright (web) + a headless game client | CI (pre-merge) |
| **Load / soak** | 20-bot match; many concurrent rooms; sustained run | `bots` profile + k6/artillery for REST | nightly + pre-release |
| **Security** | Ticket abuse, server-authority, prod-guard | targeted integration tests | CI |
| **Real-device / manual** | Feel, framerate, network on real NG handsets | manual matrix (17.7) | pre-release |

### 17.2 Money-critical tests (🔴 must never regress)
- **Payout math** — property-based: for random player/takedown distributions, assert the invariant `sum(all payouts) + platform_fee + remainder == gross_pool` exactly, `numeric` only, correct rounding-down + remainder policy (A.2).
- **Payment state machine** — `pending→paid→consumed|refunded|credited` transitions; **unconsumed entry is always returned, never kept**; consumed entry never refunded.
- **Webhook idempotency** — duplicate, out-of-order, and replayed Paystack webhooks converge to one `paid` and one settlement (keyed on `provider_reference`).
- **Zero-takedown / void** — match voids and refunds correctly.

### 17.3 Security tests (🔴)
- **Join ticket (§9):** reject expired, wrong-room, forged-signature, and **replayed** tickets; a second use of the same `jti` fails; two concurrent connects with one ticket → exactly one admitted.
- **Server authority:** client-sent impossible movement/fire-rate is rejected; a client **cannot self-declare** hits/damage/takedowns; unpaid socket (no ticket) is refused.
- **Fail-closed guard:** service **refuses to boot** if `DEV_AUTH_BYPASS` / simulate-webhook is set while `NODE_ENV=production` (§16).
- **RLS:** a user cannot read/modify another user's rows; admin/payout tables are service-role only.

### 17.4 Realtime & determinism
- **Tick loop** produces identical results for identical inputs (seeded); **§21.10 edge cases** each have a test: same-tick double death, buzzer-beater kill counts, in-flight projectiles discarded, double-attacker takedown attribution.
- **Reconnection:** disconnect → resume within the idle window re-enters the same room/state (§9); after timeout the seat is released per rules.
- **Anti-cheat flags:** each detector (A.3) fires at its threshold and not below it.

### 17.5 Load, soak & budgets
- **20-bot match** completes cleanly; assert server **tick duration** stays within budget and **broadcast kbps/client** within the mobile-data budget (§11).
- **Concurrency:** N simultaneous rooms on one Fly machine before degradation → sets the scale-out trigger.
- **Soak:** a long multi-match run with no memory growth / socket leaks; graceful drain on deploy doesn't drop a live match.

### 17.6 Real-device & network matrix (manual, pre-release)
- Devices: a set of common/low-end **Android** phones (+ Chrome).
- Networks: **MTN, Glo, Airtel, 9mobile** on 4G/3G — folds into the **region spike** (§3): capture p50/p95 RTT, jitter, packet loss, and observed framerate.
- Scenarios: mid-match backgrounding, WiFi↔4G handoff, in-app-webview auth fallback (§6).

### 17.7 CI gates (block merge / deploy)
1. Lint + typecheck + unit (incl. payout property tests) green.
2. Integration + E2E green in compose (real Postgres/Redis).
3. All **🔴 money + security** suites green — non-negotiable.
4. A **20-bot match** passes in CI (smoke-level) before deploy.
5. Prod build asserts no bypass flags present.

### 17.8 Environments
- **Local** (compose) — dev inner loop.
- **CI** — compose-based, ephemeral, runs the gates above.
- **Staging** — Fly `jnb` + a separate Supabase project + Paystack **test** mode; the only place latency/region and real Google auth are validated before prod.

### 17.9 Acceptance → Definition of Done
Each TDD §20 DoD item has an owning test: *"server confirms all takedowns"* → 17.4; *"final payout accurate"* → 17.2; *"results save"* → E2E; *"suspicious activity flagged"* → 17.4 anti-cheat; *"stable on common Android"* → 17.6. **MVP ships when every DoD item has a green owning test + a passing real-device pass.**

---

## 18. Build order

0. **Local stack first:** `infra/docker-compose.yml` (postgres + redis + api + game) so every step below is testable on a laptop and in CI from day one.
1. **Region spike (½ day):** RTT/loss test from real NG handsets → confirm `jnb`.
2. Stand up `game.xparena.net` (Colyseus on Fly jnb) + `api.xparena.net` (Fastify, co-located) + Redis.
3. Google auth (§6) + profile provisioning end-to-end on `play`.
4. Join-ticket flow (§9): api mints → game verifies — closes the unpaid-socket hole early.
5. Phaser client with prediction/interpolation + reconnect.
6. Paystack charge + webhook; results write at match end to Supabase (EU).
7. Headless bots → 20-player load test in `jnb`.
8. Admin + payout (Transfers API).

---

## 19. Art & assets

**Decision: we do not create custom graphics for the MVP.** Ship with programmer-art primitives → a free CC0 asset pack; commission bespoke art only after traction. Visual direction (dark/neon, simple avatars, clean map) is GDD §19; gameplay shapes/sizes are GDD §21.

### 18.1 Asset inventory

- **In-game (Phaser):** player sprite (rotates to aim), projectile, 3 power-up icons (health/speed/shield), Strike Zone tileset (floor/walls/cover), effects (muzzle flash, hit, elimination, shield bubble, speed trail, spawn-protect blink), spawn/power-up node markers.
- **HUD/UI (React/CSS, not sprite art):** health bar, lives, takedown count, timer, mini-leaderboard, on-screen touch joysticks, active-power-up indicators.
- **Brand:** XP Arena logo + the neon theme.
- **Audio (parallel track):** SFX (fire, hit, elimination, pickup, countdown) + light ambient — sourced the same CC0 way (e.g. Kenney audio).

### 18.2 Sourcing plan (phased — "create" only at the end)

| Phase | Source | Purpose |
|-------|--------|---------|
| **0 — Programmer art** | Phaser primitives (circles = players, dots/lines = projectiles, rects = walls) | Build + tune gameplay/netcode with **zero** art dependency. Primitives map 1:1 to §21 hitboxes → great for debugging. |
| **1 — CC0 pack (MVP look)** | **Kenney.nl** top-down packs (CC0) | "Looks like a game" at ~no cost, cohesive, mobile-friendly, no attribution/licensing risk. **This is the MVP art.** |
| **2 — Bespoke (post-traction)** | Commissioned characters / branded map / skins | Identity + a future monetization lever (skins are in not-in-MVP). |

### 18.3 Licensing
Prefer **CC0** (Kenney) — no attribution required, commercial-safe. Regardless, keep an `ASSETS.md` recording each asset's source + license in the repo. **Avoid AI-generated art on the critical path** — weaker cohesion across a sprite set and commercial-licensing ambiguity for a paid product.

### 18.4 Mobile asset pipeline (ties to §11)
Pack sprites into **texture atlases / sprite sheets**; compress (WebP where supported, else PNG); **lazy-load the Phaser scene + atlases only on `/strikeout`**, never on marketing; immutable content-hashed filenames + PWA cache so returning players re-download almost nothing. Keep the initial play-route bundle within the per-client data budget (metered NG data).

### 18.5 Player differentiation (a requirement, not decoration)
In a 20-player top-down FFA, telling players apart matters more than sprite fidelity. Required from day one (works even with primitives): a palette of **≥20 visually distinct colors/tints**, a **gamer-tag label** above each sprite, and a clear **"you" indicator** (outline/arrow). This is a design rule the client must implement regardless of art phase.
