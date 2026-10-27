import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { setTranslations, setDefaultLanguage, setLanguage } from "react-switch-lang";
import PcLauncherHint from "./PcLauncherHint";
import en from "../../Language/en.json";
import ua from "../../Language/ua.json";

const checkPcLauncher = vi.fn();
vi.mock("../../api/player", () => ({
  checkPcLauncher: (...args) => checkPcLauncher(...args),
}));

const ACCOUNT = "account.3cc264b9e6754f459de7caf048f700b7";

const renderHint = ({ language = "en", ...props } = {}) => {
  setTranslations({ en, ua });
  setDefaultLanguage("en");
  setLanguage(language);
  return render(
    <MemoryRouter>
      <PcLauncherHint platform="steam" accountId={ACCOUNT} playerName="NPX_NeoBuLi" hasRecentMatches={false} {...props} />
    </MemoryRouter>
  );
};

const events = () =>
  window.gtag.mock.calls.filter(([kind, name]) => kind === "event" && name === "player_elsewhere").map(([, , p]) => p);

beforeEach(() => {
  checkPcLauncher.mockReset();
  checkPcLauncher.mockResolvedValue({ status: 200, data: { platform: "kakao", matches: 71 } });
  window.gtag = vi.fn();
});

afterEach(() => {
  delete window.gtag;
  setTranslations({});
  setDefaultLanguage("en");
});

test("an empty Steam profile whose account plays on Kakao points there", async () => {
  renderHint();
  const link = await screen.findByRole("link", { name: "Open the Kakao profile →" });
  expect(link).toHaveAttribute("href", "/player/kakao/NPX_NeoBuLi");
  // The whole sentence, not its opening: react-switch-lang fills a placeholder
  // once, so a repeated {platform} shipped as literal text on 2026-10-27.
  expect(screen.getByRole("status")).toHaveTextContent(
    "This account plays through Kakao, so its matches are on that profile, not this one. Open the Kakao profile →"
  );
  expect(screen.getByRole("status").textContent).not.toMatch(/[{}]/);
  expect(checkPcLauncher).toHaveBeenCalledWith("steam", ACCOUNT);
  expect(events()).toEqual([{ platform: "steam", result: "other_launcher" }]);
});

test("it encodes the name into the link", async () => {
  renderHint({ playerName: "a/b#c" });
  expect(await screen.findByRole("link", { name: /Open the Kakao profile/ })).toHaveAttribute("href", "/player/kakao/a%2Fb%23c");
});

// One PUBG lookup per call: spent only on a PC profile that came back empty.
test("a profile with recent matches asks nothing", () => {
  const { container } = renderHint({ hasRecentMatches: true });
  expect(checkPcLauncher).not.toHaveBeenCalled();
  expect(container).toBeEmptyDOMElement();
});

test("a console profile asks nothing", () => {
  renderHint({ platform: "xbox" });
  expect(checkPcLauncher).not.toHaveBeenCalled();
});

test("a profile without a real account id asks nothing", () => {
  renderHint({ accountId: null });
  renderHint({ accountId: "account.x" });
  expect(checkPcLauncher).not.toHaveBeenCalled();
});

test("no other launcher, or a failed check, shows nothing", async () => {
  checkPcLauncher.mockResolvedValueOnce({ status: 200, data: null });
  const first = renderHint();
  await waitFor(() => expect(checkPcLauncher).toHaveBeenCalledTimes(1));
  expect(first.container).toBeEmptyDOMElement();
  first.unmount();

  checkPcLauncher.mockRejectedValueOnce(new Error("Too many lookups"));
  const second = renderHint();
  await waitFor(() => expect(checkPcLauncher).toHaveBeenCalledTimes(2));
  expect(second.container).toBeEmptyDOMElement();
  expect(events()).toEqual([]);
});

test("an answer naming a platform that is not the other launcher is ignored", async () => {
  checkPcLauncher.mockResolvedValue({ status: 200, data: { platform: "steam", matches: 5 } });
  const { container } = renderHint();
  await waitFor(() => expect(checkPcLauncher).toHaveBeenCalled());
  await Promise.resolve();
  expect(container).toBeEmptyDOMElement();
});

test("renders in Ukrainian", async () => {
  renderHint({ language: "ua" });
  expect(await screen.findByRole("link", { name: "Відкрити профіль Kakao →" })).toBeInTheDocument();
  expect(screen.getByRole("status").textContent).not.toMatch(/[{}]/);
});
