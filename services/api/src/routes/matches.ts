import type { FastifyInstance, FastifyRequest } from "fastify";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { withTx, query } from "../db";
import { mintJoinTicket } from "../tickets";

function verifyUser(req: FastifyRequest): { userId: string; gamerTag: string } {
  const auth = req.headers.authorization ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const claims = jwt.verify(token, config.supabaseJwtSecret) as any;
  return { userId: claims.sub, gamerTag: claims.gamer_tag ?? "player" };
}

export async function matchRoutes(app: FastifyInstance) {
  // Join: find/create an open match, reserve a paid seat (payment stubbed in M1),
  // and mint a single-use join ticket for the game server.
  app.post("/matches/join", async (req, reply) => {
    let user: { userId: string; gamerTag: string };
    try {
      user = verifyUser(req);
    } catch {
      return reply.code(401).send({ error: "invalid or missing token" });
    }

    const matchId = await withTx(async (client) => {
      // Find an open, waiting match with a free seat; else create one.
      const open = await client.query<{ id: string }>(
        `select m.id
           from matches m
          where m.status = 'waiting'
            and (select count(*) from match_players mp where mp.match_id = m.id) < m.max_players
          order by m.created_at asc
          limit 1
          for update skip locked`
      );
      let id: string;
      if (open.rows.length > 0) {
        id = open.rows[0].id;
      } else {
        const created = await client.query<{ id: string }>(
          `insert into matches (status) values ('waiting') returning id`
        );
        id = created.rows[0].id;
      }

      // Reserve seat (idempotent per match+user). Payment stubbed paid in M1.
      await client.query(
        `insert into match_players (match_id, user_id, payment_status, seat_status)
         values ($1, $2, 'paid', 'reserved')
         on conflict (match_id, user_id) do update set payment_status = 'paid'`,
        [id, user.userId]
      );
      await client.query(
        `insert into payments (user_id, match_id, amount, provider, provider_reference, status)
         values ($1, $2, 2000, 'stub', $3, 'paid')
         on conflict (provider_reference) do nothing`,
        [user.userId, id, `stub-${id}-${user.userId}`]
      );
      return id;
    });

    const { token } = await mintJoinTicket({
      userId: user.userId,
      matchId,
      gamerTag: user.gamerTag,
    });

    return {
      ws_url: config.gameWsUrl,
      room: "strikeout",
      match_id: matchId,
      token,
    };
  });

  // Read results (for the results screen / tests).
  app.get("/matches/:id/results", async (req) => {
    const { id } = req.params as { id: string };
    const match = await query(`select id, status, total_takedowns, ended_at from matches where id = $1`, [id]);
    const results = await query(
      `select user_id, takedowns, deaths, total_payout from match_results where match_id = $1 order by takedowns desc`,
      [id]
    );
    return { match: match[0] ?? null, results };
  });
}
