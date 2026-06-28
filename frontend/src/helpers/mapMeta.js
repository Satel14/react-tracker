export const MAP_META = {
  Baltic_Main: { displayName: "Erangel", mapMax: 8160, image: null },
  Erangel_Main: { displayName: "Erangel", mapMax: 8160, image: null },
  Desert_Main: { displayName: "Miramar", mapMax: 8160, image: null },
  Tiger_Main: { displayName: "Taego", mapMax: 8160, image: null },
  Kiki_Main: { displayName: "Deston", mapMax: 8160, image: null },
  Neon_Main: { displayName: "Rondo", mapMax: 8160, image: null },
  DihorOtok_Main: { displayName: "Vikendi", mapMax: 8160, image: null },
  Savage_Main: { displayName: "Sanhok", mapMax: 4080, image: null },
  Chimera_Main: { displayName: "Paramo", mapMax: 3060, image: null },
  Summerland_Main: { displayName: "Karakin", mapMax: 2040, image: null },
  Range_Main: { displayName: "Camp Jackal", mapMax: 2040, image: null },
  Heaven_Main: { displayName: "Haven", mapMax: 1020, image: null },
};

export const getMapMeta = (rawMapName) => {
  const meta = MAP_META[rawMapName];
  if (meta) return meta;
  return {
    displayName: (rawMapName || "Unknown").replace(/_Main$/i, ""),
    mapMax: 8160,
    image: null,
  };
};

export const worldToPercent = (coord, mapMax) => {
  if (!mapMax) return 0;
  return (coord / mapMax) * 100;
};

export const MAP_LIST = [
  { rawMapName: "Baltic_Main", displayName: "Erangel" },
  { rawMapName: "Desert_Main", displayName: "Miramar" },
  { rawMapName: "Tiger_Main", displayName: "Taego" },
  { rawMapName: "Kiki_Main", displayName: "Deston" },
  { rawMapName: "Neon_Main", displayName: "Rondo" },
  { rawMapName: "DihorOtok_Main", displayName: "Vikendi" },
  { rawMapName: "Savage_Main", displayName: "Sanhok" },
  { rawMapName: "Chimera_Main", displayName: "Paramo" },
  { rawMapName: "Summerland_Main", displayName: "Karakin" },
  { rawMapName: "Range_Main", displayName: "Camp Jackal" },
  { rawMapName: "Heaven_Main", displayName: "Haven" },
];

export default MAP_META;
