// Per-route <head> copy for the static shells the prerenderHead plugin in
// vite.config.js writes after a build. Pure and dependency-free on purpose: the
// build imports it, and so does the Pages Function that heads /player/... --
// one table rather than two copies drifting apart.
//
// `file` is flat -- build/help.html, not build/help/index.html. Cloudflare Pages
// serves a flat file at its extension-less path with a 200, while a directory
// index 308s to /help/, which would point every self-referencing canonical at a
// redirect and turn the sitemap entries into redirects too.
//
// /404 is deliberately absent. A top-level 404.html is what tells Pages the
// project is NOT a single-page app, and it then stops mapping unmatched paths to
// the shell -- every /player/... and /match/... deep link would 404. The route
// exists in the router; it just must never become a file.

import { ARTICLE_SEASON } from "./articleSeason.js";

export const SITE_ORIGIN = "https://www.pubgtracker.top";

export const canonicalFor = (path) => `${SITE_ORIGIN}${path}`;

export const ROUTE_META = [
  {
    path: "/",
    nav: "PUBG Tracker",
    file: "index.html",
    // Unchanged from the shell: this is the one page that already ranks, and a
    // new title would restart whatever standing it has.
    title: "PUBG Tracker - Player Stats & Leaderboards",
    description:
      "Track PUBG player statistics, view match history, and check leaderboards. Fast and easy PUBG stats tracker for steam.",
    sitemap: true,
    // No hand-written stub -- and no longer "no body at all", which is what
    // this comment used to say. The homepage does ship prose: prerenderBody
    // renders its HomeIntro component into this file, and because the file is
    // also what Pages serves for /player/..., /match/... and every mistyped
    // URL, that prose rides along to all of them. What made it safe was
    // pageHeadMeta marking every unmatched path noindex with no canonical.
    // The flag only decides the stub, and an article supersedes it.
    body: false,
  },
  {
    path: "/leaderboards",
    nav: "Ranked leaderboards",
    file: "leaderboards.html",
    title: "PUBG ranked leaderboards by region",
    description:
      "Top ranked PUBG players by RP for the current season, split by region and game mode, read straight from the official PUBG API.",
    h1: "PUBG ranked leaderboards",
    intro:
      "The current season's top ranked players by RP, by region and game mode, straight from the official PUBG API.",
    sitemap: true,
    body: true,
  },
  {
    path: "/help",
    nav: "How to look up stats",
    file: "help.html",
    title: "How to look up PUBG stats",
    description:
      "Answers to the questions we get most: finding a player by nickname or Steam URL, what each number means, and why a profile can come back empty.",
    h1: "How to look up PUBG stats",
    intro:
      "Short answers to the questions we get most: finding a player, reading the numbers, and what to do when a profile will not load.",
    sitemap: true,
    body: true,
  },
  {
    path: "/ranks",
    nav: "PUBG ranks explained",
    file: "ranks.html",
    // The season comes from articleSeason.js so the head cannot name one season
    // while the prose describes another. Nothing else here is season-specific:
    // an update number in the description would need rewriting every quarter
    // for no gain, and the distribution is now in the file rather than promised.
    title: `PUBG Ranks Explained: Tiers, RP, Survivor (Season ${ARTICLE_SEASON})`,
    description: `The PUBG ranked ladder as it stands in Season ${ARTICLE_SEASON}: all eight tiers, how RP is earned and lost, Survivor, RP decay, and a measured tier distribution.`,
    h1: "PUBG ranks explained: tiers, RP and Survivor",
    intro: "Eight tiers, one RP number shared across party types and perspectives, and a top tier you can lose overnight \u2014 this is the ranked system as it stands on 9 September 2026, sourced to KRAFTON's patch notes and official posts, with every exception labelled.",
    sitemap: true,
    body: true,
  },
  // No season number in this head, unlike /ranks. The page's numbers are dated
  // by the snapshot and its season is named in the body from the data, so a
  // season in the title would need the same rollover guard for no gain.
  {
    path: "/rank-points",
    nav: "Rank points",
    file: "rank-points.html",
    title: "Is Your PUBG RP Good? Measured Rank Point Standings",
    description:
      "What a PUBG rank point total is worth, measured from a daily sample of ranked lobbies: the RP at nine cuts of the ladder, and where any number lands.",
    h1: "Is your PUBG RP good?",
    intro:
      "The rank points at each cut of the ladder, measured from a daily sample of ranked lobbies — and where a given number lands among them.",
    sitemap: true,
    body: true,
  },
  // The same article, rendered from the ua dictionary. `translationOf` is what
  // pairs the two: it drives the hreflang set, the language switch and the
  // sitemap entry, so a twin cannot exist half-wired.
  //
  // The path segment is /ua/ because that is the form people recognise; `lang`
  // is uk because that is the ISO code, and hreflang accepts no other spelling.
  {
    path: "/ua/ranks",
    file: "ua/ranks.html",
    lang: "uk",
    translations: "ua",
    translationOf: "/ranks",
    title: `Ранги PUBG: тіри, RP і Survivor (сезон ${ARTICLE_SEASON})`,
    description: `Рейтингова система PUBG у сезоні ${ARTICLE_SEASON}: усі вісім тірів за порядком, як RP нараховується й списується, Survivor, затухання RP і виміряний розподіл за тірами.`,
    h1: "Ранги PUBG: як влаштовані тіри, RP і Survivor",
    intro:
      "Вісім тірів, одне спільне RP і найвищий тір, який можна втратити за одну ніч — як рейтингова система працює зараз.",
    sitemap: true,
    body: true,
  },
  {
    path: "/ua/rank-points",
    file: "ua/rank-points.html",
    lang: "uk",
    translations: "ua",
    translationOf: "/rank-points",
    title: "Чи добре твоє RP у PUBG? Виміряні рівні рейтингових балів",
    description:
      "Скільки вартий рейтинговий бал у PUBG, виміряно з добової вибірки рейтингових лобі: RP на дев'яти зрізах ладдера і куди потрапляє будь-яке число.",
    h1: "Чи добре твоє RP у PUBG?",
    intro:
      "Скільки RP на кожному зрізі ладдера, виміряно з добової вибірки рейтингових лобі — і куди серед них потрапляє конкретне число.",
    sitemap: true,
    body: true,
  },
  // The three below render an empty state for anyone who is not the visitor who
  // filled them in, so they are given a head to stop them being read as copies
  // of the homepage -- and told not to be indexed, because there is nothing on
  // them to index.
  {
    path: "/favorites",
    file: "favorites.html",
    title: "Your saved PUBG players",
    description:
      "The PUBG players you have saved on this device, with the current season's rank and form for each, ready to open in one tap.",
    h1: "Your saved PUBG players",
    intro:
      "Players you save are kept on this device, so this list is yours alone and starts out empty.",
    robots: "noindex, follow",
    body: true,
  },
  {
    path: "/compare",
    file: "compare.html",
    title: "Compare two PUBG players",
    description:
      "Put two PUBG profiles side by side: K/D, win rate, damage dealt, ranked RP and recent matches for the current season.",
    h1: "Compare two PUBG players",
    intro:
      "Pick two players from your favourites and read the season side by side, stat for stat.",
    robots: "noindex, follow",
    body: true,
  },
  {
    path: "/player",
    file: "player.html",
    title: "Find a PUBG player",
    description:
      "Search any PUBG profile by nickname or Steam URL for season stats, ranked progress, recent matches and a replay of each one.",
    h1: "Find a PUBG player",
    intro:
      "Enter a nickname or paste a Steam profile URL to pull up the current season.",
    robots: "noindex, follow",
    body: true,
  },
  {
    path: "/bugreport",
    file: "bugreport.html",
    title: "Report a problem with a stat",
    description:
      "Something wrong with a profile, a match or a number? Describe what you saw and it goes straight to whoever can fix it.",
    h1: "Report a problem",
    intro:
      "Tell us what you expected and what you got instead. A player name and a rough time are usually enough to find it.",
    robots: "noindex, follow",
    body: true,
  },
];

