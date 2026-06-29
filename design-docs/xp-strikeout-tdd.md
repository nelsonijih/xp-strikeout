# XP StrikeOut — MVP Technical Design Document

## Subtitle

**Every takedown pays. Last player standing wins extra.**

## 1. Product Summary

**XP StrikeOut** is a mobile browser-based 2D multiplayer arena game built in-house by XP Arena.

Players pay an entry fee, join a short match, earn payouts from verified takedowns, and compete for a “Last Player Standing” prize.

## 2. MVP Technical Goal

Build a stable, mobile-first multiplayer game that supports:

- 10–20 players per match
- 3–5 minute rounds
- server-confirmed movement, damage, takedowns, and results
- live leaderboard
- payout calculation
- admin match control
- anti-cheat flags
- payout review/export

The first version should prioritize reliability, fairness, and fast testing over advanced graphics.

## 3. Recommended Stack

### Frontend / Web App

- Next.js + React
- Tailwind CSS
- Hosted on Vercel

Used for landing page, player signup/login, lobby, leaderboard, results page, and admin dashboard.

### Game Client

- Phaser
- Runs inside the browser
- Mobile-first controls
- Embedded inside Next.js route or loaded as standalone game page

Used for rendering game map, players/projectiles/power-ups, mobile joystick controls, client prediction/interpolation, and audio/visual feedback.

### Multiplayer Server

- Node.js + Colyseus
- Hosted on Render or Fly.io

Used for room creation, match state, player movement validation, projectile simulation, hit detection, damage, takedowns, timer, leaderboard, and final result generation.

### Database / Auth / Storage

- Supabase/Postgres

Used for users, profiles, tournaments, matches, match results, payout records, audit logs, and suspicious activity flags.

### Monitoring

- Google Analytics for funnel tracking
- Sentry for frontend/server errors
- Server logs for match events and fraud review

## 4. High-Level Architecture

### User Flow

1. User visits `xparena.net/strikeout` (marketing) and taps the game title
2. User lands on `play.xparena.net/strikeout`; if no session, signs in with **Google** (Supabase Auth, PKCE redirect — see `xp-strikeout-architecture.md` §6)
3. First-time users pick a gamer tag (onboarding); returning users skip straight to the lobby
4. User joins available match
5. User pays ₦2,000 entry fee
6. User enters match lobby
7. Game server starts match
8. Players compete
9. Server calculates final results
10. Results are saved to Supabase
11. Player sees payout estimate
12. Admin reviews and approves payout

### Subdomain Topology

> Nigerian-first / mobile-first. Full rationale in `xp-strikeout-architecture.md`.
> The realtime server is hosted as close to Lagos as managed hosting allows (**Fly.io Johannesburg `jnb`**); the database lives in Europe but is kept off the gameplay hot path.

| Subdomain | Purpose | Stack | Host / Region | Auth |
|-----------|---------|-------|---------------|------|
| `xparena.net/strikeout` | Marketing, SEO, rules, trust | Next.js SSG/ISR | Vercel (global CDN) | public |
| `play.xparena.net/strikeout` | Game app (lobby + Phaser client) | Next.js + React + Phaser | Vercel | Supabase JWT |
| `game.xparena.net` | Realtime game server (WebSocket) | Node + Colyseus | Fly.io `jnb` | signed join ticket |
| `api.xparena.net` | Matchmaking, payments, results, payouts | Node/Fastify | Fly.io `jnb` (co-located) | Supabase JWT / service role |
| `admin.xparena.net` | Internal admin & payout review | Next.js | Vercel | admin role + IP allowlist |

### System Flow

