# XP StrikeOut — Micro Game Design Document

## Subtitle

**Every takedown pays. Last player standing wins extra.**

## 1. Game Summary

**XP StrikeOut** is a mobile browser-based 2D top-down arena shooter built by XP Arena.

Players enter short multiplayer matches, move around a small arena, shoot projectiles, earn money from verified takedowns, and compete for the “Last Player Standing” prize.

## 2. MVP Game Type

- **Game Title:** XP StrikeOut
- **Brand:** by XP Arena
- **Genre:** 2D top-down multiplayer arena shooter
- **Platform:** Mobile web (browser) first — native app deferred until the MVP proves traction; players use the mobile browser for now
- **Session Length:** 5 minutes (300 s active) — see §21.7
- **Players Per Match:** 10–20 players
- **Camera:** Top-down camera following player
- **Match Style:** Free-for-all

## 3. Core Gameplay Loop

1. Player joins an XP StrikeOut match.
2. Player spawns in the arena.
3. Player moves, aims, and shoots.
4. Player tries to take down other players.
5. Each verified takedown adds to their payout.
6. Eliminated players respawn if they have lives remaining.
7. Players with no lives become spectators.
8. Match ends when timer expires or one player remains.
9. Final leaderboard shows takedowns, deaths, survival rank, takedown earnings, last player standing prize, and total payout.

## 4. Recommended MVP Mode

### Mode Name: StrikeOut Rush

**StrikeOut Rush** is the first game mode inside XP StrikeOut.

Rules:

- 20 players max
- 5-minute match
- Free-for-all
- Players have 3 lives
- Each verified takedown pays from the takedown pool
- Last player alive wins the survival prize
- If more than one player is alive when timer ends, the survival prize goes to the player with:
  1. most remaining lives
  2. highest takedowns
  3. lowest deaths
  4. earliest final takedown

## 5. Why 3 Lives

Unlimited respawn creates more takedowns, but weakens the last-player-standing prize. One life creates too much waiting for eliminated players.

**3 lives is the MVP sweet spot** because players get multiple chances, takedowns still matter, survival still matters, last player standing is meaningful, and matches stay short.

## 6. Player Controls

### Mobile Controls

- Left joystick: move
- Right joystick: aim direction
- Auto-fire when aiming

This is easier than requiring precise tap shooting on small phones.

### Desktop Controls for Testing

- WASD / arrow keys: move
- Mouse: aim
- Left click: shoot

Desktop support is mainly for internal testing and admin demos.

## 7. Player Stats

Each player has:

- Health: 100 HP
- Lives: 3
- Movement speed: standard
- Weapon: standard blaster
- Ammo: unlimited
- Fire rate: controlled cooldown
- Damage per hit: 25 HP
- Hits to eliminate: 4 hits

## 8. Weapon Design

### MVP Weapon: Standard Blaster

- Projectile-based
- Medium speed
- Medium range
- 25 damage per hit
- 4 hits = takedown
- Cooldown prevents spam
- Projectiles disappear after hitting wall/player or after max range

Only one weapon should exist in the MVP. This keeps the game fair, easy to understand, and easier to balance.

## 9. Power-Ups

MVP should include only 2–3 power-ups.

### Health Boost

- Restores 40 HP
- Cannot exceed max health
- Spawns randomly on map

### Speed Boost

- Temporary movement speed increase
- Lasts 5 seconds

### Shield

- Blocks first incoming hit
- Lasts until used or expires after 8 seconds

## 10. Map Design

### MVP Map: Strike Zone

The first map should be simple:

- Rectangular or square arena
- Obstacles/walls for cover
- Open center area for action
- Side corridors for movement
- 4–6 spawn points
- 3–5 power-up spawn points

Design goals:

- Players should encounter action within 5–10 seconds.
- There should be enough cover to avoid pure chaos.
- No hiding spots that allow players to avoid combat forever.

## 11. Match Rules

### Match Start

- Players enter lobby.
- Match starts when minimum players are reached or admin starts manually.
- Countdown: 10 seconds.
- Players spawn at random spawn points.

### During Match

- Players move, shoot, use cover, and collect power-ups.
- When a player reaches 0 HP:
  - attacker gets 1 takedown
  - eliminated player loses 1 life
  - if player still has lives, they respawn after 3 seconds
  - if no lives remain, they become a spectator

### Match End

Match ends when:

- only one player remains alive, or
- timer reaches 0

Final results are calculated server-side.

## 12. Scoring and Payout Logic

### Entry Fee

- Entry fee: ₦2,000 per player

### Pool Split

