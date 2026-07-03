import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Overlay from "./Overlay";

const getPlayerData = vi.fn();

vi.mock("../api/player", () => ({
  getPlayerData: (...args) => getPlayerData(...args),
}));

const t = (k) => k;

beforeEach(() => {
  getPlayerData.mockReset();
  window.matchMedia = window.matchMedia || ((query) => ({
    matches: false, media: query, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  }));
});

const samplePlayerData = {
  data: {
    platformInfo: {
      platformUserHandle: "TestPlayer",
    },
    season: {
      rankedInfo: {
        label: "Gold III",
        currentRankPoint: 2500,
      },
    },
    segments: [
      {
        stats: {
          kd: { displayValue: "1.50" },
          wlPercentage: { displayValue: "25%" },
          avgDamage: { displayValue: "125" },
          matchesPlayed: { displayValue: "42" },
        },
      },
    ],
    matches: {
      items: [],
    },
  },
};

const renderPage = (initialEntries = ["/overlay/pc/game123"]) =>
  render(
    <MemoryRouter initialEntries={initialEntries}>
      <Overlay t={t} />
    </MemoryRouter>
  );

test("renders loading state initially and player stats after fetch", async () => {
  getPlayerData.mockResolvedValue(samplePlayerData);
  renderPage();

  expect(screen.getByText("pages.overlay.loading")).toBeInTheDocument();

  await waitFor(() => {
    expect(screen.getByText("1.50")).toBeInTheDocument();
  });
  expect(screen.getByText("25%")).toBeInTheDocument();
  expect(screen.getByText("125")).toBeInTheDocument();
  expect(screen.getByText("42")).toBeInTheDocument();
});

test("renders error state when player data is not available", async () => {
  getPlayerData.mockResolvedValue({ data: null });
  renderPage();

  await waitFor(() => {
    expect(screen.getByText("pages.overlay.errorNoPlayer")).toBeInTheDocument();
  });
});

test("uses fallback values when stat displayValues are missing", async () => {
  const dataWithMissingStats = {
    data: {
      platformInfo: { platformUserHandle: "TestPlayer" },
      season: { rankedInfo: { label: "Unranked" } },
      segments: [{ stats: {} }],
      matches: { items: [] },
    },
  };
  getPlayerData.mockResolvedValue(dataWithMissingStats);
  renderPage();

  await waitFor(() => {
    const zeros = screen.getAllByText("0");
    expect(zeros.length).toBeGreaterThan(0);
  });
});
