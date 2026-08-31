import { decodeReplay } from "./replayModel";
import { buildTracks } from "./replayTracks";

// A hand-written format-2 payload. Every expected value below is worked out by
// hand from these literals -- never by round-tripping through the decoder.
const wire = () => ({
  format: 2,
  matchId: "m-1",
  mapName: "Erangel",
  rawMapName: "Baltic_Main",
  mapMax: 8000,
  duration: 1800,
  createdAt: "2026-08-29T10:00:00Z",
  focalAccountId: "account.aaa",
  focalTeamId: 4,
  totalPlayers: 2,
  totalTeams: 2,
  players: [
    {
      name: "A",
      accountId: "account.aaa",
      teamId: 4,
      isFocal: true,
      dropTime: 12,
      deathTime: 30,
      positions: {
        t: [12, 8, 10],
        x: [1000, -5, 3],
        y: [500, 20, -30],
        h: [100, 62, 0],
        f: [0, 1, 3],
      },
    },
    {
      name: "B",
      accountId: "account.bbb",
      teamId: 7,
      isFocal: false,
      dropTime: null,
      deathTime: null,
      positions: { t: [45], x: [-200], y: [0], h: [88], f: [2] },
    },
  ],
  shots: {
    t: [5, 9],
    a: ["account.aaa", "account.bbb"],
    v: ["account.bbb", "account.aaa"],
    ax: [10, 40],
    ay: [20, 50],
    vx: [30, 60],
    vy: [40, 70],
  },
  kills: [{ t: 30, killer: "B", victim: "A" }],
  zones: [{ t: 100, bx: 1, by: 2, br: 3 }],
  landings: [{ t: 12, accountId: "account.aaa" }],
  knocks: [{ t: 25 }],
  revives: [{ t: 27 }],
  packages: [{ t: 200 }],
  specialZones: [{ t: 300, kind: "red" }],
  phases: [{ phase: 1, t: 100 }],
  flight: { sx: 0, sy: 0, ex: 100, ey: 100 },
});

test("decodes a two-player format-2 payload to exact hand-computed samples", () => {
  const out = decodeReplay(wire());

  // t: 12, 12+8, 12+8+10 | x: 1000, 995, 998 | y: 500, 520, 490
  expect(out.players[0].positions).toEqual([
    { t: 12, x: 1000, y: 500, h: 100, f: 0 },
    { t: 20, x: 995, y: 520, h: 62, f: 1 },
    { t: 30, x: 998, y: 490, h: 0, f: 3 },
  ]);
  expect(out.players[1].positions).toEqual([{ t: 45, x: -200, y: 0, h: 88, f: 2 }]);
});

test("keeps every other player field exactly as received", () => {
  const [a, b] = decodeReplay(wire()).players;
  expect(a.name).toBe("A");
  expect(a.accountId).toBe("account.aaa");
  expect(a.teamId).toBe(4);
  expect(a.isFocal).toBe(true);
  expect(a.dropTime).toBe(12);
  expect(a.deathTime).toBe(30);
  expect(b.dropTime).toBeNull();
  expect(b.deathTime).toBeNull();
  expect(b.teamId).toBe(7);
});

test("cumulatively sums the first-difference arrays", () => {
  const times = decodeReplay({
    format: 2,
    players: [{ positions: { t: [0, 10, 10, 10], x: [0, 0, 0, 0], y: [0, 0, 0, 0], h: [], f: [] } }],
  }).players[0].positions.map((p) => p.t);
  expect(times).toEqual([0, 10, 20, 30]);

  const xs = decodeReplay({
    format: 2,
    players: [{ positions: { t: [0, 1, 1], x: [1000, -5, 3], y: [0, 0, 0], h: [], f: [] } }],
  }).players[0].positions.map((p) => p.x);
  expect(xs).toEqual([1000, 995, 998]);
});

test("leaves metre coordinates unscaled", () => {
  const [p] = decodeReplay({
    format: 2,
    players: [{ positions: { t: [0], x: [7431], y: [2096], h: [100], f: [0] } }],
  }).players[0].positions;
  expect(p.x).toBe(7431);
  expect(p.y).toBe(2096);
});

test("splits the flag mask into vehicle and knocked bits for all four values", () => {
  const positions = decodeReplay({
    format: 2,
    players: [{ positions: { t: [0, 1, 1, 1], x: [0, 0, 0, 0], y: [0, 0, 0, 0], h: [100, 100, 100, 100], f: [0, 1, 2, 3] } }],
  }).players[0].positions;

  expect(positions.map((p) => p.f)).toEqual([0, 1, 2, 3]);
  expect(positions.map((p) => !!(p.f & 1))).toEqual([false, true, false, true]);
  expect(positions.map((p) => !!(p.f & 2))).toEqual([false, false, true, true]);
});

