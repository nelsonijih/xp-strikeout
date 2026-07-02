import { Room, Client } from "@colyseus/core";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import {
  WORLD,
  PLAYER,
  BLASTER,
  MoveInput,
  ShootInput,
  normalize,
  clampToArena,
  circleHit,
  type FinalizePayload,
} from "@xp/shared";
import { RoomState, Player, Projectile } from "../state";
import { config } from "../config";
import { redis, burnNonce } from "../redis";
import { markMatchStarted, submitFinalize } from "../apiClient";

const SPAWNS = [
  { x: 200, y: 200 },
  { x: 1400, y: 200 },
  { x: 200, y: 1000 },
  { x: 1400, y: 1000 },
  { x: 800, y: 600 },
];

const COUNTDOWN_MS = 3000; // short for dev/bots; §21.7 real value is 10000

type Auth = { userId: string; gamerTag: string };

export class StrikeOutRoom extends Room<RoomState> {
  maxClients = 20;
  private inputs = new Map<string, { dx: number; dy: number }>();
  private connectedUsers = new Set<string>();
  private started = false;
  private ended = false;

  onCreate(options: any) {
    this.setState(new RoomState());
    this.state.matchId = options?.matchId ?? "";
    this.state.timeLeftMs = config.matchDurationMs;
    this.setPatchRate(1000 / WORLD.broadcastHz);
    this.setSimulationInterval((dt) => this.update(dt), WORLD.tickMs);

    this.onMessage("move", (client, raw) => {
      const p = MoveInput.safeParse(raw);
      if (!p.success) return;
      this.inputs.set(client.sessionId, { dx: p.data.dx, dy: p.data.dy });
    });

    this.onMessage("shoot", (client, raw) => {
      const p = ShootInput.safeParse(raw);
      if (!p.success) return;
      this.tryShoot(client.sessionId, p.data.ax, p.data.ay);
    });
  }

  // ── Admission: verify + burn the single-use join ticket (§9). No ticket, no entry.
  async onAuth(_client: Client, options: any): Promise<Auth> {
    const token: string = options?.token ?? "";
    let claims: any;
    try {
      claims = jwt.verify(token, config.joinTicketSecret, {
        algorithms: ["HS256"],
        clockTolerance: config.joinTicketSkewSec,
      });
    } catch {
      throw new Error("invalid ticket");
    }
    if (claims.iss !== "api.xparena.net" || claims.aud !== "game.xparena.net")
      throw new Error("bad ticket audience");
    if (claims.paid !== true) throw new Error("unpaid");
    if (claims.match_id !== this.state.matchId && this.state.matchId !== "")
      throw new Error("wrong match");
    if (this.connectedUsers.has(claims.sub)) throw new Error("already connected");

    // Burn the nonce atomically (single-region Redis §9.1). DEL must return 1.
    const burned = await burnNonce(claims.jti);
    if (!burned) throw new Error("ticket already used");

    return { userId: claims.sub, gamerTag: claims.gamer_tag ?? "player" };
  }

  onJoin(client: Client, _options: any, authData?: unknown) {
    const auth = authData as Auth;
    this.connectedUsers.add(auth.userId);
    const p = new Player();
    p.userId = auth.userId;
    p.gamerTag = auth.gamerTag;
    const spawn = SPAWNS[this.state.players.size % SPAWNS.length];
    p.x = spawn.x;
    p.y = spawn.y;
    p.spawnProtectUntilMs = Date.now() + PLAYER.spawnProtectionMs;
    this.state.players.set(client.sessionId, p);

    if (!this.started && this.state.players.size >= 2) this.scheduleStart();
  }

  onLeave(client: Client) {
    const p = this.state.players.get(client.sessionId);
    if (p) this.connectedUsers.delete(p.userId);
    this.inputs.delete(client.sessionId);
    // M1: no reconnect; player simply leaves. (Reconnect-into-match is M3.)
    this.state.players.delete(client.sessionId);
  }

  private scheduleStart() {
    this.started = true;
    this.state.phase = "countdown";
    this.clock.setTimeout(() => {
      this.state.phase = "active";
      this.state.timeLeftMs = config.matchDurationMs;
      markMatchStarted(this.state.matchId);
    }, COUNTDOWN_MS);
  }

