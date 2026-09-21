import { describe, it, expect } from "vitest";
import { prerenderBody, PRERENDERED_ROUTES } from "./prerenderBody";
import { ROUTE_META } from "./routeMeta.js";
import { CENSUS_SNAPSHOT, benchmarkRows, lobbyMixRows, rpTable } from "./censusSnapshot";
import { rpCuts } from "./rankPercentile";
import { PAGE_SIZE } from "../component/leaderboard/leaderboardLayout.js";
import en from "../Language/en.json";
import ua from "../Language/ua.json";

const ranks = () => prerenderBody("/ranks");

describe("which routes ship their article", () => {
  // The other fixed routes are applications, not reading. A heading and a
  // sentence is the right amount of static text for a leaderboard, and the
  // homepage's file is also what Pages serves for every unmatched URL, so
  // prose in it would become duplicate copy across an unbounded set of them.
  it("renders the article, the homepage body, the FAQ and the leaderboard prose", () => {
    expect(PRERENDERED_ROUTES).toEqual([
      "/ranks", "/ua/ranks", "/rank-points", "/ua/rank-points",
      "/ranked-lobbies", "/ua/ranked-lobbies", "/stats-by-rank", "/ua/stats-by-rank",
      "/", "/help", "/leaderboards",
    ]);
  });

  it("says nothing for a route that is not prerendered", () => {
    // Both render an empty state for anyone who is not the visitor who filled
    // them in, so there is nothing to put in a file.
    expect(prerenderBody("/favorites")).toBeNull();
    expect(prerenderBody("/compare")).toBeNull();
  });

  // The literal list above pins today's seven routes but would stay green if a
  // future indexable route were added to the sitemap without a PAGES entry --
  // prerenderBody would silently return null and renderHead would fall back to
  // the hand-written stub, no throw, no warning. Keyed on `sitemap` rather
  // than on `body`, because a blanket rule on `body: true` would be wrong: the
  // four application routes (/favorites, /compare, /player, /bugreport) carry
  // `body: true` on purpose and are never meant to be indexed. The invariant
  // that actually matters is indexability, and it holds today because every
  // `sitemap: true` route is prerendered.
  it("prerenders every route the sitemap lists", () => {
    for (const route of ROUTE_META.filter((r) => r.sitemap)) {
      expect(PRERENDERED_ROUTES, route.path).toContain(route.path);
    }
  });
});

// The file this lands in is also what Pages serves for every unmatched URL.
// That is why it carried no prose for so long -- and why pageHeadMeta now
// marks those URLs noindex, which is what made this safe to ship.
describe("the homepage body", () => {
  const home = () => prerenderBody("/");

  it("gives the homepage the h1 it never had", () => {
    // `<h1[ >]`, not `<h1>`: this one carries a class.
    expect((home().match(/<h1[ >]/g) || []).length).toBe(1);
    expect(home()).toContain(`<h1>${en.pages.main.title}</h1>`);
    expect(decode(home())).toContain(en.pages.main.subtitle);
  });

  it("is a body rather than a slogan", () => {
    const words = home().replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean);
    expect(words.length).toBeGreaterThan(400);
  });

  it("links the two pages we want crawled from the one page that ranks", () => {
    expect(home()).toContain('href="/ranks"');
    expect(home()).toContain('href="/leaderboards"');
    expect(home()).toContain('href="/rank-points"');
    expect(home()).toContain(en.pages.main.guides.rankPoints);
  });
});

