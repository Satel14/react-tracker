import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { setTranslations, setDefaultLanguage, setLanguage } from "react-switch-lang";
import Navbar from "./Navbar";
import en from "../Language/en.json";
import ua from "../Language/ua.json";

vi.mock("../Language/SetLanguage", () => ({ default: () => <div data-testid="set-language" /> }));
vi.mock("./SetTheme", () => ({ default: () => <div data-testid="set-theme" /> }));

beforeEach(() => {
  window.matchMedia = window.matchMedia || ((query) => ({
    matches: false, media: query, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  }));
});

afterEach(() => {
  // react-switch-lang state is a module-level singleton; reset it so a locale
  // set by one test cannot leak into another.
  setTranslations({});
  setDefaultLanguage("en");
});

test("renders a Leaderboards nav item", () => {
  render(
    <MemoryRouter>
      <Navbar />
    </MemoryRouter>
  );
  expect(screen.getByText("menu.leaderboards")).toBeInTheDocument();
});

test("renders the Ukrainian Home label when language is ua", () => {
  setTranslations({ en, ua });
  setDefaultLanguage("en");
  setLanguage("ua");

  render(
    <MemoryRouter>
      <Navbar />
    </MemoryRouter>
  );

  expect(screen.getByText("Головна")).toBeInTheDocument();
  expect(screen.queryByText("menu.main")).not.toBeInTheDocument();
});
