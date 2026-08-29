const { getMapMeta } = require("./mapMeta");
const { loadMatchBundle } = require("./matchLoader");
const { shardForMatch } = require("./pubgTelemetry");
const { isFocalActor, readXY, buildMatchClock } = require("./telemetryUtils");
const { telemetryWeaponName, canonicalWeaponKey } = require("./weaponMeta");

const analysisCache = new Map();
const ANALYSIS_CACHE_LIMIT = 30;

function focalKeys({ accountId, playerName }) {
  const accountKey = typeof accountId === "string" && accountId.trim() ? accountId.trim() : null;
  const lowerName = typeof playerName === "string" && playerName.trim() ? playerName.trim().toLowerCase() : null;
  return { accountKey, lowerName };
}

function parseScoreboard(matchPayload, { accountId = null, playerName = null } = {}) {
  const included = Array.isArray(matchPayload?.included) ? matchPayload.included : [];
  const { accountKey, lowerName } = focalKeys({ accountId, playerName });

  const statsById = new Map();
  const rosters = [];
  for (const item of included) {
    if (item?.type === "participant") statsById.set(item.id, item.attributes?.stats || {});
    else if (item?.type === "roster") rosters.push(item);
  }

  let focalAccountId = null;
  let focalTeamId = null;
  const teams = [];
  for (const roster of rosters) {
    const rstats = roster.attributes?.stats || {};
    const rank = Number(rstats.rank) || null;
    const teamId = rstats.teamId ?? null;
    const won = String(roster.attributes?.won) === "true";
    const refs = roster.relationships?.participants?.data || [];
    const players = [];
    for (const ref of refs) {
      const s = statsById.get(ref?.id);
      if (!s) continue;
      const pAccountId = typeof s.playerId === "string" ? s.playerId : null;
      const name = typeof s.name === "string" ? s.name : "Unknown";
      const isFocal = isFocalActor({ accountId: pAccountId, name }, accountKey, lowerName);
      if (isFocal) { focalAccountId = pAccountId; focalTeamId = teamId; }
      players.push({
        name,
        accountId: pAccountId,
        kills: Number(s.kills) || 0,
        damageDealt: Math.round(Number(s.damageDealt) || 0),
        assists: Number(s.assists) || 0,
        DBNOs: Number(s.DBNOs ?? s.dBNOs) || 0,
        headshotKills: Number(s.headshotKills) || 0,
        timeSurvived: Number(s.timeSurvived) || 0,
        deathType: typeof s.deathType === "string" ? s.deathType : null,
        isFocal,
      });
    }
    players.sort((a, b) => b.kills - a.kills || b.damageDealt - a.damageDealt);
    teams.push({ rank, teamId, won, players });
  }
  teams.sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999));
  for (const team of teams) team.isFocalTeam = focalTeamId != null && team.teamId === focalTeamId;

  const totalPlayers = teams.reduce((n, t) => n + t.players.length, 0);
  return { teams, totalTeams: teams.length, totalPlayers, focalAccountId, focalTeamId };
}

function buildNameToTeam(telemetry) {
  const map = new Map();
  for (const ev of Array.isArray(telemetry) ? telemetry : []) {
    if (ev?._T !== "LogMatchStart") continue;
    for (const c of ev.characters || []) {
      const ch = c?.character || c;
      if (ch?.name != null && ch?.teamId != null) map.set(ch.name, ch.teamId);
    }
  }
  return map;
}

function parseKillFeed(telemetry, { clock, accountId = null, playerName = null } = {}) {
  // Callable on its own: build the clock here when nobody handed one in,
  // rather than making every caller remember to.
  const matchClock = clock || buildMatchClock(telemetry);
  const { accountKey, lowerName } = focalKeys({ accountId, playerName });
  const nameToTeam = buildNameToTeam(telemetry);
  const kills = [];
  for (const ev of Array.isArray(telemetry) ? telemetry : []) {
    if (ev?._T !== "LogPlayerKillV2") continue;
    const t = matchClock.timeOf(ev);
    const victim = ev.victim || null;
    const killer = ev.killer ?? ev.finisher ?? ev.dBNOMaker ?? null;
    const dmgInfo = ev.killerDamageInfo || ev.finishDamageInfo || {};
    const weaponKey = dmgInfo.damageCauserName || ev.damageCauserName || null;
    const rawDistance = dmgInfo.distance;
    const distance = Number.isFinite(Number(rawDistance)) ? Math.round(Number(rawDistance) / 100) : null;
    const killerName = killer?.name || null;
    const victimName = victim?.name || null;
    const kxy = readXY(killer?.location);
    const vxy = readXY(victim?.location);
    kills.push({
      t,
      killerName,
      killerTeamId: killerName != null ? (nameToTeam.get(killerName) ?? null) : null,
      victimName,
      victimTeamId: victimName != null ? (nameToTeam.get(victimName) ?? null) : null,
      weapon: telemetryWeaponName(weaponKey),
      weaponKey,
      distance,
      damageReason: dmgInfo.damageReason || null,
      kx: kxy ? kxy.x : null,
      ky: kxy ? kxy.y : null,
      vx: vxy ? vxy.x : null,
      vy: vxy ? vxy.y : null,
      isFocalKill: isFocalActor(killer, accountKey, lowerName),
      isFocalDeath: isFocalActor(victim, accountKey, lowerName),
    });
  }
  kills.sort((a, b) => (a.t ?? 0) - (b.t ?? 0));
  return kills;
}