describe("the ranks article as a crawler receives it", () => {
  // The whole point. Before this, the static file carried the h1 and one
  // sentence -- about fifty words of a seventeen-hundred-word article -- and
  // everything else existed only after the bundle ran.
  it("carries every paragraph the copy defines", () => {
    const html = ranks();
    const written = Object.entries(en.pages.ranks)
      .filter(([, value]) => value && typeof value === "object")
      .flatMap(([, value]) => Object.entries(value).filter(([key]) => /^p\d+$/.test(key)))
      .map(([, text]) => text);

    expect(written.length).toBeGreaterThan(40);
    for (const text of written) {
      // Compared after entity-decoding: renderToStaticMarkup escapes the
      // apostrophes and ampersands the copy is full of.
      expect(decode(html), text.slice(0, 40)).toContain(text);
    }
  });

  it("carries every section heading", () => {
    const html = decode(ranks());
    const headings = Object.entries(en.pages.ranks)
      .filter(([, value]) => value && typeof value === "object" && value.heading)
      .map(([, value]) => value.heading);

    expect(headings.length).toBeGreaterThan(8);
    for (const heading of headings) {
      expect(html, heading).toContain(heading);
    }
  });

  // Scoped to the ladder itself. Searching the whole document finds
  // "Survivor" in the contents rail long before the table, which says
  // nothing about the order the tiers are listed in.
  it("names the tiers in ladder order", () => {
    const html = ranks();
    // By the class the ladder puts on each row, not by slicing the <ol>:
    // the division pips are a nested list, so the first </ol> closes the
    // first tier rather than the table.
    const names = [...html.matchAll(/class="ranks-page__tier-name">([A-Za-z]+)/g)]
      .map((match) => match[1]);
    expect(names).toEqual([
      "Bronze", "Silver", "Gold", "Platinum", "Crystal", "Diamond", "Master", "Survivor",
    ]);
    expect(html).not.toContain("Grandmaster tier is");
  });

  // The h1 a crawler reads and the h1 React renders have to be the same
  // sentence. Rendering the component is what makes that true by construction
  // rather than by two people remembering to edit both.
  it("opens with the page's own h1", () => {
    expect(decode(ranks())).toContain(`<h1>${en.pages.ranks.title}</h1>`);
  });

  it("is a whole article rather than a stub", () => {
    const words = ranks().replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean);
    expect(words.length).toBeGreaterThan(1500);
  });

  // No router context, no fetch, no window: the build has none of them, and a
  // component that reached for one would throw the build rather than quietly
  // shipping half a page.
  it("renders without a live app around it", () => {
    expect(() => ranks()).not.toThrow();
  });

  // The section nobody else on the web publishes, and the one this file used to
  // deliver as the words "Reading the latest sample…" -- the numbers arrived in
  // an effect, and a build runs no effects. They come from the committed
  // snapshot now, so they are in the file a crawler and every answer engine
  // read.
  it("carries the measured tier shares, not the loading line", () => {
    const html = decode(ranks());
    expect(html).not.toContain(en.pages.ranks.distribution.loading);
    expect(html).toContain('class="ranks-page__share-list"');
    // Every tier the census could publish, as a percentage with a margin.
    expect((html.match(/class="ranks-page__share-value">\d+\.\d%/g) || []).length)
      .toBeGreaterThan(5);
    expect(html).toMatch(/Measured from [\d,]+ accounts across [\d,]+ ranked matches on PC \(Steam\)/);
  });

  it("says which window the shares were measured over", () => {
    expect(decode(ranks())).toMatch(/\d{4}-\d{2}-\d{2} to \d{4}-\d{2}-\d{2}/);
  });

  // A URL to cite rather than a screenshot to argue with.
  it("links the data files", () => {
    expect(ranks()).toContain('href="/data/tier-census.json"');
    expect(ranks()).toContain('href="/data/tier-census.csv"');
  });
});

