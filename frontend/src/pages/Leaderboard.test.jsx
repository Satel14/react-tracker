import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Leaderboard from "./Leaderboard";
import { ROUTE_META } from "../helpers/routeMeta";
import en from "../Language/en.json";
import { setTranslations, setDefaultLanguage } from "react-switch-lang";

const getLeaderboard = vi.fn();
const getSeasons = vi.fn();
const navigate = vi.fn();

vi.mock("../api/leaderboard", () => ({
  getLeaderboard: (...args) => getLeaderboard(...args),
  getSeasons: (...args) => getSeasons(...args),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => navigate };
});

const t = (k) => k;

const sampleEntries = [
  { rank: 1, accountId: "account.a", name: "Alpha", rankPoints: 6000, games: 100, wins: 20, winRatio: 0.2, kda: 5.5, avgRank: 4.2, avgKills: 6.1, avgDamage: 520, kills: 400 },
  { rank: 2, accountId: "account.b", name: "Bravo", rankPoints: 5200, games: 80, wins: 9, winRatio: 0.1125, kda: 4.1, avgRank: 7.0, avgKills: 3.4, avgDamage: 410, kills: 250 },
];

beforeEach(() => {
  getLeaderboard.mockReset();
  getSeasons.mockReset();
  navigate.mockReset();
  getSeasons.mockResolvedValue({ status: 200, data: { seasons: [{ id: "s-current", label: "Season 30" }], currentSeasonId: "s-current" } });
  getLeaderboard.mockResolvedValue({ status: 200, data: { platform: "pc-eu", gameMode: "squad-fpp", seasonId: "s-current", entries: sampleEntries } });
  window.matchMedia = window.matchMedia || ((query) => ({
    matches: false, media: query, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  }));
});

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/leaderboards"]}>
      <Leaderboard t={t} />
    </MemoryRouter>
  );

// The shell puts routeMeta's h1 inside #root and React then replaces the whole
// mount point. This page rendered its title as an h2, so after that swap it had
// no h1 at all -- and the heading in the file was not the heading on screen.
//
// Real translations, unlike every other case here: the `t` prop above echoes
// its key back, and so does react-switch-lang's own translator while no
// dictionary is registered, so nothing that returns a key can show that the
// words match. Registered inside the test and cleared after it, so the cases
// that do assert on keys keep working.
test("renders the same h1 the prerendered shell injects", () => {
  setTranslations({ en });
  setDefaultLanguage("en");
  try {
    const meta = ROUTE_META.find((route) => route.path === "/leaderboards");
    render(
      <MemoryRouter initialEntries={["/leaderboards"]}>
        <Leaderboard />
      </MemoryRouter>
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(meta.h1);
  } finally {
    setTranslations({});
  }
});

// The other half of the shared copy. The build renders this same component
// into leaderboards.html, so asserting the page shows it is what pins the file
// and the page to one source: the page had 43 crawlable words before it, and
// Google was putting the site footer in its search snippet instead.
test("renders the explainer the static file also carries", () => {
  setTranslations({ en });
  setDefaultLanguage("en");
  try {
    const { container } = render(
      <MemoryRouter initialEntries={["/leaderboards"]}>
        <Leaderboard />
      </MemoryRouter>
    );
    const about = en.pages.leaderboards.about;
    expect(container.textContent).toContain(about.lead);
    for (const section of Object.values(about).filter((v) => v && typeof v === "object")) {
      expect(container.textContent, section.heading).toContain(section.heading);
      expect(container.textContent, section.p1.slice(0, 30)).toContain(section.p1);
    }
    expect(container.querySelector(".leaderboard-intro")).not.toBeNull();
  } finally {
    setTranslations({});
  }
});

test("renders leaderboard rows from the API", async () => {
  renderPage();
  expect(await screen.findByText("Alpha")).toBeInTheDocument();
  expect(screen.getByText("Bravo")).toBeInTheDocument();
});

test("filters rows by the debounced player search box", async () => {
  renderPage();
  await screen.findByText("Alpha");
  fireEvent.change(screen.getByPlaceholderText("pages.leaderboards.search"), { target: { value: "alp" } });
  await waitFor(() => {
    expect(screen.queryByText("Bravo")).not.toBeInTheDocument();
  });
  expect(screen.getByText("Alpha")).toBeInTheDocument();
});

test("refetches when the game mode changes", async () => {
  renderPage();
  await screen.findByText("Alpha");
  const soloRadio = screen.getByText("solo", { selector: "*" });
  fireEvent.click(soloRadio);
  await waitFor(() => {
    expect(getLeaderboard).toHaveBeenLastCalledWith("pc-eu", "solo", "s-current");
  });
});

test("refetches when the refresh button is clicked", async () => {
  renderPage();
  await screen.findByText("Alpha");
  const before = getLeaderboard.mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "pages.leaderboards.refresh" }));
  await waitFor(() => {
    expect(getLeaderboard.mock.calls.length).toBeGreaterThan(before);
  });
});

