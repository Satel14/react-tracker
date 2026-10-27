import React from "react";
import { render, screen } from "@testing-library/react";
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

const answer = (data) => locatePlayer.mockResolvedValue({ status: 200, data });

const elsewhereEvents = () =>
  window.gtag.mock.calls
    .filter(([kind, name]) => kind === "event" && name === "player_elsewhere")
    .map(([, , params]) => params);

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
  answer({ found: [], complete: true });
  renderElsewhere({ platform: "xbox", gameId: "Someone" });
  await screen.findByText(en.pages.playerError.elsewhere.none);
  expect(locatePlayer).toHaveBeenCalledWith("xbox", "Someone");
});

test("says it is checking while the answer is on its way", () => {
  locatePlayer.mockReturnValue(new Promise(() => {}));
  renderElsewhere();
  expect(screen.getByText("Checking the other platforms…")).toBeInTheDocument();
});

test("links each platform the name was found on to that profile", async () => {
  answer({
    found: [
      { platform: "psn", name: "WhiteChaseSmoker" },
      { platform: "xbox", name: "WhiteChaseSmoker" },
    ],
    complete: true,
  });
  renderElsewhere();

  const links = await screen.findAllByRole("link", { name: "WhiteChaseSmoker" });
  expect(links.map((link) => link.getAttribute("href"))).toEqual([
    "/player/psn/WhiteChaseSmoker",
    "/player/xbox/WhiteChaseSmoker",
  ]);
  expect(screen.getByText(/PlayStation/)).toBeInTheDocument();
  expect(screen.getByText(/Xbox/)).toBeInTheDocument();
});

test("encodes the name into the profile link", async () => {
  answer({ found: [{ platform: "kakao", name: "a/b#c" }], complete: true });
  renderElsewhere();
  expect(await screen.findByRole("link", { name: "a/b#c" })).toHaveAttribute("href", "/player/kakao/a%2Fb%23c");
});

test("a hit on a platform the site does not offer is not linked", async () => {
  answer({ found: [{ platform: "stadia", name: "Someone" }], complete: false });
  const { container } = renderElsewhere();
  await vi.waitFor(() => expect(container).toBeEmptyDOMElement());
  expect(screen.queryByRole("link")).toBeNull();
});

test("found nowhere, it says so and points at the spelling", async () => {
  answer({ found: [], complete: true });
  renderElsewhere();
  expect(
    await screen.findByText("Not on any other platform either, so check the spelling: capital letters matter.")
  ).toBeInTheDocument();
});

// "Not anywhere else" is only true when every platform answered.
test("an incomplete answer with no hits shows nothing at all", async () => {
  answer({ found: [], complete: false });
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

test("a rescue is reported once, with the platform that was searched", async () => {
  answer({ found: [{ platform: "xbox", name: "Someone" }], complete: true });
  renderElsewhere({ platform: "xbl", gameId: "Someone" });
  await screen.findByRole("link", { name: "Someone" });
  expect(elsewhereEvents()).toEqual([{ platform: "xbox", result: "found" }]);
});

test("a dead end is reported once as none", async () => {
  answer({ found: [], complete: true });
  renderElsewhere();
  await screen.findByText(en.pages.playerError.elsewhere.none);
  expect(elsewhereEvents()).toEqual([{ platform: "steam", result: "none" }]);
});

test("renders in Ukrainian", async () => {
  answer({ found: [], complete: true });
  renderElsewhere({ language: "ua" });
  expect(await screen.findByText(ua.pages.playerError.elsewhere.none)).toBeInTheDocument();
  expect(ua.pages.playerError.elsewhere.none).not.toBe(en.pages.playerError.elsewhere.none);
});
