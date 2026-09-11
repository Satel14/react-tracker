import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { setTranslations, setDefaultLanguage, setLanguage } from "react-switch-lang";
import HomeHeading from "./HomeHeading";
import HomeGuideLinks from "./HomeGuideLinks";
import en from "../../Language/en.json";
import ua from "../../Language/ua.json";

afterEach(() => setLanguage("en"));

describe.each([["en", en, ""], ["ua", ua, "/ua"]])("homepage hero in %s", (language, dictionary, prefix) => {
  it("renders the heading, summary and crawlable guide links in the chosen language", () => {
    setTranslations({ en, ua });
    setDefaultLanguage("en");
    setLanguage(language);
    render(<MemoryRouter><HomeHeading /><HomeGuideLinks /></MemoryRouter>);
    const copy = dictionary.pages.main;
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(copy.title);
    expect(screen.getByText(copy.subtitle)).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: copy.guides.label })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: copy.guides.ranks })).toHaveAttribute("href", `${prefix}/ranks`);
    expect(screen.getByRole("link", { name: copy.guides.rankPoints })).toHaveAttribute("href", `${prefix}/rank-points`);
  });
});