// The same component, read from the ua dictionary. Asserted on sentences from
// the dictionaries themselves, so a translation that silently fell back to
// English fails here rather than shipping.
// It joined the prerendered set only once the answers were in the DOM at all.
// While antd's collapse was rendering closed panels as null, a static render of
// this page produced ten questions and no answers -- which is exactly what a
// crawler was already getting from the client render.
describe("the FAQ as a crawler receives it", () => {
  const help = () => prerenderBody("/help");

  it("carries every answer, not just the questions", () => {
    const html = decode(help());
    const faq = Object.values(en.pages.help.faq);
    expect(faq.length).toBeGreaterThan(8);
    for (const { q, a } of faq) {
      expect(html, q).toContain(q);
      expect(html, a.slice(0, 40)).toContain(a);
    }
  });

  it("is a page with answers on it rather than a heading and a sentence", () => {
    const words = help().replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean);
    // The stub it replaces was 43.
    expect(words.length).toBeGreaterThan(600);
  });

  it("opens with the page's own h1", () => {
    expect(decode(help())).toContain(`<h1>${en.pages.help.title}</h1>`);
  });
});

// The page carried 43 crawlable words, and Google fell back to putting the site
// footer in its search snippet -- the same failure /help had. What is prerendered
// is the two halves that are words: the heading above the table and the prose
// below it. The standings are not, and must not be.
describe("the leaderboard prose as a crawler receives it", () => {
  const board = () => prerenderBody("/leaderboards");

  it("carries the page's own h1, the one routeMeta writes into the shell", () => {
    expect(decode(board())).toContain(`<h1>${en.pages.leaderboards.title}</h1>`);
  });

  it("carries the lead and every section the copy defines", () => {
    const html = decode(board());
    const about = en.pages.leaderboards.about;
    expect(html).toContain(about.lead);
    const sections = Object.values(about).filter((value) => value && typeof value === "object");
    expect(sections).toHaveLength(4);
    for (const section of sections) {
      expect(html, section.heading).toContain(section.heading);
      for (const [key, text] of Object.entries(section)) {
        if (/^p\d+$/.test(key)) expect(html, text.slice(0, 40)).toContain(text);
      }
    }
  });

  it("is prose rather than a stub", () => {
    const words = board().replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean);
    // The stub it replaces was 43.
    expect(words.length).toBeGreaterThan(300);
  });

  // The whole reason the table is left out. A build cannot reach the API, and a
  // set of standings frozen at build time would disagree with the page.
  it("ships no standings", () => {
    const html = board();
    expect(html).not.toContain("ant-table");
    // The "Updated {time}" line only exists once a board has been fetched, so
    // its absence is what says no build-time copy of the standings shipped.
    expect(html).not.toContain(en.pages.leaderboards.updated.replace("{time}", "").trim());
    for (const column of [en.pages.leaderboards.avgDamage, en.pages.leaderboards.avgRank]) {
      expect(html, column).not.toContain(column);
    }
  });

  it("links the page that answers what a leaderboard cannot", () => {
    expect(board()).toContain('href="/ranks"');
  });

  // No standings, but their footprint. Without this the shell put the explainer
  // where the table lands, React shoved it ~2,950px down at mount, and this was
  // the worst page on the site for layout shift: 0.351 in production, 0.262
  // measured locally against 500 entries, now 0.000.
  //
  // The row count rides in as a custom property so PAGE_SIZE stays the only
  // place the number lives; the height itself is style.scss's business.
  it("reserves the standings' footprint instead of leaving a gap", () => {
    const html = board();
    expect(html).toContain("leaderboard-page__table-reserve");
    expect(html).toContain(`--lb-rows:${PAGE_SIZE}`);
    expect(html).toContain("leaderboard-page__filters--reserved");
    expect(html).toContain("leaderboard-page__meta--reserved");
  });

  // The shell is also what the route renders while its chunk loads, so it has
  // to wear the page's own wrapper -- otherwise the heading sits at a different
  // width in the file than on screen.
  it("wraps the page in the same container the route renders", () => {
    expect(board()).toContain('class="content leaderboard-page"');
  });
});

