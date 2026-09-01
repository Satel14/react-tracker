import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { setTranslations, setDefaultLanguage, t } from "react-switch-lang";
import RankPercentile from "./RankPercentile";
import en from "../../Language/en.json";

const SEASON = "division.bro.official.pc-2018-42";

// 101 thresholds, highest first, exactly as the endpoint ships them.
const thresholds = Array.from({ length: 101 }, (_, i) => Math.round(3600 - (2600 * i) / 100));

const payload = (over = {}) => ({
  seasonId: SEASON,
  accounts: 4430,
  rpPercentiles: thresholds,
  ...over,
});

const show = (props = {}, data = payload()) =>
  render(
    <MemoryRouter>
      <RankPercentile
        t={t}
        seasonId={SEASON}
        rankPoint={thresholds[16]}
        load={async () => ({ status: 200, data })}
        {...props}
      />
    </MemoryRouter>
  );

beforeEach(() => {
  setTranslations({ en });
  setDefaultLanguage("en");
});

afterEach(() => {
  setTranslations({});
});

const line = () => document.querySelector(".player-rank-percentile");

test("places the player and points at the numbers behind it", async () => {
  show();
  const note = await screen.findByRole("link");

  expect(note).toHaveAttribute("href", "/ranks#distribution");
  expect(line().textContent).toMatch(/16%/);
});

// "Top 78%" is a strange thing to tell somebody. Below halfway the same
// measurement reads better from the other end, and is no less true.
test("reads from the other end below halfway", async () => {
  show({ rankPoint: thresholds[78] });
  await screen.findByRole("link");

  expect(line().textContent).toMatch(/22%/);
  expect(line().textContent).not.toMatch(/78%/);
});

test("says nothing until the sample has arrived", () => {
  show({ load: () => new Promise(() => {}) });
  expect(line()).toBeNull();
});

// The page can be showing any season. A standing has to be measured against
// the ladder it belongs to, and after a reset the census serves the previous
// season for days.
test("says nothing when the census is about a different season", async () => {
  show({ seasonId: "division.bro.official.pc-2018-43" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(line()).toBeNull();
});

test("says nothing when the sample was too thin to cut", async () => {
  show({}, payload({ rpPercentiles: null }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(line()).toBeNull();
});

test("says nothing for a player with no ranked reading", async () => {
  for (const rankPoint of [null, undefined, 0 / 0, ""]) {
    document.body.innerHTML = "";
    show({ rankPoint });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(line(), String(rankPoint)).toBeNull();
  }
});

test("says nothing when the census cannot be reached", async () => {
  show({ load: async () => { throw new Error("offline"); } });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(line()).toBeNull();
});

// The visible line answers the one question the reader came with. How the
// number was arrived at is real and has to be reachable, but in the same
// sentence it buried the answer -- so it moves to the hover and to the page
// the link already points at.
test("keeps the methodology out of the visible line", async () => {
  show();
  const link = await screen.findByRole("link");

  expect(line().textContent).not.toContain("4,430");
  expect(line().textContent).not.toMatch(/7 days|sampled/i);
  expect(link.getAttribute("title")).toContain("4,430");
  expect(link.getAttribute("title")).toContain("7");
});

test("keeps the visible line to one short sentence", async () => {
  show();
  await screen.findByRole("link");
  expect(line().textContent.length).toBeLessThan(45);
});
