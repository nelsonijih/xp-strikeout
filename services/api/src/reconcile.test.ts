import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { pool, query } from "./db";
import { reconcileAbandonedMatches } from "./reconcile";

// A match that started but never finalized (room crashed) must be voided + refunded (§8.1).
describe("void-on-crash reconciliation (§8.1)", () => {
  afterAll(async () => { await pool.end(); });

  it("voids a stale active match and refunds its entries", async () => {
    const [u] = await query<{ id: string }>(`insert into users (email) values ($1) returning id`, [`${randomUUID()}@t.io`]);
    // started 10 minutes ago → well past matchDuration + finalizeTimeout
    const [m] = await query<{ id: string }>(
      `insert into matches (status, started_at) values ('active', now() - interval '600 seconds') returning id`
    );
    await query(`insert into match_players (match_id, user_id, payment_status, seat_status) values ($1,$2,'paid','consumed')`, [m.id, u.id]);
    await query(
      `insert into payments (user_id, match_id, amount, provider_reference, status) values ($1,$2,2000,$3,'paid')`,
      [u.id, m.id, `stub-${m.id}`]
    );

    const voided = await reconcileAbandonedMatches();
    expect(voided).toBeGreaterThanOrEqual(1);

    const [mrow] = await query<{ status: string }>(`select status from matches where id = $1`, [m.id]);
    expect(mrow.status).toBe("void");

    const [pay] = await query<{ status: string }>(`select status from payments where match_id = $1`, [m.id]);
    expect(pay.status).toBe("refunded");

    const [mp] = await query<{ payment_status: string }>(`select payment_status from match_players where match_id = $1`, [m.id]);
    expect(mp.payment_status).toBe("refunded");
  });
});