describe("the Ukrainian twin", () => {
  it("renders from the Ukrainian dictionary", () => {
    const html = prerenderBody("/ua/ranks");
    expect(html).toContain("Усі вісім тірів за порядком");
    expect(html).toContain("На цій сторінці");
  });

  it("leaves no English copy on it", () => {
    const html = prerenderBody("/ua/ranks");
    expect(html).not.toContain("On this page");
    expect(html).not.toContain("The eight tiers, in order");
  });

  // The language is set per call, so a page rendered after the Ukrainian one
  // would inherit it if the build did not say which language it wants.
  it("leaves the English page in English", () => {
    expect(ranks()).toContain("The eight tiers, in order");
    expect(ranks()).not.toContain("Усі вісім тірів за порядком");
  });

  // The only path between the two versions a crawler that runs no JavaScript
  // has -- and the only one a reader who landed on the wrong language has.
  it("links each language at the other", () => {
    expect(ranks()).toContain('href="/ua/ranks"');
    expect(prerenderBody("/ua/ranks")).toContain('href="/ranks"');
  });

  it("is a whole article too, not a stub", () => {
    const words = prerenderBody("/ua/ranks").replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean);
    expect(words.length).toBeGreaterThan(1500);
  });
});

describe("the rank points pages", () => {
  const page = (path) => prerenderBody(path);

  it("renders a body rather than a stub, in both languages", () => {
    for (const path of ["/rank-points", "/ua/rank-points"]) {
      const words = page(path).replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean);
      expect(words.length, path).toBeGreaterThan(250);
    }
  });

  it("carries exactly one h1 on each", () => {
    for (const path of ["/rank-points", "/ua/rank-points"]) {
      expect((page(path).match(/<h1[ >]/g) || []).length, path).toBe(1);
    }
  });

  // The whole point of the page shipping before its numbers did: the prose has
  // to stand on its own, including the constraint it states out loud. It still
  // does now that the table is here -- the refusal is not a placeholder.
  it("states what it refuses to publish, table or no table", () => {
    expect(page("/rank-points")).toContain("We do not publish where each tier starts");
  });

  // The counterpart of the lobby-table test at the bottom of this file, and
  // written the same day for the same reason: this page exists to put its
  // percentile table where a crawler reads it. See that test for why the
  // branch is derived from the snapshot and why rows are counted rather than
  // digits matched.
  it("carries the percentile table itself, not a promise of one", () => {
    const table = rpTable(CENSUS_SNAPSHOT);

    for (const path of ["/rank-points", "/ua/rank-points"]) {
      const html = decode(page(path));
      const dict = path.startsWith("/ua/") ? ua : en;
      expect(html, path).not.toContain(en.pages.ranks.distribution.loading);

      if (!table) {
        expect(html, path).toContain(dict.pages.rankPoints.gathering);
        continue;
      }

      expect(html, path).not.toContain(dict.pages.rankPoints.gathering);
      expect(html.match(/<tr><th scope="row">/g)?.length, path).toBe(rpCuts(table).length);
      expect(html, path).toMatch(/<td>[\d\s,.]+<\/td>/);
      expect(html, path).toContain(CENSUS_SNAPSHOT.firstDate);
    }
  });

  it("reads each language from its own dictionary", () => {
    expect(page("/rank-points")).toContain("Is your PUBG RP good?");
    expect(page("/ua/rank-points")).toContain("Чи добре твоє RP");
  });

  it("links the article and the leaderboards from both", () => {
    for (const path of ["/rank-points", "/ua/rank-points"]) {
      expect(page(path), path).toContain('href="/ranks"');
      expect(page(path), path).toContain('href="/leaderboards"');
    }
  });
});

