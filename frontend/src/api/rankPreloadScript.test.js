import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { API_TIMEOUT_MS } from "./apiBase";
import { RANK_PRELOAD_GLOBAL, rankPreloadKey } from "./rankPreload";
import { RANK_PRELOAD_MARKER, injectRankPreload, rankPreloadScript } from "./rankPreloadScript";

const API = "https://api.example.test/api";

// A Response whose body can be taken exactly once, and which dies the way an
// aborted one does: the object stays, reading it stops working. Measured in
// node with a real server -- once AbortSignal.timeout fires, an unread body
// throws AbortError even when the whole response already arrived.
const responseLike = (payload, { ok = true, status = 200 } = {}) => {
  let taken = false;
  const dead = () => {
    const error = new Error("The operation was aborted.");
    error.name = "AbortError";
    return Promise.reject(error);
  };
  return {
    ok,
    status,
    text: () => {
      if (taken) return dead();
      taken = true;
      return Promise.resolve(JSON.stringify(payload));
    },
    json: () => (taken ? dead() : Promise.resolve(payload)),
    kill: () => { taken = true; },
  };
};

const rejectingWith = (name) => () => {
  const error = new Error(`fetch failed: ${name}`);
  error.name = name;
  return Promise.reject(error);
};

// The source that ships inline in index.html, run here with the three browser
// globals it names passed in as arguments. Wrapping it rather than rewriting it
// is the point: what this exercises is byte for byte what the page executes.
const run = (pathname, { fetchImpl, abortSignal, payload } = {}) => {
  const window = {};
  const location = { pathname };
  const calls = [];
  const wire = responseLike(payload || { data: { ok: true } });
  const fetch = fetchImpl || ((url, init) => {
    calls.push({ url, init });
    return Promise.resolve(wire);
  });
  const AbortSignal = abortSignal === undefined ? { timeout: (ms) => ({ ms }) } : abortSignal;

  new Function("window", "location", "fetch", "AbortSignal", rankPreloadScript(API))(
    window,
    location,
    fetch,
    AbortSignal
  );

  return { window, calls, wire };
};