```text
                         ┌─────────────────────────────┐
   Android / Chrome      │   Vercel CDN (global edge)   │
   (Lagos, mobile data)  │  xparena.net/strikeout (SSG) │
        │                │  play.xparena.net (app+Phaser)│
        │  HTTPS (static, app shell, PWA)                │
        │                └─────────────────────────────┘
        │
        │  REST (auth, join, pay, results)        WebSocket (binary, 10–30 Hz)
        ▼                                              ▼
 ┌───────────────────────┐                  ┌───────────────────────────┐
 │  api.xparena.net       │  signed ticket   │  game.xparena.net          │
 │  Node/Fastify          │ ───────────────► │  Colyseus rooms (Fly jnb)  │
 │  (Fly jnb)             │                  │  server-authoritative sim  │
 └─────────┬──────────────┘                  └─────────────┬─────────────┘
           │                                                │ results at match end only
           │ matchmaking/presence/rate-limit                ▼
           ▼                                   ┌───────────────────────────┐
 ┌───────────────────┐                         │  Supabase Postgres (EU)   │
 │  Redis (Upstash)  │ ◄───────────────────────┤  users, matches, results, │
 │  presence, tickets│                         │  payments, payouts, audit │
 └───────────────────┘                         └─────────────┬─────────────┘
                                                              │
   ┌──────────────────────┐                                  │ webhooks
   │  Paystack (NG)        │ ◄────────────── api ─────────────┘
   │  charge + transfers   │
   └──────────────────────┘
                                       admin.xparena.net (Vercel) ──► api/Supabase
```

**Key property:** the in-match simulation runs entirely in memory in `jnb`. The EU database latency never touches gameplay — the only cross-region hop is the single results write at match end.

## 5. Core Technical Principle

The server must be authoritative.

The client can request actions, but the server decides the truth.

The client should not decide player position, projectile hits, damage, takedowns, survival winner, payout, or final leaderboard.

The server should control movement validation, projectile creation, projectile collision, health and lives, takedown confirmation, match timer, score, and result finalization.

## 6. Core Game Room Design

Each match runs as a Colyseus room.

### Room Config

- max players: 20
- min players: configurable, recommended 6–10
- match duration: 3–5 minutes
- lives per player: 3
- map: one MVP arena called “Strike Zone”
- mode: free-for-all
- entry fee: ₦2,000
- platform fee: 20%
- takedown payout pool: 70%
- survival prize: 10%

### Room States

```text
waiting
countdown
active
ended
results_locked
payout_pending
payout_approved
```

### Room Lifecycle

1. Room created by admin or auto-created
2. Paid players join room
3. Countdown starts
4. Match becomes active
5. Server processes movement, shots, damage, takedowns
6. Match ends by timer or last player alive
7. Results are calculated
8. Results saved to database
9. Admin reviews suspicious flags
10. Payouts approved/exported

## 7. Game Entities

### Player

- user_id
- gamer_tag
- position_x
- position_y
- velocity
- direction
- health
- lives
- takedowns
- deaths
- assists
- active/shielded/dead/spectator
- last_damage_source
- last_damage_time
- suspicious_flags

### Projectile

- projectile_id
- owner_user_id
- position_x
- position_y
- direction
- speed
- damage
- created_at
- expires_at

### Power-Up

- powerup_id
- type
- position_x
- position_y
- active
- spawn_time
- respawn_time

Power-up types:

- health boost
- speed boost
- shield

### Match Result

- match_id
- user_id
- takedowns
- deaths
- assists
- survival_rank
- was_last_standing
- takedown_earnings
- survival_prize
- total_payout
- flagged_for_review

## 8. Gameplay Mechanics

### Movement

Client sends movement input:

- direction
- timestamp
- sequence number

Server validates:

- max speed
- map boundaries
- wall collision
- impossible movement

### Shooting

Client sends shoot input:

- aim direction
- timestamp
- sequence number

Server validates:

- fire cooldown
- player alive status
- projectile spawn point
- projectile direction

Server creates projectile and updates room state.

### Damage

Projectile collision is processed server-side.

When projectile hits player:

- subtract health
- record attacker
- record timestamp
- destroy projectile

