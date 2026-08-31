// The head for the routes that carry a parameter, decided from the URL alone.
//
// Pure and dependency-light because the Cloudflare Pages Function in
// frontend/functions/ imports it and runs it on every request under /player/,
// /match/ and /overlay/. It must never reach for the PUBG API: that budget is
// about ten requests a minute, and one crawl of a few hundred player URLs would
// spend the day's quota and take the live site down with it. Everything here
// comes from the path.
//
// Fixed routes are handled at build time instead -- see routeMeta.js.

import { SITE_ORIGIN } from "./routeMeta.js";

const PLATFORMS = new Set(["steam", "xbox", "psn", "kakao", "stadia"]);

// What the backend itself accepts for a nickname. Deliberately not an ASCII
// whitelist: Kakao names are Korean and Xbox gamertags carry spaces, so a
// tighter rule would strand real players on the generic head. Safety comes from
// escaping at the rewriter, not from narrowing the charset.
const MAX_NAME = 64;

const TITLE_LIMIT = 60;
const PLAYER_SUFFIX = " - PUBG stats, ranked RP and match history";

const GENERIC = {
  title: "PUBG player stats",
  description:
    "Look up any PUBG player for season stats, ranked RP, recent matches and a replay of each one.",
  robots: "noindex, follow",
};

const decode = (segment) => {
  try {
    return decodeURIComponent(segment);
  } catch {
    // A malformed escape sequence is not a name.
    return null;
  }
};

// C0/C1 controls, plus the three characters that only ever turn up in an
// attempt to end an attribute or a tag. No real PUBG name carries any of them,
// so refusing them costs nothing and keeps a confident head off garbage.
//
// Written as a codepoint walk rather than a character class: a regex literal
// holding control characters is both unreadable in a diff and a lint error.
const isRejected = (value) => {
  for (const character of value) {
    if (character === "<" || character === ">" || character === '"') return true;
    const code = character.codePointAt(0);
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
};

const readName = (segment) => {
  if (!segment) return null;
  const decoded = decode(segment);
  if (decoded === null) return null;
  // Checked before trimming, or a leading newline is quietly washed away and
  // the rest sails through as if it had been a name all along.
  if (isRejected(decoded)) return null;
  const name = decoded.trim();
  if (!name || name.length > MAX_NAME) return null;
  // An account id is how the app addresses a player it could not name; a page
  // for one is a 404 with a straight face, so it gets no player head.
  if (/^account\./i.test(name)) return null;
  return name;
};

// Long names lose their tail rather than the sentence that explains the page.
const fitTitle = (name) => {
  const room = TITLE_LIMIT - PLAYER_SUFFIX.length;
  const shown = name.length > room ? `${name.slice(0, room - 1)}…` : name;
  return `${shown}${PLAYER_SUFFIX}`;
};

export const playerHeadMeta = (pathname) => {
  const path = String(pathname || "").split("?")[0];
  const segments = path.split("/").filter(Boolean);
  const [prefix, rawPlatform, rawName] = segments;

  if (prefix !== "player" && prefix !== "match" && prefix !== "overlay") return null;

  const lowered = String(rawPlatform || "").toLowerCase();
  const platform = lowered === "xbl" ? "xbox" : lowered;

  if (prefix === "match") {
    // Four segments ending in "replay" -- anything else under /match/ is not a
    // page the router serves.
    if (segments.length !== 4 || segments[3] !== "replay" || !PLATFORMS.has(platform)) {
      return { ...GENERIC, title: "PUBG match replay" };
    }
    return {
      title: "PUBG match replay - map, drops and the final circle",
      description:
        "Watch this PUBG match play out: every drop, the shrinking blue zone, kill feed and where each squad fell.",
      // Worth reading and worth sharing, but a match id is not a query anyone
      // types, and the URL space grows by one per match forever.
      robots: "noindex, follow",
      canonical: `${SITE_ORIGIN}/match/${platform}/${segments[2]}/replay`,
    };
  }

  if (prefix === "overlay") {
    // A transparent panel meant to be a browser source in OBS. It is chrome for
    // a stream, not a page, and it should never be a search result.
    return {
      ...GENERIC,
      title: "PUBG stats overlay for OBS",
      description:
        "A compact live stats panel meant to be used as a browser source in OBS while streaming PUBG.",
      robots: "noindex, nofollow",
    };
  }

  if (segments.length !== 3 || !PLATFORMS.has(platform)) return GENERIC;

  const name = readName(rawName);
  if (!name) return GENERIC;

  return {
    title: fitTitle(name),
    description: `Season stats, ranked RP, K/D, win rate and recent matches for ${name} on PUBG, with a replay of every match.`,
    // Indexing an unbounded, user-generated URL space is how a small site earns
    // a thin-content problem, and nothing here can tell a real player from a
    // typo without spending PUBG quota. follow, so the crawler still walks
    // through to the pages that are worth indexing.
    robots: "noindex, follow",
    canonical: `${SITE_ORIGIN}/player/${platform}/${encodeURIComponent(name)}`,
  };
};

export default playerHeadMeta;
