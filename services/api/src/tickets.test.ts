import { describe, it, expect, afterAll } from "vitest";
import jwt from "jsonwebtoken";
import { mintJoinTicket } from "./tickets";
import { redis, ticketNonceKey } from "./redis";
import { config } from "./config";

// Requires Redis (compose/CI). Verifies mint → valid signed ticket + single-use nonce.
describe("join ticket (§9)", () => {
  afterAll(async () => { await redis.quit(); });

  it("mints a verifiable ticket and a one-time nonce", async () => {
    const { token, jti } = await mintJoinTicket({ userId: "u1", matchId: "m1", gamerTag: "g1" });

    const claims: any = jwt.verify(token, config.joinTicketSecret, { algorithms: ["HS256"] });
    expect(claims.sub).toBe("u1");
    expect(claims.match_id).toBe("m1");
    expect(claims.paid).toBe(true);
    expect(claims.jti).toBe(jti);

    // nonce exists, first burn succeeds, second fails (single-use)
    expect(await redis.exists(ticketNonceKey(jti))).toBe(1);
    expect(await redis.del(ticketNonceKey(jti))).toBe(1);
    expect(await redis.del(ticketNonceKey(jti))).toBe(0);
  });
});
