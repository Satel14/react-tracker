import { filterKills } from "./killFilter";

const kill = (over = {}) => ({
  t: 60, killerName: "Me", victimName: "Foe", isFocalKill: false, isFocalDeath: false, ...over,
});

test("keeps every kill when nothing is set", () => {
  const kills = [kill({ t: 10 }), kill({ t: 900 })];
  expect(filterKills(kills, {})).toEqual(kills);
});

test("keeps only the kills inside the window, ends included", () => {
  const kills = [kill({ t: 10 }), kill({ t: 60 }), kill({ t: 120 }), kill({ t: 121 })];
  expect(filterKills(kills, { range: [60, 120] }).map((k) => k.t)).toEqual([60, 120]);
});

test("a kill with no timestamp counts as the start of the match", () => {
  // The feed builds t from telemetry and a malformed event can arrive without
  // one. Dropping it from every window would hide it; treating it as 0 keeps
  // it visible in any window that starts at 0, which is the default.
  expect(filterKills([kill({ t: undefined })], { range: [0, 100] })).toHaveLength(1);
  expect(filterKills([kill({ t: undefined })], { range: [30, 100] })).toHaveLength(0);
});

test("focalOnly keeps the focal player's kills and their death", () => {
  const kills = [
    kill({ t: 1, isFocalKill: true }),
    kill({ t: 2, isFocalDeath: true }),
    kill({ t: 3 }),
  ];
  expect(filterKills(kills, { focalOnly: true }).map((k) => k.t)).toEqual([1, 2]);
});

test("applies the window and focalOnly together", () => {
  const kills = [
    kill({ t: 10, isFocalKill: true }),
    kill({ t: 200, isFocalKill: true }),
    kill({ t: 20 }),
  ];
  expect(filterKills(kills, { range: [0, 100], focalOnly: true }).map((k) => k.t)).toEqual([10]);
});

test("a null range means the whole match, not an empty one", () => {
  // The pane holds range as null until the slider is touched, because the
  // match duration is not always known at mount and [0, 0] would blank the tab.
  expect(filterKills([kill({ t: 900 })], { range: null })).toHaveLength(1);
});

test("returns a new array and leaves the source alone", () => {
  const kills = [kill({ t: 10 }), kill({ t: 200 })];
  const out = filterKills(kills, { range: [0, 100] });
  expect(out).not.toBe(kills);
  expect(kills).toHaveLength(2);
});

test("survives a missing list", () => {
  expect(filterKills(undefined, { focalOnly: true })).toEqual([]);
});
