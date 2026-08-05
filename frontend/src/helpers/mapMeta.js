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
  Baltic_Main: { displayName: "Erangel", mapMax: 8160, image: erangel },
  Erangel_Main: { displayName: "Erangel", mapMax: 8160, image: erangel },
  Desert_Main: { displayName: "Miramar", mapMax: 8160, image: miramar },
  Tiger_Main: { displayName: "Taego", mapMax: 8160, image: taego },
  Kiki_Main: { displayName: "Deston", mapMax: 8160, image: deston },
  Neon_Main: { displayName: "Rondo", mapMax: 8160, image: rondo },
  // TODO(validate-before-deploy): confirm Vikendi mapMax against a real telemetry sample max x/y
  DihorOtok_Main: { displayName: "Vikendi", mapMax: 6120, image: vikendi },
  Savage_Main: { displayName: "Sanhok", mapMax: 4080, image: sanhok },
  Chimera_Main: { displayName: "Paramo", mapMax: 3060, image: paramo },
  Summerland_Main: { displayName: "Karakin", mapMax: 2040, image: karakin },
  Range_Main: { displayName: "Camp Jackal", mapMax: 2040, image: campJackal },
  Heaven_Main: { displayName: "Haven", mapMax: 1020, image: haven },
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
