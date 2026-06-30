# XP StrikeOut — Infra

Local dev/test stack + starter Fly.io configs for the two always-on, Lagos-proximate services.
Full rationale in [`../design-docs/xp-strikeout-architecture.md`](../design-docs/xp-strikeout-architecture.md).

| File | Purpose |
|------|---------|
| `docker-compose.yml` | **Local stack** — postgres + redis + api + game (+ optional `bots`) |
| `fly.game.toml` | Deploy `game.xparena.net` (Colyseus) → Fly `jnb` (Johannesburg) |
| `fly.api.toml`  | Deploy `api.xparena.net` → Fly `jnb` |

`play.*`, `xparena.net/games`, and `admin.*` deploy on **Vercel** (not Fly) — see the architecture doc.

## Local development (Docker Compose) — §16

```bash
docker compose -f infra/docker-compose.yml up --build               # postgres + redis + api + game
docker compose -f infra/docker-compose.yml --profile bots up --build # + 20 simulated players (full-match test)
```
- Web apps run on the host (`npm run dev`) against `http://localhost:8080` / `ws://localhost:2567`.
- **Auth:** `DEV_AUTH_BYPASS=true` mints Supabase-shaped JWTs locally (fast loop / CI). For the real Google-OAuth path, run the **Supabase CLI** (`supabase start`) instead.
- **Payments:** Paystack test-mode keys; tunnel (`cloudflared`/`ngrok`) or a dev "simulate webhook" route to drive `payment_status=paid`.
- `JOIN_TICKET_SECRET` must be **identical** on `api` and `game` (it is in the compose file).
- Same compose is intended for **CI** integration/load tests (a 20-bot match) before anything touches Fly/Supabase.
- **Parity caveat:** reproduces service boundaries/contracts, *not* hosting or region latency — green-locally = logic correct, not prod-ready.

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
