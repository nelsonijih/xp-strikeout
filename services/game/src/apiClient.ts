import type { FinalizePayload } from "@xp/shared";
import { config } from "./config";

// game → api (§8.1): the game holds no DB creds; it submits state changes to api
// authenticated by INTERNAL_API_TOKEN. Finalize is retried with backoff (durable submit).

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(`${config.apiUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-token": config.internalApiToken,
    },
    body: JSON.stringify(body),
  });
}

export async function markMatchStarted(matchId: string): Promise<void> {
  try {
    await post(`/internal/matches/${matchId}/start`, {});
  } catch (e) {
    console.error("[api] start failed", e);
  }
}

export async function submitFinalize(payload: FinalizePayload, maxAttempts = 8): Promise<boolean> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await post(`/internal/matches/${payload.match_id}/finalize`, payload);
      if (res.ok) return true;
      // 4xx (bad payload / voided) won't get better with retries.
      if (res.status >= 400 && res.status < 500) {
        console.error("[api] finalize rejected", res.status, await res.text());
        return false;
      }
    } catch (e) {
      console.error(`[api] finalize attempt ${attempt} failed`, e);
    }
    await new Promise((r) => setTimeout(r, Math.min(500 * attempt, 5000)));
  }
  return false;
}
