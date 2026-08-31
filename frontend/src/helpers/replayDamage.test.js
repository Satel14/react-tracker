import { describe, it, expect } from "vitest";
import { damageAt, DAMAGE } from "./replayDamage";

// t, attacker index, victim index, amount
const ev = (t, a, v, d) => ({ t, a, v, d });

describe("damageAt", () => {
  const events = [ev(10, 0, 1, 19), ev(11, -1, 2, 4), ev(30, 1, 0, 55)];

  it("shows nothing before the first hit", () => {
    expect(damageAt(events, 0)).toEqual([]);
  });

  it("puts one number on whoever lost the health, and none on who took it", () => {
    // Only what a player received. Who dealt it is already on the map: the
    // tracer runs from the shooter to them, so a second number saying the same
    // thing twice is noise.
    const shown = damageAt(events, 10);
    expect(shown.map((n) => [n.player, n.amount])).toEqual([[1, 19]]);
  });

  it("counts a hit nobody dealt exactly like one somebody did", () => {
    // The zone, a fall, a jerry can. The number came off a health bar either
    // way, and that is the whole of what this layer says.
    expect(damageAt([ev(11, -1, 2, 4)], 11).map((n) => [n.player, n.amount])).toEqual([[2, 4]]);
  });

  it("ages a number out of its life", () => {
    const one = [ev(10, 0, 1, 19)];
    expect(damageAt(one, 10 + DAMAGE.lifetime - 0.01)).not.toEqual([]);
    expect(damageAt(one, 10 + DAMAGE.lifetime + 0.01)).toEqual([]);
    // Not the exact boundary: 10 + 1.6 lands on an age of 0.9999999999999998,
    // so which side of it a number falls is a fact about floating point and
    // not about the design.
  });

  it("reports how far through its life each number is, from 0 to 1", () => {
    // The scene turns this into how far it has risen and how faded it is, so
    // the fade is a function of the playhead and not of the wall clock: a
    // paused replay holds its numbers still instead of blinking them out.
    expect(damageAt(events, 10)[0].age).toBeCloseTo(0, 6);
    expect(damageAt(events, 10 + DAMAGE.lifetime / 2)[0].age).toBeCloseTo(0.5, 6);
  });

  it("stacks a player's simultaneous numbers so they do not sit on each other", () => {
    const burst = [ev(10, 0, 1, 5), ev(10.1, 0, 1, 6), ev(10.2, 0, 1, 7)];
    const shown = damageAt(burst, 10.2).filter((n) => n.player === 1);
    expect(shown.map((n) => n.amount)).toEqual([7, 6, 5]);
    expect(shown.map((n) => n.stack)).toEqual([0, 1, 2]);
  });

  it("says nothing about the player who dealt the hit", () => {
    // Player 0 lands two hits on player 1 and gets no numbers of their own.
    const shown = damageAt([ev(10, 0, 1, 5), ev(10.1, 0, 1, 6)], 10.1);
    expect(shown.every((n) => n.player === 1)).toBe(true);
    expect(shown).toHaveLength(2);
  });

  it("keeps the newest when a firefight makes more than fit", () => {
    const burst = Array.from({ length: 40 }, (_, i) => ev(10 + i * 0.01, -1, i, i + 1));
    const shown = damageAt(burst, 10.4);
    expect(shown).toHaveLength(DAMAGE.cap);
    expect(shown[0].amount).toBe(40);
  });

  it("still reads an attacker column it no longer shows", () => {
    // The column stays in the payload for the roster's damage-dealt figure,
    // which is a different feature on a different surface. Nothing here reads
    // it, and nothing here may start drawing from it by accident.
    const withAttacker = damageAt([ev(10, 0, 1, 19)], 10);
    const without = damageAt([ev(10, -1, 1, 19)], 10);
    expect(withAttacker.map((n) => [n.player, n.amount, n.stack]))
      .toEqual(without.map((n) => [n.player, n.amount, n.stack]));
  });

  it("answers the same for a time whether or not a later one was asked first", () => {
    // A function of t and nothing else: scrubbing backwards has no cursor to
    // reset, which is the same reason feedAt and phaseAt are written this way.
    const forward = damageAt(events, 10.5);
    damageAt(events, 400);
    expect(damageAt(events, 10.5)).toEqual(forward);
  });

  it("gives every number a key that survives a re-render", () => {
    const shown = damageAt(events, 10);
    expect(new Set(shown.map((n) => n.id)).size).toBe(shown.length);
    expect(damageAt(events, 10.4).map((n) => n.id)).toEqual(shown.map((n) => n.id));
  });

  it("takes a lifetime and a cap from the caller", () => {
    expect(damageAt(events, 12, { lifetime: 5 }).map((n) => n.amount)).toEqual([4, 19]);
    expect(damageAt(events, 12, { lifetime: 5, cap: 1 })).toHaveLength(1);
  });

  it("survives a payload with nothing in it", () => {
    for (const bad of [null, undefined, "x", [], [null, 7, {}]]) {
      expect(damageAt(bad, 10)).toEqual([]);
    }
    expect(damageAt(events, NaN)).toEqual([]);
  });
});
