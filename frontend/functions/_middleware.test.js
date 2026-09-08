import { onRequest } from "./_middleware.js";
import { SITE_ORIGIN } from "../src/helpers/routeMeta.js";

// The first test this Function has ever had, and it can only cover the paths
// that return before HTMLRewriter is reached: that global exists in the Workers
// runtime and nowhere else. That is not much of a limitation for what is being
// pinned here -- the host check has to come first precisely so that nothing
// else runs for an aliased request.
const refuseNext = () => {
  throw new Error("next() must not be called");
};

const html = (body = "ok") =>
  new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });

const call = (url, next = refuseNext) => onRequest({ request: new Request(url), next });

describe("the production Pages alias", () => {
  // It serves this same build byte for byte, and Cloudflare adds
  // x-robots-tag: noindex to *preview* aliases only -- not to this one. Until
  // this redirect, one cross-domain canonical tag was the only thing standing
  // between a complete duplicate of the site and the search results.
  it("sends the site's own address instead of serving a copy", async () => {
    const response = await call("https://react-tracker.pages.dev/ranks");
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe(`${SITE_ORIGIN}/ranks`);
  });

  it("keeps the path and the query string", async () => {
    const response = await call("https://react-tracker.pages.dev/player/steam/shroud?tab=matches");
    expect(response.headers.get("location")).toBe(
      `${SITE_ORIGIN}/player/steam/shroud?tab=matches`,
    );
  });

  it("redirects the root", async () => {
    const response = await call("https://react-tracker.pages.dev/");
    expect(response.headers.get("location")).toBe(`${SITE_ORIGIN}/`);
  });

  // The point of doing it first: /player/... is the branch that rewrites a head,
  // and rewriting needs HTMLRewriter. If the host check ran after it, this test
  // would not redirect -- it would throw "HTMLRewriter is not defined".
  it("decides on the host before it looks at the path", async () => {
    const response = await call("https://react-tracker.pages.dev/match/steam/abc-123/replay");
    expect(response.status).toBe(301);
  });
});

describe("every other host", () => {
  // Branch previews are how a change is checked against a real Pages
  // deployment before it merges, and Cloudflare already marks them noindex.
  // Redirecting them to production would make that impossible.
  it("leaves a branch preview alone", async () => {
    const response = await call("https://feat-census-in-html.react-tracker.pages.dev/ranks", html);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
  });

  it("leaves the site itself alone", async () => {
    const response = await call("https://www.pubgtracker.top/ranks", html);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
  });

  // A fixed route's head was written and verified at build time, so the
  // Function hands the file back rather than reading it. Pinned here because
  // it is what makes the two assertions above cheap enough to make.
  it("hands a fixed route straight back, unread", async () => {
    let asked = 0;
    await call("https://www.pubgtracker.top/help", () => {
      asked += 1;
      return html();
    });
    expect(asked).toBe(1);
  });
});
