import type { FastifyInstance } from "fastify";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { query } from "../db";

// Dev-only login: mints a REAL Supabase-shaped JWT (no Google round-trip).
// Guarded — only when DEV_AUTH_BYPASS is on and not production (§16).
export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/dev-login", async (req, reply) => {
    if (!config.devAuthBypass || config.nodeEnv === "production") {
      return reply.code(403).send({ error: "dev login disabled" });
    }
    const body = (req.body ?? {}) as { email?: string; gamer_tag?: string };
    const email = body.email ?? `dev+${Math.floor(Math.random() * 1e9)}@xparena.test`;
    const gamerTag = body.gamer_tag ?? email.split("@")[0];

    const rows = await query<{ id: string; gamer_tag: string }>(
      `insert into users (email, gamer_tag)
       values ($1, $2)
       on conflict (email) do update set gamer_tag = coalesce(users.gamer_tag, excluded.gamer_tag)
       returning id, gamer_tag`,
      [email, gamerTag]
    );
    const user = rows[0];

    const token = jwt.sign(
      { sub: user.id, gamer_tag: user.gamer_tag, email },
      config.supabaseJwtSecret,
      { algorithm: "HS256", expiresIn: "1h" }
    );
    return { token, user_id: user.id, gamer_tag: user.gamer_tag };
  });
}