const BODY_REGIONS = ["HeadShot", "TorsoShot", "ArmShot", "LegShot", "PelvisShot"];
// Validated against real telemetry (Rondo capture): PUBG's own stats.damageDealt
// excludes Damage_VehicleHit but keeps grenade/molotov/explosion damage, so those stay in.
const NON_COMBAT_DAMAGE_CATEGORIES = new Set([
  "Damage_BlueZone",
  "Damage_Drown",
  "Damage_RedZone",
  "Damage_Explosion_RedZone",
  "Damage_Fall",
  "Damage_Instant_Fall",
  "Damage_VehicleHit",
]);

function emptyRegions() {
  return { HeadShot: 0, TorsoShot: 0, ArmShot: 0, LegShot: 0, PelvisShot: 0, total: 0, hitCount: 0 };
}

function parseDamage(telemetry, { accountId = null, playerName = null } = {}) {
  const { accountKey, lowerName } = focalKeys({ accountId, playerName });
  const dealt = emptyRegions();
  const taken = emptyRegions();
  const byWeapon = new Map();

  for (const ev of Array.isArray(telemetry) ? telemetry : []) {
    if (ev?._T !== "LogPlayerTakeDamage") continue;
    const amount = Number(ev.damage);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    if (NON_COMBAT_DAMAGE_CATEGORIES.has(ev.damageTypeCategory)) continue; // exclude blue zone / drown / red zone / fall

    const attacker = ev.attacker || null;
    const victim = ev.victim || null;
    const region = BODY_REGIONS.includes(ev.damageReason) ? ev.damageReason : null;

    const meDealt = isFocalActor(attacker, accountKey, lowerName) && !isFocalActor(victim, accountKey, lowerName);
    const meTaken = isFocalActor(victim, accountKey, lowerName);

    if (meDealt) {
      if (region) dealt[region] += amount;
      dealt.total += amount;
      dealt.hitCount += 1;
      const key = canonicalWeaponKey(ev.damageCauserName) || ev.damageCauserName || null;
      const entry = byWeapon.get(key) || { weaponKey: key, weapon: telemetryWeaponName(ev.damageCauserName), damage: 0, hits: 0 };
      entry.damage += amount;
      entry.hits += 1;
      byWeapon.set(key, entry);
    }
    if (meTaken) {
      if (region) taken[region] += amount;
      taken.total += amount;
      taken.hitCount += 1;
    }
  }

  for (const bucket of [dealt, taken]) {
    for (const k of Object.keys(bucket)) bucket[k] = Math.round(bucket[k]);
  }
  const dealtByWeapon = [...byWeapon.values()]
    .map((w) => ({ ...w, damage: Math.round(w.damage) }))
    .sort((a, b) => b.damage - a.damage)
    .slice(0, 8);
  const headshotDamagePct = dealt.total ? Math.round((dealt.HeadShot / dealt.total) * 100) : 0;

  return { dealt, taken, dealtByWeapon, headshotDamagePct };
}

