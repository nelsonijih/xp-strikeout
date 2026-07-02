// Shared simulation helpers — identical logic on client (prediction) and server (authority).
import { WORLD, PLAYER } from "./constants";

export function normalize(x: number, y: number): { x: number; y: number } {
  const len = Math.hypot(x, y);
  if (len === 0) return { x: 0, y: 0 };
  return { x: x / len, y: y / len };
}

export function clampToArena(x: number, y: number, r = PLAYER.hitboxRadius) {
  return {
    x: Math.max(r, Math.min(WORLD.width - r, x)),
    y: Math.max(r, Math.min(WORLD.height - r, y)),
  };
}

// Integrate a movement step; server validates by re-running this authoritatively.
export function stepMove(
  x: number,
  y: number,
  dx: number,
  dy: number,
  dtSec: number,
  speed = PLAYER.moveSpeed
) {
  const dir = normalize(dx, dy);
  const nx = x + dir.x * speed * dtSec;
  const ny = y + dir.y * speed * dtSec;
  return clampToArena(nx, ny);
}

export function circleHit(
  ax: number,
  ay: number,
  ar: number,
  bx: number,
  by: number,
  br: number
): boolean {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy <= (ar + br) * (ar + br);
}
