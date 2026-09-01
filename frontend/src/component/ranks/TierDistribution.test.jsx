import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import { setTranslations, setDefaultLanguage, t } from "react-switch-lang";
import TierDistribution from "./TierDistribution";
import { RANK_LADDER } from "../../helpers/rankLadder";
import en from "../../Language/en.json";

const tier = (key, share, low, high) => ({
  tier: key,
  count: Math.round(share * 4430),
  share,
  low,
  high,
  n: 4430,
  effectiveN: 865,
  designEffect: 5.1,
  publishable: true,
});

const SAMPLE = {
  seasonId: "division.bro.official.pc-2018-42",
  shard: "steam",
  days: 7,
  accounts: 4430,
  matches: 297,
  windows: 2,
  firstDate: "2026-08-30",
  lastDate: "2026-08-31",
  perMatch: 15,
  tiers: [
    tier("gold", 0.311, 0.2811, 0.3427),
    tier("platinum", 0.2104, 0.1852, 0.238),
    tier("silver", 0.1783, 0.1546, 0.2049),
    tier("crystal", 0.1248, 0.1037, 0.1496),
    tier("bronze", 0.086, 0.0686, 0.1074),
    tier("diamond", 0.0738, 0.0566, 0.0957),
    tier("master", 0.0081, 0.0046, 0.0143),
    tier("unranked", 0.0072, 0.0048, 0.0107),
    { tier: "survivor", count: 1, share: 0.000226, low: 0.00004, high: 0.00128, n: 4430, publishable: false },
  ],
};

const show = (data, over = {}) =>
  render(<TierDistribution t={t} load={async () => ({ status: 200, data })} {...over} />);

beforeEach(() => {
  setTranslations({ en });
  setDefaultLanguage("en");
});

afterEach(() => {
  setTranslations({});
});

const rows = (container) => Array.from(container.querySelectorAll(".ranks-page__share"));

// Ladder order, not sorted by size. The hump at Gold and the cliff after
// Diamond are the shape of the thing; sorting by count would flatten it into
// a ranking nobody asked for.
test("lists every ladder tier in ladder order, with unranked last", async () => {
  const { container } = show(SAMPLE);
  await waitFor(() => expect(rows(container).length).toBeGreaterThan(0));

  const keys = rows(container).map((row) => row.getAttribute("data-tier"));
  expect(keys).toEqual([...RANK_LADDER.map((entry) => entry.key), "unranked"]);
});

test("prints each tier's share and how far it could be out", async () => {
  const { container } = show(SAMPLE);
  await waitFor(() => expect(rows(container).length).toBeGreaterThan(0));

  const gold = rows(container).find((row) => row.getAttribute("data-tier") === "gold");
  expect(within(gold).getByText("31.1%")).toBeInTheDocument();
  // (0.3427 - 0.2811) / 2 = 3.08pp
  expect(gold.textContent).toContain("3.1");
});

// n=1 is not a measurement of 0.02%. Printing it would be the one number on
// this page that its own interval disowns.
test("a tier with too few observations says so instead of showing a number", async () => {
  const { container } = show(SAMPLE);
  await waitFor(() => expect(rows(container).length).toBeGreaterThan(0));

  const survivor = rows(container).find((row) => row.getAttribute("data-tier") === "survivor");
  expect(survivor.textContent).toContain(en.pages.ranks.distribution.tooFew);
  expect(survivor.textContent).not.toContain("0.0%");
  expect(survivor.querySelector(".ranks-page__share-fill")).toBeNull();
});

// Off the widest interval, not off the widest share and not off 100%. At
// absolute scale two thirds of the track is permanently empty; scaled off the
// share instead, the top tier's bar fills the whole track and its upper bound
// is clipped away -- so the tier carrying the most uncertainty gets drawn with
// the least.
test("scales the bars so the widest interval still fits on the track", async () => {
  const widest = 0.3427;
  const { container } = show(SAMPLE);
  await waitFor(() => expect(rows(container).length).toBeGreaterThan(0));

  const fill = (key) =>
    rows(container)
      .find((row) => row.getAttribute("data-tier") === key)
      .querySelector(".ranks-page__share-fill").style.width;

  expect(fill("gold")).toBe(`${(0.311 / widest) * 100}%`);
  expect(fill("platinum")).toBe(`${(0.2104 / widest) * 100}%`);
});

