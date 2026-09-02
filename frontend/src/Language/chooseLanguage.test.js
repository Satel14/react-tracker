import { describe, it, expect } from "vitest";
import { chooseLanguage } from "./chooseLanguage";

describe("which language a page opens in", () => {
  // Someone who opened /ua/ranks from a search result asked for Ukrainian by
  // opening it. A choice they made on this site months ago must not overrule
  // the one they are making right now.
  it("lets a URL that names a language win over the stored choice", () => {
    expect(chooseLanguage({ pathname: "/ua/ranks", stored: "en" })).toBe("ua");
  });

  // The other direction is the one that bit: a reader with "ua" stored clicked
  // "Read in English", landed on /ranks and was handed Ukrainian, because the
  // English URL was read as having no opinion.
  it("lets the English half of a pair overrule a stored Ukrainian choice", () => {
    expect(chooseLanguage({ pathname: "/ranks", stored: "ua" })).toBe("en");
  });

  it("keeps the stored choice on a page that has no other language", () => {
    expect(chooseLanguage({ pathname: "/help", stored: "ua" })).toBe("ua");
  });

  it("ignores a stored value that is not a language we ship", () => {
    expect(chooseLanguage({ pathname: "/ranks", stored: "de" })).toBe("en");
  });

  it("falls back to English when nothing is stored", () => {
    expect(chooseLanguage({ pathname: "/ranks", stored: null })).toBe("en");
  });
});
