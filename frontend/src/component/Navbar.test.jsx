import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Navbar from "./Navbar";

vi.mock("../Language/SetLanguage", () => ({ default: () => <div data-testid="set-language" /> }));
vi.mock("./SetTheme", () => ({ default: () => <div data-testid="set-theme" /> }));

beforeEach(() => {
  window.matchMedia = window.matchMedia || ((query) => ({
    matches: false, media: query, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  }));
});

test("renders a Leaderboards nav item", () => {
  render(
    <MemoryRouter>
      <Navbar />
    </MemoryRouter>
  );
  expect(screen.getByText("menu.leaderboards")).toBeInTheDocument();
});
