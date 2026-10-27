import React from "react";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { setTranslations, setDefaultLanguage, setLanguage } from "react-switch-lang";
import PlayerElsewhere from "./PlayerElsewhere";
import en from "../../Language/en.json";
import ua from "../../Language/ua.json";

const locatePlayer = vi.fn();

vi.mock("../../api/player", () => ({
  locatePlayer: (...args) => locatePlayer(...args),
}));

const renderElsewhere = ({ platform = "steam", gameId = "WhiteChaseSmoker", language = "en" } = {}) => {
  setTranslations({ en, ua });
  setDefaultLanguage("en");
  setLanguage(language);
  return render(
    <MemoryRouter>
      <PlayerElsewhere platform={platform} gameId={gameId} />
    </MemoryRouter>
  );
};

const answer = ({ found = [], suggestions = [], complete = true } = {}) =>
  locatePlayer.mockResolvedValue({ status: 200, data: { found, suggestions, complete } });

const elsewhereEvents = () =>
  window.gtag.mock.calls
    .filter(([kind, name]) => kind === "event" && name === "player_elsewhere")
    .map(([, , params]) => params);

const NONE = "Not on any other platform either, so check the spelling: capital letters matter.";

beforeEach(() => {
  locatePlayer.mockReset();
  window.gtag = vi.fn();
});

afterEach(() => {
  delete window.gtag;
  setTranslations({});
  setDefaultLanguage("en");
});

test("asks about the name and platform that were not found", async () => {
  answer();
  renderElsewhere({ platform: "xbox", gameId: "Someone" });
  await screen.findByText(NONE);
  expect(locatePlayer).toHaveBeenCalledWith("xbox", "Someone");
});

test("says it is checking while the answer is on its way", () => {
  locatePlayer.mockReturnValue(new Promise(() => {}));
  renderElsewhere();
  expect(screen.getByText("Checking the other platforms…")).toBeInTheDocument();
});

test("links each platform the exact name was found on, with its recent matches", async () => {
  answer({
    found: [
      { platform: "psn", name: "WhiteChaseSmoker", matches: 116 },
      { platform: "xbox", name: "WhiteChaseSmoker", matches: null },
    ],
  });
  renderElsewhere();

  const links = await screen.findAllByRole("link", { name: "WhiteChaseSmoker" });
  expect(links.map((link) => link.getAttribute("href"))).toEqual([
    "/player/psn/WhiteChaseSmoker",
    "/player/xbox/WhiteChaseSmoker",
  ]);
  expect(links[0].closest("p")).toHaveTextContent("PlayStation");
  expect(links[0].closest("p")).toHaveTextContent("116 matches in the last 2 weeks");
  expect(links[1].closest("p")).toHaveTextContent("Xbox");
  expect(links[1].closest("p")).not.toHaveTextContent("in the last 2 weeks");
});

test("offers the spellings that exist, linked on the platform that was searched", async () => {
  answer({
    suggestions: [
      { platform: "steam", name: "bravo_exe", matches: 67 },
      { platform: "steam", name: "Bravo_exe", matches: 0 },
    ],
  });
  renderElsewhere({ gameId: "Bravo.exe" });

  const block = (await screen.findByText("Did you mean:")).closest(".player-elsewhere__suggestions");
  const links = within(block).getAllByRole("link");
  expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
    ["bravo_exe", "/player/steam/bravo_exe"],
    ["Bravo_exe", "/player/steam/Bravo_exe"],
  ]);
  expect(links[0].closest("li")).toHaveTextContent("67 matches in the last 2 weeks");
  expect(links[1].closest("li")).toHaveTextContent("no matches in the last 2 weeks");
  expect(screen.queryByText(NONE)).toBeNull();
});

test("one recent match is singular in English", async () => {
  answer({ suggestions: [{ platform: "steam", name: "cheko_", matches: 1 }] });
  renderElsewhere({ gameId: "Cheko_" });
  expect((await screen.findByRole("link", { name: "cheko_" })).closest("li")).toHaveTextContent(
    "1 match in the last 2 weeks"
  );
});