function parseTimeline(telemetry, { clock, accountId = null, playerName = null } = {}) {
  // Callable on its own: build the clock here when nobody handed one in,
  // rather than making every caller remember to.
  const matchClock = clock || buildMatchClock(telemetry);
  const { accountKey, lowerName } = focalKeys({ accountId, playerName });
  const nameToTeam = buildNameToTeam(telemetry);
  const events = [];
  const shotsByWeapon = new Map(); // canonical item key -> shots
  const hitsByWeapon = new Map();  // canonical item key -> hits
  const takenTeamsByBucket = new Map(); // 15s bucket -> Set(teamId)

  for (const ev of Array.isArray(telemetry) ? telemetry : []) {
    const type = ev?._T;
    if (type === "LogPlayerAttack") {
      if (!isFocalActor(ev.attacker, accountKey, lowerName)) continue;
      // One event is one shot: fireWeaponStackCount is a cumulative per-magazine counter, and an empty itemId carries an uninitialised int32.
      const key = canonicalWeaponKey(ev.weapon?.itemId);
      if (!key) continue;
      shotsByWeapon.set(key, (shotsByWeapon.get(key) || 0) + 1);
      continue;
    }
    if (type === "LogPlayerTakeDamage") {
      const amount = Number(ev.damage);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      const t = matchClock.timeOf(ev);
      const meDealt = isFocalActor(ev.attacker, accountKey, lowerName) && !isFocalActor(ev.victim, accountKey, lowerName);
      const meTaken = isFocalActor(ev.victim, accountKey, lowerName);
      if (meDealt) {
        const key = canonicalWeaponKey(ev.damageCauserName);
        hitsByWeapon.set(key, (hitsByWeapon.get(key) || 0) + 1);
        events.push({ t, kind: "dealt", opponent: ev.victim?.name || null, weapon: telemetryWeaponName(ev.damageCauserName), amount: Math.round(amount), region: ev.damageReason || null });
      }
      if (meTaken && ev.attacker?.name) {
        events.push({ t, kind: "taken", opponent: ev.attacker.name, weapon: telemetryWeaponName(ev.damageCauserName), amount: Math.round(amount), region: ev.damageReason || null });
        const attackerTeam = nameToTeam.get(ev.attacker.name);
        if (attackerTeam != null) {
          const bucket = Math.floor((t || 0) / 15);
          if (!takenTeamsByBucket.has(bucket)) takenTeamsByBucket.set(bucket, new Set());
          takenTeamsByBucket.get(bucket).add(attackerTeam);
        }
      }
    }
  }

  events.sort((a, b) => (a.t ?? 0) - (b.t ?? 0));

  const accuracy = [...shotsByWeapon.keys()].map((key) => {
    const shots = shotsByWeapon.get(key) || 0;
    const hits = hitsByWeapon.get(key) || 0;
    // Shotgun pellets produce more hits than trigger pulls, so raw accuracy can
    // exceed 100%; clamp for display sanity.
    const pct = shots ? Math.min(100, Math.round((hits / shots) * 100)) : 0;
    return { weapon: telemetryWeaponName(key), shots, hits, pct };
  }).sort((a, b) => b.shots - a.shots);

  const thirdParties = [...takenTeamsByBucket.entries()]
    .filter(([, set]) => set.size >= 2)
    .map(([bucket, set]) => ({ t: bucket * 15, teamCount: set.size }))
    .sort((a, b) => a.t - b.t);

  return { events, accuracy, thirdParties };
}

async function getMatchAnalysis({ shard, matchId, accountId = null, playerName = null }) {
  if (!matchId) throw new Error("matchId is required");
  const focalTag = accountId || playerName || "-";
  const cacheKey = `${shardForMatch(shard)}:${matchId}:${focalTag}`;
  if (analysisCache.has(cacheKey)) return analysisCache.get(cacheKey);

  const { matchAttributes, matchPayload, telemetry } = await loadMatchBundle({ shard, matchId });

  const rawMapName = matchAttributes.mapName || "";
  const meta = getMapMeta(rawMapName);
  // One clock for the whole page. These tabs sit beside the replay, so a kill
  // has to carry the same timestamp in both; the wall clock they used before
  // drifts 5-19 s away from the in-game one across a match.
  const clock = buildMatchClock(telemetry);
  const scoreboard = parseScoreboard(matchPayload, { accountId, playerName });
  const killFeed = parseKillFeed(telemetry, { clock, accountId, playerName });
  const damage = parseDamage(telemetry, { accountId, playerName });
  const timeline = parseTimeline(telemetry, { clock, accountId, playerName });

  const result = {
    matchId,
    rawMapName,
    mapName: meta.displayName,
    mapMax: meta.mapMax,
    duration: Number(matchAttributes.duration) || 0,
    createdAt: matchAttributes.createdAt || null,
    focalAccountId: scoreboard.focalAccountId,
    focalTeamId: scoreboard.focalTeamId,
    scoreboard,
    killFeed,
    damage,
    timeline,
  };

  analysisCache.set(cacheKey, result);
  while (analysisCache.size > ANALYSIS_CACHE_LIMIT) {
    const oldest = analysisCache.keys().next().value;
    if (!oldest) break;
    analysisCache.delete(oldest);
  }
  return result;
}

module.exports = { getMatchAnalysis, parseScoreboard, parseKillFeed, parseDamage, parseTimeline };
