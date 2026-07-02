import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { config } from "./config";
import { redis, ticketNonceKey } from "./redis";

// Mint a single-use join ticket (architecture §9). The nonce is recorded in Redis
// with SET NX EX so double-issue is impossible; the game server burns it on connect.
export async function mintJoinTicket(params: {
  userId: string;
  matchId: string;
  gamerTag: string;
}): Promise<{ token: string; jti: string }> {
  const jti = randomUUID();
  const nowSec = Math.floor(Date.now() / 1000);

  const set = await redis.set(
    ticketNonceKey(jti),
    JSON.stringify({ userId: params.userId, matchId: params.matchId }),
    "EX",
    config.joinTicketTtlSec,
    "NX"
  );
  if (set !== "OK") throw new Error("nonce collision");

  const token = jwt.sign(
    {
      iss: "api.xparena.net",
      aud: "game.xparena.net",
      sub: params.userId,
      match_id: params.matchId,
      gamer_tag: params.gamerTag,
      paid: true,
      jti,
      nbf: nowSec,
    },
    config.joinTicketSecret,
    { algorithm: "HS256", expiresIn: config.joinTicketTtlSec }
  );

  return { token, jti };
}
