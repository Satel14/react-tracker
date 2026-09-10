import React from "react";
import { render, screen } from "@testing-library/react";
import LoadoutPanel from "./LoadoutPanel";

const t = (key, vars) => (vars ? `${key}:${JSON.stringify(vars)}` : key);

const loadout = {
  cutoff: "death",
  weapons: [
    { key: "Item_Weapon_HK416_C", name: "M416", slot: "Main", attachments: [
      { slot: "Upper", name: "6x Scope" },
      { slot: "Muzzle", name: null },
      { slot: "Lower", name: null },
    ] },
    { key: "Item_Weapon_Pan_C", name: "Pan", slot: "Melee", attachments: [] },
  ],
  armour: [
    { slot: "Headgear", key: "Item_Head_F_01_Lv2_C", level: 2 },
    { slot: "Backpack", key: "Item_Back_BlueBlocker", level: null },
  ],
  lootedFrom: [{ accountId: "account.foe", name: "Foe", items: 4 }],
  picked: 70, dropped: 16, fromCarePackage: 2,
};

test("lists weapons with their attachments", () => {
  const { container } = render(<LoadoutPanel loadout={loadout} focalPresent t={t} />);
  expect(screen.getByText("M416")).toBeInTheDocument();
  expect(screen.getByText("Pan")).toBeInTheDocument();
  // A named sight shows its name; an unnamed attachment shows its slot.
  const row = screen.getByText("M416").closest(".loadout__weapon");
  expect(row.textContent).toContain("6x Scope");
  expect(row.querySelectorAll(".loadout__attach")).toHaveLength(3);
  expect(container.querySelector(".loadout__weapon")).not.toBeNull();
});

test("renders no attachment denominator anywhere", () => {
  // How many slots a weapon has is not in telemetry, so "3 of 5" would be a
  // guess. The approved mockup showed one; this is the pin that keeps it out.
  const { container } = render(<LoadoutPanel loadout={loadout} focalPresent t={t} />);
  expect(container.textContent).not.toMatch(/\d\s*(of|з)\s*\d/);
});

test("shows armour levels, and no level when the id carries none", () => {
  const { container } = render(<LoadoutPanel loadout={loadout} focalPresent t={t} />);
  const rows = [...container.querySelectorAll(".loadout__armour-item")];
  expect(rows).toHaveLength(2);
  expect(rows[0].textContent).toContain("2");
  expect(rows[1].querySelector(".loadout__armour-level")).toBeNull();
});

test("names who was looted and prints the counters", () => {
  const { container } = render(<LoadoutPanel loadout={loadout} focalPresent t={t} />);
  expect(screen.getByText(/Foe/)).toBeInTheDocument();
  expect(container.querySelector(".loadout__counts")).not.toBeNull();
});

test("says which moment the loadout is from", () => {
  const { container } = render(<LoadoutPanel loadout={loadout} focalPresent t={t} />);
  expect(container.querySelector(".loadout__cutoff").textContent).toBe("pages.match.loadoutAtDeath");

  const { container: alive } = render(
    <LoadoutPanel loadout={{ ...loadout, cutoff: "survived" }} focalPresent t={t} />
  );
  expect(alive.querySelector(".loadout__cutoff").textContent).toBe("pages.match.loadoutAtEnd");
});

test("shows an empty state when the player carried nothing we can see", () => {
  render(
    <LoadoutPanel
      loadout={{ cutoff: null, weapons: [], armour: [], lootedFrom: [], picked: 0, dropped: 0, fromCarePackage: 0 }}
      focalPresent
      t={t}
    />
  );
  expect(screen.getByText("pages.match.loadoutEmpty")).toBeInTheDocument();
});

test("shows the not-in-match note when focal is absent", () => {
  render(<LoadoutPanel loadout={loadout} focalPresent={false} t={t} />);
  expect(screen.getByText("pages.match.focalNotInMatch")).toBeInTheDocument();
});
