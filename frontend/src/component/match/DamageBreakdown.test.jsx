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

const throws = {
  used: [
    { key: "Item_Weapon_Grenade_C", name: "Frag Grenade", damaging: true, count: 3, damage: 55 },
    { key: "Item_Weapon_SmokeBomb_C", name: "Smoke Bomb", damaging: false, count: 4, damage: 0 },
    { key: "Item_Weapon_Molotov_C", name: "Molotov", damaging: true, count: 1, damage: 0 },
  ],
  totalThrown: 8,
  totalDamage: 55,
};

test("renders the grenade card with a damage figure only for damaging kinds", () => {
  const { container } = render(
    <DamageBreakdown damage={damage} meds={meds} throws={throws} focalPresent t={t} />
  );
  const rows = [...container.querySelectorAll(".damage__throw")];
  const byName = (n) => rows.find((r) => r.textContent.includes(n));

  // A molotov that dealt nothing keeps its +0: it CAN deal damage and did not.
  expect(byName("Frag Grenade").querySelector(".damage__throw-dmg")).not.toBeNull();
  expect(byName("Molotov").querySelector(".damage__throw-dmg")).not.toBeNull();
  // Smoke deals none by design, so a "+0" beside it would read as a miss.
  expect(byName("Smoke Bomb").querySelector(".damage__throw-dmg")).toBeNull();
});

test("shows the attribution line only when grenades dealt something", () => {
  const { container } = render(
    <DamageBreakdown damage={damage} meds={meds} throws={throws} focalPresent t={t} />
  );
  expect(container.querySelector(".damage__throw-share")).not.toBeNull();

  const { container: zero } = render(
    <DamageBreakdown damage={damage} meds={meds} throws={{ ...throws, totalDamage: 0 }} focalPresent t={t} />
  );
  expect(zero.querySelector(".damage__throw-share")).toBeNull();
});

test("renders no grenade card when nothing was thrown", () => {
  const { container } = render(
    <DamageBreakdown damage={damage} meds={meds} throws={{ used: [], totalThrown: 0, totalDamage: 0 }} focalPresent t={t} />
  );
  expect(container.querySelector(".damage__throws")).toBeNull();
});

test("survives a payload with no throws at all", () => {
  const { container } = render(<DamageBreakdown damage={damage} meds={meds} focalPresent t={t} />);
  expect(container.querySelector(".damage__throws")).toBeNull();
});

test("orders the blocks damage-done first, then what was spent", () => {
  const { container } = render(
    <DamageBreakdown damage={damage} meds={meds} throws={throws} focalPresent t={t} />
  );
  const order = [...container.querySelector(".damage").children].map((c) => c.className.split(" ")[0]);
  expect(order).toEqual([
    "damage__headshot",
    "damage__cols",
    "damage__weapons",
    "damage__throws",
    "damage__meds",
  ]);
});

const environment = {
  armourBroke: [{ level: 3, count: 1 }, { level: 2, count: 2 }],
  armourLost: [{ level: 2, count: 1 }],
  vehicleDamage: 288,
  windows: 3, fences: 2, vaults: 4, doorsOpened: 12, vending: 1,
};

const withEnv = (env) => render(
  <DamageBreakdown damage={damage} meds={meds} throws={throws} environment={env} focalPresent t={t} />
);

test("renders the armour and property card between grenades and meds", () => {
  const { container } = withEnv(environment);
  const order = [...container.querySelector(".damage").children].map((c) => c.className.split(" ")[0]);
  expect(order).toEqual([
    "damage__headshot",
    "damage__cols",
    "damage__weapons",
    "damage__throws",
    "damage__broke",
    "damage__meds",
  ]);
});

test("shows both armour directions and the movement footer", () => {
  const { container } = withEnv(environment);
  const card = container.querySelector(".damage__broke");
  expect(card.querySelector(".damage__broke-armour-broke")).not.toBeNull();
  expect(card.querySelector(".damage__broke-armour-lost")).not.toBeNull();
  expect(card.querySelector(".damage__broke-moves")).not.toBeNull();
});

test("hides a row whose value is zero", () => {
  // No armour broken in 4 matches of 10, none lost in 7, no vehicle damage in
  // 5 -- these are ordinary states.
  const { container } = withEnv({ ...environment, armourLost: [], vehicleDamage: 0, fences: 0 });
  const card = container.querySelector(".damage__broke");
  expect(card.querySelector(".damage__broke-armour-lost")).toBeNull();
  expect(card.querySelector(".damage__broke-vehicles")).toBeNull();
  expect(card.querySelector(".damage__broke-fences")).toBeNull();
  expect(card.querySelector(".damage__broke-windows")).not.toBeNull();
});

test("hides the whole card when nothing happened", () => {
  const { container } = withEnv({
    armourBroke: [], armourLost: [], vehicleDamage: 0,
    windows: 0, fences: 0, vaults: 0, doorsOpened: 0, vending: 0,
  });
  expect(container.querySelector(".damage__broke")).toBeNull();
});

test("survives a payload with no environment at all", () => {
  const { container } = render(
    <DamageBreakdown damage={damage} meds={meds} throws={throws} focalPresent t={t} />
  );
  expect(container.querySelector(".damage__broke")).toBeNull();
});

test("labels vehicle damage rather than printing a bare number", () => {
  // 1429 damage over 10 matches destroyed zero vehicles -- a car has far more
  // health than a player, so the figure needs saying what it is.
  const { container } = withEnv(environment);
  const row = container.querySelector(".damage__broke-vehicles");
  expect(row.textContent).toContain("pages.match.brokeVehicles");
  expect(row.getAttribute("title")).toBe("pages.match.brokeVehiclesHint");
});
