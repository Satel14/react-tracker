import React from "react";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Main from "./Main";
import Player from "./Player";

const getLiveSnapshot = vi.fn();

vi.mock("../api/player", () => ({
  getPlayerSteamName: vi.fn(),
  getLiveSnapshot: (...args) => getLiveSnapshot(...args),
}));
vi.mock("../component/Notification", () => ({ default: () => {} }));
vi.mock("../component/HistoryChecking", () => ({ default: () => <div /> }));
vi.mock("framer-motion", () => ({
  m: {
    div: ({ children, initial: _i, animate: _a, transition: _t, ...rest }) => (
      <div {...rest}>{children}</div>
    ),
  },
}));

beforeEach(() => {
  getLiveSnapshot.mockReset();
  getLiveSnapshot.mockResolvedValue({ data: null });
  window.matchMedia = window.matchMedia || ((query) => ({
    matches: false, media: query, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  }));
});

const t = (key) => key;

const pages = [
  ["Main", () => render(<MemoryRouter><Main t={t} /></MemoryRouter>)],
  ["Player", () => render(<MemoryRouter><Player t={t} /></MemoryRouter>)],
];

// The Player page renders its platform Radio.Group before the search box, so
// "the first input" is a radio. Ask for the one the visitor types into.
const searchBox = (container) => {
  const input = container.querySelector(
    'input:not([type="radio"]):not([type="checkbox"])'
  );
  expect(input, "no text-entry input on the page").not.toBeNull();
  return input;
};

// Google Search Console flagged this site for "possible phishing during user
// login" -- a false positive, because there is no login here at all. The likely
// trigger is someone typing their Steam password into a box whose placeholder
// mentions a Steam URL, which Chrome reports as password reuse.
//
// Nothing here can stop a person pasting a password into a text field. What it
// can do is stop the field looking like a credential field to the browser: a
// search input, saying so, asking for no autofill, and never inside anything a
// heuristic would read as a sign-in form.
describe.each(pages)("%s: the player search box does not look like a login", (_name, renderPage) => {
  it("declares itself a search field", () => {
    const { container } = renderPage();
    expect(searchBox(container).getAttribute("type")).toBe("search");
  });

  it("asks the browser not to autofill it", () => {
    const { container } = renderPage();
    expect(searchBox(container).getAttribute("autocomplete")).toBe("off");
  });

  it("has a name that reads as a query, not a credential", () => {
    const { container } = renderPage();
    expect(searchBox(container).getAttribute("name")).toBe("q");
  });

  it("carries an accessible name", () => {
    const { container } = renderPage();
    const input = searchBox(container);
    const label = input.getAttribute("aria-label") || input.getAttribute("aria-labelledby");
    expect(label, "the search box has no accessible name").toBeTruthy();
  });

  it("offers no password field and no sign-in form", () => {
    const { container } = renderPage();
    expect(container.querySelectorAll('input[type="password"]')).toHaveLength(0);
    for (const form of container.querySelectorAll("form")) {
      // antd renders no form here today; if one ever appears it must not be
      // addressable as a login by a heuristic reading its action or method.
      expect(form.getAttribute("action") || "").not.toMatch(/login|signin|auth/i);
    }
  });
});