test("masks the flag byte to the five defined bits, matching the backend decoder", () => {
  // bit 0 in a vehicle, bit 1 knocked, bits 2-4 which vehicle (0-7). The mask
  // has to stay in step with decodePositions in
  // backend/modules/replay/positions.js: the two are inverses, and widening
  // one alone silently drops a glyph.
  const fs = decodeReplay({
    format: 2,
    players: [{ positions: {
      t: [0, 1, 1, 1, 1], x: [0, 0, 0, 0, 0], y: [0, 0, 0, 0, 0],
      h: [100, 100, 100, 100, 100],
      // 21 = boat, 13 = bike, 31 = every defined bit, 32 and 63 spill past
      // the field and must be trimmed to it.
      f: [21, 13, 31, 32, 63],
    } }],
  }).players[0].positions.map((p) => p.f);
  expect(fs).toEqual([21, 13, 31, 0, 31]);
});
test("carries absolute health through untouched by the delta pass", () => {
  const hs = decodeReplay({
    format: 2,
    players: [{ positions: { t: [0, 1, 1], x: [0, 0, 0], y: [0, 0, 0], h: [100, 40, 75], f: [0, 0, 0] } }],
  }).players[0].positions.map((p) => p.h);
  expect(hs).toEqual([100, 40, 75]);
});

test("decodes the parallel shot arrays into objects", () => {
  const { shots } = decodeReplay(wire());
  expect(shots).toEqual([
    { t: 5, a: "account.aaa", v: "account.bbb", ax: 10, ay: 20, vx: 30, vy: 40 },
    { t: 9, a: "account.bbb", v: "account.aaa", ax: 40, ay: 50, vx: 60, vy: 70 },
  ]);
});

test("truncates mismatched shot arrays to the shortest with no undefined fields", () => {
  const { shots } = decodeReplay({
    format: 2,
    shots: {
      t: [1, 2, 3],
      a: ["x", "y", "z"],
      v: ["p", "q", "r"],
      ax: [1, 2, 3],
      ay: [1, 2, 3],
      vx: [1, 2],
      vy: [1, 2, 3],
    },
  });
  expect(shots).toHaveLength(2);
  for (const shot of shots) {
    for (const key of ["t", "a", "v", "ax", "ay", "vx", "vy"]) {
      expect(shot[key]).toBeDefined();
    }
  }
});

test("yields no shots when one of the parallel arrays is missing entirely", () => {
  // The row count is the shortest column, so an absent one is zero rows rather
  // than rows with an undefined field. Its fixture used to prove this by
  // omitting dmg; dmg is gone from the layer, so it omits vy instead -- the
  // property is the same one, and it is what makes removing a column from the
  // backend without removing its key here a silent way to lose every shot.
  const { shots } = decodeReplay({
    format: 2,
    shots: { t: [1], a: ["x"], v: ["p"], ax: [1], ay: [1], vx: [1] },
  });
  expect(shots).toEqual([]);
});

test("decodes a legacy payload, defaulting health to 100 and flags to 0", () => {
  const out = decodeReplay({
    format: 1,
    mapName: "Miramar",
    players: [
      {
        name: "L",
        accountId: "account.lll",
        teamId: 3,
        isFocal: false,
        dropTime: 5,
        deathTime: null,
        positions: [{ t: 0, x: 10, y: 20 }, { t: 10, x: 30, y: 40 }],
      },
    ],
    kills: [{ t: 1 }],
    zones: [{ t: 2 }],
  });

  expect(out.players[0].positions).toEqual([
    { t: 0, x: 10, y: 20, h: 100, f: 0 },
    { t: 10, x: 30, y: 40, h: 100, f: 0 },
  ]);
  expect(out.players[0].name).toBe("L");
  expect(out.players[0].dropTime).toBe(5);
  expect(out.mapName).toBe("Miramar");
  expect(out.kills).toEqual([{ t: 1 }]);
  expect(out.zones).toEqual([{ t: 2 }]);
  expect(out.shots).toEqual([]);
});

test("decodes a legacy array track even when the payload claims format 2", () => {
  const out = decodeReplay({
    format: 2,
    players: [{ name: "L", positions: [{ t: 3, x: 1, y: 2 }] }],
  });
  expect(out.players[0].positions).toEqual([{ t: 3, x: 1, y: 2, h: 100, f: 0 }]);
});

