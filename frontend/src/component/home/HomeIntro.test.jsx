import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { setTranslations, setDefaultLanguage, setLanguage } from "react-switch-lang";
import HomeIntro from "./HomeIntro";
import en from "../../Language/en.json";
import ua from "../../Language/ua.json";

const paragraphs = () =>
  Object.entries(en.pages.main.about)
    .filter(([, value]) => value && typeof value === "object")
    .flatMap(([, value]) => Object.entries(value).filter(([key]) => /^p\d+$/.test(key)))
    .map(([, text]) => text);

const renderIntro = () => {
  setTranslations({ en, ua });
  setDefaultLanguage("en");
  setLanguage("en");
  return render(
    <MemoryRouter>
      <HomeIntro />
    </MemoryRouter>,
  );
};

describe("the homepage's own words", () => {
  // The page holding every one of this site's search impressions rendered
  // eight words and no heading at all. This is the body it was missing.
  it("gives the page exactly one h1", () => {
    renderIntro();
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0].textContent.length).toBeGreaterThan(15);
  });

  it("renders every paragraph the copy defines", () => {
    const { container } = renderIntro();
    const written = paragraphs();
    expect(written.length).toBeGreaterThan(7);
    for (const text of written) {
      expect(container.textContent, text.slice(0, 40)).toContain(text);
    }
  });

  it("is long enough to be worth crawling", () => {
    const { container } = renderIntro();
    const words = container.textContent.split(/\s+/).filter(Boolean);
    expect(words.length).toBeGreaterThan(400);
  });

  // The homepage is the only page with any standing in search, so it is the
  // one place a link to the two pages we do want indexed is worth anything.
  it("sends readers to the pages worth reading", () => {
    renderIntro();
    expect(screen.getByRole("link", { name: /rank/i })).toHaveAttribute("href", "/ranks");
    expect(screen.getByRole("link", { name: /leaderboard/i })).toHaveAttribute(
      "href",
      "/leaderboards",
    );
  });

  it("gives each section a heading of its own", () => {
    renderIntro();
    expect(screen.getAllByRole("heading", { level: 2 }).length).toBeGreaterThan(3);
  });
});
