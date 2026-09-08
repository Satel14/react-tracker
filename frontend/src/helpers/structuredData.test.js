import { webApplicationLd, SITE_NAME } from "./structuredData";

const parsed = (over = {}) =>
  JSON.parse(
    webApplicationLd({
      url: "https://www.pubgtracker.top/ranks",
      description: "The PUBG ranked ladder as it stands.",
      ...over,
    }),
  );

describe("the WebApplication node", () => {
  it("is valid JSON, whatever it is handed", () => {
    expect(() => parsed()).not.toThrow();
    // A description carrying the characters that break naive escaping. It goes
    // into a <script> element, where HTML entities are not decoded, so the
    // value has to survive as JSON rather than as markup.
    // `<` is written as <, which is the same character to a JSON parser.
    const awkward = parsed({ description: 'Stats & "ranks" for <every> platform' });
    expect(awkward.description).toBe('Stats & "ranks" for <every> platform');
    expect(webApplicationLd({ url: "https://x/", description: "<b>" })).not.toContain("<");
  });

  it("says what it is and what it costs", () => {
    const node = parsed();
    expect(node["@context"]).toBe("https://schema.org");
    expect(node["@type"]).toBe("WebApplication");
    expect(node.name).toBe(SITE_NAME);
    expect(node.applicationCategory).toBe("GameApplication");
    expect(node.operatingSystem).toBe("Web");
    expect(node.offers).toEqual({ "@type": "Offer", price: "0", priceCurrency: "USD" });
  });

  it("is stated at the URL it is handed, not at the site root", () => {
    expect(parsed().url).toBe("https://www.pubgtracker.top/ranks");
    expect(parsed({ url: "https://www.pubgtracker.top/player/steam/shroud" }).url).toBe(
      "https://www.pubgtracker.top/player/steam/shroud",
    );
  });

  it("carries the description it is handed, not the homepage's", () => {
    expect(parsed({ description: "Where players actually sit." }).description).toBe(
      "Where players actually sit.",
    );
  });

  // Not a rating and not a review. Google's software-app rich result needs one
  // of them, and there is no honest source for either here -- so the node must
  // never grow one by accident.
  it("claims no rating and no review", () => {
    const node = parsed();
    expect(node.aggregateRating).toBeUndefined();
    expect(node.review).toBeUndefined();
    expect(Object.keys(node)).toEqual([
      "@context",
      "@type",
      "name",
      "url",
      "description",
      "applicationCategory",
      "operatingSystem",
      "offers",
    ]);
  });

  it("cannot break out of the script element it is written into", () => {
    const hostile = webApplicationLd({ url: "https://x/", description: "</script><b>hi" });
    expect(hostile).not.toContain("</script>");
  });
});