test("navigates to compare with the selected players", async () => {
  renderPage();
  await screen.findByText("Alpha");
  const checkboxes = screen.getAllByRole("checkbox");
  // select-all header is hidden, so row checkboxes start at index 0
  fireEvent.click(checkboxes[0]);
  fireEvent.click(checkboxes[1]);
  const compareBtn = await screen.findByRole("button", { name: /pages.leaderboards.compare/ });
  fireEvent.click(compareBtn);
  await waitFor(() => {
    expect(navigate).toHaveBeenCalled();
  });
  const dest = navigate.mock.calls[0][0];
  expect(dest).toContain("/compare?");
  expect(dest).toContain("steam%3AAlpha");
  expect(dest).toContain("steam%3ABravo");
});

test("links a steam-region row to the steam shard", async () => {
  renderPage();
  const link = await screen.findByRole("link", { name: "Alpha" });
  expect(link).toHaveAttribute("href", "/player/steam/Alpha");
});

test("links a KAKAO-region row to the kakao shard, not steam", async () => {
  getLeaderboard.mockResolvedValue({
    status: 200,
    data: { platform: "pc-kakao", gameMode: "squad-fpp", seasonId: "s-current", entries: sampleEntries },
  });
  render(
    <MemoryRouter initialEntries={["/leaderboards?platform=pc-kakao"]}>
      <Leaderboard t={t} />
    </MemoryRouter>
  );
  const link = await screen.findByRole("link", { name: "Alpha" });
  expect(link).toHaveAttribute("href", "/player/kakao/Alpha");
});

test("compares selected players on the region's own shard", async () => {
  getLeaderboard.mockResolvedValue({
    status: 200,
    data: { platform: "pc-kakao", gameMode: "squad-fpp", seasonId: "s-current", entries: sampleEntries },
  });
  render(
    <MemoryRouter initialEntries={["/leaderboards?platform=pc-kakao"]}>
      <Leaderboard t={t} />
    </MemoryRouter>
  );
  await screen.findByText("Alpha");
  const checkboxes = screen.getAllByRole("checkbox");
  fireEvent.click(checkboxes[0]);
  fireEvent.click(checkboxes[1]);
  fireEvent.click(await screen.findByRole("button", { name: /pages.leaderboards.compare/ }));
  await waitFor(() => {
    expect(navigate).toHaveBeenCalled();
  });
  const dest = navigate.mock.calls[0][0];
  expect(dest).toContain("kakao%3AAlpha");
  expect(dest).not.toContain("steam%3A");
});

test("re-links rows when the region dropdown switches to KAKAO", async () => {
  renderPage();
  await screen.findByRole("link", { name: "Alpha" });

  fireEvent.mouseDown(document.querySelector(".leaderboard-page__platform .ant-select-selector"));
  fireEvent.click(await screen.findByText("PC · KAKAO"));

  await waitFor(() => {
    expect(getLeaderboard).toHaveBeenLastCalledWith("pc-kakao", "squad-fpp", "s-current");
  });
  await waitFor(async () => {
    expect(await screen.findByRole("link", { name: "Alpha" })).toHaveAttribute("href", "/player/kakao/Alpha");
  });
});

test("the loading state keeps the standings table's own header and rows", async () => {
  // Ten 120px dashes stood in for a ten-column table, so the page rearranged
  // itself the moment the standings arrived.
  getLeaderboard.mockReturnValue(new Promise(() => {}));
  const { container } = renderPage();

  const status = await screen.findByRole("status");
  expect(status).toHaveTextContent("pages.leaderboards.loading");
  expect(container.querySelector(".leaderboard-page__table")).not.toBeNull();
  // The page's own columns, so the header the reader sees while waiting is the
  // header they keep. antd renders a measure copy of the row, hence the Set.
  const headers = new Set([...container.querySelectorAll(".ant-table-thead th")].map((th) => th.textContent));
  expect(headers).toContain("pages.leaderboards.rank");
  expect(headers).toContain("pages.leaderboards.player");
  expect(container.querySelectorAll(".ant-table-tbody tr.ant-table-row")).toHaveLength(10);
});
