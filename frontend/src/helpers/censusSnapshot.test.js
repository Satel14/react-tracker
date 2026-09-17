import {
  CENSUS_SNAPSHOT,
  usableSnapshot,
  publishableReading,
  snapshotSeasonNumber,
  effectiveReadings,
  rpTable,
  RP_TABLE_LENGTH,
  MIN_POOLED_WINDOWS,
  lobbyMixRows,
  gatedMixRows,
  benchmarkRows,
  gatedBenchmarkRows,
} from "./censusSnapshot";
import committed from "../data/tierCensus.json";

const tier = (over = {}) => ({
  tier: "gold",
  count: 3788,
  share: 0.3,
  low: 0.28,
  high: 0.32,
  n: 12509,
  effectiveN: 2531,
  designEffect: 4.94,
  publishable: true,
  ...over,
});

const snapshot = (over = {}) => ({
  capturedAt: "2026-09-07T18:58:25Z",
  seasonId: "division.bro.official.pc-2018-42",
  current: true,
  shard: "steam",
  days: 7,
  accounts: 12509,
  matches: 845,
  windows: 7,
  firstDate: "2026-08-30",
  lastDate: "2026-09-05",
  perMatch: 15,
  tiers: [tier()],
  ...over,
});

describe("usableSnapshot", () => {
  it("accepts a snapshot that can stand in the static HTML", () => {
    expect(usableSnapshot(snapshot())).toEqual(snapshot());
  });

  // The whole point of committing a snapshot is that a crawler and a cold
  // visitor read numbers rather than a loading line. A snapshot with nothing
  // publishable in it would bake the "collection has only just started"
  // sentence into the file instead -- a claim about this minute, frozen for as
  // long as nobody deploys. Better to fall back to the live read for that.
  it("refuses one with no publishable tier", () => {
    expect(usableSnapshot(snapshot({ tiers: [tier({ publishable: false })] }))).toBeNull();
    expect(usableSnapshot(snapshot({ tiers: [] }))).toBeNull();
  });

  // What a reading looks like when a day of season 42 lobbies is measured
  // against the ladder of a season that opened that morning: everybody comes
  // back unplaced, and the one row that clears the publication bar says 100%
  // unranked. It is arithmetically fine and it is not a tier distribution --
  // the page's whole subject is where players sit on the ladder.
  it("refuses one where the only publishable row is the unranked bucket", () => {
    const unplaced = snapshot({
      seasonId: "division.bro.official.pc-2018-43",
      accounts: 2001,
      windows: 1,
      tiers: [tier({ tier: "unranked", count: 2001, share: 1, low: 0.998, high: 1 })],
    });

    expect(usableSnapshot(unplaced)).toBeNull();
  });

  it("accepts one where a ladder tier is publishable alongside the unranked bucket", () => {
    const mixed = snapshot({
      tiers: [tier({ tier: "unranked" }), tier({ tier: "gold" })],
    });

    expect(usableSnapshot(mixed)).toEqual(mixed);
  });

  it("refuses one that cannot date itself", () => {
    expect(usableSnapshot(snapshot({ firstDate: null }))).toBeNull();
    expect(usableSnapshot(snapshot({ lastDate: "" }))).toBeNull();
  });

  it("refuses one with no accounts behind it", () => {
    expect(usableSnapshot(snapshot({ accounts: 0 }))).toBeNull();
  });

  it("refuses anything that is not a snapshot at all", () => {
    for (const value of [null, undefined, 0, "", [], { tiers: "gold" }]) {
      expect(usableSnapshot(value)).toBeNull();
    }
  });
});

