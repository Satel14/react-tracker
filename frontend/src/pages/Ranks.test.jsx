import React from "react";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { setTranslations, setDefaultLanguage, setLanguage } from "react-switch-lang";
import Ranks from "./Ranks";
import { ROUTE_META } from "../helpers/routeMeta";
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
  expect(screen.getByText(ua.pages.ranks.ladder.heading)).toBeInTheDocument();
});
