// One census run.
//
// Ask PUBG for its daily sample of matches, keep the ranked ones, and read the
// tier of a bounded random draw of players from each. Storage stays the
// caller's job -- it arrives as a callback, which is what makes this testable
// without a database or a network.
//
// Rows are handed over in batches as they are read, not in one lump at the end.
// The first scheduled run spent about 1900 metered calls and stored nothing,
// because it was cut off before it reached its single closing write.
//
// The one asymmetry worth knowing: /matches is NOT rate limited. It carries no
// rate-limit headers and does not move the counter -- measured, not assumed. So
// classifying all ~1100 matches is free, and only /samples and the per-player
// ranked reads are metered. That is why every match gets classified and only
// fifteen players per ranked lobby get measured.

const { createPacer } = require("./pacer");
const { participantsFromMatch, rosterCount, pickParticipants } = require("./sampling");

const BASE = "https://api.pubg.com/shards";
const RANKED_MATCH_TYPE = "competitive";

// Big enough that a full run is a couple of dozen writes rather than a hundred,
// small enough that an interruption costs a few seconds of reading.
const FLUSH_EVERY = 100;

const header = (headers, name) => {
  const raw = typeof headers?.get === "function" ? headers.get(name) : undefined;
  if (raw === null || raw === undefined || raw === "") return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
};

// PUBG lists every ranked mode, in an order of its own, and a mode the player
// never queued is a zero-round shell with an empty tier. Reading whichever key
// came first files a Diamond player under "unranked", and /samples only serves
// recent days, so the mistake cannot be repaired afterwards. Same rule as
// rankPointHistory/reading.js: a played mode first, and only fall back when
// there is nothing better -- older payloads may carry no roundsPlayed at all.
const readModeEntry = (modes) => {
  const entries = Object.entries(modes ?? {});
  return (
    entries.find(([, m]) => Number(m?.roundsPlayed) > 0 && m?.currentTier?.tier) ??
    entries.find(([, m]) => m?.currentTier?.tier) ??
    entries[0]
  );
};

// Whether any two PLAYED modes disagree about where this player stands.
//
// Free: the whole rankedGameModeStats object is already in the response the
// tier was read from, and this is a pass over it rather than a request. Null
// rather than false when there is nothing to compare -- one played mode cannot
// agree or disagree with anything, and recording that as "no conflict" would
// make the column read as evidence it is not.
const modesDisagree = (modes) => {
  const played = Object.values(modes ?? {}).filter(
    (m) => Number(m?.roundsPlayed) > 0 && m?.currentTier?.tier,
  );
  if (played.length < 2) return null;
  const standing = (m) =>
    `${String(m.currentTier.tier).toLowerCase()}/${m.currentTier.subTier}/${m.currentRankPoint}`;
  return new Set(played.map(standing)).size > 1;
};

// Note on why `tier` below is never keyed to the match's `gameMode`, though it
// looks like it should be: PUBG unified RP across modes since Season 36 (patch
// 36.1 notes), so a tier is the same in every mode a player has played --
// measured 2026-09-16 against live accounts. Keying it to the match's mode
// instead would reintroduce the bug the 2026-09-14 audit fixed: a player drawn
// from a squad lobby who has only ever queued ranked squad-fpp would have no
// tier for "squad" and would be filed unranked -- unrepairable afterwards,
// because /samples only serves recent days. So the tier stays the player's
// tier, `tierMode` records which reading was taken, and `tierModeConflict`
// records whether some other played mode disagreed.

// Node's fetch REJECTS on a DNS, socket or TLS error rather than answering a
// non-200, and a truncated body rejects in json(). Unguarded, one blip out of
// the ~3000 calls a run makes throws out of collect and discards everything
// since the last flush -- the failure the batched flush exists to prevent.
const tryCall = async (what) => {
  try {
    return await what();
  } catch (error) {
    console.log(`[census] call failed: ${error.message}`);
    return null;
  }
};

