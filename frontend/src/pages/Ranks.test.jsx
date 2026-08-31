import React from "react";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { setTranslations, setDefaultLanguage, setLanguage } from "react-switch-lang";
import Ranks from "./Ranks";
import { ROUTE_META } from "../helpers/routeMeta";
import { RANK_LADDER, SURVIVOR_SLOTS, DIVISION_PIPS } from "../helpers/rankLadder";
import en from "../Language/en.json";
import ua from "../Language/ua.json";

const renderPage = () => {
  setTranslations({ en, ua });
  setDefaultLanguage("en");
  return render(
    <MemoryRouter>
      <Ranks />
    </MemoryRouter>
  );
};

afterEach(() => {
  setTranslations({});
  setDefaultLanguage("en");
});

test("renders every section, in the order the copy is written", () => {
  const { container } = renderPage();
  const headings = Array.from(container.querySelectorAll("h2")).map((h) => h.textContent);
  expect(headings).toEqual([
    en.pages.ranks.ladder.heading,
    en.pages.ranks.grandmaster.heading,
    en.pages.ranks.howRpMoves.heading,
    en.pages.ranks.tierProtection.heading,
    en.pages.ranks.survivorTier.heading,
    en.pages.ranks.rpDecay.heading,
    en.pages.ranks.update421.heading,
    en.pages.ranks.queuesAndMaps.heading,
    en.pages.ranks.seasonSchedule.heading,
    en.pages.ranks.whatWeDoNotClaim.heading,
  ]);
});

// The static shell writes routeMeta's h1 and intro into #root, and React then
// replaces them. If the two drift, a crawler reads one page and a visitor sees
// another.
test("renders the same h1 and intro the prerendered shell injects", () => {
  renderPage();
  const meta = ROUTE_META.find((route) => route.path === "/ranks");
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(meta.h1);
  expect(screen.getByText(meta.intro)).toBeInTheDocument();
});

test("lists the eight tiers in ladder order, Grandmaster absent", () => {
  const { container } = renderPage();
  const names = Array.from(container.querySelectorAll(".ranks-page__tier-name")).map(
    (node) => node.textContent
  );
  expect(names).toHaveLength(8);
  expect(names[0]).toMatch(/^Bronze/);
  expect(names[4]).toMatch(/^Crystal/);
  expect(names[7]).toMatch(/^Survivor/);
  expect(names.join(" ")).not.toMatch(/Grandmaster|Top 500/);
});

test("says which tiers have divisions and which do not", () => {
  const { container } = renderPage();
  const tiers = Array.from(container.querySelectorAll(".ranks-page__tier"));
  // Master and Survivor are the two single ranks; the other six carry four
  // divisions each, and no tier may claim five.
  const single = tiers.filter((tier) =>
    within(tier).queryByText(en.pages.ranks.ladder.divisionsSingle)
  );
  expect(single).toHaveLength(2);
  expect(container.textContent).toContain("4 divisions");
  expect(container.textContent).not.toContain("5 divisions");
});

test("renders a paragraph for every string the copy defines", () => {
  const { container } = renderPage();
  // A section that gained a paragraph in translation but not in SECTIONS would
  // silently drop it, and nothing else would notice.
  const written = Object.entries(en.pages.ranks)
    .filter(([, value]) => typeof value === "object")
    .flatMap(([, value]) => Object.entries(value).filter(([key]) => /^p\d+$/.test(key)))
    .map(([, text]) => text);
  expect(written.length).toBeGreaterThan(40);
  for (const text of written) {
    expect(container.textContent, text.slice(0, 40)).toContain(text);
  }
});

test("links on to the leaderboards", () => {
  renderPage();
  expect(screen.getByRole("link", { name: en.pages.ranks.seeLeaderboards })).toHaveAttribute(
    "href",
    "/leaderboards"
  );
});

test("renders in Ukrainian too", () => {
  setTranslations({ en, ua });
  setDefaultLanguage("en");
  setLanguage("ua");
  render(
    <MemoryRouter>
      <Ranks />
    </MemoryRouter>
  );
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(ua.pages.ranks.title);
  // By role, not by text: the contents rail repeats every heading verbatim, so
  // a bare getByText finds two nodes and throws.
  expect(
    screen.getByRole("heading", { level: 2, name: ua.pages.ranks.ladder.heading })
  ).toBeInTheDocument();
});

