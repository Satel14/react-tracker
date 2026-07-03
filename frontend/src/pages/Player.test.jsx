import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Player from "./Player";

beforeEach(() => {
  window.matchMedia = window.matchMedia || ((query) => ({
    matches: false, media: query, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  }));
});

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/"]}>
      <Player />
    </MemoryRouter>
  );

test("does not render the fabricated 'Player Online' widget", () => {
  renderPage();
  expect(screen.queryByText(/Player Online/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/1,133,462/)).not.toBeInTheDocument();
});

test("still renders the player search box", () => {
  renderPage();
  expect(screen.getByPlaceholderText("Enter name, id or url")).toBeInTheDocument();
});