describe("the inline rank preload", () => {
  it("starts the rank request for the player named in the URL", () => {
    const { calls } = run("/player/steam/PlayerA");

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${API}/player/rank`);
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(calls[0].init.body)).toEqual({
      platform: "steam",
      gameId: "PlayerA",
      seasonId: null,
    });
  });

  it("sends the JSON headers the endpoint is validated against", () => {
    const { calls } = run("/player/steam/PlayerA");

    expect(calls[0].init.headers).toEqual({
      Accept: "application/json",
      "Content-Type": "application/json",
    });
  });

  // Drift here is the whole risk of having two callers: the script writes the
  // key and player.js reads it, and nothing else would notice if they parted.
  it("files the request under the key player.js looks it up by", () => {
    const { window } = run("/player/steam/PlayerA");

    expect(window[RANK_PRELOAD_GLOBAL].key).toBe(rankPreloadKey("steam", "PlayerA"));
  });

  it("decodes a name that had to be escaped to fit in a URL", () => {
    const { calls, window } = run("/player/steam/Player%20A");

    expect(JSON.parse(calls[0].init.body).gameId).toBe("Player A");
    expect(window[RANK_PRELOAD_GLOBAL].key).toBe(rankPreloadKey("steam", "Player A"));
  });

  it("bounds the wait by the same timeout the normal request uses", () => {
    const { calls } = run("/player/steam/PlayerA");

    expect(calls[0].init.signal).toEqual({ ms: API_TIMEOUT_MS });
  });

  it("leaves every other page alone", () => {
    expect(run("/").calls).toHaveLength(0);
    expect(run("/leaderboards").calls).toHaveLength(0);
    expect(run("/player").calls).toHaveLength(0);
    expect(run("/player/steam").calls).toHaveLength(0);
    expect(run("/match/abc/replay").calls).toHaveLength(0);
  });

  it("writes nothing to the page when there is nothing to preload", () => {
    expect(run("/").window[RANK_PRELOAD_GLOBAL]).toBe(undefined);
  });

  it("settles rather than rejecting into nobody's hands when the request fails", async () => {
    const { window } = run("/player/steam/PlayerA", {
      fetchImpl: () => Promise.reject(new Error("offline")),
    });

    await expect(window[RANK_PRELOAD_GLOBAL].response).resolves.toMatchObject({
      preloadFailed: true,
      timedOut: false,
    });
  });

  // The defect this replaced: the script held an unread Response, and once the
  // 45 s abort fired, reading it threw AbortError -- so a slow page turned an
  // HTTP 200 that had already arrived into an error. Reproduced in node against
  // a real server, both while the body was still streaming and after it had
  // fully arrived.
  it("reads the body while it can, so a page that mounts late still gets the answer", async () => {
    const { window, wire } = run("/player/steam/PlayerA", { payload: { data: { handle: "PlayerA" } } });
    const snapshot = await window[RANK_PRELOAD_GLOBAL].response;

    wire.kill(); // the abort fires; the Response is no longer readable

    expect(snapshot.ok).toBe(true);
    expect(snapshot.status).toBe(200);
    await expect(snapshot.json()).resolves.toEqual({ data: { handle: "PlayerA" } });
  });

  it("hands over a readable snapshot, not the Response itself", async () => {
    const { window, wire } = run("/player/steam/PlayerA");
    const snapshot = await window[RANK_PRELOAD_GLOBAL].response;

    expect(snapshot).not.toBe(wire);
  });

  it("carries an error status through so the page reports the server's answer", async () => {
    const { window } = run("/player/steam/PlayerA", {
      fetchImpl: () => Promise.resolve(responseLike({ status: 422, message: "Player not found" }, { ok: false, status: 422 })),
    });
    const snapshot = await window[RANK_PRELOAD_GLOBAL].response;

    expect(snapshot.ok).toBe(false);
    expect(snapshot.status).toBe(422);
    await expect(snapshot.json()).resolves.toMatchObject({ message: "Player not found" });
  });

  // Told apart because the answer differs: a timeout has already spent the whole
  // budget and must not buy a second one, while a fast failure costs nothing to
  // retry through the normal path.
  it("marks a timeout as a timeout", async () => {
    const { window } = run("/player/steam/PlayerA", { fetchImpl: rejectingWith("TimeoutError") });

    await expect(window[RANK_PRELOAD_GLOBAL].response).resolves.toMatchObject({
      preloadFailed: true,
      timedOut: true,
    });
  });

  it("does not mark an ordinary network failure as a timeout", async () => {
    const { window } = run("/player/steam/PlayerA", { fetchImpl: rejectingWith("TypeError") });

    await expect(window[RANK_PRELOAD_GLOBAL].response).resolves.toMatchObject({
      preloadFailed: true,
      timedOut: false,
    });
  });

  // Carried on the failure itself so the fallback can be given the rest of the
  // budget rather than a fresh one.
  it("says when it started, so a late failure cannot buy a second full wait", async () => {
    const before = Date.now();
    const { window } = run("/player/steam/PlayerA", { fetchImpl: rejectingWith("TypeError") });
    const result = await window[RANK_PRELOAD_GLOBAL].response;

    expect(typeof result.startedAt).toBe("number");
    expect(result.startedAt).toBeGreaterThanOrEqual(before);
    expect(result.startedAt).toBeLessThanOrEqual(Date.now());
  });

  it("treats a body that dies mid-read as the timeout it came from", async () => {
    const { window } = run("/player/steam/PlayerA", {
      fetchImpl: () => Promise.resolve({
        ok: true,
        status: 200,
        text: rejectingWith("TimeoutError"),
      }),
    });

    await expect(window[RANK_PRELOAD_GLOBAL].response).resolves.toMatchObject({
      preloadFailed: true,
      timedOut: true,
    });
  });

  it("stands aside on a browser without AbortSignal.timeout instead of starting a request nothing can cancel", () => {
    const { calls, window } = run("/player/steam/PlayerA", { abortSignal: {} });

    expect(calls).toHaveLength(0);
    expect(window[RANK_PRELOAD_GLOBAL]).toBe(undefined);
  });

  it("never throws out of the page's first script, whatever the URL", () => {
    expect(() => run("/player/steam/%E0%A4%A")).not.toThrow();
  });
});

describe("putting the script into index.html", () => {
  const shell = (head) => `<!DOCTYPE html><html><head>${head}</head><body></body></html>`;

  it("replaces the marker with a runnable script tag", () => {
    const html = injectRankPreload(shell(RANK_PRELOAD_MARKER), API);

    expect(html).not.toContain(RANK_PRELOAD_MARKER);
    expect(html).toContain("<script>(function () {");
    expect(html).toContain(`${API}/player/rank`);
  });

  // A silent no-op here would cost the whole head start and look exactly like
  // a page that is merely slow, so the build stops instead.
  it("refuses a document with no marker rather than shipping without the preload", () => {
    expect(() => injectRankPreload(shell("<title>x</title>"), API)).toThrow(/marker/i);
  });

  it("leaves the rest of the document untouched", () => {
    const html = injectRankPreload(shell(`<title>x</title>${RANK_PRELOAD_MARKER}`), API);

    expect(html).toContain("<title>x</title>");
    expect(html).toContain("</body></html>");
  });

  it("is actually wired into the index.html the build reads", () => {
    const indexHtml = readFileSync(
      fileURLToPath(new URL("../../index.html", import.meta.url)),
      "utf8"
    );

    expect(indexHtml).toContain(RANK_PRELOAD_MARKER);
  });
});
