// One census run.
//
// Ask PUBG for its daily sample of matches, keep the ranked ones, and read the
// tier of a bounded random draw of players from each. Everything it learns is
// returned rather than written -- storage is the caller's job, which is what
// makes this testable without a database or a network.
//
// The one asymmetry worth knowing: /matches is NOT rate limited. It carries no
// rate-limit headers and does not move the counter -- measured, not assumed. So
// classifying all ~1100 matches is free, and only /samples and the per-player
// ranked reads are metered. That is why every match gets classified and only
// fifteen players per ranked lobby get measured.

const { createPacer } = require("./pacer");
const { accountsFromMatch, pickParticipants } = require("./sampling");

const BASE = "https://api.pubg.com/shards";
const RANKED_MATCH_TYPE = "competitive";

const header = (headers, name) => {
  const raw = typeof headers?.get === "function" ? headers.get(name) : undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
};

// PUBG's sample is a rolling 24h window and the filter must sit at least a day
// back, so the run is always measuring yesterday.
const sampleWindowStart = (at) => new Date(at - 26 * 3600 * 1000).toISOString().replace(/\.\d+Z$/, "Z");

const collect = async ({
  shard,
  seasonId,
  apiKey,
  fetch: doFetch,
  sleep,
  now = Date.now,
  deadlineMs = 90 * 60_000,
  perMatch,
}) => {
  const pacer = createPacer({ now });
  const startedAt = now();
  const headers = { Authorization: `Bearer ${apiKey}`, Accept: "application/vnd.api+json" };

  let matchesSeen = 0;
  let matchesFailed = 0;
  let playersFailed = 0;
  let rankedMatches = 0;
  let aborted = false;
  const observations = [];

  const msLeft = () => deadlineMs - (now() - startedAt);

  // Only metered calls go through the pacer. /matches is free, so waiting on it
  // would just make the run longer for nothing.
  const metered = async (url) => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const delay = pacer.delayBefore(now());
      if (delay > 0) await sleep(delay);

      const response = await doFetch(url, { headers });
      if (response.status === 429) {
        pacer.rateLimited({ resetAt: header(response.headers, "x-ratelimit-reset") });
        continue;
      }
      pacer.record(now());
      pacer.observe({
        remaining: header(response.headers, "x-ratelimit-remaining"),
        resetAt: header(response.headers, "x-ratelimit-reset"),
      });
      return response;
    }
    return null;
  };

  const free = async (url) => doFetch(url, { headers });

  // 1. The sample: one metered call for ~1100 match ids.
  const sampleUrl =
    `${BASE}/${shard}/samples?filter[createdAt-start]=${encodeURIComponent(sampleWindowStart(now()))}`;
  const sampleResponse = await metered(sampleUrl);
  if (!sampleResponse || sampleResponse.status !== 200) {
    return { windowDate: null, matchesSeen: 0, rankedMatches: 0, matchesFailed: 1, playersFailed: 0,
      observations: [], aborted: false, ...pacer.stats() };
  }
  const sample = await sampleResponse.json();
  const windowDate = (sample?.data?.attributes?.createdAt ?? "").slice(0, 10) || null;
  const matchIds = (sample?.data?.relationships?.matches?.data ?? []).map((m) => m.id);

  // 2. Classify every match. Free, so no pacing and no sampling.
  const ranked = [];
  for (const id of matchIds) {
    const response = await free(`${BASE}/${shard}/matches/${id}`);
    matchesSeen += 1;
    if (!response || response.status !== 200) {
      matchesFailed += 1;
      continue;
    }
    const payload = await response.json();
    if (payload?.data?.attributes?.matchType !== RANKED_MATCH_TYPE) continue;
    rankedMatches += 1;
    ranked.push({ id, accounts: pickParticipants(accountsFromMatch(payload), Math.random, perMatch) });
  }

  // 3. Read a tier for each drawn player. Metered, one call each.
  const queue = ranked.flatMap((match) => match.accounts.map((accountId) => ({ matchId: match.id, accountId })));
  for (let i = 0; i < queue.length; i += 1) {
    if (pacer.shouldAbort({ remainingCalls: queue.length - i, msLeft: msLeft() })) {
      aborted = true;
      break;
    }

    const { matchId, accountId } = queue[i];
    const response = await metered(
      `${BASE}/${shard}/players/${accountId}/seasons/${seasonId}/ranked`,
    );
    if (!response || response.status !== 200) {
      playersFailed += 1;
      continue;
    }

    const payload = await response.json();
    const modes = payload?.data?.attributes?.rankedGameModeStats ?? {};
    const first = Object.values(modes)[0];
    // A player who has not queued ranked this season answers 200 with nothing.
    // Kept, with a null tier: dropping them would make an unranked bucket
    // impossible and quietly bias the denominator.
    observations.push({
      shard,
      seasonId,
      windowDate,
      matchId,
      accountId,
      tier: first?.currentTier?.tier ? String(first.currentTier.tier).toLowerCase() : null,
      subTier: Number(first?.currentTier?.subTier) || null,
      rankPoint: Number(first?.currentRankPoint) || null,
      observedAt: now(),
    });
  }

  return {
    windowDate,
    matchesSeen,
    rankedMatches,
    matchesFailed,
    playersFailed,
    observations,
    aborted,
    ...pacer.stats(),
  };
};

module.exports = { collect, sampleWindowStart, RANKED_MATCH_TYPE };
