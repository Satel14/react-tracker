const TRN_API_KEY = process.env.TRN_API_KEY;
const PUBG_API_KEY = process.env.PUBG_API_KEY;

const playerCache = new Map();
const statsCache = new Map();
const CACHE_DURATION = 10 * 60 * 1000;

async function doRequest(url) {
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${PUBG_API_KEY}`,
      'Accept': 'application/vnd.api+json'
    }
  });

  if (!response.ok) {
    if (response.status === 404) throw new Error("Player not found");
    if (response.status === 401) throw new Error("API Key Invalid");
    if (response.status === 429) throw new Error("Rate Limit Reached");
    throw new Error(`PUBG API Error: ${response.statusText}`);
  }
  return response.json();
}

function mapPubgStatsToFrontend(pubgStats, playerName, accountId) {

  let totalKills = 0;
  let totalWins = 0;
  let totalTime = 0;
  let totalDamage = 0;
  let totalMatches = 0;
  let totalHeadshots = 0;
  let maxKillDistance = 0;
  let totalRevives = 0;
  let totalAssists = 0;
  let totalDBNOs = 0;
  let totalHeals = 0;
  let totalBoosts = 0;
  let totalVehicleDestroys = 0;
  let totalRoadKills = 0;
  let totalTop10s = 0;

  const modes = Object.values(pubgStats.gameModeStats || {});

  modes.forEach(mode => {
    totalKills += mode.kills || 0;
    totalWins += mode.wins || 0;
    totalTime += mode.timeSurvived || 0;
    totalDamage += mode.damageDealt || 0;
    totalMatches += mode.roundsPlayed || 0;
    totalHeadshots += mode.headshotKills || 0;
    totalRevives += mode.revives || 0;
    totalAssists += mode.assists || 0;
    totalDBNOs += mode.dBNOs || 0;
    totalHeals += mode.heals || 0;
    totalBoosts += mode.boosts || 0;
    totalVehicleDestroys += mode.vehicleDestroys || 0;
    totalRoadKills += mode.roadKills || 0;
    totalTop10s += mode.top10s || 0;
    if (mode.longestKill > maxKillDistance) maxKillDistance = mode.longestKill;
  });

  const kd = (totalMatches - totalWins) > 0 ? (totalKills / (totalMatches - totalWins)).toFixed(2) : totalKills;
  const avgDamage = totalMatches > 0 ? (totalDamage / totalMatches).toFixed(0) : 0;
  const wlPercentage = totalMatches > 0 ? ((totalWins / totalMatches) * 100).toFixed(1) : 0;

  return {
    data: {
      platformInfo: {
        platformSlug: "steam",
        platformUserId: accountId,
        platformUserHandle: playerName,
        platformUserIdentifier: accountId,
        avatarUrl: "https://wstatic-prod-boc.krafton.com/common/img/pubg_logo_w.png",
      },
      segments: [
        {
          stats: {
            timePlayed: { displayValue: Math.round(totalTime / 3600) + "h", value: totalTime },

            kills: { displayValue: totalKills.toLocaleString(), value: totalKills },
            deaths: { displayValue: (totalMatches - totalWins).toLocaleString(), value: totalMatches - totalWins },
            kd: { displayValue: kd, value: kd },
            wins: { displayValue: totalWins.toLocaleString(), value: totalWins },
            matchesPlayed: { displayValue: totalMatches.toLocaleString(), value: totalMatches },
            roundsPlayed: { displayValue: totalMatches.toLocaleString(), value: totalMatches },
            mvp: { displayValue: totalRevives.toLocaleString(), value: totalRevives },
            headshotPct: { displayValue: totalHeadshots.toLocaleString(), value: totalHeadshots },
            damage: { displayValue: Math.round(totalDamage).toLocaleString(), value: totalDamage },
            wlPercentage: { displayValue: wlPercentage + "%", value: wlPercentage },
            bombsDefused: { displayValue: Math.round(maxKillDistance) + "m", value: maxKillDistance },
            assists: { displayValue: totalAssists.toLocaleString(), value: totalAssists },
            dbnos: { displayValue: totalDBNOs.toLocaleString(), value: totalDBNOs },
            top10s: { displayValue: totalTop10s.toLocaleString(), value: totalTop10s },
            heals: { displayValue: totalHeals.toLocaleString(), value: totalHeals },
            boosts: { displayValue: totalBoosts.toLocaleString(), value: totalBoosts },
            vehicleDestroys: { displayValue: totalVehicleDestroys.toLocaleString(), value: totalVehicleDestroys },
            roadKills: { displayValue: totalRoadKills.toLocaleString(), value: totalRoadKills }
          }
        }
      ]
    }
  };
}

module.exports.parsePlayerRank = async (platform, gameid) => {
  try {
    let accountId = playerCache.get(gameid);
    let playerName = gameid;


    if (!accountId) {
      if (gameid.startsWith("account.")) {
        accountId = gameid;
      } else {
        console.log(`[PUBG] Resolving player: ${gameid}`);
        const searchUrl = `https://api.pubg.com/shards/steam/players?filter[playerNames]=${gameid}`;
        const searchData = await doRequest(searchUrl);

        if (!searchData.data || searchData.data.length === 0) {
          throw new Error("Player not found");
        }
        accountId = searchData.data[0].id;
        playerName = searchData.data[0].attributes.name;

        playerCache.set(gameid, accountId);
      }
    } else {
      console.log(`[PUBG] Cache hit for player ID: ${gameid} -> ${accountId}`);
    }

    const cachedStats = statsCache.get(accountId);
    if (cachedStats && (Date.now() - cachedStats.timestamp < CACHE_DURATION)) {
      console.log(`[PUBG] Serving cached stats for ${playerName}`);
      return mapPubgStatsToFrontend(cachedStats.data, playerName, accountId);
    }


    console.log(`[PUBG] Fetching fresh stats for ${playerName}`);
    const statsUrl = `https://api.pubg.com/shards/steam/players/${accountId}/seasons/lifetime`;
    const statsData = await doRequest(statsUrl);

    if (!statsData.data || !statsData.data.attributes) {
      throw new Error("No stats found for this player");
    }

    console.log("Raw PUBG Stats:", JSON.stringify(statsData.data.attributes.gameModeStats, null, 2));

    statsCache.set(accountId, {
      data: statsData.data.attributes,
      timestamp: Date.now()
    });

    return mapPubgStatsToFrontend(statsData.data.attributes, playerName, accountId);

  } catch (e) {
    console.log("PUBG API Error:", e.message);
    throw Error(e.message)
  }
};