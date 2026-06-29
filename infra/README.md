# XP StrikeOut — Infra

Starter Fly.io configs for the two always-on, Lagos-proximate services. Full rationale in
[`../design-docs/xp-strikeout-architecture.md`](../design-docs/xp-strikeout-architecture.md).

| File | App | Subdomain | Region |
|------|-----|-----------|--------|
| `fly.game.toml` | `xp-strikeout-game` | `game.xparena.net` | `jnb` (Johannesburg) |
| `fly.api.toml`  | `xp-strikeout-api`  | `api.xparena.net`  | `jnb` |

`play.*` and `xparena.net/strikeout` and `admin.*` deploy on **Vercel** (not Fly) — see the architecture doc.

## Before you deploy
1. **Region spike (do first):** measure RTT + packet loss from real NG handsets on MTN/Glo/Airtel/9mobile to `jnb` vs a London region. Confirm `jnb` wins on the median, then lock it.
2. Create the apps: `fly apps create xp-strikeout-game` / `xp-strikeout-api`.
3. Set secrets (see header comments in each `.toml`). `JOIN_TICKET_SECRET` must be **identical** on both apps.
4. Point DNS: `game.xparena.net` / `api.xparena.net` → the Fly apps (`fly certs add ...`).

## Key operational notes
- **Never auto-stop the game machine** (`auto_stop_machines = false`): a stopped machine kills live matches.
- **Graceful drain on deploy:** the game server must flip `/health` to 503 on SIGTERM (stop taking new rooms), let active matches finish, then exit. `kill_timeout = 600s` covers a 5-min match + results write. Bluegreen stands up new machines before draining old ones.
- **Scaling the game server:** enable the Colyseus Redis presence/driver, then `fly scale count 2 --region jnb`. Keep all machines in `jnb` for MVP.
- **Join tickets:** the API mints, the game server verifies — see [`../design-docs/xp-strikeout-architecture.md`](../design-docs/xp-strikeout-architecture.md) §9 (Join ticket — room admission).
