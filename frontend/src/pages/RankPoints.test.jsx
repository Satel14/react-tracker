import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { setTranslations, setDefaultLanguage, setLanguage } from "react-switch-lang";
import en from "../Language/en.json";
import RankPoints from "./RankPoints";

setTranslations({ en });
setDefaultLanguage("en");
setLanguage("en");

const descending = (top) => Array.from({ length: 101 }, (_, i) => top - i * 40);

const payload = (overrides = {}) => ({
  seasonId: "division.bro.official.pc-2018-43",
  current: true,
  shard: "steam",
  accounts: 11836,
  matches: 800,
  firstDate: "2026-09-11",
  lastDate: "2026-09-17",
  tiers: [{ tier: "gold", publishable: true, share: 0.3, low: 0.28, high: 0.32, effectiveN: 2400 }],
  rpPercentiles: descending(5000),
  ...overrides,
});

const at = (path, ui) => render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);

describe("RankPoints", () => {
  it("renders the prose sections whether or not there is a table", async () => {
    at("/rank-points", <RankPoints snapshot={null} load={() => Promise.reject(new Error("down"))} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Is your PUBG RP good?");
    expect(screen.getByText(/How this is measured/)).toBeInTheDocument();
    expect(screen.getByText(/What this cannot tell you/)).toBeInTheDocument();
    // The constraint, stated on the page itself.
    expect(screen.getByText(/We do not publish where each tier starts/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("table")).toBeNull());
  });

  it("renders the committed snapshot immediately, without waiting for a fetch", () => {
    at("/rank-points", <RankPoints snapshot={payload()} load={() => new Promise(() => {})} />);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText(/Half the ranked players/)).toHaveTextContent("3,000");
  });

  it("takes a fresher live reading over the snapshot", async () => {
    at("/rank-points", <RankPoints
      snapshot={payload()}
      load={() => Promise.resolve({ data: payload({ rpPercentiles: descending(6000) }) })}
    />);
    await waitFor(() =>
      expect(screen.getByText(/Half the ranked players/)).toHaveTextContent("4,000"));
  });

  // The controller answers its own errors with a 200 and no data, and the first
  // days of a season come back with no table at all. Neither may replace a good
  // one that is already on the page.
  it("keeps the snapshot when the live read comes back without a table", async () => {
    at("/rank-points", <RankPoints
      snapshot={payload()}
      load={() => Promise.resolve({ data: payload({ rpPercentiles: null }) })}
    />);
    await waitFor(() => expect(screen.getByRole("table")).toBeInTheDocument());
    expect(screen.getByText(/Half the ranked players/)).toHaveTextContent("3,000");
  });

  // Unless it names a different season, in which case the committed reading is
  // the stale one and has to give way even though it is the fuller one.
  it("gives way to a new season even with nothing to show for it", async () => {
    at("/rank-points", <RankPoints
      snapshot={payload()}
      load={() => Promise.resolve({ data: payload({
        seasonId: "division.bro.official.pc-2018-44", rpPercentiles: null }) })}
    />);
    await waitFor(() =>
      expect(screen.getByText(/Collection for Season 44 has only just started/)).toBeInTheDocument());
  });

  it("links to the article and the leaderboards", () => {
    at("/rank-points", <RankPoints snapshot={payload()} load={() => new Promise(() => {})} />);
    expect(screen.getByRole("link", { name: /How the ranked system works/ }))
      .toHaveAttribute("href", "/ranks");
    expect(screen.getByRole("link", { name: /top of each region/ }))
      .toHaveAttribute("href", "/leaderboards");
  });

  it("offers the other language, picked from the path", () => {
    at("/rank-points", <RankPoints snapshot={null} load={() => new Promise(() => {})} />);
    expect(screen.getByRole("link", { name: "Читати українською" }))
      .toHaveAttribute("href", "/ua/rank-points");
  });

  it("offers English from the Ukrainian path", () => {
    at("/ua/rank-points", <RankPoints snapshot={null} load={() => new Promise(() => {})} />);
    expect(screen.getByRole("link", { name: "Read in English" }))
      .toHaveAttribute("href", "/rank-points");
  });
});