test.each([
  [1, "1 матч за 2 тижні"],
  [3, "3 матчі за 2 тижні"],
  [67, "67 матчів за 2 тижні"],
  [21, "21 матч за 2 тижні"],
  [0, "жодного матчу за 2 тижні"],
])("Ukrainian counts %i recent matches as «%s»", async (matches, text) => {
  answer({ suggestions: [{ platform: "steam", name: "cheko_", matches }] });
  renderElsewhere({ gameId: "Cheko_", language: "ua" });
  expect((await screen.findByRole("link", { name: "cheko_" })).closest("li")).toHaveTextContent(text);
});

test("encodes the name into the profile link", async () => {
  answer({ found: [{ platform: "kakao", name: "a/b#c", matches: 3 }] });
  renderElsewhere();
  expect(await screen.findByRole("link", { name: "a/b#c" })).toHaveAttribute("href", "/player/kakao/a%2Fb%23c");
});

test("a hit on a platform the site does not offer is not linked", async () => {
  answer({ found: [{ platform: "stadia", name: "Someone" }], suggestions: [{ platform: "stadia", name: "x" }], complete: false });
  const { container } = renderElsewhere();
  await vi.waitFor(() => expect(container).toBeEmptyDOMElement());
  expect(screen.queryByRole("link")).toBeNull();
});

test("found nowhere, it says so and points at the spelling", async () => {
  answer();
  renderElsewhere();
  expect(await screen.findByText(NONE)).toBeInTheDocument();
});

// "Not anywhere else" is only true when every platform answered.
test("an incomplete answer with no hits shows nothing at all", async () => {
  answer({ complete: false });
  const { container } = renderElsewhere();
  await vi.waitFor(() => expect(container).toBeEmptyDOMElement());
  expect(elsewhereEvents()).toEqual([]);
});

test("a failed request shows nothing at all", async () => {
  locatePlayer.mockRejectedValue(new Error("Too many lookups"));
  const { container } = renderElsewhere();
  await vi.waitFor(() => expect(container).toBeEmptyDOMElement());
  expect(elsewhereEvents()).toEqual([]);
});

test("a hit on another platform is reported as found, with the platform searched", async () => {
  answer({
    found: [{ platform: "xbox", name: "Someone", matches: 4 }],
    suggestions: [{ platform: "xbox", name: "someone", matches: 2 }],
  });
  renderElsewhere({ platform: "xbl", gameId: "Someone" });
  await screen.findByRole("link", { name: "Someone" });
  expect(elsewhereEvents()).toEqual([{ platform: "xbox", result: "found" }]);
});

test("a spelling offered with no other hit is reported as suggested", async () => {
  answer({ suggestions: [{ platform: "steam", name: "bravo_exe", matches: 67 }] });
  renderElsewhere({ gameId: "Bravo.exe" });
  await screen.findByRole("link", { name: "bravo_exe" });
  expect(elsewhereEvents()).toEqual([{ platform: "steam", result: "suggested" }]);
});

test("a dead end is reported once as none", async () => {
  answer();
  renderElsewhere();
  await screen.findByText(NONE);
  expect(elsewhereEvents()).toEqual([{ platform: "steam", result: "none" }]);
});

// Seventeen digits cannot be a PUBG name (sixteen at most), so nothing is asked.
test("a SteamID64 gets an explanation instead of a lookup", async () => {
  renderElsewhere({ gameId: "76561198000000000" });
  expect(
    screen.getByText("This is a Steam ID, not a PUBG name. Type the nickname exactly as it appears in the game.")
  ).toBeInTheDocument();
  expect(locatePlayer).not.toHaveBeenCalled();
  expect(elsewhereEvents()).toEqual([{ platform: "steam", result: "steam_id" }]);
});

// A bare number can still be a PUBG name, so the lookup runs as well.
test("a PUBG MOBILE-style number is explained and still looked up", async () => {
  answer();
  renderElsewhere({ gameId: "5123456789" });
  expect(screen.getByText(/looks like a PUBG MOBILE ID/)).toBeInTheDocument();
  await screen.findByText(NONE);
  expect(locatePlayer).toHaveBeenCalledWith("steam", "5123456789");
});

test("renders in Ukrainian", async () => {
  answer();
  renderElsewhere({ language: "ua" });
  expect(await screen.findByText(ua.pages.playerError.elsewhere.none)).toBeInTheDocument();
  expect(ua.pages.playerError.elsewhere.none).not.toBe(en.pages.playerError.elsewhere.none);
});
