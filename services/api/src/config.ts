// Env + the fail-closed prod guard (architecture §16). Import side-effect runs the guard.

function bool(v: string | undefined): boolean {
  return v === "true" || v === "1";
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 8080),
  databaseUrl: process.env.DATABASE_URL ?? "postgres://xp:xp@localhost:5432/xp_strikeout",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  joinTicketSecret: process.env.JOIN_TICKET_SECRET ?? "dev-only-secret-change-me",
  joinTicketTtlSec: Number(process.env.JOIN_TICKET_TTL_SECONDS ?? 60),
  joinTicketSkewSec: Number(process.env.JOIN_TICKET_SKEW_SECONDS ?? 30),
  internalApiToken: process.env.INTERNAL_API_TOKEN ?? "dev-internal-token-change-me",
  gameWsUrl: process.env.GAME_WS_URL ?? "ws://localhost:2567",
  supabaseJwtSecret: process.env.SUPABASE_JWT_SECRET ?? "dev-jwt-secret",
  devAuthBypass: bool(process.env.DEV_AUTH_BYPASS),
  matchDurationMs: Number(process.env.MATCH_DURATION_MS ?? 300_000),
  // How long a match with no finalize is allowed to sit before reconciliation voids it.
  finalizeTimeoutMs: Number(process.env.FINALIZE_TIMEOUT_MS ?? 60_000),
};

// ── Fail-closed guard: bypass flags must never run in production ──────────────
export function assertProdSafety() {
  if (config.nodeEnv === "production" && config.devAuthBypass) {
    throw new Error(
      "FATAL: DEV_AUTH_BYPASS is enabled while NODE_ENV=production. Refusing to boot (§16)."
    );
  }
}
