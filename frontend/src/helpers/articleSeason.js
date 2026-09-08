// The season the ranks article is written about.
//
// Declared once here and read by routeMeta.js for both language heads, so the
// title, the description and the prose cannot drift apart. It is deliberately a
// literal rather than something derived from the census at build time: the copy
// around it -- the start date, the 42.1-42.3 update range, the Ranked map pool
// -- is season-specific prose, and swapping the number in it would turn each
// true sentence into a false one.
//
// articleSeason.test.js compares this to the season the census is actually
// measuring. When PUBG opens the next season that test fails, which is the
// intended alarm: someone has to rewrite the season's paragraphs and bump this,
// and until they do, CI is red rather than the page being quietly wrong.
//
// Dependency-free on purpose. routeMeta.js imports it, and vite.config.js
// imports that under Node's resolver.
export const ARTICLE_SEASON = "42";

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
