import { z } from "zod";

// ─── Join ticket (architecture §9) ──────────────────────────────────────────
export const JoinTicketClaims = z.object({
  iss: z.literal("api.xparena.net"),
  aud: z.literal("game.xparena.net"),
  sub: z.string(), // user_id
  match_id: z.string(),
  gamer_tag: z.string(),
  paid: z.literal(true),
  jti: z.string(),
  iat: z.number(),
  nbf: z.number(),
  exp: z.number(),
});
export type JoinTicketClaims = z.infer<typeof JoinTicketClaims>;

// ─── Client → server messages (WS) ──────────────────────────────────────────
export const MoveInput = z.object({
  seq: z.number().int().nonnegative(),
  dx: z.number(), // desired direction, normalized-ish (-1..1)
  dy: z.number(),
  t: z.number(),
});
export type MoveInput = z.infer<typeof MoveInput>;

export const ShootInput = z.object({
  seq: z.number().int().nonnegative(),
  ax: z.number(), // aim direction
  ay: z.number(),
  t: z.number(),
});
export type ShootInput = z.infer<typeof ShootInput>;

// ─── Result finalization payload (game → api, §8.1) ─────────────────────────
export const FinalizePlayerResult = z.object({
  user_id: z.string(),
  takedowns: z.number().int().nonnegative(),
  deaths: z.number().int().nonnegative(),
});
export const FinalizePayload = z.object({
  match_id: z.string(),
  total_takedowns: z.number().int().nonnegative(),
  players: z.array(FinalizePlayerResult),
});
export type FinalizePayload = z.infer<typeof FinalizePayload>;
