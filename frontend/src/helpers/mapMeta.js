import erangel from "../img/maps/erangel.webp";
import miramar from "../img/maps/miramar.webp";
import taego from "../img/maps/taego.webp";
import deston from "../img/maps/deston.webp";
import rondo from "../img/maps/rondo.webp";
import vikendi from "../img/maps/vikendi.webp";
import sanhok from "../img/maps/sanhok.webp";
import paramo from "../img/maps/paramo.webp";
import karakin from "../img/maps/karakin.webp";
import campJackal from "../img/maps/camp_jackal.webp";
import haven from "../img/maps/haven.webp";

export const MAP_META = {
  Baltic_Main: { displayName: "Erangel", mapMax: 8160, slug: "erangel", image: erangel },
  Erangel_Main: { displayName: "Erangel", mapMax: 8160, slug: "erangel", image: erangel },
  Desert_Main: { displayName: "Miramar", mapMax: 8160, slug: "miramar", image: miramar },
  Tiger_Main: { displayName: "Taego", mapMax: 8160, slug: "taego", image: taego },
  Kiki_Main: { displayName: "Deston", mapMax: 8160, slug: "deston", image: deston },
  Neon_Main: { displayName: "Rondo", mapMax: 8160, slug: "rondo", image: rondo },
  // Vikendi is 8x8 km, not the 6x6 of its 2019 original. Confirmed against a
  // real match: the first safety zone is centred on the map midpoint, and it
  // sits at 4080 m, so the side is 8160. Players in that match reached 7513 m,
  // which the old 6120 would have drawn off the map.
  DihorOtok_Main: { displayName: "Vikendi", mapMax: 8160, slug: "vikendi", image: vikendi },
  Savage_Main: { displayName: "Sanhok", mapMax: 4080, slug: "sanhok", image: sanhok },
  Chimera_Main: { displayName: "Paramo", mapMax: 3060, slug: "paramo", image: paramo },
  Summerland_Main: { displayName: "Karakin", mapMax: 2040, slug: "karakin", image: karakin },
  Range_Main: { displayName: "Camp Jackal", mapMax: 2040, slug: "camp_jackal", image: campJackal },
  Heaven_Main: { displayName: "Haven", mapMax: 1020, slug: "haven", image: haven },
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

export const HIGH_RES_VERSION = "v1";

export const highResUrl = (rawMapName) => {
  const meta = MAP_META[rawMapName];
  if (!meta || !meta.slug) return null;
  return `/map-hi/${meta.slug}-2048.${HIGH_RES_VERSION}.webp`;
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
