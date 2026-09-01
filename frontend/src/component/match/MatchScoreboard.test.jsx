import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MatchScoreboard from "./MatchScoreboard";

const t = (key, vars) => (vars ? `${key}:${JSON.stringify(vars)}` : key);

const scoreboard = {
  teams: [
    { rank: 1, teamId: 10, won: true, isFocalTeam: true, players: [
      { name: "Me", accountId: "account.me", kills: 3, damageDealt: 413, assists: 1, DBNOs: 2, headshotKills: 1, timeSurvived: 1200, isFocal: true },
    ] },
    { rank: 2, teamId: 20, won: false, isFocalTeam: false, players: [
      { name: "Foe", accountId: "account.foe", kills: 5, damageDealt: 800, assists: 2, DBNOs: 3, headshotKills: 2, timeSurvived: 303, isFocal: false },
    ] },
  ],
  totalTeams: 2, totalPlayers: 2,
};

const renderSb = () =>
  render(
    <MemoryRouter>
      <MatchScoreboard scoreboard={scoreboard} platform="steam" t={t} />
    </MemoryRouter>
  );

test("renders every player row", () => {
  renderSb();
  expect(screen.getByText("Me")).toBeInTheDocument();
  expect(screen.getByText("Foe")).toBeInTheDocument();
});

test("links a player row to their profile", () => {
  renderSb();
  const link = screen.getByRole("link", { name: /Me/ });
  expect(link).toHaveAttribute("href", "/player/steam/Me");
});

test("renders teams in placement order (rank 1 first)", () => {
  renderSb();
  const headers = screen.getAllByText(/"rank":1|"rank":2/);
  expect(headers[0].textContent).toContain('"rank":1');
});

test("renders survival time with zero-padded minutes", () => {
  renderSb();
  expect(screen.getByText("05:03")).toBeInTheDocument();
});

test("says the scoreboard is empty instead of claiming the load failed", () => {
  // Reachable now that a lobby link can deep-link straight to this tab: an
  // analysis that came back without teams is not the same thing as one that
  // could not be fetched, and the error copy read as a broken page.
  render(
    <MemoryRouter><MatchScoreboard scoreboard={{ teams: [] }} platform="steam" t={t} /></MemoryRouter>
  );
  expect(screen.getByText("pages.match.emptyScoreboard")).toBeInTheDocument();
  expect(screen.queryByText("pages.match.error")).toBeNull();
});

test("leaves a bot's row as plain text while a real player still links", () => {
  // It linked every name, and most of a PUBG lobby is AI: in the match this
  // was measured on, 92 of the 100 entrants were bots, so 92 of the rows
  // pointed at a profile that does not exist.
  const board = {
    teams: [{
      teamId: 1, rank: 1, isFocalTeam: true,
      players: [
        { name: "Satel14", accountId: "account.me", kills: 3, damage: 400, assists: 0, dbnos: 1, survivalTime: 900, headshotKills: 1, longestKill: 87, revives: 0, isFocal: true },
        { name: "Bot_Frank", accountId: "ai.1031", kills: 0, damage: 12, assists: 0, dbnos: 0, survivalTime: 120, headshotKills: 0, longestKill: 0, revives: 0, isFocal: false },
      ],
    }],
  };
  const { container } = render(
    <MemoryRouter><MatchScoreboard scoreboard={board} platform="steam" t={t} /></MemoryRouter>
  );
  const links = [...container.querySelectorAll("a")];
  expect(links.map((a) => a.textContent)).toEqual(["Satel14"]);
  expect(links[0].getAttribute("href")).toBe("/player/steam/Satel14");
  expect(container.textContent).toContain("Bot_Frank");
});