- 20%: XP Arena platform fee
- 70%: takedown payout pool
- 10%: Last Player Standing prize

### Takedown Payout

Takedown payout per takedown = takedown payout pool ÷ total verified takedowns

Example:

- 20 players
- ₦2,000 entry
- gross pool = ₦40,000
- XP Arena fee = ₦8,000
- takedown pool = ₦28,000
- survival prize = ₦4,000
- total verified takedowns = 40
- payout per takedown = ₦700

### Player Payout

Player payout = takedown earnings + survival prize if applicable.

Example:

- Player gets 5 takedowns
- payout per takedown = ₦700
- takedown earnings = ₦3,500
- if player is last standing, add ₦4,000
- total payout = ₦7,500

## 13. Anti-Cheat Requirements

Because real money is involved, the server must be authoritative.

The client should never decide:

- takedowns
- damage
- final score
- match winner
- payout

The server must control:

- player position validation
- projectile creation
- projectile collision
- health updates
- takedown confirmation
- match timer
- final leaderboard
- payout calculation

## 14. Suspicious Activity Flags

The system should flag:

- impossible movement speed
- impossible fire rate
- repeated same-player farming
- abnormal takedown rate
- disconnect/reconnect abuse
- multiple accounts from same device/IP
- players not moving but repeatedly being eliminated
- collusion patterns

Flagged matches should require admin review before payout.

## 15. MVP Screens

### Player Screens

1. Landing page
2. Sign in with Google (single tap; no email/password in MVP)
3. Player profile/gamer tag (first-time onboarding)
4. Match lobby
5. Game screen
6. Match result screen
7. Leaderboard
8. Payout status

### Admin Screens

1. Create match
2. View players
3. Start match
4. View live match status
5. View final results
6. Review suspicious flags
7. Approve payouts
8. Export payout list

## 16. MVP Technical Stack

- Next.js + React for website, dashboard, and UI
- Tailwind CSS for styling
- Phaser for the 2D browser game
- Colyseus + Node.js for multiplayer rooms
- Supabase/Postgres for users, matches, results, and payouts
- Vercel for frontend hosting
- Render or Fly.io for game server hosting
- Google Analytics for tracking
- Sentry for error monitoring

## 17. MVP Build Scope

### Must Have

- 2D arena map
- mobile controls
- multiplayer room
- player movement
- shooting/projectiles
- health/lives
- takedown tracking
- final leaderboard
- payout calculation
- admin match control
- server-side result validation

### Should Have

- 2–3 power-ups
- spectator mode
- suspicious activity flags
- player match history
- payout status

### Not Needed for MVP

- native mobile app
- multiple weapons
- skins
- clans
- chat
- ranked matchmaking
- season pass
- crypto
- NFTs
- 3D graphics
- AI bots
- multiple maps

## 18. MVP Success Criteria

The MVP is successful if:

- players understand the rules within 1 minute
- game runs smoothly on common Android phones
- 20-player matches are stable
- takedowns are tracked accurately
- players trust the payout calculation
- at least 30% of players want to play again
- fraud/cheating complaints are manageable
- XP Arena can run matches without heavy manual intervention

## 19. Design Direction

Visual style should match XP Arena:

- dark gaming theme
- neon accent colors
- bold leaderboard UI
- simple character avatars
- clean arena map
- mobile-first layout

The game should feel fast, competitive, and easy to understand.

## 20. MVP Recommendation

Build **XP StrikeOut by XP Arena**, starting with one mode called **StrikeOut Rush**:

- 20 players max
- 3 lives each
- 5-minute match
- one weapon
- one map: Strike Zone
- takedown payouts
- last player standing prize
- admin payout approval

This is the simplest version that supports the business model while staying buildable for an MVP.

---

# 21. Gameplay Constants & Rules (Code-Ready Spec)

> Concrete values so the design is unambiguous to implement. Anything tagged **⚙️ tune** is a starting value to refine in playtest; the rest are design rules. All authority is server-side (see `xp-strikeout-architecture.md` §10).

## 21.1 World & coordinate system

| Constant | Value | Notes |
|---|---|---|
| World units | pixels (logical) | Origin top-left, +x right, +y down |
| Arena size (Strike Zone) | **1600 × 1200** | ⚙️ tune — sized so a crossing takes ~7 s → action in 5–10 s |
| Simulation tick | **30 Hz** (33.3 ms) | Server-authoritative fixed step |
| State broadcast | **15 Hz** | Client interpolates (~100 ms buffer) |
| Lag-comp rewind cap | **250 ms** | Hit validation against shooter's acked view |

## 21.2 Player

