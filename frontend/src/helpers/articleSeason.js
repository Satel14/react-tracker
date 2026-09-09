// The season the ranks article is written about.
//
// Declared once here and read by routeMeta.js for both language heads, so the
// title, the description and the prose cannot drift apart. It is deliberately a
// literal rather than something derived from the census at build time: the copy
// around it -- the start date, the update range, the Ranked map pool -- is
// season-specific prose, and swapping the number in it would turn each true
// sentence into a false one.
//
// articleSeason.test.js requires this to be at least the season the census is
// measuring, and requires every string listed below to name it. Bumping the
// number without rewriting the paragraphs leaves CI red, which is the intended
// alarm: the rewrite has to be done by someone who knows what changed.
//
// Dependency-free on purpose. routeMeta.js imports it, and vite.config.js
// imports that under Node's resolver.
export const ARTICLE_SEASON = "43";

// The copy that names the current season, as paths under `pages.ranks`. Listed
// rather than discovered: the page quotes older seasons on purpose (Ranked
// launched in 7.2, Crystal arrived in 36.1), so "every season this page names"
// is the wrong set -- these are the places that must name *this* one.
export const SEASON_COPY_KEYS = [
  "seasonSchedule.heading",
  "seasonSchedule.p1",
  "seasonSchedule.p3",
  "queuesAndMaps.p3",
];
