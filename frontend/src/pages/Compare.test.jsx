import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { setTranslations, setDefaultLanguage } from "react-switch-lang";
import en from "../Language/en.json";
import ua from "../Language/ua.json";
import Compare from "./Compare";

const getPlayerData = vi.fn();
const resolvePlayers = vi.fn();

vi.mock("../api/player", () => ({
  getPlayerData: (...args) => getPlayerData(...args),
  resolvePlayers: (...args) => resolvePlayers(...args),
}));

vi.mock("../component/Notification", () => ({ default: () => {} }));

setTranslations({ en, ua });
setDefaultLanguage("en");

beforeEach(() => {
  getPlayerData.mockReset();
  resolvePlayers.mockReset();
  resolvePlayers.mockResolvedValue({ status: 200, data: { resolved: [], missing: [] } });
  window.matchMedia = window.matchMedia || ((query) => ({
    matches: false, media: query, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  }));
});

const statCell = (value) => ({ value, displayValue: String(value) });

const payloadFor = (handle, stats) => ({
  status: 200,
  data: {
    platformInfo: {
      platformSlug: "steam",
      platformUserId: `account.${handle}`,
      platformUserHandle: handle,
    },
    segments: [{ stats }],
    season: {},
  },
});

const renderCompare = (search = "?p1=steam:A&p2=steam:B") =>
  render(
    <MemoryRouter initialEntries={[`/compare${search}`]}>
      <Compare />
    </MemoryRouter>
  );

const flush = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

test("reports a rate-limited slot as a rate limit, not as a missing player", async () => {
  getPlayerData.mockResolvedValue({ status: 200, message: "Rate Limit Reached" });

  renderCompare();

  expect(await screen.findAllByText("Hit the API rate limit")).toHaveLength(2);
  expect(screen.queryByText("Player not found")).not.toBeInTheDocument();
});

test("still reports a genuinely missing player as not found", async () => {
  getPlayerData.mockResolvedValue({ status: 200, message: "Player not found" });

  renderCompare();

  expect(await screen.findAllByText("Player not found")).toHaveLength(2);
});

test("keeps loaded profiles and issues no new requests when the columns are swapped", async () => {
  getPlayerData.mockImplementation((_platform, id) =>
    Promise.resolve(payloadFor(id, { wins: statCell(id === "A" ? 5 : 3) }))
  );

  renderCompare();

  await screen.findByText("A");
  await screen.findByText("B");
  expect(getPlayerData).toHaveBeenCalledTimes(2);
  expect(resolvePlayers).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByText("Swap"));
  await flush();

  expect(getPlayerData).toHaveBeenCalledTimes(2);
  expect(resolvePlayers).toHaveBeenCalledTimes(1);
  expect(screen.getByText("A")).toBeInTheDocument();
  expect(screen.getByText("B")).toBeInTheDocument();
  expect(screen.getByText("5")).toBeInTheDocument();
});

test("highlights nobody when both players tie on a stat", async () => {
  getPlayerData.mockImplementation((_platform, id) =>
    Promise.resolve(payloadFor(id, { wins: statCell(7) }))
  );

  const { container } = renderCompare();

  await screen.findByText("A");
  await screen.findByText("B");
  await flush();

  expect(container.querySelectorAll(".compare-cell--winner")).toHaveLength(0);
});

test("highlights nobody when only one column produced a value", async () => {
  getPlayerData.mockImplementation((_platform, id) =>
    id === "A"
      ? Promise.resolve(payloadFor(id, { wins: statCell(5) }))
      : Promise.resolve({ status: 200, message: "Player not found" })
  );

  const { container } = renderCompare();

  await screen.findByText("A");
  await flush();

  expect(container.querySelectorAll(".compare-cell--winner")).toHaveLength(0);
});

test("highlights the single best column when the values differ", async () => {
  getPlayerData.mockImplementation((_platform, id) =>
    Promise.resolve(payloadFor(id, { wins: statCell(id === "A" ? 5 : 3) }))
  );

  const { container } = renderCompare();

  await screen.findByText("A");
  await screen.findByText("B");
  await flush();

  const winners = container.querySelectorAll(".compare-cell--winner");
  expect(winners).toHaveLength(1);
  expect(winners[0]).toHaveTextContent("5");
});
