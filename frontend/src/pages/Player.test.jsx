import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
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

test("keeps a pasted Steam URL inside a single player route segment", () => {
  const Location = () => <output data-testid="location">{useLocation().pathname}</output>;
  render(<MemoryRouter><Player /><Location /></MemoryRouter>);
  const query = "https://steamcommunity.com/id/Example";
  fireEvent.change(screen.getByPlaceholderText("Enter name, id or url"), { target: { value: query } });
  fireEvent.keyDown(screen.getByPlaceholderText("Enter name, id or url"), { key: "Enter", code: "Enter", keyCode: 13 });
  expect(screen.getByTestId("location").textContent).toBe(`/player/steam/${encodeURIComponent(query)}`);
});
