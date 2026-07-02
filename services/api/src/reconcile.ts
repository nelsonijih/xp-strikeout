import { withTx } from "./db";
import { config } from "./config";

// Void-on-crash reconciliation (architecture §8.1). A match that started but never
// finalized (e.g. the room machine died) is voided and its entries refunded — never
// a silent loss, never half-paid. Runs periodically.
export async function reconcileAbandonedMatches(now = Date.now()): Promise<number> {
  const staleBefore = new Date(now - (config.matchDurationMs + config.finalizeTimeoutMs));

  return withTx(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `select id from matches
        where status in ('countdown','active','finalizing')
          and started_at is not null
          and started_at < $1
        for update skip locked`,
      [staleBefore]
    );

    for (const m of rows) {
      // Refund all consumed/paid entries (M1: stub refund; Paystack reversal in M4).
      await client.query(
        `update payments set status = 'refunded'
          where match_id = $1 and status = 'paid'`,
        [m.id]
      );
      await client.query(
        `update match_players set payment_status = 'refunded', seat_status = 'released'
          where match_id = $1`,
        [m.id]
      );
      await client.query(
        `update matches set status = 'void', ended_at = now(), updated_at = now() where id = $1`,
        [m.id]
      );
    }
    return rows.length;
  });
}

export function startReconcileLoop(intervalMs = 15_000): NodeJS.Timeout {
  return setInterval(() => {
    reconcileAbandonedMatches().catch((e) => console.error("[reconcile]", e));
  }, intervalMs);
}