### Takedown

If health reaches 0:

- attacker receives 1 takedown
- eliminated player loses 1 life
- eliminated player receives 1 death
- player respawns after 3 seconds if lives remain
- player becomes spectator if no lives remain

### Assist

Assist can be added later, but optional for MVP.

Simple MVP assist rule: if another player damaged the eliminated player within the last 5 seconds, they receive 1 assist.

## 9. Payout Logic

### Entry Fee

- ₦2,000 per player

### Pool Calculation

For each match:

```text
gross_pool = total_paid_players × 2000
xp_arena_fee = gross_pool × 20%
takedown_pool = gross_pool × 70%
survival_prize = gross_pool × 10%
```

### Takedown Value

```text
payout_per_takedown = takedown_pool ÷ total_verified_takedowns
```

### Player Payout

```text
player_takedown_earnings = player_takedowns × payout_per_takedown
player_total_payout = player_takedown_earnings + survival_prize_if_last_standing
```

### Edge Cases

If total takedowns = 0, the match is voided and replayed.

If players disconnect:

- disconnected players lose active control
- their character may remain idle for 10 seconds
- after timeout, they are marked disconnected
- no refund by default unless server fault is confirmed

## 10. Database Schema

### users

`id` equals the Supabase `auth.users` id (`auth.uid()`); row is auto-provisioned on first Google sign-in via a trigger. See `xp-strikeout-architecture.md` §13.

```sql
id uuid primary key      -- = auth.uid()
name text
phone text               -- nullable; collected later at payout/KYC, not at signup
email text
email_verified boolean default false
provider text            -- 'google' (future: 'apple','email')
provider_sub text        -- Google `sub`, stable per-account id
avatar_url text
role text                -- 'player' | 'admin'
last_login_at timestamp
created_at timestamp
```

### player_profiles

```sql
id uuid primary key
user_id uuid
gamer_tag text
avatar_url text
total_matches int
total_takedowns int
total_earnings numeric
created_at timestamp
```

### tournaments

```sql
id uuid primary key
name text
status text
entry_fee numeric
platform_fee_percent numeric
takedown_pool_percent numeric
survival_prize_percent numeric
start_time timestamp
created_at timestamp
```

### matches

```sql
id uuid primary key
tournament_id uuid
room_id text
status text
max_players int
min_players int
started_at timestamp
ended_at timestamp
gross_pool numeric
platform_fee numeric
takedown_pool numeric
survival_prize numeric
total_takedowns int
payout_per_takedown numeric
created_at timestamp
```

### match_players

```sql
id uuid primary key
match_id uuid
user_id uuid
payment_status text
join_status text
takedowns int
deaths int
assists int
survival_rank int
was_last_standing boolean
takedown_earnings numeric
survival_prize_earnings numeric
total_payout numeric
flagged_for_review boolean
created_at timestamp
```

### payments

```sql
id uuid primary key
user_id uuid
match_id uuid
amount numeric
provider text
provider_reference text
status text
created_at timestamp
```

### payout_records

```sql
id uuid primary key
user_id uuid
match_id uuid
amount numeric
status text
approved_by uuid
approved_at timestamp
paid_at timestamp
payment_note text
created_at timestamp
```

### suspicious_flags

```sql
id uuid primary key
match_id uuid
user_id uuid
flag_type text
severity text
details jsonb
review_status text
created_at timestamp
```

### audit_logs

```sql
id uuid primary key
actor_user_id uuid
action text
entity_type text
entity_id text
metadata jsonb
created_at timestamp
```

## 11. API / Server Events

### Web App API

```text
POST /api/auth/profile
GET /api/tournaments/active
POST /api/matches/join
GET /api/matches/:id
GET /api/matches/:id/results
GET /api/leaderboard
POST /api/admin/matches/create
POST /api/admin/matches/:id/start
POST /api/admin/payouts/:id/approve
GET /api/admin/payouts/export
```

