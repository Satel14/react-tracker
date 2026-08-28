import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import ReplayRoster from "./ReplayRoster";

const DICT = {
  "pages.replay.roster": "Roster",
  "pages.replay.killsShort": "{count} K",
  "pages.replay.teamLabel": "Team {id}",
  "pages.replay.teamless": "No team",
  "pages.replay.yourTeam": "Your Team",
  "pages.replay.aliveOf": "{alive} of {total} alive",
  "pages.replay.stateAlive": "Alive",
  "pages.replay.stateKnocked": "Knocked",
  "pages.replay.stateDead": "Dead",
  "pages.replay.healthLabel": "Health {value}%",
};

const t = (key, params = {}) =>
  (DICT[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ""));

const row = (over) => ({
  name: "P",
  accountId: "a.p",
  teamId: 1,
  kills: 0,
  alive: true,
  isFocal: false,
  h: 100,
  knocked: false,
  ...over,
});

const renderRoster = (rows, over = {}) =>
  render(
    <ReplayRoster rows={rows} focusedAccountId={null} onSelect={() => {}} t={t} {...over} />
  );

const teamOrder = (container) =>
  [...container.querySelectorAll(".replay-roster__team")].map((el) =>
    el.querySelector(".replay-roster__team-name").textContent
  );

test("a wiped team sorts below a team that still has survivors", () => {
  const { container } = renderRoster([
    row({ name: "Wiped", accountId: "a.1", teamId: 2, alive: false }),
    row({ name: "Living", accountId: "a.2", teamId: 9, alive: true }),
  ]);
  expect(teamOrder(container)).toEqual(["Team 9", "Team 2"]);
});

test("the focal team is first even when it is wiped and other teams survive", () => {
  const { container } = renderRoster([
    row({ name: "Living", accountId: "a.1", teamId: 9, alive: true }),
    row({ name: "Me", accountId: "a.2", teamId: 4, alive: false, isFocal: true }),
    row({ name: "Other", accountId: "a.3", teamId: 3, alive: true }),
  ]);
  expect(teamOrder(container)).toEqual(["Your Team", "Team 3", "Team 9"]);
});

test("a team card shows its alive count out of its size", () => {
  const { container } = renderRoster([
    row({ name: "A", accountId: "a.1", teamId: 5, alive: true }),
    row({ name: "B", accountId: "a.2", teamId: 5, alive: true, knocked: true }),
    row({ name: "C", accountId: "a.3", teamId: 5, alive: false }),
    row({ name: "D", accountId: "a.4", teamId: 5, alive: false }),
  ]);
  const count = container.querySelector(".replay-roster__team-alive");
  expect(count.textContent).toBe("2/4"); // a knocked player is still alive
  expect(count.getAttribute("aria-label")).toBe("2 of 4 alive");
});

test("members are listed alive-first, then by kills, then by name", () => {
  const { container } = renderRoster([
    row({ name: "Zoe", accountId: "a.1", teamId: 5, alive: true, kills: 1 }),
    row({ name: "Abe", accountId: "a.2", teamId: 5, alive: false, kills: 9 }),
    row({ name: "Cid", accountId: "a.3", teamId: 5, alive: true, kills: 3 }),
    row({ name: "Ann", accountId: "a.4", teamId: 5, alive: true, kills: 1 }),
  ]);
  const names = [...container.querySelectorAll(".replay-roster__name")].map((el) => el.textContent);
  expect(names).toEqual(["Cid", "Ann", "Zoe", "Abe"]);
});

test("a knocked player renders distinctly from a dead one, in text as well as class", () => {
  const { container } = renderRoster([
    row({ name: "Down", accountId: "a.1", teamId: 5, alive: true, knocked: true }),
    row({ name: "Gone", accountId: "a.2", teamId: 5, alive: false }),
  ]);
  const down = container.querySelector(".replay-roster__row[data-account='a.1']");
  const gone = container.querySelector(".replay-roster__row[data-account='a.2']");

  expect(down.className).toContain("is-knocked");
  expect(down.className).not.toContain("is-dead");
  expect(gone.className).toContain("is-dead");
  expect(gone.className).not.toContain("is-knocked");

  const stateOf = (el) => el.querySelector(".replay-roster__state").textContent;
  expect(stateOf(down)).toBe("Knocked");
  expect(stateOf(gone)).toBe("Dead");
  expect(stateOf(down)).not.toBe(stateOf(gone));
});

test("an untouched player reads as alive", () => {
  const { container } = renderRoster([row({ name: "Fine", accountId: "a.1" })]);
  const el = container.querySelector(".replay-roster__row");
  expect(el.querySelector(".replay-roster__state").textContent).toBe("Alive");
  expect(el.className).not.toContain("is-dead");
  expect(el.className).not.toContain("is-knocked");
});

test("the health bar width reflects the held health reading", () => {
  const { container } = renderRoster([
    row({ name: "Empty", accountId: "a.1", teamId: 5, h: 0 }),
    row({ name: "Half", accountId: "a.2", teamId: 5, h: 50 }),
    row({ name: "Full", accountId: "a.3", teamId: 5, h: 100 }),
  ]);
  const fillFor = (id) =>
    container.querySelector(`.replay-roster__row[data-account='${id}'] .replay-roster__health-fill`);
  expect(fillFor("a.1").style.width).toBe("0%");
  expect(fillFor("a.2").style.width).toBe("50%");
  expect(fillFor("a.3").style.width).toBe("100%");
  expect(
    container
      .querySelector(".replay-roster__row[data-account='a.2'] .replay-roster__health")
      .getAttribute("aria-label")
  ).toBe("Health 50%");
});

test("rows stay keyboard-reachable buttons carrying name and kills", () => {
  renderRoster([row({ name: "Me", accountId: "a.me", kills: 3, isFocal: true })]);
  const button = screen.getByRole("button", { name: /Me/ });
  expect(button.tagName).toBe("BUTTON");
  expect(button.getAttribute("type")).toBe("button");
  expect(button.className).toContain("is-focal");
  expect(button.textContent).toContain("3 K");
});

test("clicking a row selects it and clicking the selected row again deselects", () => {
  const onSelect = vi.fn();
  const rows = [row({ name: "Me", accountId: "a.me" })];
  const { container, rerender } = renderRoster(rows, { onSelect });

  fireEvent.click(container.querySelector(".replay-roster__row"));
  expect(onSelect).toHaveBeenCalledWith("a.me");

  rerender(
    <ReplayRoster rows={rows} focusedAccountId="a.me" onSelect={onSelect} t={t} />
  );
  const selected = container.querySelector(".replay-roster__row");
  expect(selected.className).toContain("is-selected");
  fireEvent.click(selected);
  expect(onSelect).toHaveBeenLastCalledWith(null);
});

test("renders nothing but the title when the roster is empty", () => {
  const { container } = render(<ReplayRoster t={t} onSelect={() => {}} />);
  expect(container.querySelectorAll(".replay-roster__team")).toHaveLength(0);
  expect(screen.getByText("Roster")).toBeInTheDocument();
});
