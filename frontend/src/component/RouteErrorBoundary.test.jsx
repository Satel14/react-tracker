import React from "react";
import { render, screen } from "@testing-library/react";
import { setTranslations, setDefaultLanguage } from "react-switch-lang";
import en from "../Language/en.json";
import ua from "../Language/ua.json";
import RouteErrorBoundary from "./RouteErrorBoundary";

setTranslations({ en, ua });
setDefaultLanguage("en");

const Boom = () => {
  throw new Error("Failed to fetch dynamically imported module");
};

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
});

test("renders its children untouched while nothing throws", () => {
  render(
    <RouteErrorBoundary>
      <p>route content</p>
    </RouteErrorBoundary>
  );

  expect(screen.getByText("route content")).toBeInTheDocument();
});

test("renders a reload action instead of unmounting when a child throws", () => {
  render(
    <RouteErrorBoundary>
      <Boom />
    </RouteErrorBoundary>
  );

  expect(screen.getByRole("button", { name: /reload/i })).toBeInTheDocument();
  expect(screen.queryByText("route content")).not.toBeInTheDocument();
});

test("clears the failure once the reset key changes", () => {
  const { rerender } = render(
    <RouteErrorBoundary resetKey="/compare">
      <Boom />
    </RouteErrorBoundary>
  );

  expect(screen.getByRole("button", { name: /reload/i })).toBeInTheDocument();

  rerender(
    <RouteErrorBoundary resetKey="/favorites">
      <p>route content</p>
    </RouteErrorBoundary>
  );

  expect(screen.getByText("route content")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /reload/i })).not.toBeInTheDocument();
});