### Colyseus Client Events

Client sends:

```text
join_room
player_input_move
player_input_shoot
player_ready
ping
```

Server broadcasts:

```text
room_state
match_countdown
match_started
player_spawned
projectile_created
player_hit
player_eliminated
player_respawned
leaderboard_updated
match_ended
results_ready
```

## 12. Anti-Cheat / Fairness

### MVP Anti-Cheat Rules

Flag:

- movement faster than allowed
- fire rate faster than allowed
- impossible projectile direction changes
- repeated same-player takedown farming
- unusual takedown rate
- repeated disconnect/reconnect behavior
- multiple accounts on same device/IP
- suspiciously low movement with repeated deaths

### Device / Session Tracking

Track:

- user ID
- session ID
- IP address
- browser user agent
- device fingerprint where legally appropriate
- match connection logs

### Payout Safety

Any flagged match or player should move to `payout_pending_review`. Admin must approve before payout.

## 13. Admin Dashboard Requirements

Admin should be able to:

- create match
- set entry fee
- set player limit
- view paid players
- start match
- watch live match status
- view final leaderboard
- view suspicious flags
- approve or hold payouts
- export payout list
- mark payouts as paid

## 14. Player Screens

### Landing Page

- product explanation
- “Every takedown pays”
- join CTA
- rules summary

### Signup / Profile

- name
- phone
- gamer tag

### Match Lobby

- entry fee
- prize split
- number of players joined
- rules
- start countdown

### Game Screen

- player health
- lives
- takedown count
- timer
- mini leaderboard
- controls

### Results Screen

- takedowns
- payout per takedown
- survival winner
- total payout
- payout status

### Leaderboard

- match leaderboard
- weekly leaderboard
- all-time leaderboard later

## 15. Deployment Architecture

### Frontend

- Vercel
- environment variables for Supabase, API, game server URL

### Game Server

- Render or Fly.io
- Node.js service
- WebSocket support
- autoscaling later, not required for MVP

### Database

- Supabase Postgres
- row-level security for user data
- admin-only access for payout/admin tables

### Monitoring

- Sentry for frontend and backend
- server logs for room events
- analytics events for funnel tracking

## 16. Analytics Events

```text
xp_strikeout_landing_page_view
signup_started
signup_completed
match_join_clicked
payment_started
payment_completed
lobby_joined
match_started
match_completed
results_viewed
payout_claimed
player_returned
```

## 17. MVP Milestones

### Milestone 1: Web Shell

- landing page
- auth/profile
- dashboard layout
- admin layout

### Milestone 2: Game Prototype

- Phaser map
- player movement
- projectiles
- health/lives
- local test mode

### Milestone 3: Multiplayer

- Colyseus room
- 10–20 players
- synced movement
- server-side shooting/damage
- match timer

### Milestone 4: Results and Database

- save match results
- calculate pool split
- show results screen
- leaderboard

### Milestone 5: Admin and Payout Review

- create/start match
- review flags
- approve payouts
- export payout list

### Milestone 6: Controlled MVP Test

- 20-player match
- ₦2,000 entry
- payout calculation
- admin review
- player feedback

## 18. Technical Risks

### Latency

Mobile browser connections may be unstable. Start with 10 players and scale to 20 after stability testing.

### Cheating

Money increases cheating attempts. Server authority is non-negotiable.

### Payment Disputes

Players may dispute results. Keep detailed logs for every match.

### Browser Compatibility

Test on common Android devices and browsers first.

### Server Cost

MVP server cost should be low, but WebSocket hosting must be stable.

## 19. Not Included in MVP

Do not build yet:

- native mobile app
- crypto/NFT/token
- multiple maps
- multiple weapons
- skins
- clans
- chat
- ranked matchmaking
- automated bank payouts
- complex matchmaking
- AI bots

## 20. MVP Definition of Done

The MVP is ready for controlled testing when:

