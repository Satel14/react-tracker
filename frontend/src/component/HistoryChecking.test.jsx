import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import HistoryChecking from "./HistoryChecking";
import { MAX_RECENT_ITEMS } from "../cookie/store";

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

// The homepage's whole layout shift lived here. With nothing in storage this
// component used to return an empty fragment until the fetch landed, so
// .history-list was 0px tall and everything below it dropped ~740px when the
// rows arrived -- Lighthouse named this block as the sole CLS culprit.
//
// Asserted synchronously, with no waitFor: the reservation is only worth
// anything if it is on the FIRST paint. A skeleton that appears a tick later
// has already let the shift happen.
test("reserves the block on the first paint for a visitor with nothing stored", () => {
  getRecentSearchesMock.mockReturnValue(new Promise(() => {}));

  const { container } = renderComponent();

  expect(container.querySelectorAll(".historycheck_block--loading")).toHaveLength(
    MAX_RECENT_ITEMS
  );
});

// /api/player/recent answers with `limit = 10`, and the client caps its cache at
// the same number. Reserving a different count would trade a big shift for a
// small one rather than removing it.
test("reserves exactly as many rows as the endpoint returns", () => {
  expect(MAX_RECENT_ITEMS).toBe(10);
});

// Reading localStorage is synchronous; only the `async` on getHistory made it
// look otherwise, and a stored history that paints one tick late shifts the
// column under it just as surely as the fetch does.
test("paints stored history on the first paint too", () => {
  window.localStorage.setItem("history", JSON.stringify(HISTORY_ENTRY));
  getRecentSearchesMock.mockReturnValue(new Promise(() => {}));

  renderComponent();

  expect(screen.getByText("Neo")).toBeInTheDocument();
});

test("shows a skeleton instead of the N/A placeholder while the request is in flight", async () => {
  window.localStorage.setItem("history", JSON.stringify(HISTORY_ENTRY));
  getRecentSearchesMock.mockReturnValue(new Promise(() => {}));

  const { container } = renderComponent();

  await waitFor(() => {
    expect(container.querySelector(".historycheck_block--loading")).not.toBeNull();
  });
  expect(container.querySelector(".historycheck_block--empty")).toBeNull();
  // A short dash, not a line: skeleton--text is full-width now that page-level
  // skeletons use it for table and feed rows, and it would stretch across the
  // flex row here.
  expect(container.querySelector(".historycheck_block-left .skeleton--label")).not.toBeNull();
  expect(container.querySelector(".skeleton--text")).toBeNull();
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
