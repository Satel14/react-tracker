// Sizes verified against real telemetry for Erangel, Miramar, Taego, Deston,
// Rondo, Vikendi and Paramo, using the fact that the first safety zone is
// centred on the map midpoint: centre * 2 is the side. Sanhok, Karakin, Camp
// Jackal and Haven are unverified -- they did not appear in 1001 sampled
// matches, so they are out of rotation. The mapMeta test pins that every value
// is at least one of the six real PUBG map sides, which is what caught Vikendi.
const MAP_META = {
  Baltic_Main: { displayName: "Erangel", mapMax: 8160 },
  Erangel_Main: { displayName: "Erangel", mapMax: 8160 },
  Desert_Main: { displayName: "Miramar", mapMax: 8160 },
  Tiger_Main: { displayName: "Taego", mapMax: 8160 },
  Kiki_Main: { displayName: "Deston", mapMax: 8160 },
  Neon_Main: { displayName: "Rondo", mapMax: 8160 },
  // Vikendi is 8x8 km, not the 6x6 of its 2019 original. Confirmed against a
  // real match: the first safety zone is centred on the map midpoint, and it
  // sits at 4080 m, so the side is 8160. Players in that match reached 7513 m,
  // which the old 6120 would have drawn off the map.
  DihorOtok_Main: { displayName: "Vikendi", mapMax: 8160 },
  Savage_Main: { displayName: "Sanhok", mapMax: 4080 },
  Chimera_Main: { displayName: "Paramo", mapMax: 3060 },
  Summerland_Main: { displayName: "Karakin", mapMax: 2040 },
  Range_Main: { displayName: "Camp Jackal", mapMax: 2040 },
  Heaven_Main: { displayName: "Haven", mapMax: 1020 },
};

function getMapMeta(rawMapName) {
  const meta = MAP_META[rawMapName];
  if (meta) return meta;
  return {
    displayName: (rawMapName || "Unknown").replace(/_Main$/i, ""),
    mapMax: 8160,
  };
}

module.exports = { MAP_META, getMapMeta };