describe("the ranked lobbies pages", () => {
  const page = (path) => prerenderBody(path);

  it("renders a body rather than a stub, in both languages", () => {
    for (const path of ["/ranked-lobbies", "/ua/ranked-lobbies"]) {
      const words = page(path).replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean);
      expect(words.length, path).toBeGreaterThan(250);
    }
  });

  it("carries exactly one h1 on each", () => {
    for (const path of ["/ranked-lobbies", "/ua/ranked-lobbies"]) {
      expect((page(path).match(/<h1[ >]/g) || []).length, path).toBe(1);
    }
  });

  it("reads each language from its own dictionary", () => {
    expect(decode(page("/ranked-lobbies"))).toContain(en.pages.rankedLobbies.title);
    expect(page("/ua/ranked-lobbies")).toContain("Хто насправді сидить у твоєму рейтинговому лобі PUBG?");
  });

  it("links the article and the rank points page from both", () => {
    for (const path of ["/ranked-lobbies", "/ua/ranked-lobbies"]) {
      expect(page(path), path).toContain('href="/ranks"');
      expect(page(path), path).toContain('href="/rank-points"');
    }
  });

  // The point of the page: its table has to be IN the file a crawler reads,
  // not fetched into it afterwards. Written on 2026-09-15, the day the nightly
  // census first put `lobbyMix` in the committed snapshot -- until then there
  // were no percentages anywhere in the file to find, and this test could only
  // pin the gathering state.
  //
  // Which of the two states is asserted is read off the snapshot rather than
  // hardcoded, because gathering is a state this page legitimately returns to
  // at every season rollover -- a fixed pin on the table would turn the next
  // reset into a red build about nothing. What holds in both branches is that
  // the static file carries the page's answer and never the loading line.
  //
  // Row counts rather than the digits themselves: the numbers move every night
  // and their formatting is per-locale (uk-UA groups with a space and
  // decimal-commas), so a literal "37%" would pin the day rather than the page.
  it("carries the lobby table itself, not a promise of one", () => {
    const rows = lobbyMixRows(CENSUS_SNAPSHOT);

    for (const path of ["/ranked-lobbies", "/ua/ranked-lobbies"]) {
      const html = decode(page(path));
      const dict = path.startsWith("/ua/") ? ua : en;
      expect(html, path).not.toContain(en.pages.ranks.distribution.loading);

      if (!rows) {
        expect(html, path).toContain(dict.pages.rankedLobbies.gathering);
        continue;
      }

      expect(html, path).not.toContain(dict.pages.rankedLobbies.gathering);
      expect(html.match(/<tr><th scope="row">/g)?.length, path).toBe(rows.length);
      expect(html, path).toMatch(/<td>[\d\s,.]+%<\/td>/);
      expect(html, path).toContain(CENSUS_SNAPSHOT.firstDate);
    }
  });
});

