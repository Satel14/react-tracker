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