| Constant | Value | Notes |
|---|---|---|
| Health / max | **100 / 100** | |
| Lives | **3** | |
| Damage per hit | **25** | → exactly 4 hits = takedown |
| Hitbox | **circle, r = 24 px** | sprite ≈ 48 px |
| Move speed (base) | **220 px/s** | ⚙️ tune — "standard" |
| Player–player collision | **pass-through** | players don't block each other (anti-grief, simpler on mobile); collide with walls only |
| Respawn delay | **3.0 s** | |
| Spawn protection | **2.0 s invulnerable**, broken early if the player fires | blink VFX; prevents spawn-camping in a money game |

## 21.3 Weapon — Standard Blaster

| Constant | Value | Notes |
|---|---|---|
| Damage | **25** | |
| Fire cooldown | **350 ms** | ⚙️ tune — ≈ 2.85 shots/s |
| Projectile speed | **600 px/s** | ⚙️ tune — "medium" |
| Projectile max range | **700 px** (≈ 1.17 s life), hard lifetime cap **1500 ms** | despawns on wall/player/range |
| Projectile hitbox | **circle, r = 6 px** | |
| Muzzle offset | **30 px** along aim from player center | so you never hit yourself |
| Self-damage | **none** | |
| Friendly fire | **N/A** (FFA — everyone is hostile) | |

## 21.4 Controls & aiming

| Rule | Value | Notes |
|---|---|---|
| Left stick (move) | analog 360°, **15% dead-zone**; magnitude scales speed up to base max | |
| Right stick (aim) | analog 360°, **20% dead-zone** | |
| Auto-fire | fires **continuously while the aim stick is held** past dead-zone, gated by cooldown; stops on release | |
| Aim assist | **none** for MVP | keep it fair + server-authoritative |
| Desktop (test) | WASD move, mouse aim, hold/click to fire | internal only |

## 21.5 Power-ups

| Constant | Value | Notes |
|---|---|---|
| Spawn nodes | **3–5 fixed** map locations | |
| Initial spawn | at match start | |
| Respawn after pickup | **15 s** at that node | ⚙️ tune |
| Pickup | walk over (pickup radius **28 px**) | |
| **Health Boost** | +40 HP, capped at 100 | |
| **Speed Boost** | **1.5×** move speed (→ 330 px/s), **5 s** | re-pickup refreshes timer, no stacking of magnitude |
| **Shield** | absorbs the **next 1 incoming hit** in full, else expires after **8 s** | one shield at a time |
| Stacking | **different** power-ups may be active at once (e.g. Speed + Shield); **same** type refreshes, never stacks magnitude | |

## 21.6 Spawning

| Rule | Value |
|---|---|
| Spawn points | **4–6** fixed |
| Start spawn | random among spawn points |
| Respawn selection | choose the spawn point with **max distance to the nearest living player** (anti spawn-camp) |

## 21.7 Match timing & flow

| Constant | Value |
|---|---|
| Players | min **6** to auto-start (admin may start manually), max **20** |
| Countdown | **10 s** |
| Active duration | **300 s** (5:00) |
| End conditions | **≤ 1 player alive** OR **timer = 0** |
| Survival tiebreak (multiple alive at timer) | most lives → most takedowns → fewest deaths → earliest final takedown → **if still fully tied, split the survival prize equally** |

## 21.8 Spectator (out of lives)

- Becomes spectator; **follow-only camera** (auto-follows the match leader or own last attacker) — **no free pan**, to limit ghosting/collusion (see TDD Appendix A.6).

## 21.9 Disconnect during match

- Character idles in place and remains **vulnerable** for **10 s**; reconnect within the window resumes (architecture §10, §9).
- After 10 s → marked disconnected, removed from play, remaining lives forfeit. Verified takedowns already earned still count and remain payable (TDD A.2).

## 21.10 Edge cases (must be deterministic)

| Case | Rule |
|---|---|
| Last two players die on the same tick | Match ends with no sole survivor; survival prize resolved by 21.7 tiebreak between them (likely split). |
| Takedown lands on the buzzer | Damage for the final tick resolves **before** the timer-end check, so a kill at 0:00 counts. |
| Projectiles in flight at match end | Discarded after the final tick; no post-buzzer kills. |
| Player reaches 0 HP from two attackers same tick | Takedown credited to the hit processed first in tick order (deterministic by projectile id); the other gets an assist if assists are enabled. |

## 21.11 Assist (optional for MVP)

- If another player dealt damage to the eliminated player within the **last 5 s**, they get +1 assist. Assists are tracked but **do not pay** in MVP (display only).
