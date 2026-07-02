function bool(v: string | undefined): boolean {
  return v === "true" || v === "1";
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 2567),
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  joinTicketSecret: process.env.JOIN_TICKET_SECRET ?? "dev-only-secret-change-me",
  joinTicketSkewSec: Number(process.env.JOIN_TICKET_SKEW_SECONDS ?? 30),
  internalApiToken: process.env.INTERNAL_API_TOKEN ?? "dev-internal-token-change-me",
  apiUrl: process.env.API_URL ?? "http://localhost:8080",
  // Short by default so bots/tests finish quickly; prod overrides to 300000 (§21.7).
  matchDurationMs: Number(process.env.MATCH_DURATION_MS ?? 20_000),
  devAuthBypass: bool(process.env.DEV_AUTH_BYPASS),
};

// game holds NO SUPABASE_SERVICE_ROLE_KEY — it never writes the DB (§8.1).
export function assertProdSafety() {
  if (config.nodeEnv === "production" && config.devAuthBypass) {
    throw new Error("FATAL: DEV_AUTH_BYPASS enabled in production. Refusing to boot (§16).");
  }
}
