// The head for any URL the site can be asked for, decided from the path alone.
//
// Three cases, in order:
//
//   1. A fixed route. The build wrote that file and verified its head, so the
//      edge must leave it exactly as it is.
//   2. /player/, /match/, /overlay/ -- one URL per player and per match, so
//      their heads can only be built at request time. See playerHeadMeta.
//   3. Anything else. Cloudflare Pages answers every unmatched path with the
//      homepage's file, which means a typo used to answer 200 declaring
//      "index, follow" and a canonical pointing at the homepage. That was
//      survivable while the file held no prose. It stopped being survivable
//      when the homepage got a body, because the body rides along to every one
//      of them.
//
// Pure and dependency-light: the Pages Function imports it and runs it on
// every HTML request. It must never reach for the PUBG API -- that budget is
// about ten requests a minute and is shared with the live site.

import { routeMetaFor } from "./routeMeta.js";
import { playerHeadMeta } from "./playerHeadMeta.js";

// No canonical, deliberately. One pointing at the homepage would invite Google
// to file the junk URL as a version of the homepage; the page is not a version
// of anything. `follow` so a crawler that landed here still walks out through
// the nav to the pages that are worth reading.
const NOT_FOUND = {
  title: "Page not found - PUBG Tracker",
  description:
    "There is no page at this address. Search for a PUBG player by nickname or Steam URL from the homepage.",
  robots: "noindex, follow",
};

export const pageHeadMeta = (pathname) => {
  const path = String(pathname || "").split("?")[0];

  if (routeMetaFor(path)) return null;

  const parameterised = playerHeadMeta(path);
  if (parameterised) return parameterised;

  return NOT_FOUND;
};

export default pageHeadMeta;
