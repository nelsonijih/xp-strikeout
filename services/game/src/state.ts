import { Schema, MapSchema, type } from "@colyseus/schema";

export class Player extends Schema {
  @type("string") userId = "";
  @type("string") gamerTag = "";
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") health = 100;
  @type("number") lives = 3;
  @type("number") takedowns = 0;
  @type("number") deaths = 0;
  @type("boolean") alive = true;
  // server-only (not synced): last fire time, spawn-protect until, respawn-at
  lastFireMs = 0;
  spawnProtectUntilMs = 0;
  respawnAtMs = 0;
}

export class Projectile extends Schema {
  @type("string") id = "";
  @type("string") ownerId = "";
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") vx = 0;
  @type("number") vy = 0;
  bornMs = 0;
  travelled = 0;
}

export class RoomState extends Schema {
  @type("string") matchId = "";
  @type("string") phase = "waiting"; // waiting | countdown | active | ended
  @type("number") timeLeftMs = 0;
  @type({ map: Player }) players = new MapSchema<Player>();
  @type({ map: Projectile }) projectiles = new MapSchema<Projectile>();
}