- 10–20 players can join one match
- match starts and ends correctly
- server confirms all takedowns
- final payout calculation is accurate
- results save to Supabase
- admin can review and approve payouts
- players can see final results
- suspicious activity can be flagged
- match is stable on common Android phones

## 21. Recommended First Build

Build one game and one mode:

- **Game:** XP StrikeOut by XP Arena
- **Mode:** StrikeOut Rush

MVP settings:

- 20 players max
- 3 lives each
- 5-minute match
- one weapon
- one map: Strike Zone
- takedown payouts
- last player standing prize
- admin payout approval

This gives XP Arena the simplest technical foundation to test whether players understand, trust, and replay the XP StrikeOut format.

---

# Appendix A — Gaps, Risks & Backlog

> Open risks and not-yet-specified areas, prioritised. Architecture-level items (auth, join ticket, netcode, regions) are already designed in `xp-strikeout-architecture.md`; this appendix tracks what remains.
>
> **Priority:** 🔴 P0 blocker · 🟠 P1 high · 🟡 P2 medium.

## A.1 Legal, compliance & trust 🔴 P0

Real money is pooled and redistributed minus a house cut → assessed as gaming/betting regardless of skill element.

| # | Gap | Action |
|---|-----|--------|
| 1.1 | No regulatory position | Legal opinion on skill-gaming vs betting under NG federal (NLRC) + state (e.g. Lagos LSLGA) rules **before** payout code; document licensing path. |
| 1.2 | No age gate | Hard 18+ gate at signup; store `date_of_birth`, block under-18. |
| 1.3 | No KYC/AML | Identity verification before *payout* (BVN/phone match common in NG). Also the strongest anti-multi-account defense. |
| 1.4 | No responsible-gaming controls | Daily entry/loss cap, self-exclusion flag, cool-down. |
| 1.5 | No tax handling | Decide withholding on winnings + platform tax; keep records. |

```sql
-- users (add)
date_of_birth date
kyc_status text         -- unverified | pending | verified | rejected
kyc_reference text
self_excluded_until timestamp

-- new table: responsible_gaming_limits
id uuid primary key
user_id uuid
daily_entry_limit_naira numeric
daily_loss_limit_naira numeric
updated_at timestamp
```

## A.2 Payment, refund & payout correctness 🔴 P0

The `payments` / `payout_records` tables exist but flow, edge cases, and money math are undefined.

- **Capture:** Paystack (primary). Charge **at join into an escrow/holding state**, consumed only when the match starts. Idempotent on `provider_reference`.
- **Refund / void policy:**

| Scenario | Policy |
|----------|--------|
| Match never reaches min players | Full auto-refund, void |
| Server crash before `active` | Full auto-refund |
| Server crash mid-match | Void + refund |
| `total_verified_takedowns = 0` | Void + replay; auto-refund if not replayed |
| Paid but client failed to join | Auto-refund that player |
| Voluntary disconnect | No refund |

- **Payout rounding:** `payout_per_takedown = takedown_pool ÷ total_verified_takedowns` rarely divides evenly. Round **down** to ₦1; remainder rolls into platform fee (or survival winner — pick one). Invariant: `sum(payouts) + platform_fee + remainder == gross_pool` exactly.
- **Disconnect & denominator:** a disconnected player's verified takedowns **still count** and remain payable (pending KYC).
- **Integrity:** compute results **once** at `results_locked`; all payout writes in a single DB transaction; `numeric`, never floats.

## A.3 Anti-cheat depth 🟠 P1

The flag list is a list, not a system.
- **Protocol-level bots:** Phaser client is inspectable JS; a headless client can send *legal* inputs to Colyseus. Server-authority doesn't stop input-level aimbots → add input-rate sanity, aim-snap/pattern detection, reaction-time outlier analysis.
- **Fingerprint weakness:** browser fingerprinting is defeated by incognito/VPN → a *signal*, not a gate; pair with KYC (A.1.3).
- **Thresholds:** every flag needs concrete numbers + severity:

