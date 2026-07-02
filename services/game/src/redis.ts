import Redis from "ioredis";
import { config } from "./config";

// Single regional Redis (§9.1) — atomic ops only. Same instance the api writes nonces to.
export const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: null });

// Without an 'error' listener, a transient connection blip becomes an uncaught
// exception and kills the process (crash-on-startup). Log and let ioredis reconnect.
redis.on("error", (e) => console.error("[redis]", e.message));

// Atomic single-use burn: DEL returns 1 only if the nonce existed (issued & unused).
export async function burnNonce(jti: string): Promise<boolean> {
  const removed = await redis.del(`join_ticket:${jti}`);
  return removed === 1;
}