  private tryShoot(sessionId: string, ax: number, ay: number) {
    if (this.state.phase !== "active") return;
    const p = this.state.players.get(sessionId);
    if (!p || !p.alive) return;
    const now = Date.now();
    if (now - p.lastFireMs < BLASTER.fireCooldownMs) return;
    p.lastFireMs = now;

    const dir = normalize(ax, ay);
    if (dir.x === 0 && dir.y === 0) return;
    const proj = new Projectile();
    proj.id = randomUUID();
    proj.ownerId = sessionId;
    proj.x = p.x + dir.x * BLASTER.muzzleOffset;
    proj.y = p.y + dir.y * BLASTER.muzzleOffset;
    proj.vx = dir.x * BLASTER.projectileSpeed;
    proj.vy = dir.y * BLASTER.projectileSpeed;
    proj.bornMs = now;
    this.state.projectiles.set(proj.id, proj);
  }

  // ── Authoritative tick (30 Hz). All truth decided here. ─────────────────────
  private update(dtMs: number) {
    if (this.state.phase !== "active" || this.ended) return;
    const dt = dtMs / 1000;
    const now = Date.now();

    // Movement
    for (const [sid, p] of this.state.players) {
      if (!p.alive) {
        if (p.respawnAtMs && now >= p.respawnAtMs) this.respawn(p);
        continue;
      }
      const inp = this.inputs.get(sid);
      if (inp) {
        const dir = normalize(inp.dx, inp.dy);
        const np = clampToArena(p.x + dir.x * PLAYER.moveSpeed * dt, p.y + dir.y * PLAYER.moveSpeed * dt);
        p.x = np.x;
        p.y = np.y;
      }
    }

    // Projectiles + collisions
    for (const [id, proj] of this.state.projectiles) {
      const stepX = proj.vx * dt;
      const stepY = proj.vy * dt;
      proj.x += stepX;
      proj.y += stepY;
      proj.travelled += Math.hypot(stepX, stepY);

      const expired =
        proj.travelled > BLASTER.projectileMaxRange ||
        now - proj.bornMs > BLASTER.projectileLifetimeMs ||
        proj.x < 0 || proj.x > WORLD.width || proj.y < 0 || proj.y > WORLD.height;
      if (expired) {
        this.state.projectiles.delete(id);
        continue;
      }

      for (const [sid, target] of this.state.players) {
        if (!target.alive) continue;
        if (sid === proj.ownerId) continue;
        if (now < target.spawnProtectUntilMs) continue;
        if (circleHit(proj.x, proj.y, BLASTER.projectileRadius, target.x, target.y, PLAYER.hitboxRadius)) {
          this.applyDamage(proj.ownerId, target);
          this.state.projectiles.delete(id);
          break;
        }
      }
    }

    // Timer + end conditions
    this.state.timeLeftMs -= dtMs;
    const withLives = [...this.state.players.values()].filter((p) => p.lives > 0);
    if (this.state.timeLeftMs <= 0 || withLives.length <= 1) this.endMatch();
  }

  private applyDamage(attackerSessionId: string, target: Player) {
    target.health -= BLASTER.damage;
    if (target.health > 0) return;

    // Elimination
    target.alive = false;
    target.deaths += 1;
    target.lives -= 1;
    const attacker = this.state.players.get(attackerSessionId);
    if (attacker) attacker.takedowns += 1;

    if (target.lives > 0) {
      target.respawnAtMs = Date.now() + PLAYER.respawnDelayMs;
    } else {
      target.respawnAtMs = 0; // spectator
    }
  }

  private respawn(p: Player) {
    const spawn = SPAWNS[Math.floor(Math.random() * SPAWNS.length)];
    p.x = spawn.x;
    p.y = spawn.y;
    p.health = PLAYER.maxHealth;
    p.alive = true;
    p.respawnAtMs = 0;
    p.spawnProtectUntilMs = Date.now() + PLAYER.spawnProtectionMs;
  }

  private async endMatch() {
    if (this.ended) return;
    this.ended = true;
    this.state.phase = "ended";

    // Compute results once, then submit to api (durable, idempotent §8.1).
    const byUser = new Map<string, { takedowns: number; deaths: number }>();
    for (const p of this.state.players.values()) {
      const cur = byUser.get(p.userId) ?? { takedowns: 0, deaths: 0 };
      cur.takedowns += p.takedowns;
      cur.deaths += p.deaths;
      byUser.set(p.userId, cur);
    }
    const players = [...byUser.entries()].map(([user_id, v]) => ({ user_id, ...v }));
    const payload: FinalizePayload = {
      match_id: this.state.matchId,
      total_takedowns: players.reduce((s, p) => s + p.takedowns, 0),
      players,
    };

    const ok = await submitFinalize(payload);
    if (!ok) console.error(`[room] finalize failed for match ${this.state.matchId} — reconciler will void`);

    this.broadcast("match_ended", { match_id: this.state.matchId });
    this.disconnect();
  }
}
