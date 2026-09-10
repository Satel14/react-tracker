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

const meds = {
  used: [
    { key: "Item_Heal_Bandage_C", name: "Bandage", kind: "heal", count: 7, hp: 70 },
    { key: "Item_Boost_EnergyDrink_C", name: "Energy Drink", kind: "boost", count: 2, hp: null },
  ],
  boostHp: 84,
  other: [{ key: "Item_Bluechip_C", name: "Blue Chip", count: 1 }],
  totalUses: 10,
  inBlueZone: 6,
  inVehicle: 4,
};

test("lists what was consumed, with HP only where there is HP", () => {
  const { container } = render(<DamageBreakdown damage={damage} meds={meds} focalPresent t={t} />);
  expect(screen.getByText("Bandage")).toBeInTheDocument();
  expect(screen.getByText("Energy Drink")).toBeInTheDocument();

  // A boost restores no HP itself, so a "+0 HP" beside it would read as a
  // wasted use -- the same rule the thrown-items counters follow for smoke.
  const rows = [...container.querySelectorAll(".damage__med")];
  const bandage = rows.find((r) => r.textContent.includes("Bandage"));
  const drink = rows.find((r) => r.textContent.includes("Energy Drink"));
  expect(bandage.querySelector(".damage__med-hp")).not.toBeNull();
  expect(drink.querySelector(".damage__med-hp")).toBeNull();
});

test("shows boost regen and the other-items line", () => {
  const { container } = render(<DamageBreakdown damage={damage} meds={meds} focalPresent t={t} />);
  expect(container.querySelector(".damage__med-regen")).not.toBeNull();
  expect(screen.getByText(/Blue Chip/)).toBeInTheDocument();
});

test("omits boost regen when none was recorded", () => {
  const { container } = render(
    <DamageBreakdown damage={damage} meds={{ ...meds, boostHp: 0 }} focalPresent t={t} />
  );
  expect(container.querySelector(".damage__med-regen")).toBeNull();
});

test("renders no consumables block when nothing was used", () => {
  // A real state, not a defensive branch: 1 of 10 measured matches had no
  // Use-category item at all.
  const { container } = render(
    <DamageBreakdown damage={damage} meds={{ used: [], other: [], boostHp: 0, totalUses: 0, inBlueZone: 0, inVehicle: 0 }} focalPresent t={t} />
  );
  expect(container.querySelector(".damage__meds")).toBeNull();
});

test("survives a payload with no meds at all", () => {
  // An analysis response cached before this change carries no meds key.
  const { container } = render(<DamageBreakdown damage={damage} focalPresent t={t} />);
  expect(container.querySelector(".damage__meds")).toBeNull();
});
