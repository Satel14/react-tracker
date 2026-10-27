import { describe, it, expect } from "vitest";
import { snapshotOf, changeSince, timeAgo } from "./sinceLastVisit";

const stat = (value) => ({ value, displayValue: String(value) });
const S43 = "division.bro.official.pc-2018-43";

const payload = ({ matches = 100, wins = 5, kills = 80, rp = 2400, tier = "Gold 1", current = true, season = S43 } = {}) => ({
  platformInfo: { platformSlug: "steam", platformUserId: "account.3cc264b9e6754f459de7caf048f700b7" },
  season: {
    id: season,
    isCurrentSeason: current,
    rankedInfo: rp === null ? null : { currentRankPoint: rp, label: tier },
    stats: { matchesPlayed: stat(matches), wins: stat(wins), kills: stat(kills) },
  },
});

describe("snapshotOf", () => {
  it("keeps the current season's running totals, keyed by platform and account", () => {
    expect(snapshotOf(payload())).toEqual({
      key: "steam:account.3cc264b9e6754f459de7caf048f700b7",
      seasonId: S43,
      rankPoint: 2400,
      tier: "Gold 1",
      matches: 100,
      wins: 5,
      kills: 80,
    });
  });

  // A past season does not move, so "since you last looked" has nothing to say.
  it("is nothing for a past season", () => {
    expect(snapshotOf(payload({ current: false }))).toBeNull();
  });

  it("is nothing without an account id or a match count", () => {
    const anonymous = payload();
    anonymous.platformInfo.platformUserId = "WhiteChaseSmoker";
    expect(snapshotOf(anonymous)).toBeNull();

    const blank = payload();
    blank.season.stats.matchesPlayed = stat(null);
    expect(snapshotOf(blank)).toBeNull();
    expect(snapshotOf(null)).toBeNull();
  });

  it("keeps a player without ranked play, with no RP", () => {
    expect(snapshotOf(payload({ rp: null }))).toMatchObject({ rankPoint: null, tier: null, matches: 100 });
  });
});

describe("changeSince", () => {
  const before = { ...snapshotOf(payload()), at: 1000 };

  it("counts what happened since the last look", () => {
    const now = snapshotOf(payload({ matches: 106, wins: 6, kills: 94, rp: 2438, tier: "Gold 1" }));
    expect(changeSince(before, now)).toEqual({ since: 1000, matches: 6, wins: 1, kills: 14, rankPoint: 38, tier: null });
  });

  it("names the rank only when it changed", () => {
    const now = snapshotOf(payload({ matches: 103, rp: 2510, tier: "Platinum 4" }));
    expect(changeSince(before, now).tier).toBe("Platinum 4");
  });

  it("reports RP lost as a negative change", () => {
    const now = snapshotOf(payload({ matches: 102, rp: 2380 }));
    expect(changeSince(before, now).rankPoint).toBe(-20);
  });

  it("says nothing when nothing was played", () => {
    expect(changeSince(before, snapshotOf(payload()))).toBeNull();
  });

  it("says nothing on a first look", () => {
    expect(changeSince(null, snapshotOf(payload({ matches: 106 })))).toBeNull();
  });

  // Running totals only grow within a season; a smaller one means the two
  // readings are not comparable, not that the player lost matches.
  it("says nothing across seasons or when a total went backwards", () => {
    expect(changeSince(before, snapshotOf(payload({ season: "division.bro.official.pc-2018-44", matches: 3 })))).toBeNull();
    expect(changeSince(before, snapshotOf(payload({ matches: 90 })))).toBeNull();
    expect(changeSince(before, snapshotOf(payload({ matches: 106, kills: 70 })))).toBeNull();
  });

  it("leaves RP out when either look had none", () => {
    const now = snapshotOf(payload({ matches: 104, rp: null }));
    expect(changeSince(before, now)).toMatchObject({ matches: 4, rankPoint: null, tier: null });
  });
});

describe("timeAgo", () => {
  const MINUTE = 60 * 1000;
  it("says how long ago in the reader's language", () => {
    expect(timeAgo(5 * MINUTE, "en")).toBe("5 minutes ago");
    expect(timeAgo(3 * 60 * MINUTE, "en")).toBe("3 hours ago");
    expect(timeAgo(2 * 24 * 60 * MINUTE, "en")).toBe("2 days ago");
    expect(timeAgo(3 * 24 * 60 * MINUTE, "ua")).toBe("3 дні тому");
  });

  // Yesterday and the day before read better as words, in both languages.
  it("uses the words for the last two days", () => {
    expect(timeAgo(24 * 60 * MINUTE, "en")).toBe("yesterday");
    expect(timeAgo(2 * 24 * 60 * MINUTE, "ua")).toBe("позавчора");
  });

  it("never says less than a minute", () => {
    expect(timeAgo(10 * 1000, "en")).toBe("1 minute ago");
  });
});
