const MAP_META = {
  Baltic_Main: { displayName: "Erangel", mapMax: 8160 },
  Erangel_Main: { displayName: "Erangel", mapMax: 8160 },
  Desert_Main: { displayName: "Miramar", mapMax: 8160 },
  Tiger_Main: { displayName: "Taego", mapMax: 8160 },
  Kiki_Main: { displayName: "Deston", mapMax: 8160 },
  Neon_Main: { displayName: "Rondo", mapMax: 8160 },
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