// The links every prerendered shell carries. Nothing in the raw HTML links
// anywhere otherwise -- the navbar's anchors are rendered by React -- so a
// crawler that does not run JS can only find pages through the sitemap.
//
// Reading order is stated here rather than inherited from the table above,
// which is ordered indexable-first for its own reasons. Membership follows
// the sitemap: a route linked from every page ought to be one we are willing
// to have indexed, and renderHead.test.js pins exactly that.
const NAV_ORDER = ["/", "/leaderboards", "/ranks", "/rank-points", "/help"];

export const NAV_ROUTES = NAV_ORDER.map((path) => {
  const route = ROUTE_META.find((item) => item.path === path);
  if (!route?.nav) throw new Error(`routeMeta: ${path} is in the nav but has no label`);
  return route;
});

export const routeMetaFor = (path) => ROUTE_META.find((route) => route.path === path);

// The pages that are the same article in different languages, or null when a
// path has no twin. The English row is the group's default: it is the one a
// reader with no matching language should land on.
const languageGroupFor = (path) => {
  const route = routeMetaFor(path);
  if (!route) return null;
  const defaultPath = route.translationOf || path;
  const members = ROUTE_META.filter(
    (item) => item.path === defaultPath || item.translationOf === defaultPath,
  );
  return members.length > 1 ? { defaultPath, members } : null;
};

// Google reads an hreflang set as a claim about a group of pages and ignores
// the whole group unless every page in it names every other -- including
// itself. So the set is built once and emitted verbatim on each member.
export const alternatesFor = (path) => {
  const group = languageGroupFor(path);
  if (!group) return [];
  return [
    ...group.members.map((item) => ({
      hreflang: item.lang || "en",
      href: canonicalFor(item.path),
    })),
    { hreflang: "x-default", href: canonicalFor(group.defaultPath) },
  ];
};

// Where the language switch should go from `path`, or null when this page has
// no version in that language -- or is already the one asked for.
export const translationFor = (path, language) => {
  const group = languageGroupFor(path);
  if (!group) return null;
  const wanted = group.members.find((item) => (item.translations || "en") === language);
  return wanted && wanted.path !== path ? wanted.path : null;
};

// The language a URL commits to, or null when it leaves the choice to the
// visitor. Read from the table rather than parsed out of the path: a /ua/
// prefix means nothing unless there is a page behind it.
//
// Both halves of a pair commit. /ranks is the English page, not the page with
// no opinion -- read the other way, a reader who had once picked Ukrainian in
// the dropdown clicked "Read in English" and was handed Ukrainian anyway.
export const languageForPath = (path) => {
  const route = routeMetaFor(path);
  if (!route) return null;
  if (route.translations) return route.translations;
  return languageGroupFor(path) ? "en" : null;
};
