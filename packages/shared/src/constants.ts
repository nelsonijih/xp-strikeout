// Gameplay constants — GDD §21 (code-ready spec). Values marked "tune" in the GDD.
// Single source of truth shared by client (prediction) and server (authority).

export const WORLD = {
  width: 1600,
  height: 1200,
  tickHz: 30,
  tickMs: 1000 / 30,
  broadcastHz: 15,
} as const;

export const PLAYER = {
  maxHealth: 100,
  lives: 3,
  damagePerHit: 25, // 4 hits = takedown
  hitboxRadius: 24,
  moveSpeed: 220, // px/s
  respawnDelayMs: 3000,
  spawnProtectionMs: 2000,
} as const;

export const BLASTER = {
  damage: 25,
  fireCooldownMs: 350,
  projectileSpeed: 600, // px/s
  projectileMaxRange: 700, // px
  projectileLifetimeMs: 1500,
  projectileRadius: 6,
  muzzleOffset: 30,
} as const;

export const MATCH = {
  minPlayers: 6,
  maxPlayers: 20,
  countdownMs: 10_000,
  // Full match is 300s (GDD §21.7); overridable via env for dev/tests/bots.
  durationMs: 300_000,
} as const;

export const ENTRY_FEE_NAIRA = 2000;
export const POOL_SPLIT = { platformPct: 20, takedownPct: 70, survivalPct: 10 } as const;
