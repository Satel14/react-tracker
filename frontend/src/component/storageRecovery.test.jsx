import React from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";

vi.mock("antd", () => ({
  Dropdown: ({ children, menu }) => <div>{children}{menu.items.map((item) => <button key={item.key} onClick={item.onClick}>{item.key}</button>)}</div>,
  Button: ({ children, onClick }) => <button onClick={onClick}>{children}</button>,
  Spin: () => null,
}));
vi.mock("react-switch-lang", () => ({
  setTranslations: vi.fn(), setDefaultLanguage: vi.fn(), setLanguage: vi.fn(),
  translate: (Component) => (props) => <Component {...props} t={(key) => key} />,
}));
vi.mock("../router/routes", () => ({ default: [] }));
vi.mock("./Navbar", () => ({ default: () => null }));
vi.mock("./Footer", () => ({ default: () => null }));

let SetLanguage, SetTheme, CookieRule, RouterLayout, getCurrentLocale;
beforeEach(async () => {
  vi.resetModules();
  window.localStorage.clear();
  ({ default: SetLanguage } = await import("../Language/SetLanguage"));
  ({ default: SetTheme } = await import("./SetTheme"));
  ({ default: CookieRule } = await import("./CookieRule"));
  ({ default: RouterLayout } = await import("../router/RouterLayout"));
  ({ getCurrentLocale } = await import("../helpers/locale"));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete window.App;
});
const Location = () => <output>{useLocation().pathname}</output>;

test.each(["getter", "getItem"])("shell controls render when storage %s throws", (failure) => {
  const deny = () => { throw new DOMException("Disabled", "SecurityError"); };
  if (failure === "getter") vi.spyOn(window, "localStorage", "get").mockImplementation(deny);
  else vi.spyOn(Storage.prototype, "getItem").mockImplementation(deny);
  render(<MemoryRouter initialEntries={["/ua/ranks"]}><SetLanguage /><SetTheme /><CookieRule /></MemoryRouter>);
  expect(screen.getByText("UA", { selector: "span" })).toBeInTheDocument();
  expect(screen.getByText("other.cookie.accept")).toBeInTheDocument();
  expect(screen.getByText("green", { selector: "button" })).toBeInTheDocument();
});

test("language selection still navigates and formats Ukrainian after a failed write and remount", () => {
  localStorage.setItem("lang", "en");
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Full", "QuotaExceededError"); });
  const first = render(<MemoryRouter initialEntries={["/ranks"]}><SetLanguage /><Location /></MemoryRouter>);
  fireEvent.click(screen.getByText("ua", { selector: "button" }));
  expect(screen.getByText("/ua/ranks")).toBeInTheDocument();
  expect(getCurrentLocale()).toBe("uk-UA");
  first.unmount();
  render(<MemoryRouter initialEntries={["/help"]}><SetLanguage /></MemoryRouter>);
  expect(screen.getByText("UA", { selector: "span" })).toBeInTheDocument();
});

test("theme applies after a failed write and survives a shell remount", () => {
  localStorage.setItem("theme", "green");
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Full", "QuotaExceededError"); });
  const changeTheme = vi.fn();
  window.App = { changeTheme };
  const first = render(<SetTheme />);
  fireEvent.click(screen.getByText("red", { selector: "button" }));
  expect(changeTheme).toHaveBeenLastCalledWith("red");
  first.unmount();
  const second = render(<MemoryRouter><RouterLayout /></MemoryRouter>);
  expect(second.container.querySelector(".app")).toHaveClass("red");
  second.unmount();
  window.App = { changeTheme };
  render(<SetTheme />);
  expect(changeTheme).toHaveBeenLastCalledWith("red");
});

test("cookie acceptance survives a failed write and remount", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Full", "QuotaExceededError"); });
  const first = render(<CookieRule />);
  fireEvent.click(screen.getByText("other.cookie.accept"));
  expect(screen.queryByText("other.cookie.accept")).not.toBeInTheDocument();
  first.unmount();
  render(<CookieRule />);
  expect(screen.queryByText("other.cookie.accept")).not.toBeInTheDocument();
});