// PUBG buckets its sample by calendar day and answers 400 for a filter under a
// day old, so the window is a DATE, not an offset. It used to be "now minus 26
// hours", which meant the day it landed on depended on the hour the job fired:
// GitHub's scheduler came 4h54m late once and the run collected a different day
// than the cron intended. Two days back at midday is the same answer whenever
// the run fires, and PUBG still serves buckets four days old.
const sampleWindowStart = (at) => `${new Date(at - 48 * 3600 * 1000).toISOString().slice(0, 10)}T12:00:00Z`;

const collect = async ({
  shard,
  seasonId,
  // Which season this particular sample day should be measured against. Only
  // the caller can answer it, and only once PUBG has named the window, so it
  // arrives as a function rather than as the season itself.
  seasonFor,
  apiKey,
  fetch: doFetch,
  sleep,
  now = Date.now,
  deadlineMs = 90 * 60_000,
  perMatch,
  onObservations,
  onProgress,
  windowCollected,
}) => {
  const pacer = createPacer({ now });
  const startedAt = now();
  const headers = { Authorization: `Bearer ${apiKey}`, Accept: "application/vnd.api+json" };

  let matchesSeen = 0;
  let matchesFailed = 0;
  let playersFailed = 0;
  let rankedMatches = 0;
  let aborted = false;
  let stored = 0;
  const observations = [];
  const pending = [];

  const msLeft = () => deadlineMs - (now() - startedAt);

  const report = () => {
    if (!onProgress) return;
    onProgress({ matchesSeen, rankedMatches, observed: observations.length, stored });
  };

  // A batch that will not land is a dent in the sample. Taking the run down
  // with it would cost the hour of quota that produced the rest.
  const flush = async () => {
    if (!onObservations || !pending.length) return;
    const batch = pending.splice(0, pending.length);
    try {
      stored += Number(await onObservations(batch)) || 0;
    } catch (error) {
      console.log(`[census] a batch of ${batch.length} did not store: ${error.message}`);
    }
  };

  // Only metered calls go through the pacer. /matches is free, so waiting on it
  // would just make the run longer for nothing.
  const metered = async (url) => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const delay = pacer.delayBefore(now());
      if (delay > 0) await sleep(delay);

      const response = await tryCall(() => doFetch(url, { headers }));
      if (!response) continue;
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

  const free = async (url) => tryCall(() => doFetch(url, { headers }));
  const body = async (response) => tryCall(() => response.json());

  // 1. The sample: one metered call for ~1100 match ids.
  const sampleUrl =
    `${BASE}/${shard}/samples?filter[createdAt-start]=${encodeURIComponent(sampleWindowStart(now()))}`;
  const sampleResponse = await metered(sampleUrl);
  const sample = sampleResponse?.status === 200 ? await body(sampleResponse) : null;
  if (!sample) {
    return { windowDate: null, matchesSeen: 0, rankedMatches: 0, matchesFailed: 1, playersFailed: 0,
      observations: [], stored: 0, aborted: false, skipped: false, ...pacer.stats() };
  }
  const windowDate = (sample?.data?.attributes?.createdAt ?? "").slice(0, 10) || null;

  // A day that straddles a reset belongs to neither season, and the one metered
  // call already spent is the whole cost of finding that out. Everything below
  // stores under, and reads out of, this season rather than the one the run
  // started with.
  const season = seasonFor ? seasonFor(windowDate) : seasonId;
  if (!season) {
    return { windowDate, matchesSeen: 0, rankedMatches: 0, matchesFailed: 0, playersFailed: 0,
      observations: [], stored: 0, aborted: false, skipped: true,
      skipReason: "no season owns this window", ...pacer.stats() };
  }

  // A day already in the store can only give back players from lobbies we drew
  // last time: the extra rows sit in the same clusters, so the design effect
  // climbs about as fast as the count and the hour of quota buys nothing. A
  // store that cannot answer is not worth losing a day over, so a guard that
  // throws collects.
  let collected = false;
  if (windowCollected && windowDate) {
    try {
      collected = Boolean(await windowCollected(windowDate, season));
    } catch (error) {
      console.log(`[census] could not check whether ${windowDate} is collected: ${error.message}`);
    }
  }
  if (collected) {
    return { windowDate, matchesSeen: 0, rankedMatches: 0, matchesFailed: 0, playersFailed: 0,
      observations: [], stored: 0, aborted: false, skipped: true, ...pacer.stats() };
  }
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
    const payload = await body(response);
    if (!payload) {
      matchesFailed += 1;
      continue;
    }
    if (payload?.data?.attributes?.matchType !== RANKED_MATCH_TYPE) continue;
    rankedMatches += 1;
    ranked.push({
      id,
      gameMode: payload?.data?.attributes?.gameMode ?? null,
      mapName: payload?.data?.attributes?.mapName ?? null,
      matchDuration: Number(payload?.data?.attributes?.duration) || null,
      rosterCount: rosterCount(payload),
      // The performance travels with the draw: picking ids and then looking the
      // stats up again would mean holding every match's payload in memory.
      players: pickParticipants(participantsFromMatch(payload), Math.random, perMatch),
    });
    report();
  }

  // 3. Read a tier for each drawn player. Metered, one call each.
  const queue = ranked.flatMap((match) =>
    match.players.map((player) => ({
      matchId: match.id,
      gameMode: match.gameMode,
      mapName: match.mapName,
      matchDuration: match.matchDuration,
      rosterCount: match.rosterCount,
      player,
    })),
  );
  for (let i = 0; i < queue.length; i += 1) {
    if (pacer.shouldAbort({ remainingCalls: queue.length - i, msLeft: msLeft() })) {
      aborted = true;
      break;
    }

    const { matchId, gameMode, mapName, matchDuration, rosterCount: teams, player } = queue[i];
    const response = await metered(
      `${BASE}/${shard}/players/${player.accountId}/seasons/${season}/ranked`,
    );
    if (!response || response.status !== 200) {
      playersFailed += 1;
      continue;
    }

    const payload = await body(response);
    if (!payload) {
      playersFailed += 1;
      continue;
    }
    const modes = payload?.data?.attributes?.rankedGameModeStats;
    const [tierMode = null, first] = readModeEntry(modes) ?? [];
    const tierModeConflict = modesDisagree(modes);
    // A player who has not queued ranked this season answers 200 with nothing.
    // Kept, with a null tier: dropping them would make an unranked bucket
    // impossible and quietly bias the denominator.
    observations.push({
      shard,
      seasonId: season,
      windowDate,
      matchId,
      gameMode,
      accountId: player.accountId,
      tier: first?.currentTier?.tier ? String(first.currentTier.tier).toLowerCase() : null,
      subTier: Number(first?.currentTier?.subTier) || null,
      rankPoint: Number(first?.currentRankPoint) || null,
      observedAt: now(),
      // What the player did in the lobby they were drawn from. Already in the
      // payload the free /matches call returned, so none of this costs quota.
      damageDealt: player.damageDealt,
      kills: player.kills,
      timeSurvived: player.timeSurvived,
      winPlace: player.winPlace,
      rosterCount: teams,
      headshotKills: player.headshotKills,
      assists: player.assists,
      dbnos: player.dbnos,
      revives: player.revives,
      walkDistance: player.walkDistance,
      rideDistance: player.rideDistance,
      mapName,
      matchDuration,
      // Which ranked mode the tier above was read from, and whether any other
      // mode this player has played disagrees with it. See the note below.
      tierMode,
      tierModeConflict,
    });
    pending.push(observations[observations.length - 1]);
    if (pending.length >= FLUSH_EVERY) await flush();
    report();
  }

  await flush();
  report();

  return {
    windowDate,
    matchesSeen,
    rankedMatches,
    matchesFailed,
    playersFailed,
    observations,
    stored,
    aborted,
    skipped: false,
    ...pacer.stats(),
  };
};

module.exports = { collect, sampleWindowStart, RANKED_MATCH_TYPE, FLUSH_EVERY };
