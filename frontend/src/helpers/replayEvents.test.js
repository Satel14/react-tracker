import { lowerBound, createSweep, pruneFlashes } from "./replayEvents";

const events = [0, 5, 5, 12, 30, 30, 31].map((t, i) => ({ t, id: i }));

test("lowerBound finds the first index at or after t", () => {
  expect(lowerBound(events, -1)).toBe(0);
  expect(lowerBound(events, 5)).toBe(1);
  expect(lowerBound(events, 6)).toBe(3);
  expect(lowerBound(events, 999)).toBe(events.length);
});

test("sweepTo emits each event exactly once while advancing", () => {
  const sweep = createSweep(events);
  const seen = [];
  for (const t of [0, 1, 5, 5, 11, 12, 29, 31, 40]) seen.push(...sweep.sweepTo(t).map((e) => e.id));
  expect(seen).toEqual([0, 1, 2, 3, 4, 5, 6]);
});

test("a single huge step still emits everything", () => {
  const sweep = createSweep(events);
  expect(sweep.sweepTo(1000).map((e) => e.id)).toEqual([0, 1, 2, 3, 4, 5, 6]);
});

test("a backward move emits nothing until reset", () => {
  const sweep = createSweep(events);
  sweep.sweepTo(1000);
  expect(sweep.sweepTo(3)).toEqual([]);
  sweep.reset(3);
  expect(sweep.sweepTo(6).map((e) => e.id)).toEqual([1, 2]);
});

test("emits every event exactly once over a random walk with seeks", () => {
  let seed = 999;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const many = Array.from({ length: 400 }, (_, i) => ({ t: Math.round(rand() * 1800), id: i }))
    .sort((a, b) => a.t - b.t);
  const sweep = createSweep(many);
  const counts = new Map();
  let t = 0;
  for (let i = 0; i < 4000; i += 1) {
    if (rand() < 0.1) {
      t = Math.round(rand() * 1800);
      sweep.reset(t);
      counts.clear();
      continue;
    }
    t += rand() * 60;
    for (const e of sweep.sweepTo(t)) counts.set(e.id, (counts.get(e.id) || 0) + 1);
  }
  for (const n of counts.values()) expect(n).toBe(1);
});

test("pruneFlashes drops expired entries and caps the list", () => {
  const flashes = Array.from({ length: 50 }, (_, i) => ({ bornMs: 1000 + i, id: i }));
  pruneFlashes(flashes, 1030, 20, 40);
  expect(flashes.every((f) => f.id >= 10)).toBe(true);
  expect(flashes.length).toBeLessThanOrEqual(40);
});

test("pruneFlashes mutates in place", () => {
  const flashes = [{ bornMs: 0, id: 1 }];
  expect(pruneFlashes(flashes, 5000, 1200, 40)).toBe(flashes);
  expect(flashes).toHaveLength(0);
});
