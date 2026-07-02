import { describe, it, expect } from "vitest";
import { circleHit, stepMove, clampToArena } from "./sim";
import { PLAYER, BLASTER, WORLD } from "./constants";

describe("constants sanity (GDD §21)", () => {
  it("4 hits eliminate a full-health player", () => {
    expect(BLASTER.damage * 4).toBe(PLAYER.maxHealth);
  });
});

describe("sim helpers", () => {
  it("clamps inside the arena", () => {
    const p = clampToArena(-100, 99999);
    expect(p.x).toBe(PLAYER.hitboxRadius);
    expect(p.y).toBe(WORLD.height - PLAYER.hitboxRadius);
  });

  it("moves at bounded speed", () => {
    const p = stepMove(800, 600, 1, 0, 1); // 1 second, full right
    expect(p.x).toBeCloseTo(800 + PLAYER.moveSpeed, 5);
    expect(p.y).toBeCloseTo(600, 5);
  });

  it("detects overlapping circles", () => {
    expect(circleHit(0, 0, 6, 5, 0, 24)).toBe(true);
    expect(circleHit(0, 0, 6, 100, 0, 24)).toBe(false);
  });
});
