import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect } from "vitest";
import KillFeed from "./KillFeed";

const t = (key, vars) => (vars ? `${key}:${JSON.stringify(vars)}` : key);

const kills = [
  { t: 30, killerName: "Me", victimName: "Foe", weapon: "M416", distance: 50, damageReason: "HeadShot", isFocalKill: true, isFocalDeath: false },
  { t: 60, killerName: "Foe", victimName: "Bob", weapon: "Kar98k", distance: 120, damageReason: "TorsoShot", isFocalKill: false, isFocalDeath: false },
];

test("renders one row per kill", () => {
  render(<KillFeed kills={kills} t={t} />);
  expect(screen.getByText("Me")).toBeInTheDocument();
  expect(screen.getByText("Bob")).toBeInTheDocument();
});

test("the Mine filter shows only the focal player's kills/deaths", () => {
  render(<KillFeed kills={kills} t={t} />);
  fireEvent.click(screen.getByText("pages.match.filterFocal"));
  expect(screen.getByText("Foe")).toBeInTheDocument(); // victim of focal kill
  expect(screen.queryByText("Bob")).not.toBeInTheDocument();
});

test("shows the empty state when there are no kills", () => {
  render(<KillFeed kills={[]} t={t} />);
  expect(screen.getByText("pages.match.noKills")).toBeInTheDocument();
});

describe("profile links", () => {
  const row = (over = {}) => ({
    t: 60, killerName: "Me", killerAccountId: "account.me",
    victimName: "Foe", victimAccountId: "account.foe",
    weapon: "AUG", distance: 87, ...over,
  });
  const show = (kills) => render(
    <MemoryRouter><KillFeed kills={kills} t={t} /></MemoryRouter>
  );

  it("links both names to their profiles", () => {
    const { container } = show([row()]);
    const links = [...container.querySelectorAll("a")];
    expect(links.map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["Me", "/player/steam/Me"],
      ["Foe", "/player/steam/Foe"],
    ]);
  });

  it("leaves a bot's name as plain text", () => {
    // Most of a lobby is AI and their names look like anyone else's, so a feed
    // that linked every name would be mostly dead links.
    const { container } = show([row({ victimName: "Bot_Frank", victimAccountId: "ai.1031" })]);
    const links = [...container.querySelectorAll("a")];
    expect(links.map((a) => a.textContent)).toEqual(["Me"]);
    expect(container.textContent).toContain("Bot_Frank");
  });

  it("leaves a death nobody caused with no killer link and no blank one", () => {
    const { container } = show([row({ killerName: null, killerAccountId: null })]);
    expect([...container.querySelectorAll("a")].map((a) => a.textContent)).toEqual(["Foe"]);
  });
});