describe("the stats by rank pages", () => {
  const page = (path) => prerenderBody(path);

  it("renders a body rather than a stub, in both languages", () => {
    for (const path of ["/stats-by-rank", "/ua/stats-by-rank"]) {
      const words = page(path).replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean);
      expect(words.length, path).toBeGreaterThan(250);
    }
  });

  it("carries exactly one h1 on each", () => {
    for (const path of ["/stats-by-rank", "/ua/stats-by-rank"]) {
      expect((page(path).match(/<h1[ >]/g) || []).length, path).toBe(1);
    }
  });

  it("reads each language from its own dictionary", () => {
    expect(decode(page("/stats-by-rank"))).toContain(en.pages.statsByRank.h1);
    expect(decode(page("/ua/stats-by-rank"))).toContain(ua.pages.statsByRank.h1);
  });

  // Language-matched: a reader on the Ukrainian twin must not be sent back to
  // the English /ranks, /ranked-lobbies or /rank-points. All three outro links
  // shipped English-only in commit 804244a; this pins the fix.
  it("links the article, the lobby table and the rank points page from both, in the page's own language", () => {
    expect(page("/stats-by-rank")).toContain('href="/ranks"');
    expect(page("/stats-by-rank")).toContain('href="/ranked-lobbies"');
    expect(page("/stats-by-rank")).toContain('href="/rank-points"');
    expect(page("/ua/stats-by-rank")).toContain('href="/ua/ranks"');
    expect(page("/ua/stats-by-rank")).toContain('href="/ua/ranked-lobbies"');
    expect(page("/ua/stats-by-rank")).toContain('href="/ua/rank-points"');
  });

  // The point of the page: its table has to be IN the file a crawler reads,
  // not fetched into it afterwards. Which of the two states is asserted is read
  // off the snapshot rather than hardcoded, for the reason the lobby table
  // above gives -- gathering is a state this page legitimately returns to at
  // every season rollover, and a fixed pin on the table would turn the next
  // reset into a red build about nothing.
  it("carries the benchmark table itself, not a promise of one", () => {
    const rows = benchmarkRows(CENSUS_SNAPSHOT);

    for (const path of ["/stats-by-rank", "/ua/stats-by-rank"]) {
      const html = decode(page(path));
      const dict = path.startsWith("/ua/") ? ua : en;
      expect(html, path).not.toContain(en.pages.ranks.distribution.loading);

      if (!rows) {
        expect(html, path).toContain(dict.pages.statsByRank.gathering);
        continue;
      }

      expect(html, path).not.toContain(dict.pages.statsByRank.gathering);
      expect(html.match(/<tr><th scope="row">/g)?.length, path).toBe(rows.length);
      expect(html, path).toContain(CENSUS_SNAPSHOT.firstDate);
    }
  });

  // The half of the test above that had to wait for data. It was written while
  // `benchmarks` was still null in the snapshot, so it could only count rows --
  // and a row whose cells are empty counts just the same. The nightly run of
  // 2026-09-19 was the first to publish numbers, so the digits can be pinned now.
  //
  // Both halves of the cell, because PR #108 made it a pair: a crawler that
  // reads the median without the quartiles under it has half the answer the
  // page is read for. Patterns rather than literals for the reason the lobby
  // table gives -- the numbers move every night.
  it("carries the median and its quartile range as digits, not just the row", () => {
    if (!benchmarkRows(CENSUS_SNAPSHOT)) return;

    for (const path of ["/stats-by-rank", "/ua/stats-by-rank"]) {
      const html = decode(page(path));
      expect(html, path).toMatch(/<span class="stats-by-rank__median">[\d\s,.]+<\/span>/);
      expect(html, path).toMatch(
        /<span class="stats-by-rank__spread">[\d\s,.]+ – [\d\s,.]+<\/span>/,
      );
      // The no-kill column is a share, which by design carries no quartiles.
      expect(html, path).toMatch(/<td[^>]*>[\d\s,.]+%<\/td>/);
    }
  });

  // The gathering state's snapshot is by definition the ARCHIVED season, so a
  // season number there is false twice over -- and this is the file that would
  // carry it into a search result.
  it("names no season while it is still gathering", () => {
    if (benchmarkRows(CENSUS_SNAPSHOT)) return;
    for (const path of ["/stats-by-rank", "/ua/stats-by-rank"]) {
      const text = decode(page(path)).replace(/<[^>]+>/g, " ");
      expect(text, path).not.toMatch(/season \d+/i);
      expect(text, path).not.toMatch(/сезон \d+/i);
    }
  });
});

// The footer did not exist in the shell and appeared at mount, which moved
// everything measured below it. Prerendering the real component makes the two
// renders agree by construction rather than by a reserved height.
it.each(["/stats-by-rank", "/ua/stats-by-rank", "/ranks", "/"])(
  "renders the footer into the %s shell",
  (path) => {
    const html = prerenderBody(path);
    expect(html).toContain('class="footer"');
    // Its real copy, not an empty placeholder element.
    expect(html).toMatch(/Real-time PUBG stats|Статистика PUBG/);
  },
);

it("renders the footer once, after the page body", () => {
  const html = prerenderBody("/stats-by-rank");
  expect(html.match(/class="footer"/g)).toHaveLength(1);
  expect(html.indexOf('class="footer"')).toBeGreaterThan(html.indexOf("stats-by-rank__section"));
});

const decode = (html) =>
  html
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
