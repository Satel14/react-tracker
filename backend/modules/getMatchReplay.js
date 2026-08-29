const { getMapMeta } = require("./mapMeta");
const { readXY, buildMatchClock } = require("./telemetryUtils");
const { loadMatchBundle } = require("./matchLoader");
const { shardForMatch } = require("./pubgTelemetry");
const { encodePositions } = require("./replay/positions");
const { extractFlight } = require("./replay/flight");
const { extractLandings } = require("./replay/landings");
const { extractKnocks } = require("./replay/knocks");
const { extractShots } = require("./replay/shots");
const { extractPackages } = require("./replay/packages");
const { extractSpecialZones, extractPhases } = require("./replay/zones");

// Bumped whenever the wire shape changes, so a stale cached payload is detected
// rather than silently mis-decoded. 2 = delta-coded position columns.
const REPLAY_FORMAT = 2;

const replayCache = new Map();
const REPLAY_CACHE_LIMIT = 30;

// The map draws six vehicle shapes, and LogPlayerPosition names the vehicle it
// carries. Measured across 8 real matches, 54 distinct vehicleIds appear on
// position samples; these are the groupings worth telling apart at marker
// size. A car is 0, so anything unrecognised -- including whatever PUBG adds
// next patch -- rides as a car rather than as no vehicle at all.
const KIND = { CAR: 0, PLANE: 1, BALLOON: 2, BIKE: 3, TRUCK: 4, BOAT: 5 };

const BY_TYPE = {
  TransportAircraft: KIND.PLANE,
  EmergencyPickup: KIND.BALLOON,
  FloatingVehicle: KIND.BOAT,
};

// Matched against the vehicleId, most specific first.
const BY_ID = [
  [/^Boat_|^AquaRail|^BP_Airboat|^BP_PG117/i, KIND.BOAT],
  [/^BP_Motorbike|^BP_Bicycle|^BP_Snowbike|^BP_Dirtbike|^BP_Scooter|Panigale|RoadGlide/i, KIND.BIKE],
  [/^BP_PickupTruck|^BP_Van_|^BP_Porter|^BP_PicoBus|^BP_LootTruck|^BP_BRDM|^Uaz_/i, KIND.TRUCK],
  [/Aircraft/i, KIND.PLANE],
  [/EmergencyPickup/i, KIND.BALLOON],
];

function vehicleKind(vehicle) {
  const id = vehicle?.vehicleId;
  if (typeof id === "string") {
    for (const [pattern, kind] of BY_ID) if (pattern.test(id)) return kind;
  }
  return BY_TYPE[vehicle?.vehicleType] ?? KIND.CAR;
}

function lower(s) {
  return typeof s === "string" ? s.trim().toLowerCase() : null;
}

