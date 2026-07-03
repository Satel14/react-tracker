import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Main from "./Main";

const getPlayerSteamName = vi.fn();
const getLiveSnapshot = vi.fn();
const openNotification = vi.fn();
const navigate = vi.fn();

vi.mock("../api/player", () => ({
  getPlayerSteamName: (...args) => getPlayerSteamName(...args),
  getLiveSnapshot: (...args) => getLiveSnapshot(...args),
}));

vi.mock("../component/Notification", () => ({
  default: (...args) => openNotification(...args),
}));

vi.mock("../component/HistoryChecking", () => ({
  default: () => <div data-testid="history" />,
}));

vi.mock("framer-motion", () => ({
  m: {
    div: ({ children, initial, animate, transition, ...rest }) => (
      <div {...rest}>{children}</div>
    ),
  },
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => navigate };
});

const t = (k) => k;

beforeEach(() => {
  getPlayerSteamName.mockReset();
  getLiveSnapshot.mockReset();
  openNotification.mockReset();
  navigate.mockReset();
  getLiveSnapshot.mockResolvedValue({ data: null });
  window.matchMedia = window.matchMedia || ((query) => ({
    matches: false, media: query, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  }));
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <Main t={t} />
    </MemoryRouter>
  );

test("shows a notification and does not navigate when Steam resolution returns no account", async () => {
  getPlayerSteamName.mockResolvedValue({ status: 200, message: "not found" });
  renderPage();

  const input = screen.getByPlaceholderText("Enter PUBG nickname or Steam url");
  fireEvent.change(input, {
    target: { value: "https://steamcommunity.com/id/ghost" },
  });

  fireEvent.click(screen.getByRole("button", { name: "other.words.viewStats" }));

  await waitFor(() => {
    expect(openNotification).toHaveBeenCalledWith(
      "error",
      "Steam Error",
      "Account not found"
    );
  });
  expect(navigate).not.toHaveBeenCalled();
});

test("resets the exit animation state when the Steam resolver throws", async () => {
  getPlayerSteamName.mockRejectedValue(new Error("network down"));
  const { container } = renderPage();

  const input = screen.getByPlaceholderText("Enter PUBG nickname or Steam url");
  fireEvent.change(input, {
    target: { value: "https://steamcommunity.com/id/ghost" },
  });

  fireEvent.click(screen.getByRole("button", { name: "other.words.viewStats" }));

  await waitFor(() => {
    expect(openNotification).toHaveBeenCalledWith(
      "error",
      "Steam Error",
      "Account not found"
    );
  });
  expect(navigate).not.toHaveBeenCalled();
  expect(container.querySelector(".mainpage").className).not.toMatch(/exit/);
});
