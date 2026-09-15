import { API_TIMEOUT_MS } from "./apiBase";
import { RANK_PRELOAD_GLOBAL } from "./rankPreload";

// The source of the one inline script in index.html. Imported by vite.config.js
// and by its test, never by the bundle -- it exists to run before the bundle does.
//
// Written against `window`, `location`, `fetch` and `AbortSignal` by name and
// nothing else, so the test can hand those in as arguments and exercise the
// exact text the page runs.
//
// Path parsing by split rather than a regex: this string is assembled, and an
// escaped regex inside an assembled string is the kind of thing that survives
// review and fails in production.
export const rankPreloadScript = (apiUrl) => `(function () {
  try {
    if (typeof AbortSignal === "undefined" || typeof AbortSignal.timeout !== "function") return;

    var parts = location.pathname.split("/");
    if (parts.length !== 4 || parts[1] !== "player" || !parts[2] || !parts[3]) return;

    var platform = decodeURIComponent(parts[2]);
    var gameId = decodeURIComponent(parts[3]);

    window[${JSON.stringify(RANK_PRELOAD_GLOBAL)}] = {
      key: encodeURIComponent(platform) + "|" + encodeURIComponent(gameId),
      response: fetch(${JSON.stringify(`${apiUrl}/player/rank`)}, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ platform: platform, gameId: gameId, seasonId: null }),
        signal: AbortSignal.timeout(${API_TIMEOUT_MS})
      }).catch(function () { return null; })
    };
  } catch (e) {
    // The page has to load whatever happens here: this is only a head start.
  }
})();`;

export const RANK_PRELOAD_MARKER = "<!--rank-preload-->";

// A thrown build rather than a quiet skip. Losing the preload costs the whole
// head start and looks identical to a page that is merely slow, so it would sit
// there unnoticed; a build that stops gets fixed the same day.
export const injectRankPreload = (html, apiUrl) => {
  if (!html.includes(RANK_PRELOAD_MARKER)) {
    throw new Error(`inject-rank-preload: index.html has no ${RANK_PRELOAD_MARKER} marker to replace`);
  }

  return html.replace(RANK_PRELOAD_MARKER, `<script>${rankPreloadScript(apiUrl)}</script>`);
};
