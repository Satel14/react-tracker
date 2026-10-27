import { describe, it, expect } from "vitest";
import { seasonRecap, previousSeason } from "./seasonRecap";

const stat = (value) => ({ value, displayValue: value === null ? "N/A" : String(value) });

const season = (overrides = {}) => ({
  id: "division.bro.official.pc-2018-43",
  isCurrentSeason: false,
  rankedInfo: {
    tier: "Platinum",
    subTier: "2",
    label: "Platinum II",
    currentRankPoint: 2450,
    bestRankPoint: 2610,
    avgRank: 9.4,
    mode: "squad-fpp",
  },
  breakdown: {
    ranked: {
      matchesPlayed: stat(138),
      wins: stat(9),
      top10Rate: stat(41.3),
      kd: stat(2.1),
      avgDamage: stat(312),
    },
    normal: { bestGameKills: stat(11), longestKill: stat(512.4) },
  },
  ...overrides,
});

describe("seasonRecap", () => {
  it("collects the season's rank, ranked numbers and records", () => {
    expect(seasonRecap(season())).toEqual({
      seasonId: "division.bro.official.pc-2018-43",
      season: 43,
      finished: true,
      tier: "platinum",
      tierLabel: "Platinum II",
      rankPoint: 2450,
      peakRankPoint: 2610,
      ranked: { matches: 138, wins: 9, top10Rate: 41.3, kd: 2.1, avgDamage: 312, avgPlace: 9.4 },
      records: { mostKills: 11, longestKill: 512.4 },
    });
  });

  it("is still running while the season is current", () => {
    expect(seasonRecap(season({ isCurrentSeason: true })).finished).toBe(false);
  });

  // A peak equal to where the season ended is not a second number worth a line.
  it("drops the peak when the season ended on it", () => {
    const flat = season();
    flat.rankedInfo = { ...flat.rankedInfo, bestRankPoint: 2450 };
    expect(seasonRecap(flat).peakRankPoint).toBeNull();
  });

  it("drops a peak below the final reading, which no ladder produces", () => {
    const odd = season();
    odd.rankedInfo = { ...odd.rankedInfo, bestRankPoint: 1900 };
    expect(seasonRecap(odd).peakRankPoint).toBeNull();
  });

  it("is nothing for a season without ranked play", () => {
    expect(seasonRecap(season({ rankedInfo: null }))).toBeNull();
    expect(seasonRecap(null)).toBeNull();
  });

  // Unknown is not zero: PUBG can leave deaths out, and K/D with it.
  it("keeps an unknown number unknown", () => {
    const partial = season();
    partial.breakdown = { ranked: { ...partial.breakdown.ranked, kd: stat(null) }, normal: null };
    const recap = seasonRecap(partial);
    expect(recap.ranked.kd).toBeNull();
    expect(recap.records).toEqual({ mostKills: null, longestKill: null });
  });

  // Ranked mode reports these two as a literal 0 whatever happened, so they
  // only ever come from normal matches; a 0 there is "no record", not a record.
  it("treats a zero record as no record", () => {
    const quiet = season();
    quiet.breakdown = { ...quiet.breakdown, normal: { bestGameKills: stat(0), longestKill: stat(0) } };
    expect(seasonRecap(quiet).records).toEqual({ mostKills: null, longestKill: null });
  });

  it("reads the season number off the id", () => {
    expect(seasonRecap(season({ id: "division.bro.official.console-43" })).season).toBe(43);
  });
});

describe("previousSeason", () => {
  const seasons = [
    { id: "division.bro.official.pc-2018-44", seasonNumber: 44, isCurrentSeason: true },
    { id: "division.bro.official.pc-2018-43", seasonNumber: 43, isCurrentSeason: false },
    { id: "division.bro.official.pc-2018-42", seasonNumber: 42, isCurrentSeason: false },
  ];

  it("is the season numbered one below the one on screen", () => {
    expect(previousSeason("division.bro.official.pc-2018-44", seasons)).toEqual(seasons[1]);
  });

  it("is nothing when that season is not in the list", () => {
    expect(previousSeason("division.bro.official.pc-2018-42", seasons)).toBeNull();
    expect(previousSeason("division.bro.official.pc-2018-44", [])).toBeNull();
    expect(previousSeason(null, seasons)).toBeNull();
  });
});
