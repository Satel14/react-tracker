import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { setTranslations, setDefaultLanguage, setLanguage } from "react-switch-lang";
import Navbar from "./Navbar";
import { NAV_ROUTES } from "../helpers/routeMeta";
import en from "../Language/en.json";
import ua from "../Language/ua.json";

vi.mock("../Language/SetLanguage", () => ({ default: () => <div data-testid="set-language" /> }));
vi.mock("./SetTheme", () => ({ default: () => <div data-testid="set-theme" /> }));

beforeEach(() => {
  window.matchMedia = window.matchMedia || ((query) => ({
    matches: false, media: query, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  }));
});

afterEach(() => {
  // react-switch-lang state is a module-level singleton; reset it so a locale
  // set by one test cannot leak into another.
  setTranslations({});
  setDefaultLanguage("en");
});

test("renders a Leaderboards nav item", () => {
  render(
    <MemoryRouter>
      <Navbar />
    </MemoryRouter>
  );
  expect(screen.getByText("menu.leaderboards")).toBeInTheDocument();
});

test("renders the Ukrainian Home label when language is ua", () => {
  setTranslations({ en, ua });
  setDefaultLanguage("en");
  setLanguage("ua");

  render(
    <MemoryRouter>
      <Navbar />
    </MemoryRouter>
  );

  expect(screen.getByText("Головна")).toBeInTheDocument();
  expect(screen.queryByText("menu.main")).not.toBeInTheDocument();
});

const NAV_DESTINATIONS = ["/", "/favorites", "/help", "/leaderboards", "/ranks"];

const hrefsIn = (container) =>
  Array.from(container.querySelectorAll("a[href]")).map((a) => a.getAttribute("href"));

// jsdom reports 1024, so a bare render is the desktop branch. Set it before
// render, not after: `isMobile` is seeded by a useState initialiser.
const setViewport = (width) => {
  const previous = window.innerWidth;
  window.innerWidth = width;
  return () => {
    window.innerWidth = previous;
  };
};

test("every nav destination is reachable by href, not just by click", () => {
  const { container } = render(
    <MemoryRouter>
      <Navbar />
    </MemoryRouter>
  );

  expect(hrefsIn(container)).toEqual(expect.arrayContaining(NAV_DESTINATIONS));
});

// The crawlable shell nav (NAV_ROUTES, built from NAV_ORDER in routeMeta.js)
// and this component's navItems/rightNavItems are two independent lists that
// have to describe the same set of destinations, or a crawler and a visitor
// see different menus. This is a one-way check on purpose: the React navbar
// legitimately carries entries the shell nav does not, such as /favorites,
// which is noindex and deliberately left out of the shell nav that points
// only at pages we are willing to have indexed. Asserting set equality here
// would demand /favorites be added to the shell nav -- an SEO regression, not
// a fix -- so do not "tighten" this to equality later. The two navs also
// deliberately differ in ORDER: the shell nav ends with /help, while the
// React navbar splits into a left menu and a right menu, so Help renders
// third. This guard is about membership, not sequence.
test("every crawlable shell nav destination also exists in the React navbar", () => {
  const { container } = render(
    <MemoryRouter>
      <Navbar />
    </MemoryRouter>
  );

  const rendered = hrefsIn(container);
  for (const route of NAV_ROUTES) {
    expect(rendered, route.path).toContain(route.path);
  }
});

test("the wordmark is a link home", () => {
  const { container } = render(
    <MemoryRouter>
      <Navbar />
    </MemoryRouter>
  );

  expect(container.querySelector("a.navbar__logo")).toHaveAttribute("href", "/");
});

// WCAG 2.5.3, Label in Name: the accessible name has to contain the words on
// screen. This carried aria-label="Home", which replaced them -- so a link that
// reads PUBG.TRACKER answered only to "Home", and the nav already has a Home
// item of its own. Queried by role so the assertion is the real name
// computation rather than the absence of one attribute.
test.each([["desktop", 1024], ["phone", 400]])(
  "the %s wordmark is named by the words printed on it",
  (_layout, width) => {
    const restore = setViewport(width);
    try {
      render(
        <MemoryRouter>
          <Navbar />
        </MemoryRouter>
      );
      expect(screen.getByRole("link", { name: "PUBG.TRACKER" })).toHaveAttribute("href", "/");
    } finally {
      restore();
    }
  }
);

// Googlebot crawls at a phone viewport, where the desktop menus are unmounted
// and the drawer starts closed. If the destinations only exist once someone taps
// the burger, the crawler never sees a single one of them.
test("the phone layout exposes every destination without opening the drawer", () => {
  const restore = setViewport(400);
  try {
    const { container } = render(
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>
    );

    expect(hrefsIn(container)).toEqual(expect.arrayContaining(NAV_DESTINATIONS));
  } finally {
    restore();
  }
});

const LocationProbe = ({ seen }) => {
  const location = useLocation();
  seen.add(location.key);
  return null;
};

test("clicking a nav link pushes exactly one history entry", () => {
  const seen = new Set();
  render(
    <MemoryRouter>
      <Navbar />
      <LocationProbe seen={seen} />
    </MemoryRouter>
  );

  const before = seen.size;
  fireEvent.click(screen.getByRole("link", { name: "menu.leaderboards" }));

  // The anchor navigates on its own. An unguarded menu-item onClick alongside it
  // would push the same path a second time and break the back button.
  expect(seen.size).toBe(before + 1);
});

test("clicking a menu item's icon still navigates", () => {
  const seen = new Set();
  const { container } = render(
    <MemoryRouter>
      <Navbar />
      <LocationProbe seen={seen} />
    </MemoryRouter>
  );

  const before = seen.size;
  fireEvent.click(container.querySelector(".ant-menu-item .anticon"));

  expect(seen.size).toBe(before + 1);
});