test("draws the interval from its low bound to its high one", async () => {
  const widest = 0.3427;
  const { container } = show(SAMPLE);
  await waitFor(() => expect(rows(container).length).toBeGreaterThan(0));

  const range = rows(container)
    .find((row) => row.getAttribute("data-tier") === "platinum")
    .querySelector(".ranks-page__share-range");

  expect(range.style.left).toBe(`${(0.1852 / widest) * 100}%`);
  expect(range.style.width).toBe(`${((0.238 - 0.1852) / widest) * 100}%`);
});

// The defect this replaced, caught by looking at the render: Gold, the tier
// with the widest interval, had its upper bound sliced off by the end of the
// track and so appeared the most certain of them all.
test("no tier's interval runs off the end of its track", async () => {
  const { container } = show(SAMPLE);
  await waitFor(() => expect(rows(container).length).toBeGreaterThan(0));

  const ranges = rows(container)
    .map((row) => row.querySelector(".ranks-page__share-range"))
    .filter(Boolean);

  expect(ranges).toHaveLength(8);
  for (const range of ranges) {
    const right = parseFloat(range.style.left) + parseFloat(range.style.width);
    expect(right).toBeLessThanOrEqual(100);
  }
});

test("states what the sample is measured from", async () => {
  const { container } = show(SAMPLE);
  await waitFor(() => expect(rows(container).length).toBeGreaterThan(0));

  const text = container.textContent;
  expect(text).toContain("4,430");
  expect(text).toContain("297");
  expect(text).toContain("2026-08-30");
  expect(text).toContain("2026-08-31");
});

test("says it is reading before the numbers arrive", () => {
  const { container } = render(
    <TierDistribution t={t} load={() => new Promise(() => {})} />
  );
  expect(screen.getByText(en.pages.ranks.distribution.loading)).toBeInTheDocument();
  expect(rows(container)).toHaveLength(0);
});

// The article is the point. A census that is down folds this section to one
// line rather than taking the page with it.
test("folds to a single line when the census cannot be reached", async () => {
  const { container } = render(
    <TierDistribution t={t} load={async () => { throw new Error("offline"); }} />
  );
  await screen.findByText(en.pages.ranks.distribution.unavailable);
  expect(rows(container)).toHaveLength(0);
});

// What every season rollover looks like for its first days.
test("says collection has started when no tier is publishable yet", async () => {
  const thin = {
    ...SAMPLE,
    seasonId: "division.bro.official.pc-2018-43",
    accounts: 12,
    matches: 1,
    windows: 1,
    tiers: [{ tier: "gold", count: 12, share: 1, low: 0.7, high: 1, n: 12, publishable: false }],
  };
  const { container } = show(thin);

  await screen.findByText(/just started/i);
  expect(rows(container)).toHaveLength(0);
  // Naming the season is the point of the sentence: the numbers are gone
  // because the season turned over, not because the site broke.
  expect(container.textContent).toContain("43");
});

test("asks for nothing at all when there is no sample yet", async () => {
  const { container } = show({ ...SAMPLE, accounts: 0, matches: 0, windows: 0, tiers: [] });
  await screen.findByText(/just started/i);
  expect(rows(container)).toHaveLength(0);
});

// --- across a season boundary ---
//
// Ranked resets every three months. For the first days of a new season the API
// keeps serving the finished one, because "almost nobody has placed yet" is a
// true measurement and a misleading answer. The page has to say which season it
// is looking at rather than pass the old one off as current.

test("says so when it is showing a season that has ended", async () => {
  const { container } = show({ ...SAMPLE, current: false });
  await waitFor(() => expect(rows(container).length).toBeGreaterThan(0));

  const note = container.querySelector(".ranks-page__share-stale");
  expect(note).not.toBeNull();
  expect(note.textContent).toContain("42");
  // The numbers are still shown -- a finished season's distribution is the
  // more meaningful one, it just is not the current one.
  expect(container.textContent).toContain("31.1%");
});

test("does not caveat the season being played right now", async () => {
  const { container } = show({ ...SAMPLE, current: true });
  await waitFor(() => expect(rows(container).length).toBeGreaterThan(0));

  expect(container.querySelector(".ranks-page__share-stale")).toBeNull();
});

// An older deploy of the API does not send the flag at all. Silence must not
// be read as "this season is over".
test("treats a missing flag as the current season", async () => {
  const { container } = show(SAMPLE);
  await waitFor(() => expect(rows(container).length).toBeGreaterThan(0));

  expect(container.querySelector(".ranks-page__share-stale")).toBeNull();
});
