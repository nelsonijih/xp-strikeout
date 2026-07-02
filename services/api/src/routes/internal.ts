import type { FastifyInstance, FastifyRequest } from "fastify";
import { FinalizePayload } from "@xp/shared";
import { config } from "../config";
import { query } from "../db";
import { finalizeMatch } from "../finalize";

function assertInternal(req: FastifyRequest): boolean {
  return req.headers["x-internal-token"] === config.internalApiToken;
}

// Internal endpoints — called only by the game server (authenticated by INTERNAL_API_TOKEN).
// The game server has no DB credentials; all writes go through here (§8.1).
export async function internalRoutes(app: FastifyInstance) {
  // Mark a match active + consume seats when the room starts.
  app.post("/internal/matches/:id/start", async (req, reply) => {
    if (!assertInternal(req)) return reply.code(403).send({ error: "forbidden" });
    const { id } = req.params as { id: string };
    await query(
      `update matches
          set status = 'active', started_at = coalesce(started_at, now()), updated_at = now()
        where id = $1 and status in ('waiting','countdown')`,
      [id]
    );
    await query(`update match_players set seat_status = 'consumed' where match_id = $1`, [id]);
    return { ok: true };
  });

  // Durable, idempotent result finalization (§8.1).
  app.post("/internal/matches/:id/finalize", async (req, reply) => {
    if (!assertInternal(req)) return reply.code(403).send({ error: "forbidden" });
    const { id } = req.params as { id: string };
    const parsed = FinalizePayload.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "bad payload", details: parsed.error.issues });
    if (parsed.data.match_id !== id) return reply.code(400).send({ error: "match_id mismatch" });

    const out = await finalizeMatch(parsed.data);
    return { ok: true, ...out };
  });
}
