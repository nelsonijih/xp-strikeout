import Redis from "ioredis";
import { config } from "./config";

// Single regional Redis (architecture §9.1). Atomic ops only for nonce/locks.
export const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: null });

// Attach an error listener so a transient connection blip can't become an
// uncaught exception that kills the process. ioredis reconnects on its own.
redis.on("error", (e) => console.error("[redis]", e.message));

export function ticketNonceKey(jti: string): string {
  return `join_ticket:${jti}`;
}
