import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import FavoritesList from "./FavoritesList";

const ACCOUNT_ID = "account.fa405e76bea343a59dc8bc4d3cece7a6";

beforeEach(() => {
  window.localStorage.clear();
  window.matchMedia = window.matchMedia || ((query) => ({
    matches: false, media: query, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  }));
});

test("links a favorite by nickname when the stored gameId is an account id", async () => {
  window.localStorage.setItem(
    "favorites",
    JSON.stringify({
      [ACCOUNT_ID]: {
        id: ACCOUNT_ID,
        gameId: ACCOUNT_ID,
        accountId: ACCOUNT_ID,
        nickname: "Neo",
        platform: "steam",
        avatarUrl: null,
        addedAt: 1,
      },
    })
  );

  render(
    <MemoryRouter>
      <FavoritesList />
    </MemoryRouter>
  );

  const name = await screen.findByText("Neo");
  expect(name.closest("a")).toHaveAttribute("href", "/player/steam/Neo");
});