// A tier clearing the per-tier statistical bar says nothing about how many days
// of lobbies stand behind it. On 2026-09-13 one day of season 43 -- 145 matches,
// the second day of a reset -- came back with five publishable rungs and put
// Gold at 39.4% where a pooled week of season 42 had it at 29.0%. It was not a
// distribution, it was a snapshot of how far people had re-climbed by Thursday,
// and it displaced the finished season's chart everywhere: the page, the static
// HTML and both files the copy invites people to cite.
describe("publishableReading", () => {
  it("refuses a reading pooled over fewer days than the method claims", () => {
    expect(publishableReading(snapshot({ windows: 1 }))).toBe(false);
    expect(publishableReading(snapshot({ windows: 2 }))).toBe(false);
  });

  it("accepts one at the threshold", () => {
    expect(publishableReading(snapshot({ windows: MIN_POOLED_WINDOWS }))).toBe(true);
  });

  // Absence is not zero. An older deploy of the API, and every fixture written
  // before the field existed, simply do not send it -- and silence must not
  // blank a table that is otherwise sound.
  it("treats a missing window count as unknown rather than as none", () => {
    const { windows, ...undated } = snapshot();
    expect(windows).toBeDefined();
    expect(publishableReading(undated)).toBe(true);
  });

  it("still demands a rung of the ladder, however deep the pool", () => {
    const unplaced = snapshot({ windows: 7, tiers: [tier({ tier: "unranked" })] });
    expect(publishableReading(unplaced)).toBe(false);
  });

  it("agrees with the backend's own pooling floor", () => {
    expect(MIN_POOLED_WINDOWS).toBe(3);
  });
});

// Defence in depth against the same day. The workflow gate is what should stop
// a thin reading being committed; this is what stops one already committed from
// being rendered as though it were a measurement.
describe("usableSnapshot and pooling depth", () => {
  it("refuses a snapshot pooled over too few days", () => {
    expect(usableSnapshot(snapshot({ windows: 1 }))).toBeNull();
  });
});

describe("snapshotSeasonNumber", () => {
  it("reads the season off the id PUBG uses", () => {
    expect(snapshotSeasonNumber(snapshot())).toBe("42");
    expect(snapshotSeasonNumber(snapshot({ seasonId: "division.bro.official.pc-2018-7" }))).toBe("7");
  });

  it("is empty rather than wrong when there is no id", () => {
    expect(snapshotSeasonNumber(snapshot({ seasonId: null }))).toBe("");
    expect(snapshotSeasonNumber(null)).toBe("");
  });
});

describe("effectiveReadings", () => {
  // The tightest of the publishable tiers, not the average: the sentence beside
  // the table says how much information the sample carries, and the honest
  // answer is the one that holds for every interval drawn from it.
  it("takes the smallest effective sample any published tier had", () => {
    const data = snapshot({
      tiers: [
        tier({ tier: "gold", effectiveN: 2531 }),
        tier({ tier: "diamond", effectiveN: 1910 }),
        tier({ tier: "unranked", effectiveN: 10592 }),
      ],
    });
    expect(effectiveReadings(data)).toBe(1900);
  });

  it("ignores tiers that were not published", () => {
    const data = snapshot({
      tiers: [tier({ effectiveN: 2531 }), tier({ tier: "survivor", effectiveN: 12, publishable: false })],
    });
    expect(effectiveReadings(data)).toBe(2500);
  });

  it("rounds to a figure that does not pretend to be exact", () => {
    expect(effectiveReadings(snapshot({ tiers: [tier({ effectiveN: 2549 })] }))).toBe(2500);
    expect(effectiveReadings(snapshot({ tiers: [tier({ effectiveN: 2550 })] }))).toBe(2600);
    // Under a thousand there is nothing to round off without losing the size.
    expect(effectiveReadings(snapshot({ tiers: [tier({ effectiveN: 864 })] }))).toBe(860);
  });

  it("is null when nothing was published", () => {
    expect(effectiveReadings(snapshot({ tiers: [] }))).toBeNull();
    expect(effectiveReadings(null)).toBeNull();
  });
});

