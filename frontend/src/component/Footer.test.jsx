import React from "react";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { setTranslations, setDefaultLanguage, setLanguage } from "react-switch-lang";
import Footer from "./Footer";
// The component's own source, so the key list below is derived rather than
// restated. `?raw` rather than node:fs: this spec runs in the jsdom project,
// where import.meta.url is not a file: URL.
import footerSource from "./Footer.jsx?raw";
import en from "../Language/en.json";
import ua from "../Language/ua.json";

const keysUsedByComponent = () => {
  const used = new Set();
  for (const match of footerSource.matchAll(/t\("footer\.([A-Za-z]+)"\)/g)) used.add(match[1]);
  return [...used].sort();
};

const renderFooter = (language = "en") => {
  setTranslations({ en, ua });
  setDefaultLanguage("en");
  setLanguage(language);
  return render(
    <MemoryRouter>
      <Footer />
    </MemoryRouter>
  );
};

afterEach(() => {
  // react-switch-lang state is a module-level singleton; reset it so a locale
  // set by one test cannot leak into another.
  setTranslations({});
  setDefaultLanguage("en");
});

test("the bug report link points at /bugreport", () => {
  renderFooter();
  expect(screen.getByRole("link", { name: "Report a bug" })).toHaveAttribute("href", "/bugreport");
});

// Exact name, not a regex: antd renders the icon as <span role="img"
// aria-label="bug"> and spreads our props after that label, so dropping the
// aria-hidden would make the name "bug Report a bug". A loose matcher would
// still pass; this one fails.
test("the bug report icon stays out of the accessibility tree", () => {
  renderFooter();
  const link = screen.getByRole("link", { name: "Report a bug" });
  expect(within(link).queryByRole("img")).toBeNull();
  expect(screen.queryByRole("link", { name: "bug Report a bug" })).toBeNull();
});

test("the mail link has a mailto href and a non-empty accessible name", () => {
  const { container } = renderFooter();
  const mail = container.querySelector('a[href^="mailto:"]');

  expect(mail).not.toBeNull();
  expect(mail).toHaveAttribute("href", "mailto:ostaplvov@gmail.com");
  expect(mail.textContent.trim()).not.toBe("");
  expect(screen.getByRole("link", { name: "Email the developer" })).toBe(mail);
});

// mailto: cannot be opened in a new browsing context, so target/rel were inert.
test("the mail link does not carry a browsing-context target", () => {
  const { container } = renderFooter();
  const mail = container.querySelector('a[href^="mailto:"]');
  expect(mail).not.toHaveAttribute("target");
});

test("the KRAFTON disclaimer renders verbatim", () => {
  renderFooter();
  expect(
    screen.getByText(
      "PUBG Tracker is not affiliated with KRAFTON, Inc. PUBG is a registered trademark of KRAFTON, Inc."
    )
  ).toBeInTheDocument();
});

test("renders a contentinfo landmark", () => {
  renderFooter();
  expect(screen.getByRole("contentinfo")).toBeInTheDocument();
});

test("renders Ukrainian copy, including the disclaimer, when the language is ua", () => {
  renderFooter("ua");

  expect(screen.getByRole("link", { name: ua.footer.bugReport })).toHaveAttribute("href", "/bugreport");
  expect(screen.getByRole("link", { name: ua.footer.contact })).toHaveAttribute(
    "href",
    "mailto:ostaplvov@gmail.com"
  );
  expect(screen.getByText(ua.footer.disclaimer)).toBeInTheDocument();
  expect(screen.queryByText(en.footer.disclaimer)).toBeNull();
});

// A half-translated footer has to fail the build, so the list of keys is
// derived from the component rather than restated by hand.
test("every footer key the component uses is defined in both locales", () => {
  const used = keysUsedByComponent();

  expect(used.length).toBeGreaterThan(0);
  for (const key of used) {
    expect(en.footer?.[key], `en is missing footer.${key}`).toBeTruthy();
    expect(ua.footer?.[key], `ua is missing footer.${key}`).toBeTruthy();
  }
});

test("neither locale keeps a footer key the component no longer renders", () => {
  const used = keysUsedByComponent();
  expect(Object.keys(en.footer).sort()).toEqual(used);
  expect(Object.keys(ua.footer).sort()).toEqual(used);
});
