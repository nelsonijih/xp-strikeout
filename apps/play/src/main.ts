import { Client, Room } from "colyseus.js";

// Minimal M1 dev client: dev-login → join → connect → render + desktop controls.
// Netcode polish, mobile joysticks, and Phaser art are M3. World is 1600x1200,
// drawn scaled into an 800x600 canvas.

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8080";
const WORLD_W = 1600;
const WORLD_H = 1200;

const hud = document.getElementById("hud") as HTMLDivElement;
const canvas = document.getElementById("c") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const scaleX = canvas.width / WORLD_W;
const scaleY = canvas.height / WORLD_H;

const keys: Record<string, boolean> = {};
let aim = { x: 1, y: 0 };
let shooting = false;

window.addEventListener("keydown", (e) => {
  if (e.key === " ") e.preventDefault(); // don't scroll the page when shooting
  keys[e.key.toLowerCase()] = true;
});
window.addEventListener("keyup", (e) => (keys[e.key.toLowerCase()] = false));
canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left) / scaleX;
  const my = (e.clientY - rect.top) / scaleY;
  const me = myPos();
  if (me) { aim = { x: mx - me.x, y: my - me.y }; }
});
canvas.addEventListener("mousedown", () => (shooting = true));
canvas.addEventListener("mouseup", () => (shooting = false));

let room: Room | null = null;
let mySessionId = "";

function myPos(): { x: number; y: number } | null {
  const p = room?.state?.players?.get?.(mySessionId);
  return p ? { x: p.x, y: p.y } : null;
}

async function connect() {
  const login = await fetch(`${API_URL}/auth/dev-login`, { method: "POST" }).then((r) => r.json());
  const joined = await fetch(`${API_URL}/matches/join`, {
    method: "POST",
    headers: { authorization: `Bearer ${login.token}` },
  }).then((r) => r.json());

  const client = new Client(joined.ws_url);
  room = await client.joinOrCreate(joined.room, { matchId: joined.match_id, token: joined.token });
  mySessionId = room.sessionId;
  hud.textContent = "connected — waiting for match…";

  room.onMessage("match_ended", async () => {
    const res = await fetch(`${API_URL}/matches/${joined.match_id}/results`).then((r) => r.json());
    hud.textContent = "MATCH ENDED — results: " + JSON.stringify(res.results);
  });
}

let seq = 0;
setInterval(() => {
  if (!room) return;
  let dx = 0, dy = 0;
  if (keys["w"] || keys["arrowup"]) dy -= 1;
  if (keys["s"] || keys["arrowdown"]) dy += 1;
  if (keys["a"] || keys["arrowleft"]) dx -= 1;
  if (keys["d"] || keys["arrowright"]) dx += 1;
  room.send("move", { seq: seq++, dx, dy, t: Date.now() });
  // Shoot on hold-left-click OR hold-Space (Space is easier on a Mac trackpad).
  if (shooting || keys[" "]) room.send("shoot", { seq: seq++, ax: aim.x, ay: aim.y, t: Date.now() });
}, 50);

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const st: any = room?.state;
  if (st) {
    hud.textContent = `phase=${st.phase} timeLeft=${Math.max(0, Math.ceil(st.timeLeftMs / 1000))}s players=${st.players.size}`;
    st.projectiles?.forEach((pr: any) => {
      ctx.fillStyle = "#ffd166";
      ctx.beginPath();
      ctx.arc(pr.x * scaleX, pr.y * scaleY, 3, 0, Math.PI * 2);
      ctx.fill();
    });
    let i = 0;
    st.players?.forEach((p: any, sid: string) => {
      ctx.fillStyle = sid === mySessionId ? "#4cc9f0" : `hsl(${(i * 47) % 360},70%,60%)`;
      ctx.globalAlpha = p.alive ? 1 : 0.3;
      ctx.beginPath();
      ctx.arc(p.x * scaleX, p.y * scaleY, 24 * scaleX, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#e6edf3";
      ctx.font = "10px sans-serif";
      ctx.fillText(`${p.gamerTag} ♥${p.health} ✖${p.takedowns}`, p.x * scaleX - 24, p.y * scaleY - 28);
      i++;
    });
  }
  requestAnimationFrame(draw);
}

connect().catch((e) => (hud.textContent = "error: " + e.message));
draw();
