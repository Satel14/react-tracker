import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SetLanguage from "./SetLanguage";

describe("the language switch", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // The pair that matters: a Ukrainian URL and an English preference. If the
  // stored value won, a visitor arriving from a Ukrainian search result would
  // watch the page flip to English under them.
  it("follows the URL when the URL names a language", () => {
    localStorage.setItem("lang", "en");
    render(
      <MemoryRouter initialEntries={["/ua/ranks"]}>
        <SetLanguage />
      </MemoryRouter>,
    );
    expect(screen.getByText(/UA/)).toBeInTheDocument();
  });

  it("keeps the stored choice on a page that names none", () => {
    localStorage.setItem("lang", "ua");
    render(
      <MemoryRouter initialEntries={["/help"]}>
        <SetLanguage />
      </MemoryRouter>,
    );
    expect(screen.getByText(/UA/)).toBeInTheDocument();
  });
});
