// The PUBG ranked ladder as KRAFTON lists it, lowest tier first.
//
// Sourced to the Season 42 reward table (Update 42.1, 16 June 2026), which
// enumerates exactly these eight tiers in this order. Crystal's position comes
// from the Season 36 dev letter: "a new tier called Crystal will be added
// between Platinum and Diamond".
//
// Grandmaster is deliberately absent. It was a tier in PUBG's 2018 ranked beta
// and in nothing since -- it appears in no patch note, no reward table and no
// part of the API. Third-party guides still print it.
//
// `divisions` is 4 for every tier that has them: Update 36.1 cut divisions from
// five to four (PC 11 June 2025, console 19 June 2025). Master and Survivor are
// shown as single ranks -- KRAFTON has never published a per-tier division
// table, so `divisions: 1` here is the convention every source follows rather
// than a documented fact, and the page says so.

const icon = (slug) => `/images/ranks/opgg/${slug}.webp`;

export const RANK_LADDER = [
  { key: "bronze", divisions: 4, iconUrl: icon("bronze-1") },
  { key: "silver", divisions: 4, iconUrl: icon("silver-1") },
  { key: "gold", divisions: 4, iconUrl: icon("gold-1") },
  { key: "platinum", divisions: 4, iconUrl: icon("platinum-1") },
  { key: "crystal", divisions: 4, iconUrl: icon("crystal-1") },
  { key: "diamond", divisions: 4, iconUrl: icon("diamond-1") },
  { key: "master", divisions: 1, iconUrl: icon("master-1") },
  { key: "survivor", divisions: 1, iconUrl: icon("survivor-1") },
];

// PC Survivor slots per region, from the Update 36.1 table. KRAFTON prefaced it
// with "These numbers are subject to change based on matchmaking conditions"
// and has not republished it since, so the page dates it rather than presenting
// it as current.
export const SURVIVOR_SLOTS = [
  { key: "as", slots: 200 },
  { key: "sea", slots: 100 },
  { key: "eu", slots: 50 },
  { key: "kakao", slots: 50 },
  { key: "ru", slots: 50 },
  { key: "na", slots: 5 },
  { key: "sa", slots: 5 },
];

export default RANK_LADDER;
