import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
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