test("returns empty sections instead of undefined for null, {} and a player-less payload", () => {
  const sections = ["players", "shots", "kills", "zones", "landings", "knocks", "revives", "packages", "specialZones", "phases"];
  for (const payload of [null, undefined, {}, { format: 2 }, { format: 2, players: null }]) {
    const out = decodeReplay(payload);
    for (const key of sections) {
      expect(Array.isArray(out[key])).toBe(true);
      expect(out[key]).toHaveLength(0);
    }
    expect(out.flight).toBeNull();
  }
});

test("survives structurally broken input without throwing", () => {
  for (const payload of [42, "nope", [], { format: 2, players: "no" }, { format: 2, players: [null, 7, {}] }, { format: 2, shots: [] }, { format: 2, players: [{ positions: { t: null } }] }]) {
    expect(() => decodeReplay(payload)).not.toThrow();
  }
  const out = decodeReplay({ format: 2, players: [{ positions: {} }, { positions: null }] });
  expect(out.players[0].positions).toEqual([]);
  expect(out.players[1].positions).toEqual([]);
});

test("passes the non-columnar sections through untouched", () => {
  const src = wire();
  const out = decodeReplay(src);
  expect(out.kills).toEqual(src.kills);
  expect(out.zones).toEqual(src.zones);
  expect(out.landings).toEqual(src.landings);
  expect(out.knocks).toEqual(src.knocks);
  expect(out.revives).toEqual(src.revives);
  expect(out.packages).toEqual(src.packages);
  expect(out.specialZones).toEqual(src.specialZones);
  expect(out.phases).toEqual(src.phases);
  expect(out.flight).toEqual(src.flight);
  expect(out.mapName).toBe("Erangel");
  expect(out.rawMapName).toBe("Baltic_Main");
  expect(out.mapMax).toBe(8000);
  expect(out.duration).toBe(1800);
  expect(out.createdAt).toBe("2026-08-29T10:00:00Z");
  expect(out.matchId).toBe("m-1");
  expect(out.focalAccountId).toBe("account.aaa");
  expect(out.focalTeamId).toBe(4);
  expect(out.totalPlayers).toBe(2);
  expect(out.totalTeams).toBe(2);
});

test("does not mutate the payload it was handed", () => {
  const src = wire();
  decodeReplay(src);
  expect(src.players[0].positions).toEqual({
    t: [12, 8, 10],
    x: [1000, -5, 3],
    y: [500, 20, -30],
    h: [100, 62, 0],
    f: [0, 1, 3],
  });
  expect(Array.isArray(src.shots)).toBe(false);
});

test("decoded players plug straight into buildTracks", () => {
  const out = decodeReplay(wire());
  const tracks = buildTracks(out.players);
  expect(tracks.count).toBe(2);
  expect(tracks.X[0][0]).toBe(out.players[0].positions[0].x);
  expect(tracks.X[0][0]).toBe(1000);
  expect(Array.from(tracks.T[0])).toEqual([12, 20, 30]);
  expect(tracks.meta[0].accountId).toBe("account.aaa");
  expect(tracks.X[1][0]).toBe(-200);
});

describe("the damage layer", () => {
  it("keeps decoding shots after the damage column left them", () => {
    // decodeShots takes the SHORTEST column as the row count, so a key listed
    // here that the backend no longer ships is not a missing field -- it is
    // zero shots. This is the regression that removing shots[].dmg could have
    // caused silently.
    const shots = { t: [1, 2], a: ["x", "x"], v: ["y", "y"], ax: [1, 1], ay: [1, 1], vx: [2, 2], vy: [2, 2] };
    expect(decodeReplay({ shots }).shots).toHaveLength(2);
  });

  it("decodes damage into rows the scene can read", () => {
    const damage = { t: [10, 20], a: [3, -1], v: [7, 7], d: [19, 4] };
    expect(decodeReplay({ damage }).damage).toEqual([
      { t: 10, a: 3, v: 7, d: 19 },
      { t: 20, a: -1, v: 7, d: 4 },
    ]);
  });

  it("gives a payload from before the layer existed an empty one", () => {
    // Every cached replay predates it, and a missing layer must render as no
    // numbers rather than as a blank page.
    for (const payload of [{}, { damage: null }, { damage: "x" }, { damage: {} }]) {
      expect(decodeReplay(payload).damage).toEqual([]);
    }
  });

  it("takes a payload that already holds objects as it is", () => {
    const rows = [{ t: 1, a: 0, v: 1, d: 5 }];
    expect(decodeReplay({ damage: rows }).damage).toEqual(rows);
  });
});
