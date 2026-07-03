import React from "react";
import { render, screen } from "@testing-library/react";
import DamageBreakdown from "./DamageBreakdown";

const t = (key, vars) => (vars ? `${key}:${JSON.stringify(vars)}` : key);
const damage = {
  dealt: { HeadShot: 34, TorsoShot: 20, ArmShot: 0, LegShot: 0, PelvisShot: 0, total: 54, hitCount: 2 },
  taken: { HeadShot: 0, TorsoShot: 0, ArmShot: 0, LegShot: 18, PelvisShot: 0, total: 18, hitCount: 1 },
  dealtByWeapon: [{ weapon: "M416", weaponKey: "WeapHK416_C", damage: 54, hits: 2 }],
  headshotDamagePct: 63,
};

test("renders dealt and taken totals", () => {
  // dealt.total (54) collides textually with dealtByWeapon[0].damage (54), so
  // scope the query to the per-column total instead of a bare getByText.
  const { container } = render(<DamageBreakdown damage={damage} focalPresent t={t} />);
  const totals = [...container.querySelectorAll(".damage__col-head strong")].map((el) => el.textContent);
  expect(totals).toEqual(["54", "18"]);
});

test("renders the weapon breakdown", () => {
  render(<DamageBreakdown damage={damage} focalPresent t={t} />);
  expect(screen.getByText("M416")).toBeInTheDocument();
});

test("shows the not-in-match note when focal is absent", () => {
  render(<DamageBreakdown damage={damage} focalPresent={false} t={t} />);
  expect(screen.getByText("pages.match.focalNotInMatch")).toBeInTheDocument();
});