function parseReplayTelemetry(telemetry, { matchAttributes = {}, accountId = null, playerName = null } = {}) {
  const rawMapName = matchAttributes.mapName || "";
  const meta = getMapMeta(rawMapName);
  const duration = Number(matchAttributes.duration) || 0;
  const clock = buildMatchClock(telemetry);

  const roster = new Map();
  const positions = new Map();
  const deathTime = new Map();
  const dropTime = new Map();
  const kills = [];
  const zones = [];

  const accountKey = typeof accountId === "string" && accountId.trim() ? accountId.trim() : null;
  const lowerName = lower(playerName);

  for (const ev of Array.isArray(telemetry) ? telemetry : []) {
    const type = ev?._T;

    if (type === "LogMatchStart") {
      for (const c of ev.characters || []) {
        const ch = c?.character || c;
        if (ch?.accountId && !roster.has(ch.accountId)) {
          roster.set(ch.accountId, { name: ch.name, teamId: ch.teamId });
        }
      }
      continue;
    }

    if (type === "LogPlayerPosition") {
      const ch = ev.character;
      if (!ch?.accountId) continue;
      if (Number(ev?.common?.isGame) < 0.1) continue;
      const xy = readXY(ch.location);
      if (!xy) continue;
      const t = clock.timeOf(ev);
      if (t === null) continue;
      if (!roster.has(ch.accountId)) roster.set(ch.accountId, { name: ch.name, teamId: ch.teamId });
      if (!positions.has(ch.accountId)) positions.set(ch.accountId, []);
      const arr = positions.get(ch.accountId);
      if (arr.length && arr[arr.length - 1].t === t) continue;
      // health rides on every position sample already, so it is free.
      arr.push({
        t,
        x: xy.x,
        y: xy.y,
        health: ch.health,
        isInVehicle: !!ch.isInVehicle,
        isDBNO: !!ch.isDBNO,
        vehicleKind: vehicleKind(ev.vehicle),
      });
      continue;
    }

    if (type === "LogVehicleLeave") {
      if (ev?.vehicle?.vehicleId !== "DummyTransportAircraft_C") continue;
      const id = ev?.character?.accountId;
      const t = clock.timeOf(ev);
      if (!id || t === null) continue;
      const prev = dropTime.get(id);
      if (prev === undefined || t < prev) dropTime.set(id, t);
      if (!roster.has(id)) roster.set(id, { name: ev.character.name, teamId: ev.character.teamId });
      continue;
    }

    if (type === "LogPlayerKillV2") {
      const victim = ev.victim;
      const killer = ev.killer || ev.finisher || ev.dBNOMaker || null;
      const t = clock.timeOf(ev);
      if (t === null) continue;
      if (victim?.accountId) deathTime.set(victim.accountId, t);
      const vxy = readXY(victim?.location);
      if (!vxy) continue;
      const kxy = readXY(killer?.location);
      kills.push({
        t,
        killer: killer?.name || null,
        victim: victim?.name || null,
        killerAccountId: killer?.accountId || null,
        victimAccountId: victim?.accountId || null,
        killerTeamId: killer?.teamId ?? null,
        victimTeamId: victim?.teamId ?? null,
        kx: kxy ? kxy.x : null,
        ky: kxy ? kxy.y : null,
        vx: vxy.x,
        vy: vxy.y,
      });
      continue;
    }

    if (type === "LogGameStatePeriodic") {
      const gs = ev.gameState || {};
      const t = clock.timeOf(ev);
      const blue = readXY(gs.safetyZonePosition);
      const br = Number(gs.safetyZoneRadius);
      if (t !== null && blue && Number.isFinite(br) && br > 0) {
        const white = readXY(gs.poisonGasWarningPosition);
        const wr = Number(gs.poisonGasWarningRadius);
        zones.push({
          t,
          bx: blue.x,
          by: blue.y,
          br: Math.round(br / 100),
          wx: white ? white.x : blue.x,
          wy: white ? white.y : blue.y,
          wr: Number.isFinite(wr) ? Math.round(wr / 100) : 0,
        });
      }
      continue;
    }
  }

  let focalAccountId = null;
  let focalTeamId = null;
  for (const [id, info] of roster) {
    if ((accountKey && id === accountKey) || (lowerName && lower(info.name) === lowerName)) {
      focalAccountId = id;
      focalTeamId = info.teamId ?? null;
      break;
    }
  }

  const players = [];
  for (const [id, info] of roster) {
    const posArr = positions.get(id) || [];
    const isFocal =
      (focalAccountId !== null && id === focalAccountId) ||
      (focalTeamId !== null && info.teamId === focalTeamId);
    players.push({
      name: info.name || id,
      accountId: id,
      teamId: info.teamId ?? null,
      isFocal: !!isFocal,
      // encodePositions sorts by t and drops duplicate timestamps itself.
      positions: encodePositions(posArr),
      dropTime: dropTime.has(id) ? dropTime.get(id) : null,
      landTime: null,
      deathTime: deathTime.has(id) ? deathTime.get(id) : null,
    });
  }
  kills.sort((a, b) => a.t - b.t);
  zones.sort((a, b) => a.t - b.t);

  let phase = 0;
  let prevWarning = null;
  for (const z of zones) {
    const hasWarning = z.wr > 0;
    if (hasWarning) {
      const moved =
        prevWarning === null ||
        Math.hypot(z.wx - prevWarning.wx, z.wy - prevWarning.wy) > 1 ||
        Math.abs(z.wr - prevWarning.wr) > 1;
      if (moved) phase += 1;
      prevWarning = { wx: z.wx, wy: z.wy, wr: z.wr };
    }
    z.phase = phase;
  }

  const { knocks, revives } = extractKnocks(telemetry, clock);
  const landings = extractLandings(telemetry, clock);
  // Between leaving the plane and touching down a player is under canopy, and
  // the map draws them differently. extractLandings already keeps only the
  // first landing per player, which is the one that ends the descent.
  const landTime = new Map();
  for (const l of landings) if (!landTime.has(l.a)) landTime.set(l.a, l.t);
  const shots = extractShots(telemetry, clock);
  const packages = extractPackages(telemetry, clock);
  const specialZones = extractSpecialZones(telemetry, clock);
  const phases = extractPhases(telemetry, clock);
  const flight = extractFlight(telemetry, clock);
  for (const p of players) p.landTime = landTime.has(p.accountId) ? landTime.get(p.accountId) : null;

  // `duration` is wall-clock seconds from the match record; the replay scrubber
  // needs the in-game span, which the two clocks make a different number.
  let endTime = 0;
  for (const p of players) {
    const t = p.positions.t;
    if (!t.length) continue;
    let last = 0;
    for (const d of t) last += d;
    if (last > endTime) endTime = last;
  }
  for (const list of [kills, zones]) {
    for (const item of list) if (item.t > endTime) endTime = item.t;
  }

  return {
    format: REPLAY_FORMAT,
    rawMapName,
    mapName: meta.displayName,
    mapMax: meta.mapMax,
    duration,
    endTime,
    createdAt: matchAttributes.createdAt || null,
    focalAccountId,
    focalTeamId,
    totalPlayers: roster.size,
    totalTeams: new Set([...roster.values()].map((i) => i.teamId ?? "none")).size,
    players,
    kills,
    zones,
    flight,
    landings,
    knocks,
    revives,
    shots,
    packages,
    specialZones,
    phases,
  };
}

async function getMatchReplay({ shard, matchId, accountId, playerName }) {
  if (!matchId) throw new Error("matchId is required");
  const focalTag = accountId || playerName || "-";
  const cacheKey = `${shardForMatch(shard)}:${matchId}:${focalTag}`;
  if (replayCache.has(cacheKey)) return replayCache.get(cacheKey);

  const { matchAttributes, telemetry } = await loadMatchBundle({ shard, matchId });

  const parsed = parseReplayTelemetry(telemetry, { matchAttributes, accountId, playerName });
  const result = { matchId, ...parsed };

  replayCache.set(cacheKey, result);
  while (replayCache.size > REPLAY_CACHE_LIMIT) {
    const oldest = replayCache.keys().next().value;
    if (!oldest) break;
    replayCache.delete(oldest);
  }
  return result;
}

module.exports = { getMatchReplay, parseReplayTelemetry };
