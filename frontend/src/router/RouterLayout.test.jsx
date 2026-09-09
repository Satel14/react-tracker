import React from "react";
import { render } from "@testing-library/react";
import RouterLayout from "./RouterLayout";
import themes from "../component/config/themes";

vi.mock("react-router-dom", () => ({
  useLocation: () => ({ pathname: "/" }),
  Routes: () => null,
  Route: () => null,
}));

vi.mock("framer-motion", () => ({
  LazyMotion: ({ children }) => <>{children}</>,
  domAnimation: {},
}));

vi.mock("../component/Navbar", () => ({ default: () => <nav /> }));
vi.mock("../component/Footer", () => ({ default: () => <footer /> }));
vi.mock("../component/CookieRule", () => ({ default: () => null }));
vi.mock("../pages/ErrorPage", () => ({ default: () => null }));
vi.mock("./routes", () => ({ default: [] }));

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
  delete window.App;
});

test("uses the saved theme from localStorage on first paint", () => {
  window.localStorage.setItem("theme", "red");
  const { container } = render(<RouterLayout />);
  const shell = container.querySelector(".app");
  expect(shell).not.toBeNull();
  expect(shell.className).toContain("red");
});

test("falls back to the green theme when no theme is saved", () => {
  const { container } = render(<RouterLayout />);
  const shell = container.querySelector(".app");
  expect(shell.className).toContain("green");
});

test("falls back to the green theme when the saved theme is not a known theme", () => {
  window.localStorage.setItem("theme", "garbage");
  const { container } = render(<RouterLayout />);
  const shell = container.querySelector(".app");
  expect(shell.className).toContain("app green");
});

test("falls back to the green theme when localStorage.getItem throws", () => {
  const getItemSpy = vi
    .spyOn(window.localStorage.__proto__, "getItem")
    .mockImplementation(() => {
      throw new Error("localStorage disabled");
    });

  try {
    const { container } = render(<RouterLayout />);
    const shell = container.querySelector(".app");
    expect(shell.className).toContain("green");
  } finally {
    getItemSpy.mockRestore();
  }
});

// The routed content is the page's main landmark. Pinned because it is a bare
// tag name with no styling hanging off it -- nothing else in the app would
// notice it turning back into a div.
test("wraps the routed content in a single main landmark", () => {
  const { container } = render(<RouterLayout />);
  const landmarks = container.querySelectorAll("main");
  expect(landmarks).toHaveLength(1);
  expect(landmarks[0].className).toContain("content");
});

test("the theme class matches a theme that defines an accent", () => {
  const { container } = render(<RouterLayout />);
  const shell = container.querySelector(".app");
  const applied = [...shell.classList].find((name) => name !== "app");
  expect(Object.keys(themes)).toContain(applied);
});