// The file the daily census job commits. If it ever stops being usable the page
// silently drops back to the loading line for every crawler, so this is checked
// rather than assumed.
describe("the committed snapshot", () => {
  it("is the one the page ships with", () => {
    expect(CENSUS_SNAPSHOT).not.toBeNull();
    expect(CENSUS_SNAPSHOT).toEqual(usableSnapshot(committed));
  });

  it("is drawn from the PC shard the copy names", () => {
    expect(CENSUS_SNAPSHOT.shard).toBe("steam");
  });

  it("carries the window it was measured over", () => {
    expect(CENSUS_SNAPSHOT.firstDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(CENSUS_SNAPSHOT.lastDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(CENSUS_SNAPSHOT.lastDate >= CENSUS_SNAPSHOT.firstDate).toBe(true);
  });

  // A share that does not sit in [0, 1], or an interval that does not contain
  // its own share, would be drawn as a bar running off the track.
  it("holds shares and intervals that make sense", () => {
    for (const row of CENSUS_SNAPSHOT.tiers.filter((entry) => entry.publishable)) {
      expect(row.share, row.tier).toBeGreaterThan(0);
      expect(row.share, row.tier).toBeLessThanOrEqual(1);
      expect(row.low, row.tier).toBeLessThanOrEqual(row.share);
      expect(row.high, row.tier).toBeGreaterThanOrEqual(row.share);
    }
  });
});

describe("rpTable", () => {
  const table = (overrides = {}) => {
    const values = Array.from({ length: 101 }, (_, i) => 5000 - i * 40);
    values[50] = values[49];
    return { rpPercentiles: values, ...overrides };
  };

  it("returns the table when it is 101 readings in non-ascending order", () => {
    const data = table();
    expect(rpTable(data)).toEqual(data.rpPercentiles);
  });

  it("allows equal neighbours, which is the normal shape of a crowded band", () => {
    const values = Array.from({ length: 101 }, () => 2000);
    expect(rpTable({ rpPercentiles: values })).toEqual(values);
  });

  it("refuses a table that is not exactly 101 long", () => {
    const values = table().rpPercentiles;
    expect(rpTable({ rpPercentiles: values.slice(0, 100) })).toBeNull();
    expect(rpTable({ rpPercentiles: [...values, 0] })).toBeNull();
  });

  it("refuses a table that rises anywhere", () => {
    const values = table().rpPercentiles.slice();
    values[70] = values[69] + 1;
    expect(rpTable({ rpPercentiles: values })).toBeNull();
  });

  it("refuses entries that are not numbers", () => {
    for (const bad of [null, "", "2000", undefined, NaN]) {
      const values = table().rpPercentiles.slice();
      values[3] = bad;
      expect(rpTable({ rpPercentiles: values }), String(bad)).toBeNull();
    }
  });

  it("returns null when there is no table at all", () => {
    expect(rpTable({})).toBeNull();
    expect(rpTable({ rpPercentiles: null })).toBeNull();
    expect(rpTable(null)).toBeNull();
    expect(rpTable(undefined)).toBeNull();
  });

  it("exposes the length it requires", () => {
    expect(RP_TABLE_LENGTH).toBe(101);
  });
});

describe("the RP table is not part of snapshot usability", () => {
  it("keeps a snapshot usable when the RP table is absent", () => {
    const snap = usableSnapshot(
      snapshot({
        tiers: [tier({ effectiveN: 2400 })],
        firstDate: "2026-09-01",
        lastDate: "2026-09-07",
        accounts: 11836,
      })
    );
    expect(snap).not.toBeNull();
    expect(rpTable(snap)).toBeNull();
  });

  it("keeps a snapshot usable when the RP table is malformed", () => {
    const snap = usableSnapshot(
      snapshot({
        tiers: [tier({ effectiveN: 2400 })],
        firstDate: "2026-09-01",
        lastDate: "2026-09-07",
        accounts: 11836,
        rpPercentiles: [1, 2, 3],
      })
    );
    expect(snap).not.toBeNull();
    expect(rpTable(snap)).toBeNull();
  });
});

const row = (tierName, over) => ({
  tier: tierName,
  lobbies: over ? 40 : 3,
  focals: 100,
  opponents: 300,
  publishable: Boolean(over),
  mix: [
    { tier: "gold", count: 200, share: 2 / 3, low: 0.4, high: 0.8 },
    { tier: "silver", count: 100, share: 1 / 3, low: 0.2, high: 0.5 },
  ],
});

describe("lobbyMixRows", () => {
  it("keeps only the rows that carry their own sample", () => {
    const rows = lobbyMixRows({ lobbyMix: [row("gold", true), row("master", false)] });
    expect(rows.map((r) => r.tier)).toEqual(["gold"]);
  });

  it("a mix whose shares do not add to one is refused whole", () => {
    const broken = row("gold", true);
    broken.mix = [{ tier: "gold", count: 1, share: 0.2, low: 0, high: 1 }];
    expect(lobbyMixRows({ lobbyMix: [broken] })).toBeNull();
  });

  it("absence is not emptiness", () => {
    expect(lobbyMixRows({})).toBeNull();
    expect(lobbyMixRows(null)).toBeNull();
  });

  it("no publishable row means nothing to draw", () => {
    expect(lobbyMixRows({ lobbyMix: [row("master", false)] })).toBeNull();
  });

  it("a mix with a coerced share (not a real number) is refused whole", () => {
    const corrupted = row("gold", true);
    corrupted.mix = [
      { tier: "gold", count: 200, share: 0.7, low: 0.4, high: 0.8 },
      { tier: "silver", count: 100, share: null, low: 0.2, high: 0.5 },
      { tier: "bronze", count: 0, share: 0.3, low: 0.1, high: 0.4 },
    ];
    expect(lobbyMixRows({ lobbyMix: [corrupted] })).toBeNull();
  });

  // lobbyMix.js legitimately emits mix: [] for a tier whose lobbies held no
  // other sampled player (its own test "a lobby with one sampled player
  // contributes no pairs" pins that) -- and that same aggregator never marks
  // such a row publishable (it requires opponents > 0). An empty,
  // UNPUBLISHABLE mix sums to zero, and the old check refused the WHOLE
  // payload for it -- one such row blanked a perfectly good day of data for
  // every other tier too.
  it("an unpublishable row with an empty mix does not blank the rest of the payload", () => {
    const emptyMix = row("survivor", false);
    emptyMix.mix = [];
    const rows = lobbyMixRows({ lobbyMix: [row("gold", true), emptyMix] });
    expect(rows).not.toBeNull();
    expect(rows.map((r) => r.tier)).toEqual(["gold"]);
    expect(rows.gated.map((r) => r.tier)).toEqual(["survivor"]);
  });

  // The aggregator cannot produce a PUBLISHABLE row with an empty mix
  // (publishable requires opponents > 0, and an empty mix has none), so this
  // shape is not real data but a malformed payload -- it must not sail through
  // and render as a row of all-0% cells.
  it("a publishable row claiming an empty mix is refused as malformed", () => {
    const impossible = row("survivor", true);
    impossible.mix = [];
    expect(lobbyMixRows({ lobbyMix: [row("gold", true), impossible] })).toBeNull();
  });

  it("keeps the tiers a fresh reading gated out, for the page to name", () => {
    const rows = lobbyMixRows({ lobbyMix: [row("gold", true), row("master", false)] });
    expect(rows.gated.map((r) => r.tier)).toEqual(["master"]);
  });
});

describe("gatedMixRows", () => {
  it("names the same gated tiers as the .gated property it stands in for", () => {
    const data = { lobbyMix: [row("gold", true), row("master", false)] };
    expect(gatedMixRows(data).map((r) => r.tier)).toEqual(["master"]);
  });

  it("survives a spread of the published rows, unlike the .gated expando", () => {
    const data = { lobbyMix: [row("gold", true), row("master", false)] };
    const rows = lobbyMixRows(data);
    const copied = [...rows];
    // The expando does not survive the spread -- this is the failure mode
    // gatedMixRows exists to route around, pinned here so a future change
    // that makes .gated itself spread-safe does not silently make this
    // assertion meaningless.
    expect(copied.gated).toBeUndefined();
    // gatedMixRows recomputes from the original data rather than reading
    // .gated off whatever rows array the caller happens to still be holding,
    // so it is unaffected by the copy above.
    expect(gatedMixRows(data).map((r) => r.tier)).toEqual(["master"]);
  });

  it("is an empty array, not null or undefined, when nothing was gated", () => {
    expect(gatedMixRows({ lobbyMix: [row("gold", true)] })).toEqual([]);
  });

  it("is an empty array when the payload has no usable mix at all", () => {
    expect(gatedMixRows({})).toEqual([]);
    expect(gatedMixRows(null)).toEqual([]);
    expect(gatedMixRows({ lobbyMix: [row("master", false)] })).toEqual([]);
  });
});

describe("benchmarkRows", () => {
  // The quartiles sit wider than the interval on purpose: low/high are the
  // uncertainty of this mean, p25/p75 are how far apart two players of the tier
  // are. A fixture where they matched would hide a validator that confused them.
  const metric = (mean) => ({
    mean, low: mean - 10, high: mean + 10, n: 120, effectiveN: 90, designEffect: 1.3,
    p25: mean - 60, p50: mean - 5, p75: mean + 70,
  });
  const benchmark = (tierName, over = {}) => ({
    tier: tierName, accounts: 120, lobbies: 90, publishable: true,
    metrics: {
      damage: metric(200), kills: metric(1.2), minutesAlive: metric(14),
      placement: { mean: 0.55, low: 0.5, high: 0.6, n: 120, effectiveN: 90, designEffect: 1.3, p25: 0.3, p50: 0.56, p75: 0.8 },
      noKillShare: { share: 0.4, low: 0.35, high: 0.45, n: 120, effectiveN: 90, designEffect: 1.3, publishable: true },
    },
    ...over,
  });

  it("returns only the publishable rows and remembers the rest", () => {
    const data = { benchmarks: [benchmark("gold"), benchmark("master", { publishable: false, accounts: 70 })] };
    expect(benchmarkRows(data).map((r) => r.tier)).toEqual(["gold"]);
    expect(gatedBenchmarkRows(data).map((r) => r.tier)).toEqual(["master"]);
  });

  // Half a projection is the deployment mismatch this guards: the API grew the
  // quartiles and the nightly jq program did not, so a median would draw with no
  // range under it on the columns that made it through and not on the others.
  it("refuses a published row whose quartiles did not arrive", () => {
    const thin = benchmark("gold");
    thin.metrics.kills = { ...thin.metrics.kills, p50: null };
    expect(benchmarkRows({ benchmarks: [thin] })).toBe(null);
  });

  // Out of order means an aggregation drifted, and the range drawn from it would
  // misstate the tier's spread rather than merely look odd.
  it("refuses quartiles that are not in order", () => {
    const crossed = benchmark("gold");
    crossed.metrics.damage = { ...crossed.metrics.damage, p25: 400, p50: 200, p75: 300 };
    expect(benchmarkRows({ benchmarks: [crossed] })).toBe(null);
  });

  it("refuses a payload with no publishable row", () => {
    expect(benchmarkRows({ benchmarks: [benchmark("master", { publishable: false })] })).toBe(null);
    expect(benchmarkRows({ benchmarks: [] })).toBe(null);
    expect(benchmarkRows({})).toBe(null);
  });

  // A coercible value like null or "" is not a number. A published row whose mean
  // is missing would render an empty cell in a table that claims to be measured.
  it("refuses the whole payload when a published row is malformed", () => {
    const broken = benchmark("gold");
    broken.metrics.damage = { ...broken.metrics.damage, mean: null };
    expect(benchmarkRows({ benchmarks: [broken] })).toBe(null);
  });

  it("refuses a placement outside the share it claims to be", () => {
    const broken = benchmark("gold");
    broken.metrics.placement = { ...broken.metrics.placement, mean: 1.4 };
    expect(benchmarkRows({ benchmarks: [broken] })).toBe(null);
  });

  // A gated row is allowed to be thin -- it is never drawn.
  it("does not judge a gated row's metrics", () => {
    const thin = benchmark("master", { publishable: false });
    thin.metrics.damage = { ...thin.metrics.damage, mean: null };
    expect(benchmarkRows({ benchmarks: [benchmark("gold"), thin] }).map((r) => r.tier)).toEqual(["gold"]);
  });
});
