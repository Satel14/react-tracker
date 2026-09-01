#!/usr/bin/env node
// Measures the one thing the RP attribution rule cannot be written without:
// when PUBG actually counts a ranked match, and how long after that moment the
// ranked counter moves. Everything else about the poller is guesswork until
// this has run against real sessions.
//
//   node scripts/rpLag/measure.js Satel14              # watch, Ctrl+C to stop
//   node scripts/rpLag/measure.js Satel14 --every 60   # seconds between polls
//   node scripts/rpLag/measure.js --report <file.jsonl>
//
// Costs two rate-limited calls per poll. /matches is not rate limited, so match
// detail is free. At the default minute cadence that is 2 of the key's 100 per
// minute, which leaves the live site and the nightly census untouched.

require("dotenv").config({ path: require("path").join(__dirname, "..", "..", ".env") });

const fs = require("fs");
const path = require("path");
const { readRankedSnapshot } = require("../../modules/rankPointHistory/reading");
const { getCurrentSeasonId } = require("../../modules/getSeasonCatalog");
const { analyseLag } = require("./analyse");

const API = "https://api.pubg.com";
const KEY = process.env.PUBG_API_KEY;

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

async function get(url) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${KEY}`, Accept: "application/vnd.api+json" },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return {
    body: await response.json(),
    remaining: response.headers.get("x-ratelimit-remaining"),
  };
}

const minutes = (ms) => (ms === null || ms === undefined ? "  n/a" : `${(ms / 60000).toFixed(1)}m`);

function report(file) {
  const lines = fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const polls = lines.filter((l) => l.type === "poll");
  const matches = lines.filter((l) => l.type === "match").map((l) => l.match);
  const { matches: rows, summary, polls: pollCount } = analyseLag({ polls, matches });
  const stamp = (t) => (t === null ? "     --     " : new Date(t).toISOString().slice(5, 16).replace("T", " "));

  console.log("");
  console.log(`${pollCount} polls, ${summary.matches} ranked matches in the list`);
  console.log(`${summary.firm} of them were played and counted while watching`);
  console.log("");
  console.log("match             ended         counted       lag(end)  lag(death)  listed first  note");
  for (const r of rows) {
    const note = r.outOfRange
      ? "ended before watching began"
      : r.countedAt === null
        ? "NEVER COUNTED"
        : r.ambiguous
          ? "upper bound only"
          : "";
    console.log(
      `${String(r.id).slice(0, 14).padEnd(14)}  ${stamp(r.endedAt)}  ${stamp(r.countedAt)}  ` +
      `${minutes(r.lagFromEndMs).padStart(8)}  ${minutes(r.lagFromDeathMs).padStart(10)}  ` +
      `${r.listedBeforeCounted === null ? " --" : r.listedBeforeCounted ? " yes" : "  no"}         ${note}`
    );
  }

  if (!summary.firm) {
    console.log("");
    console.log("Nothing to conclude yet: no ranked match both started and was counted");
    console.log("while watching. Leave the script running across a session and stop it");
    console.log("a few minutes after the last match ends.");
    console.log("");
    return;
  }

  console.log("");
  console.log(`lag from match end   min ${minutes(summary.minLagFromEndMs)}  median ${minutes(summary.medianLagFromEndMs)}  max ${minutes(summary.maxLagFromEndMs)}`);
  console.log(`counted before the match ended: ${summary.countedBeforeMatchEnd} of ${summary.firm}`);
  const verdict = summary.countsAt === "playerDeath"
    ? "PUBG counts at the player's death. Bound each match from its death time."
    : "PUBG counts at the match's end. Bound each match from createdAt + duration.";
  console.log(`  ${verdict}`);
  console.log(`list showed the match before the counter moved: ${summary.listedBeforeCounted} of ${summary.firm}`);
  console.log(`never counted: ${summary.uncounted}  (a leaver waiver records no round)`);
  console.log(`out of range: ${summary.outOfRange}  (over before watching began)`);
  console.log(`ambiguous (two rounds in one poll): ${summary.ambiguous}`);
  console.log("");
  console.log("LAG_MAX should be the max above, rounded up, not the median.");
  console.log("");
}

async function watch() {
  const name = process.argv[2];
  if (!name || name.startsWith("--")) throw new Error("give a player name or account id");
  if (!KEY) throw new Error("PUBG_API_KEY is missing from backend/.env");

  const shard = arg("shard", "steam");
  const every = Number(arg("every", "60")) * 1000;
  const file = arg("out", path.join(__dirname, `lag-${name}-${new Date().toISOString().slice(0, 10)}.jsonl`));
  const write = (row) => fs.appendFileSync(file, `${JSON.stringify(row)}\n`);

  const seasonId = await getCurrentSeasonId(shard);
  if (!seasonId) throw new Error("could not resolve the current season");

  const accountId = name.startsWith("account.")
    ? name
    : (await get(`${API}/shards/${shard}/players?filter[playerNames]=${encodeURIComponent(name)}`)).body.data?.[0]?.id;
  if (!accountId) throw new Error(`no such player: ${name}`);

  console.log(`watching ${name} (${accountId})`);
  console.log(`season ${seasonId}, every ${every / 1000}s, writing ${file}`);
  console.log("play ranked; press Ctrl+C when done and the report prints\n");

  const seen = new Set();
  let stopping = false;

  const tick = async () => {
    const player = await get(`${API}/shards/${shard}/players/${accountId}`);
    const ranked = await get(`${API}/shards/${shard}/players/${accountId}/seasons/${seasonId}/ranked`);
    const reading = readRankedSnapshot(ranked.body?.data?.attributes?.rankedGameModeStats);
    const matchIds = (player.body?.data?.relationships?.matches?.data || []).map((m) => m.id);

    const poll = {
      type: "poll",
      at: Date.now(),
      rankPoint: reading?.rankPoint ?? null,
      roundsPlayed: reading?.roundsPlayed ?? null,
      matchIds,
      quotaRemaining: ranked.remaining,
    };
    write(poll);
    console.log(
      `${new Date(poll.at).toISOString().slice(11, 19)}  RP ${String(poll.rankPoint ?? "--").padStart(5)}` +
      `  rounds ${String(poll.roundsPlayed ?? "--").padStart(4)}  quota ${poll.quotaRemaining ?? "?"}`
    );

    // Not rate limited, so detail for every new match is free.
    for (const id of matchIds.slice(0, 12)) {
      if (seen.has(id)) continue;
      seen.add(id);
      try {
        const { body } = await get(`${API}/shards/${shard}/matches/${id}`);
        const attributes = body?.data?.attributes || {};
        const me = (body.included || []).find(
          (x) => x.type === "participant" && x.attributes?.stats?.playerId === accountId
        );
        write({
          type: "match",
          match: {
            id,
            createdAt: attributes.createdAt,
            duration: attributes.duration,
            matchType: attributes.matchType,
            gameMode: attributes.gameMode,
            timeSurvived: me?.attributes?.stats?.timeSurvived ?? null,
            deathType: me?.attributes?.stats?.deathType ?? null,
          },
        });
      } catch (e) {
        console.log(`  match ${id.slice(0, 8)} unavailable: ${e.message}`);
      }
    }
  };

  const loop = async () => {
    while (!stopping) {
      try {
        await tick();
      } catch (e) {
        console.log(`poll failed: ${e.message}`);
      }
      await new Promise((r) => setTimeout(r, every));
    }
  };

  process.on("SIGINT", () => {
    stopping = true;
    console.log("\nstopping\n");
    try {
      report(file);
    } catch (e) {
      console.log(`report failed: ${e.message}`);
    }
    process.exit(0);
  });

  await loop();
}

const reportOnly = arg("report");
(reportOnly ? Promise.resolve(report(reportOnly)) : watch()).catch((e) => {
  console.error(e.message);
  process.exit(1);
});
