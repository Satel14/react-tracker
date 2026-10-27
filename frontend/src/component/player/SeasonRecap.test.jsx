import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { setTranslations, setDefaultLanguage, setLanguage } from "react-switch-lang";
import SeasonRecap from "./SeasonRecap";
import en from "../../Language/en.json";
import ua from "../../Language/ua.json";

const downloadSeasonRecap = vi.fn();
vi.mock("../../helpers/downloadSeasonRecap", () => ({
  downloadSeasonRecap: (...args) => downloadSeasonRecap(...args),
}));

const S43 = "division.bro.official.pc-2018-43";
const stat = (value) => ({ value, displayValue: String(value) });

const season = (overrides = {}) => ({
  id: S43,
  isCurrentSeason: false,
  rankedInfo: { tier: "Platinum", subTier: "2", label: "Platinum II", currentRankPoint: 2450, bestRankPoint: 2610, avgRank: 9.4 },
  breakdown: {
    ranked: { matchesPlayed: stat(138), wins: stat(9), top10Rate: stat(41.3), kd: stat(2.1), avgDamage: stat(312) },
    normal: { bestGameKills: stat(11), longestKill: stat(512.4) },
  },
  ...overrides,
});

const seasons = [
  { id: "division.bro.official.pc-2018-44", seasonNumber: 44, isCurrentSeason: true },
  { id: S43, seasonNumber: 43, isCurrentSeason: false },
];

// The census answers with 101 RP thresholds, highest first; 2450 first clears
// index 28 of this made-up table, so the line reads "better than 72".
const census = (seasonId = S43) => ({
  data: {
    seasonId,
    accounts: 9000,
    days: 7,
    rpPercentiles: Array.from({ length: 101 }, (_, i) => 2450 + (28 - i) * 10),
  },
});

const renderRecap = ({ language = "en", props = {} } = {}) => {
  setTranslations({ en, ua });
  setDefaultLanguage("en");
  setLanguage(language);
  const onOpenSeason = vi.fn();
  const loadDistribution = props.loadDistribution || vi.fn().mockResolvedValue(census());
  const view = render(
    <SeasonRecap
      season={season()}
      seasons={seasons}
      playerName="WhiteChaseSmoker"
      platform="steam"
      onOpenSeason={onOpenSeason}
      loadDistribution={loadDistribution}
      {...props}
    />
  );
  return { ...view, onOpenSeason, loadDistribution };
};

beforeEach(() => {
  downloadSeasonRecap.mockReset();
  downloadSeasonRecap.mockResolvedValue(undefined);
  window.gtag = vi.fn();
});

afterEach(() => {
  delete window.gtag;
  setTranslations({});
  setDefaultLanguage("en");
});

test("shows a finished season's rank, peak and ranked numbers", async () => {
  renderRecap();
  expect(screen.getByRole("heading", { name: "Season 43 · final" })).toBeInTheDocument();
  expect(screen.getByText("Platinum II")).toBeInTheDocument();
  expect(screen.getByText("2,450 RP")).toBeInTheDocument();
  expect(screen.getByText("Season high 2,610 RP")).toBeInTheDocument();
  const stats = screen.getByRole("list", { name: "Season 43 · final" });
  for (const [label, value] of [["Ranked matches", "138"], ["Wins", "9"], ["Top 10", "41%"], ["K/D", "2.10"], ["Damage per match", "312"], ["Average place", "9.4"]]) {
    expect(within(stats).getByText(label).closest("li")).toHaveTextContent(value);
  }
  expect(screen.getByText(/Records in normal matches/)).toHaveTextContent("Most kills in a match 11 · Longest kill 512 m");
});

test("says so far while the season runs", () => {
  renderRecap({ props: { season: season({ isCurrentSeason: true, id: "division.bro.official.pc-2018-44" }) } });
  expect(screen.getByRole("heading", { name: "Season 44 so far" })).toBeInTheDocument();
});

test("places the player against the census when the census measured that season", async () => {
  renderRecap();
  expect(await screen.findByText("Better than 72 out of 100 ranked players")).toBeInTheDocument();
});

