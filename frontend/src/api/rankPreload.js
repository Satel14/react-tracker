// The rank request used to be the last thing in a three-wave chain: the HTML,
// then the entry bundle, then PlayerPage's own lazy chunk, and only then did the
// page know enough to ask. Measured on production, that put the request on the
// wire at 394-563 ms on a desktop with everything cached. An inline script in
// index.html starts it while the bundle is still downloading; this is the side
// that picks it back up.
//
// The name is on globalThis rather than a module: the script that writes it runs
// before any module exists.
export const RANK_PRELOAD_GLOBAL = "__pubgRankPreload";

// Encoded so that a platform or a name containing the separator cannot collide
// with another pair -- "steam" + "a|b" must not read as "steam|a" + "b".
export const rankPreloadKey = (platform, gameId) =>
  `${encodeURIComponent(platform ?? "")}|${encodeURIComponent(gameId ?? "")}`;

// Always clears, match or not. The preload answers the first lookup of the page
// or nothing at all: keeping it around would let a later navigation adopt a
// response fetched before the visitor played their last match.
export const takeRankPreload = (key) => {
  const preload = globalThis[RANK_PRELOAD_GLOBAL];
  delete globalThis[RANK_PRELOAD_GLOBAL];

  if (!preload || typeof preload !== "object") return null;
  if (preload.key !== key) return null;

  return preload.response || null;
};
