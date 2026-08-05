import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import HistoryChecking from "./HistoryChecking";

const { getRecentSearchesMock } = vi.hoisted(() => ({
  getRecentSearchesMock: vi.fn(),
}));

vi.mock("../api/player", () => ({
  getRecentSearches: getRecentSearchesMock,
}));

vi.mock("react-switch-lang", () => ({
  translate: (Component) => (props) => <Component {...props} t={(key) => key} />,
}));

vi.mock("framer-motion", () => ({
  m: {
    div: ({ children, ...rest }) => <div {...rest}>{children}</div>,
  },
}));

const HISTORY_ENTRY = {
  "steam:Neo": {
    id: "steam:Neo",
    gameId: "Neo",
    platform: "steam",
    nickname: "Neo",
    searchedAt: 1783084548082,
  },
};

const RECENT_ENTRY = {
  id: "steam:Trinity",
  gameId: "Trinity",
  platform: "steam",
  nickname: "Trinity",
  rating: 2100,
  searchedAt: 1783084548082,
};

const renderComponent = () =>
  render(
    <MemoryRouter>
      <HistoryChecking />
    </MemoryRouter>
  );

beforeEach(() => {
  window.localStorage.clear();
  getRecentSearchesMock.mockReset();
});

afterEach(() => {
  window.localStorage.clear();
});

test("shows a skeleton instead of the N/A placeholder while the request is in flight", async () => {
  window.localStorage.setItem("history", JSON.stringify(HISTORY_ENTRY));
  getRecentSearchesMock.mockReturnValue(new Promise(() => {}));

  const { container } = renderComponent();

  await waitFor(() => {
    expect(container.querySelector(".historycheck_block--loading")).not.toBeNull();
  });
  expect(container.querySelector(".historycheck_block--empty")).toBeNull();
});

test("paints the cached list on the very first render, before the request resolves", () => {
  window.localStorage.setItem("history", JSON.stringify(HISTORY_ENTRY));
  window.localStorage.setItem(
    "recent",
    JSON.stringify({ items: [RECENT_ENTRY], cachedAt: 1783084548082 })
  );
  getRecentSearchesMock.mockReturnValue(new Promise(() => {}));

  renderComponent();

  expect(screen.getByText("Trinity")).toBeInTheDocument();
});

test("caches the fetched list so the next visit can paint instantly", async () => {
  window.localStorage.setItem("history", JSON.stringify(HISTORY_ENTRY));
  getRecentSearchesMock.mockResolvedValue({ data: { data: [RECENT_ENTRY] } });

  renderComponent();

  await screen.findByText("Trinity");
  await waitFor(() => {
    const cached = JSON.parse(window.localStorage.getItem("recent"));
    expect(cached.items[0].gameId).toBe("Trinity");
  });
});

test("keeps the cached list when the request fails instead of falling back to N/A", async () => {
  window.localStorage.setItem("history", JSON.stringify(HISTORY_ENTRY));
  window.localStorage.setItem(
    "recent",
    JSON.stringify({ items: [RECENT_ENTRY], cachedAt: 1783084548082 })
  );
  getRecentSearchesMock.mockRejectedValue(new Error("cold start"));

  const { container } = renderComponent();

  await waitFor(() => {
    expect(getRecentSearchesMock).toHaveBeenCalled();
  });
  expect(screen.getByText("Trinity")).toBeInTheDocument();
  expect(container.querySelector(".historycheck_block--empty")).toBeNull();
});

test("still shows N/A once an empty list has genuinely loaded", async () => {
  window.localStorage.setItem("history", JSON.stringify(HISTORY_ENTRY));
  getRecentSearchesMock.mockResolvedValue({ data: { data: [] } });

  const { container } = renderComponent();

  await waitFor(() => {
    expect(container.querySelector(".historycheck_block--empty")).not.toBeNull();
  });
  expect(container.querySelector(".historycheck_block--loading")).toBeNull();
});
