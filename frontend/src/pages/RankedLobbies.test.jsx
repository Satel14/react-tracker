import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import RankedLobbies from "./RankedLobbies";

const published = (tier) => ({
  tier, lobbies: 300, focals: 2003, opponents: 27042, publishable: true,
  mix: [{ tier: "silver", count: 27042, share: 1, low: 0.9, high: 1 }],
});

const snapshotOf = (seasonId, lobbyMix) => ({
  seasonId, current: true, shard: "steam", accounts: 5040, matches: 338,
  windows: 3, firstDate: "2026-09-11", lastDate: "2026-09-13", lobbyMix,
});

const committed = snapshotOf("division.bro.official.pc-2018-43", [published("gold")]);

const draw = (load, snapshot = committed) =>
  render(
    <MemoryRouter initialEntries={["/ranked-lobbies"]}>
      <RankedLobbies load={load} snapshot={snapshot} />
    </MemoryRouter>,
  );

const rowNames = () =>
  screen.getAllByRole("row").map((row) => row.textContent);

test("renders the page heading", () => {
  draw(() => new Promise(() => {}));
  expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
});

test("a live read with no mix does not replace the committed one", async () => {
  draw(() => Promise.resolve({ data: snapshotOf(committed.seasonId, null) }));
  await waitFor(() => expect(rowNames().join(" ")).toMatch(/gold/i));
});

// The committed reading is the stale one once the season turns, even though it
// is the fuller one, so this guard has to fire in the opposite direction.
test("a live read naming a different season does replace it", async () => {
  draw(() =>
    Promise.resolve({ data: snapshotOf("division.bro.official.pc-2018-44", [published("platinum")]) }),
  );
  await waitFor(() => expect(rowNames().join(" ")).toMatch(/platinum/i));
  expect(rowNames().join(" ")).not.toMatch(/\bgold\b/i);
});

test("a failed live read leaves the committed table on the page", async () => {
  draw(() => Promise.reject(new Error("offline")));
  await waitFor(() => expect(rowNames().join(" ")).toMatch(/gold/i));
});

test("with no committed reading at all the page still renders its prose", () => {
  draw(() => new Promise(() => {}), null);
  expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
});
