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
- **Platform:** Mobile web first
- **Session Length:** 3–5 minutes
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
2. Signup/login
3. Player profile/gamer tag
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
