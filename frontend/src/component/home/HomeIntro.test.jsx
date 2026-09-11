import { afterEach, describe, it, expect } from "vitest";
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

afterEach(() => setLanguage("en"));

const renderIntro = (language = "en") => {
  setTranslations({ en, ua });
  setDefaultLanguage("en");
  setLanguage(language);
  return render(
    <MemoryRouter>
      <HomeIntro />
    </MemoryRouter>,
  );
};

describe("the homepage's own words", () => {
  // The page holding every one of this site's search impressions rendered
  // eight words and no heading at all. This is the body it was missing.
  it("leaves the page's h1 to the search hero", () => {
    renderIntro();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: en.pages.main.about.h1 })).toBeInTheDocument();
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

  it.each([
    ["en", en, "/rank-points"],
    ["ua", ua, "/ua/rank-points"],
  ])("sends %s readers to the guides and their language's RP page", (language, dictionary, rpPath) => {
    renderIntro(language);
    const copy = dictionary.pages.main.about;
    expect(screen.getByRole("link", { name: copy.ranksLink })).toHaveAttribute("href", "/ranks");
    expect(screen.getByRole("link", { name: copy.leaderboardsLink })).toHaveAttribute(
      "href",
      "/leaderboards",
    );
    expect(screen.getByRole("link", { name: copy.rankPoints.link })).toHaveAttribute("href", rpPath);
  });

  it("gives each section a heading of its own", () => {
    renderIntro();
    expect(screen.getAllByRole("heading", { level: 2 }).length).toBeGreaterThan(3);
  });
});
