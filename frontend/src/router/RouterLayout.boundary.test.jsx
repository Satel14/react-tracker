import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { setTranslations, setDefaultLanguage } from "react-switch-lang";
import en from "../Language/en.json";
import ua from "../Language/ua.json";
import RouterLayout from "./RouterLayout";

// A lazy route chunk that fails to download surfaces as a throw from the route
// element, which is what this stands in for.
vi.mock("./routes", () => ({
  default: [
    {
      path: "/",
      component: () => {
        throw new Error("Failed to fetch dynamically imported module");
      },
    },
  ],
}));

vi.mock("../component/Navbar", () => ({ default: () => <nav data-testid="navbar" /> }));
vi.mock("../component/Footer", () => ({ default: () => <footer data-testid="footer" /> }));
vi.mock("../component/CookieRule", () => ({ default: () => null }));

setTranslations({ en, ua });
setDefaultLanguage("en");

let consoleError;

// React re-throws a caught render error so browser devtools still see it; jsdom
// would then report it as an uncaught exception and pollute the test output.
const swallowUncaught = (event) => event.preventDefault();

beforeEach(() => {
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  window.addEventListener("error", swallowUncaught);
});

afterEach(() => {
  window.removeEventListener("error", swallowUncaught);
  consoleError.mockRestore();
  delete window.App;
});

test("keeps the shell mounted when a route component fails to load", () => {
  render(
    <MemoryRouter initialEntries={["/"]}>
      <RouterLayout />
    </MemoryRouter>
  );

  expect(screen.getByTestId("navbar")).toBeInTheDocument();
  expect(screen.getByTestId("footer")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /reload/i })).toBeInTheDocument();
});
