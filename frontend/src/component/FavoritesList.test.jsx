import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { setTranslations, setDefaultLanguage } from "react-switch-lang";
import en from "../Language/en.json";
import ua from "../Language/ua.json";
import FavoritesList from "./FavoritesList";

const ACCOUNT_ID = "account.fa405e76bea343a59dc8bc4d3cece7a6";

setTranslations({ en, ua });
setDefaultLanguage("en");

const favorite = (id, nickname) => ({
  id,
  gameId: id,
  nickname,
  platform: "steam",
  avatarUrl: null,
  addedAt: 1,
});

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

test("drops a compare selection whose favorite disappeared from storage", async () => {
  window.localStorage.setItem(
    "favorites",
    JSON.stringify({ alpha: favorite("alpha", "Alpha"), bravo: favorite("bravo", "Bravo") })
  );

  render(
    <MemoryRouter>
      <FavoritesList />
    </MemoryRouter>
  );

  await screen.findByText("Alpha");
  fireEvent.click(screen.getByText("Compare mode"));
  fireEvent.click(screen.getByText("Alpha").closest("button"));
  fireEvent.click(screen.getByText("Bravo").closest("button"));

  expect(screen.getByText("Compare (2)")).toBeInTheDocument();

  window.localStorage.setItem(
    "favorites",
    JSON.stringify({ bravo: favorite("bravo", "Bravo") })
  );
  await act(async () => {
    window.dispatchEvent(new Event("favorites:updated"));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
  expect(screen.queryByText("Compare (2)")).not.toBeInTheDocument();
});
