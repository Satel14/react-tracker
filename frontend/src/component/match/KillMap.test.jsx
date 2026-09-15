import React from "react";
import { render, screen } from "@testing-library/react";
import KillMap from "./KillMap";

const t = (key, vars) => (vars ? `${key}:${JSON.stringify(vars)}` : key);
const kills = [
  { t: 30, kx: 1000, ky: 1000, vx: 1300, vy: 1400, isFocalKill: true },
  { t: 90, kx: 2000, ky: 2000, vx: 2100, vy: 2050, isFocalKill: false },
];

test("renders the map background image", () => {
  render(<KillMap kills={kills} rawMapName="Baltic_Main" mapMax={8160} t={t} />);
  expect(screen.getByRole("img", { name: /erangel/i })).toBeInTheDocument();
});

test("carries no time range of its own", () => {
  // KillsPane owns it, because the feed beside this map has to narrow with it.
  // A second slider here would be two controls for one window.
  const { container } = render(<KillMap kills={kills} rawMapName="Baltic_Main" mapMax={8160} t={t} />);
  expect(container.querySelector(".ant-slider")).toBeNull();
  expect(screen.queryByText("pages.match.timeRange")).toBeNull();
});
