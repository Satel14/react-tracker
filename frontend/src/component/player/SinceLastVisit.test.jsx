import React, { StrictMode } from "react";
import { render, screen } from "@testing-library/react";
import { setTranslations, setDefaultLanguage, setLanguage } from "react-switch-lang";
import SinceLastVisit, { SNAPSHOT_STORAGE_KEY, MAX_SNAPSHOTS, VISIT_GAP_MS } from "./SinceLastVisit";
import en from "../../Language/en.json";
import ua from "../../Language/ua.json";

const stat = (value) => ({ value, displayValue: String(value) });
const S43 = "division.bro.official.pc-2018-43";
const ACCOUNT = "account.3cc264b9e6754f459de7caf048f700b7";
const DAY = 24 * 60 * 60 * 1000;
const T0 = 1_760_000_000_000;

const payload = ({ matches = 100, wins = 5, kills = 80, rp = 2400, tier = "Gold 1", current = true, account = ACCOUNT } = {}) => ({
  platformInfo: { platformSlug: "steam", platformUserId: account },
  season: {
    id: S43,
    isCurrentSeason: current,
    rankedInfo: rp === null ? null : { currentRankPoint: rp, label: tier },
    stats: { matchesPlayed: stat(matches), wins: stat(wins), kills: stat(kills) },
  },
});

const show = (data, { language = "en", at = T0 } = {}) => {
  setTranslations({ en, ua });
  setDefaultLanguage("en");
  setLanguage(language);
  return render(<SinceLastVisit data={data} now={() => at} />);
};

const stored = () => JSON.parse(window.localStorage.getItem(SNAPSHOT_STORAGE_KEY) || "{}");

beforeEach(() => {
  window.localStorage.clear();
  window.gtag = vi.fn();
});

afterEach(() => {
  delete window.gtag;
  setTranslations({});
  setDefaultLanguage("en");
});

test("a first look shows nothing and remembers the totals", () => {
  const { container } = show(payload());
  expect(container).toBeEmptyDOMElement();
  expect(stored()[`steam:${ACCOUNT}`]).toEqual({
    previous: null,
    latest: { seasonId: S43, rankPoint: 2400, tier: "Gold 1", matches: 100, wins: 5, kills: 80, at: T0 },
  });
});

test("the next look says what changed, in words", () => {
  show(payload()).unmount();
  show(payload({ matches: 106, wins: 6, kills: 94, rp: 2438 }), { at: T0 + 2 * DAY });

  expect(screen.getByRole("status")).toHaveTextContent(
    "Since you last looked 2 days ago: RP up by 38 · 6 matches · 1 win · 14 kills"
  );
  expect(window.gtag).toHaveBeenCalledWith("event", "since_last_visit", { platform: "steam" });
});

test("RP that fell is said to have fallen, and a new rank is named", () => {
  show(payload()).unmount();
  show(payload({ matches: 103, wins: 5, kills: 81, rp: 2320, tier: "Gold 2" }), { at: T0 + 3 * 60 * 60 * 1000 });
  expect(screen.getByRole("status")).toHaveTextContent(
    "Since you last looked 3 hours ago: RP down by 80 · now Gold 2 · 3 matches · 1 kill"
  );
});

test("nothing played since, nothing said -- and the clock restarts", () => {
  show(payload()).unmount();
  const { container } = show(payload(), { at: T0 + DAY });
  expect(container).toBeEmptyDOMElement();
  expect(stored()[`steam:${ACCOUNT}`].latest.at).toBe(T0 + DAY);
});

// A refresh of the page already open must keep counting from the look before
// it, not from the refresh.
test("a refresh while the page is open still counts from the previous look", () => {
  show(payload()).unmount();
  const view = show(payload({ matches: 102, kills: 82 }), { at: T0 + DAY });
  expect(screen.getByRole("status")).toHaveTextContent("2 matches · 2 kills");

  view.rerender(<SinceLastVisit data={payload({ matches: 104, kills: 85 })} now={() => T0 + DAY + 60_000} />);
  expect(screen.getByRole("status")).toHaveTextContent("Since you last looked yesterday: 4 matches · 5 kills");
});

// One visit can mount the line several times -- a language switch remounts
// it, a reload repeats it, and React's StrictMode runs every effect twice in
// development. The first version recorded the look as it showed it, and each of
// those then compared the look with itself and hid the line.
test("looks within one visit keep comparing with the visit before", () => {
  show(payload()).unmount();
  show(payload({ matches: 103, kills: 84 }), { at: T0 + DAY }).unmount();
  show(payload({ matches: 104, kills: 85 }), { at: T0 + DAY + VISIT_GAP_MS - 60_000 });
  expect(screen.getByRole("status")).toHaveTextContent("4 matches · 5 kills");
});

test("a look after the gap starts a new visit, counted from the last one", () => {
  show(payload()).unmount();
  show(payload({ matches: 103, kills: 84 }), { at: T0 + DAY }).unmount();
  show(payload({ matches: 104, kills: 85 }), { at: T0 + DAY + VISIT_GAP_MS });
  expect(screen.getByRole("status")).toHaveTextContent("Since you last looked 30 minutes ago: 1 match · 1 kill");
});

test("survives StrictMode's double effects", () => {
  show(payload()).unmount();
  setLanguage("en");
  render(
    <StrictMode>
      <SinceLastVisit data={payload({ matches: 102 })} now={() => T0 + DAY} />
    </StrictMode>
  );
  expect(screen.getByRole("status")).toHaveTextContent("Since you last looked yesterday: 2 matches");
});

test("a past season is neither shown nor remembered", () => {
  const { container } = show(payload({ current: false }));
  expect(container).toBeEmptyDOMElement();
  expect(stored()).toEqual({});
});

test("only the most recent players are remembered", () => {
  for (let i = 0; i < MAX_SNAPSHOTS + 5; i += 1) {
    const account = `account.${String(i).padStart(32, "0")}`;
    show(payload({ account }), { at: T0 + i }).unmount();
  }
  const keys = Object.keys(stored());
  expect(keys).toHaveLength(MAX_SNAPSHOTS);
  expect(keys).not.toContain(`steam:account.${"0".repeat(32)}`);
});

test("a broken stored value is ignored rather than crashing the page", () => {
  window.localStorage.setItem(SNAPSHOT_STORAGE_KEY, "{not json");
  const { container } = show(payload({ matches: 101 }));
  expect(container).toBeEmptyDOMElement();
  expect(stored()[`steam:${ACCOUNT}`].latest.matches).toBe(101);
});

test("renders in Ukrainian with Ukrainian plurals", () => {
  show(payload()).unmount();
  show(payload({ matches: 105, wins: 7, kills: 101, rp: 2450 }), { at: T0 + 3 * DAY, language: "ua" });
  expect(screen.getByRole("status")).toHaveTextContent(
    "З вашого минулого перегляду 3 дні тому: RP більше на 50 · 5 матчів · 2 перемоги · 21 кіл"
  );
});