test("says nothing about standing when the census measured another season", async () => {
  const { loadDistribution } = renderRecap({ props: { loadDistribution: vi.fn().mockResolvedValue(census("division.bro.official.pc-2018-44")) } });
  await waitFor(() => expect(loadDistribution).toHaveBeenCalled());
  await Promise.resolve();
  expect(screen.queryByText(/Better than/)).toBeNull();
});

// Reached by "Season N recap →", so an empty card is an answer, not a gap:
// found live on 2026-10-27, where the click left the page with no block at all.
test("a past season without ranked play says so and offers the way back", () => {
  const { onOpenSeason } = renderRecap({ props: { season: season({ rankedInfo: null }) } });
  expect(screen.getByRole("heading", { name: "Season 43 · final" })).toBeInTheDocument();
  expect(screen.getByText("No ranked matches this season.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Download image" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "← Season 44" }));
  expect(onOpenSeason).toHaveBeenCalledWith("division.bro.official.pc-2018-44");
});

test("a past season's recap offers the way back to the current one", () => {
  const { onOpenSeason } = renderRecap();
  fireEvent.click(screen.getByRole("button", { name: "← Season 44" }));
  expect(onOpenSeason).toHaveBeenCalledWith("division.bro.official.pc-2018-44");
});

// Only season 44 in the list: with a previous season the "recap →" link takes
// the head's place and would hide a wrong "← Season 44" from this test.
test("the current season offers no way back to itself", () => {
  renderRecap({
    props: {
      season: season({ id: "division.bro.official.pc-2018-44", isCurrentSeason: true }),
      seasons: [seasons[0]],
    },
  });
  expect(screen.getByRole("heading", { name: "Season 44 so far" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^←/ })).toBeNull();
});

test("without a known current season there is no way back to offer", () => {
  renderRecap({ props: { season: season({ rankedInfo: null }), seasons: [] } });
  expect(screen.getByText("No ranked matches this season.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^←/ })).toBeNull();
});

test("offers the previous season's recap from the current one", () => {
  const current = season({ id: "division.bro.official.pc-2018-44", isCurrentSeason: true, rankedInfo: null });
  const { onOpenSeason } = renderRecap({ props: { season: current } });
  fireEvent.click(screen.getByRole("button", { name: "Season 43 recap →" }));
  expect(onOpenSeason).toHaveBeenCalledWith(S43);
});

// Season 42 is in the list on purpose: without it the link could be missing
// for the wrong reason.
test("does not offer a previous season from a past one", () => {
  renderRecap({
    props: { seasons: [...seasons, { id: "division.bro.official.pc-2018-42", seasonNumber: 42, isCurrentSeason: false }] },
  });
  expect(screen.queryByRole("button", { name: /recap →/ })).toBeNull();
});

test("downloads the image with the figures on screen, then reports it", async () => {
  renderRecap();
  await screen.findByText("Better than 72 out of 100 ranked players");
  fireEvent.click(screen.getByRole("button", { name: "Download image" }));

  await waitFor(() => expect(downloadSeasonRecap).toHaveBeenCalledTimes(1));
  const [recap, options] = downloadSeasonRecap.mock.calls[0];
  expect(recap).toMatchObject({ season: 43, rankPoint: 2450, finished: true });
  expect(options).toMatchObject({ language: "en", playerName: "WhiteChaseSmoker", platform: "steam", percentile: 72 });
  await waitFor(() =>
    expect(window.gtag).toHaveBeenCalledWith("event", "season_recap_download", { season: 43 })
  );
});

test("says so when the image could not be made", async () => {
  downloadSeasonRecap.mockRejectedValue(new Error("Canvas is unavailable"));
  renderRecap();
  fireEvent.click(screen.getByRole("button", { name: "Download image" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("The image could not be made. Try again.");
  expect(window.gtag).not.toHaveBeenCalledWith("event", "season_recap_download", expect.anything());
});

test("renders in Ukrainian", () => {
  renderRecap({ language: "ua" });
  expect(screen.getByRole("heading", { name: "Сезон 43 · підсумки" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Завантажити картинку" })).toBeInTheDocument();
  expect(screen.getByText("2,10", { exact: false })).toBeInTheDocument();
});
