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
    // Head only. This file is also what Pages serves for /player/..., /match/...
    // and every mistyped URL, so injected homepage prose would become duplicate
    // body copy across an unbounded set of URLs -- on the pages that get the
    // traffic. Those routes get their own text from the Pages Function later.
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
    title: "PUBG Ranks Explained: Tiers, RP, Survivor (Season 42)",
    description: "The PUBG ranked ladder as it actually stands in Season 42: all eight tiers in order, how RP is earned and lost after Update 42.1, Survivor, and RP decay.",
    h1: "PUBG ranks explained: tiers, RP and Survivor",
    intro: "Eight tiers, one RP number shared across party types and perspectives, and a top tier you can lose overnight \u2014 this is the ranked system as it stands on 31 August 2026, sourced to KRAFTON's patch notes and official posts, with every exception labelled.",
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
const NAV_ORDER = ["/", "/leaderboards", "/ranks", "/help"];

export const NAV_ROUTES = NAV_ORDER.map((path) => {
  const route = ROUTE_META.find((item) => item.path === path);
  if (!route?.nav) throw new Error(`routeMeta: ${path} is in the nav but has no label`);
  return route;
});

export const routeMetaFor = (path) => ROUTE_META.find((route) => route.path === path);
