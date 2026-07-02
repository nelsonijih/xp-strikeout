import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { pool, query } from "./db";
import { finalizeMatch } from "./finalize";

// Requires Postgres with schema applied (compose/CI).
async function seed() {
  const [m] = await query<{ id: string }>(`insert into matches (status) values ('active') returning id`);
  const [u1] = await query<{ id: string }>(`insert into users (email) values ($1) returning id`, [`${randomUUID()}@t.io`]);
  const [u2] = await query<{ id: string }>(`insert into users (email) values ($1) returning id`, [`${randomUUID()}@t.io`]);
  for (const u of [u1, u2]) {
    await query(`insert into match_players (match_id, user_id, payment_status) values ($1,$2,'paid')`, [m.id, u.id]);
  }
  return { matchId: m.id, users: [u1.id, u2.id] };
}

describe("result finalization is durable + idempotent (§8.1)", () => {
  afterAll(async () => { await pool.end(); });

  it("locks once and is safe to re-submit", async () => {
    const { matchId, users } = await seed();
    const payload = {
      match_id: matchId,
      total_takedowns: 3,
      players: [
        { user_id: users[0], takedowns: 2, deaths: 1 },
        { user_id: users[1], takedowns: 1, deaths: 2 },
      ],
    };

    const first = await finalizeMatch(payload);
    const second = await finalizeMatch(payload); // duplicate submit
    expect(first.locked).toBe(true);
    expect(second.locked).toBe(true);

    const results = await query(`select * from match_results where match_id = $1`, [matchId]);
    expect(results.length).toBe(2); // no duplicates despite two submits

    const [mrow] = await query<{ status: string; total_takedowns: number }>(
      `select status, total_takedowns from matches where id = $1`, [matchId]
    );
    expect(mrow.status).toBe("results_locked");
    expect(Number(mrow.total_takedowns)).toBe(3);
  });
});
