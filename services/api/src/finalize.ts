import type { FinalizePayload } from "@xp/shared";
import { withTx } from "./db";

// Idempotent result finalization (architecture §8.1). Keyed by match_id.
// Re-submits converge: match_results is unique on (match_id, user_id) and the
// status flip to results_locked is guarded. Never half-paid.
// NOTE: M1 stores takedowns/deaths only; payout math (rounding invariant) lands in M4.
export async function finalizeMatch(payload: FinalizePayload): Promise<{ locked: boolean }> {
  return withTx(async (client) => {
    const { rows } = await client.query<{ status: string }>(
      "select status from matches where id = $1 for update",
      [payload.match_id]
    );
    if (rows.length === 0) throw new Error("match not found");
    const status = rows[0].status;

    // Idempotent: already finalized → no-op success.
    if (status === "results_locked") return { locked: true };
    if (status === "void") throw new Error("cannot finalize a voided match");

    for (const p of payload.players) {
      await client.query(
        `insert into match_results (match_id, user_id, takedowns, deaths)
         values ($1, $2, $3, $4)
         on conflict (match_id, user_id) do nothing`,
        [payload.match_id, p.user_id, p.takedowns, p.deaths]
      );
      await client.query(
        `update match_players set takedowns = $3, deaths = $4, seat_status = 'consumed'
         where match_id = $1 and user_id = $2`,
        [payload.match_id, p.user_id, p.takedowns, p.deaths]
      );
    }

    await client.query(
      `update matches
         set status = 'results_locked', total_takedowns = $2, ended_at = now(), updated_at = now()
       where id = $1`,
      [payload.match_id, payload.total_takedowns]
    );

    return { locked: true };
  });
}
