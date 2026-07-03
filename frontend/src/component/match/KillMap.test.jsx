import React from "react";
import { render, screen } from "@testing-library/react";
import KillMap from "./KillMap";

const t = (key, vars) => (vars ? `${key}:${JSON.stringify(vars)}` : key);
const kills = [
  { t: 30, kx: 1000, ky: 1000, vx: 1300, vy: 1400, isFocalKill: true },
  { t: 90, kx: 2000, ky: 2000, vx: 2100, vy: 2050, isFocalKill: false },
];

test("renders the map background image", () => {
  render(<KillMap kills={kills} rawMapName="Baltic_Main" mapMax={8160} duration={120} t={t} />);
  expect(screen.getByRole("img", { name: /erangel/i })).toBeInTheDocument();
});

test("renders a time-range control", () => {
  render(<KillMap kills={kills} rawMapName="Baltic_Main" mapMax={8160} duration={120} t={t} />);
  expect(screen.getByText("pages.match.timeRange")).toBeInTheDocument();
});
