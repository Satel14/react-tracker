// PUBG names the POI an actor is standing in, on `character.zone` of every
// character-bearing telemetry event. The app read past it until 2026-09-10.
//
// Measured (6 matches, 4 maps): the field is present on 30-50% of the actors on
// LogPlayerKillV2, 82% on LogItemPickup, and 0-1% on LogParachuteLanding -- a
// drop cannot be named from the landing event at all. Roughly every second kill
// therefore has no place name, which is correct: a fight in the open between
// POIs does not have one.
//
// The slugs are lowercase de-spaced renderings of the display name, and this
// table is the ONLY way back. There is deliberately no fallback: a slug that is
// not in here renders nothing. `ferrypier` is "Ferry Pier" and `boatyard` is
// "Boatyard", and nothing short of a dictionary tells those two apart -- so a
// title-casing fallback would ship wrong place names on every map nobody has
// filled in yet. A missing name is the accepted failure mode; a wrong one is not.
//
// To grow the table, run scripts/apiProbe/probePoiCoverage.js: it reports slugs
// that appeared in live matches and are absent here. A probe only sees POIs that
// were actually visited (one match visits 9-17 of a map's ~20), so absence from
// this table means "not harvested yet", never "not a place".
const POI_NAMES = Object.freeze({
  // --- Taego (Tiger_Main) ---
  armybase: "Army Base",
  buksansa: "Buksansa",
  godok: "Godok",
  hosan: "Hosan",
  hosanprison: "Hosan Prison",
  palace: "Palace",
  shipyard: "Shipyard",
  terminal: "Terminal",
  yongcheon: "Yongcheon",

  // --- Miramar (Desert_Main) ---
  brickyard: "Brickyard",
  campomilitar: "Campo Militar",
  cantera: "Cantera",
  chumacera: "Chumacera",
  cruzdelvalle: "Cruz del Valle",
  elazahar: "El Azahar",
  // The slug is misspelled upstream -- PUBG ships "manisgenerales" for a POI the
  // game displays as Minas Generales. Keyed as shipped, named as displayed.
  manisgenerales: "Minas Generales",
  haciendadelpatron: "Hacienda del Patrón",
  impala: "Impala",
  losleones: "Los Leones",
  montenuevo: "Monte Nuevo",
  pecado: "Pecado",
  prison: "Prison",
  sanmartin: "San Martín",
  // Both spellings occur, and they nest as ["truckstop", "GDTruckStop"] -- one
  // place, so both keys carry the same name and the rule's answer is stable
  // whichever entry it lands on.
  truckstop: "Truck Stop",
  gdtruckstop: "Truck Stop",
  watertreatment: "Water Treatment",

  // --- Erangel (Baltic_Main) ---
  boatyard: "Boat Yard",
  farm: "Farm",
  ferrypier: "Ferry Pier",
  gatka: "Gatka",
  georgopol: "Georgopol",
  mylta: "Mylta",
  novorepnoye: "Novorepnoye",
  pochinki: "Pochinki",
  primorsk: "Primorsk",
  ruins: "Ruins",
  sosnovkamilitarybase: "Sosnovka Military Base",

  // --- Rondo (Neon_Main) ---
  beili: "Bei Li",
  danching: "Dan Ching",
  fongtun: "Fong Tun",
  hungshan: "Hung Shan",
  jadenacity: "Jadena City",
  jaotin: "Jao Tin",
  kunxia: "Kun Xia",
  lanpo: "Lan Po",
  lohuaxing: "Lo Hua Xing",
  longho: "Long Ho",
  meyran: "Mey Ran",
  muhopan: "Mu Ho Pan",
  nanchuan: "Nan Chuan",
  neoxfactory: "Neox Factory",
  raian: "Rai An",
  rinjiang: "Rin Jiang",
  stadium: "Stadium",
  testtrack: "Test Track",
  tuling: "Tu Ling",
  yulin: "Yu Lin",
  yungu: "Yun Gu",
});

// The LAST entry the table knows, not the first.
//
// `zone` can hold two names and is not ordered by specificity: the observed
// pairs are ["9thEventSpot","stadium"] (position 0 is a 3.3 km event overlay),
// ["truckstop","GDTruckStop"] and ["neoxfactory","testtrack"] -- and both Rondo
// slugs in that last pair also appear alone. Taking the last known entry
// resolves all three correctly and needs no extent arithmetic at runtime.
function poiName(zone) {
  if (!Array.isArray(zone)) return null;

  for (let i = zone.length - 1; i >= 0; i -= 1) {
    const entry = zone[i];
    // Guarding the type, not the value: the allow-list already rejects "" and
    // the engine's "None" for free, since neither is a key. Only a non-string
    // needs catching, because .trim() would throw on it.
    if (typeof entry !== "string") continue;
    const name = POI_NAMES[entry.trim().toLowerCase()];
    if (name) return name;
  }

  return null;
}

module.exports = { poiName, POI_NAMES };
