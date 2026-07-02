import { Client } from "colyseus.js";

// Headless players for local load / e2e (§15, §17). Internal-only — never a paid match.
// Each bot: dev-login → join (get ticket) → connect → random inputs → exit on match end.

const API_URL = process.env.API_URL ?? "http://localhost:8080";
const GAME_WS_URL = process.env.GAME_WS_URL ?? "ws://localhost:2567";
const BOT_COUNT = Number(process.env.BOT_COUNT ?? 6);

async function devLogin(i: number): Promise<{ token: string }> {
  const res = await fetch(`${API_URL}/auth/dev-login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: `bot${i}-${Date.now()}@xparena.test`, gamer_tag: `bot${i}_${Date.now()}` }),
  });
  if (!res.ok) throw new Error(`dev-login failed: ${res.status}`);
  return res.json() as Promise<{ token: string }>;
}

async function join(userToken: string): Promise<{ match_id: string; token: string; room: string }> {
  const res = await fetch(`${API_URL}/matches/join`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${userToken}` },
  });
  if (!res.ok) throw new Error(`join failed: ${res.status}`);
  return res.json() as any;
}

async function runBot(i: number): Promise<string> {
  const { token: userToken } = await devLogin(i);
  const { match_id, token, room } = await join(userToken);

  const client = new Client(GAME_WS_URL);
  const roomConn = await client.joinOrCreate(room, { matchId: match_id, token });

  let seq = 0;
  const inputTimer = setInterval(() => {
    const ang = Math.random() * Math.PI * 2;
    roomConn.send("move", { seq: seq++, dx: Math.cos(ang), dy: Math.sin(ang), t: Date.now() });
    if (Math.random() < 0.5) {
      const a = Math.random() * Math.PI * 2;
      roomConn.send("shoot", { seq: seq++, ax: Math.cos(a), ay: Math.sin(a), t: Date.now() });
    }
  }, 200);

  return new Promise<string>((resolve) => {
    const done = () => {
      clearInterval(inputTimer);
      roomConn.leave();
      resolve(match_id);
    };
    roomConn.onMessage("match_ended", done);
    roomConn.onLeave(done);
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`[bots] spawning ${BOT_COUNT} bots → ${API_URL} / ${GAME_WS_URL}`);
  const running: Promise<string>[] = [];
  for (let i = 0; i < BOT_COUNT; i++) {
    // Start (don't await match end) with a small stagger so bots share one open match.
    running.push(runBot(i).catch((e) => { console.error(`[bots] bot ${i} error`, e); return ""; }));
    await sleep(i === 0 ? 500 : 80); // head start for the first bot to create the room
  }
  const ids = await Promise.all(running);
  console.log(`[bots] all finished. match(es): ${[...new Set(ids.filter(Boolean))].join(", ")}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
