import erangel from "../img/maps/erangel.png";
import miramar from "../img/maps/miramar.png";
import taego from "../img/maps/taego.png";
import deston from "../img/maps/deston.png";
import rondo from "../img/maps/rondo.png";
import vikendi from "../img/maps/vikendi.png";
import sanhok from "../img/maps/sanhok.png";
import paramo from "../img/maps/paramo.png";
import karakin from "../img/maps/karakin.png";
import campJackal from "../img/maps/camp_jackal.png";
import haven from "../img/maps/haven.png";

export const MAP_META = {
  Baltic_Main: { displayName: "Erangel", mapMax: 8160, image: erangel },
  Erangel_Main: { displayName: "Erangel", mapMax: 8160, image: erangel },
  Desert_Main: { displayName: "Miramar", mapMax: 8160, image: miramar },
  Tiger_Main: { displayName: "Taego", mapMax: 8160, image: taego },
  Kiki_Main: { displayName: "Deston", mapMax: 8160, image: deston },
  Neon_Main: { displayName: "Rondo", mapMax: 8160, image: rondo },
  DihorOtok_Main: { displayName: "Vikendi", mapMax: 8160, image: vikendi },
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