```yaml
anti_cheat_thresholds:
  impossible_movement_speed: { max_units_per_sec: <MAX>, severity: high }
  impossible_fire_rate:      { min_cooldown_ms: <CD>,   severity: high }
  abnormal_takedown_rate:    { max_per_minute: <N>,     severity: medium }
  same_player_farming:       { max_repeat_takedowns_same_victim: <N>, severity: medium }
  reaction_time_outlier:     { min_human_ms: 120,       severity: medium }
```

## A.4 Liquidity & lobby filling 🟠 P1

Needs 6–20 paying players online at once — empty lobbies are the #1 killer of real-money skill games.
- **Scheduled match windows** (e.g. every 15 min) + notify when a lobby is filling, vs always-on empty rooms.
- Explicit **under-fill behavior**: fill timeout → start at current count or void + refund (A.2).
- Reconcile min-player count (see A.8).

## A.5 New-player experience & fairness 🟠 P1

- **Free/practice mode.** Paying ₦2,000 before feeling the controls = instant churn. Add a free practice arena vs internal test bots (also needed for A.7). Contradicts "no AI bots in MVP" → allow **internal/practice bots only**, never in paid matches.
- **Shark-vs-minnow.** No SBMM → skilled players farm newcomers; most in a 20-player FFA get 0–2 takedowns and leave net-negative. Mitigate: a **low-stakes tier** (₦200–₦500) + an honest "average win rate" stat. Flag SBMM as a fast-follow.

## A.6 Gameplay tuning tension 🟡 P2

- **Timer vs survival.** 3 lives × 20 players = 60 lives; most 5-min matches end on the **timer**, so the survival prize goes to the tiebreaker "most remaining lives" — which **rewards camping**, contradicting "no hiding forever." Consider shrinking play-area / sudden-death in the final minute, or an aggression-rewarding tiebreaker.
- **Spectator ghosting.** Eliminated players free-looking live players can relay positions over a call (collusion) → delayed/fogged or self-only spectate.
- **Payout dilution.** `value = pool / total_takedowns` dilutes as kills rise — model against multi-account feeder strategies before launch (A.7 economics).

## A.7 Testing, economics & retention 🟡 P2

- **Testing:** DoD wants stable 20-player matches but bans AI bots — you cannot load-test 20 WS clients without simulated clients. Add **internal headless test bots** as a build dependency (doubles as practice opponent, A.5).
- **Unit economics:** 20% gross is eaten by Paystack in-fees (~1.5%), per-payout transfer fees, server/Supabase/Sentry, fraud, manual payout labor → under-filled matches can go negative. Build a per-match P&L model; run player-EV/feeder-exploit math (avg return ~80% of entry; bottom ~80% net-negative).
- **Retention:** only loop is "win money or churn." Add match history (already should-have ✓), progression/levels, daily reward, referrals.

## A.8 Doc consistency 🟡 P2

| Field | GDD | TDD | Action |
|-------|-----|-----|--------|
| Session length | 3–5 min | 3–5 min | Pick one (spec.yaml was 5 min) |
| Min players | — | "6–10" | Pick one (was `min_recommended: 6`) |
| AI bots | not needed | not included | Allow *internal* bots (A.5/A.7) |

*Consistent:* 25 dmg × 4 hits = 100 HP ✓; pool split 20/70/10 ✓.

## A.9 Sequencing

1. 🔴 A.1 Legal + A.2 Money correctness — before payout code.
2. 🟠 A.3 Anti-cheat thresholds (netcode/auth already in architecture).
3. 🟠 A.5 Practice mode + A.7 test bots — onboarding + testability (shared work).
4. 🟠 A.4 Liquidity plan.
5. 🟡 A.6 tuning, A.7 economics/retention — after first controlled test.