// SURVIVOR_SLOTS shipped in rankLadder.js with the Update 36.1 sourcing and a
// test, and then rendered nowhere. It is the closest thing to a free answer to
// "how rare is Survivor" -- the exact question a month-long API crawl was being
// sized to answer worse.
test("shows how many Survivor slots each region gets", () => {
  const { container } = renderPage();
  const rows = container.querySelectorAll(".ranks-page__slot");
  expect(rows).toHaveLength(SURVIVOR_SLOTS.length);

  const text = container.textContent;
  for (const region of SURVIVOR_SLOTS) {
    expect(text, region.key).toContain(String(region.slots));
  }
  // The number that makes the point. 460 is every PC region in the table;
  // the 410 quoted elsewhere excludes Kakao, which runs on its own shard --
  // so the copy has to say which one it means.
  expect(text).toContain("460");
});

test("dates the slot table instead of passing it off as current", () => {
  const { container } = renderPage();
  expect(container.textContent).toContain(en.pages.ranks.survivorTier.p5);
});

// The rail reuses each section's own heading rather than a second set of short
// labels, so a heading reworded in the copy cannot leave a nav entry quoting
// the old wording at an anchor that still resolves.
test("points the contents rail at every section on the page", () => {
  const { container } = renderPage();
  const links = Array.from(container.querySelectorAll(".ranks-page__toc-list a"));
  const sections = Array.from(container.querySelectorAll(".ranks-page__section"));
  expect(links).toHaveLength(sections.length);
  expect(links.map((link) => link.getAttribute("href"))).toEqual(
    sections.map((section) => `#${section.id}`)
  );
  expect(links.map((link) => link.textContent)).toEqual(
    sections.map((section) => section.querySelector("h2").textContent)
  );
});

// Every headline number has to be one KRAFTON published and has not since
// contradicted. The per-match RP swing is the one that fails that bar: Season
// 36 capped it at -44/+44 and Update 42.1 stacked bonuses on top without
// restating the cap, so the copy refuses to call it current. However quotable
// it looks, it may not appear in large type here.
test("puts four published numbers in the key-fact strip, and not the RP swing", () => {
  const { container } = renderPage();
  const facts = Array.from(container.querySelectorAll(".ranks-page__fact"));
  const values = facts.map(
    (fact) => fact.querySelector(".ranks-page__fact-value").textContent
  );
  expect(values).toEqual(["8", "3,700", "3", "100"]);
  expect(values[0]).toBe(String(RANK_LADDER.length));
  expect(container.querySelector(".ranks-page__facts").textContent).not.toContain("44");
});

// The seat counts only make their point beside one another: NA gets five where
// AS gets two hundred. The bar is that comparison, so it is scaled off the
// largest region rather than off the 460-seat total.
test("scales each Survivor slot bar off the largest region", () => {
  const { container } = renderPage();
  const bars = Array.from(container.querySelectorAll(".ranks-page__slot-bar > span"));
  const largest = Math.max(...SURVIVOR_SLOTS.map((region) => region.slots));
  expect(bars).toHaveLength(SURVIVOR_SLOTS.length);
  expect(bars.map((bar) => bar.style.width)).toEqual(
    SURVIVOR_SLOTS.map((region) => `${(region.slots / largest) * 100}%`)
  );
});

// Decoration that repeats what the row already says in prose: hidden from the
// accessibility tree, and pinned to the division count so the pips cannot
// quietly disagree with the sentence beside them.
test("draws one division pip per division, and none for a single rank", () => {
  const { container } = renderPage();
  const tiers = Array.from(container.querySelectorAll(".ranks-page__tier"));
  expect(tiers).toHaveLength(RANK_LADDER.length);
  tiers.forEach((tier, index) => {
    const pips = tier.querySelector(".ranks-page__tier-pips");
    const { divisions } = RANK_LADDER[index];
    if (divisions === 1) {
      expect(pips, RANK_LADDER[index].key).toBeNull();
      return;
    }
    expect(pips).toHaveAttribute("aria-hidden", "true");
    expect(pips.querySelectorAll("li")).toHaveLength(divisions);
    expect(pips.textContent).toBe(DIVISION_PIPS.slice(-divisions).join(""));
  });
});
