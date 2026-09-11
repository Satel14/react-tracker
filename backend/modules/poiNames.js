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
//
// Two slugs are absent ON PURPOSE and must stay that way: "8theventspot" and
// "9thEventSpot" are event-mode overlays spanning kilometres (3.3 km measured
// for the Rondo one), not places. Naming a kill after one would label it with a
// region covering a third of the map.
const POI_NAMES = Object.freeze({
  // --- shared across maps ---
  // The table is flat, so a slug two maps share has to mean the same place on
  // both. These do: Erangel and Taego both label a School, and Erangel and
  // Miramar both label a Prison.
  school: "School",
  prison: "Prison",

  // --- Taego (Tiger_Main) ---
  armybase: "Army Base",
  buksansa: "Buksansa",
  fishingcamp: "Fishing Camp",
  godok: "Godok",
  haemoosa: "Haemoosa",
  hosan: "Hosan",
  hosanprison: "Hosan Prison",
  kangneung: "Kangneung",
  ohhyang: "Oh Hyang",
  palace: "Palace",
  shipyard: "Shipyard",
  songam: "Songam",
  terminal: "Terminal",
  wolsong: "Wolsong",
  yongcheon: "Yongcheon",

  // --- Miramar (Desert_Main) ---
  // Alcantara carries no accent, unlike Hacienda del Patrón and La Cobrería --
  // the game is inconsistent about them, so each one is as confirmed, not as
  // Spanish orthography would have it.
  alcantara: "Alcantara",
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
  elpozo: "El Pozo",
  graveyard: "Graveyard",
  impala: "Impala",
  lacobreria: "La Cobrería",
  losleones: "Los Leones",
  montenuevo: "Monte Nuevo",
  pecado: "Pecado",
  powergrid: "Power Grid",
  sanmartin: "San Martín",
  valledelmar: "Valle del Mar",
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
  hospital: "Hospital",
  lipovka: "Lipovka",
  mylta: "Mylta",
  myltapower: "Mylta Power",
  novorepnoye: "Novorepnoye",
  pochinki: "Pochinki",
  primorsk: "Primorsk",
  quarry: "Quarry",
  rozhok: "Rozhok",
  ruins: "Ruins",
  severny: "Severny",
  shelter: "Shelter",
  sosnovkamilitarybase: "Sosnovka Military Base",
  yasnayapolyana: "Yasnaya Polyana",

  // --- Vikendi (DihorOtok_Main) ---
  castle: "Castle",
  coalmine: "Coal Mine",
  observatory: "Observatory",
  trainstation: "Train Station",

  // --- Sanhok (Savage_Main) ---
  bantai: "Ban Tai",
  bootcamp: "Bootcamp",
  campalpha: "Camp Alpha",
  campbravo: "Camp Bravo",
  campcharlie: "Camp Charlie",
  docks: "Docks",
  hatinh: "Ha Tinh",
  khao: "Khao",
  mongnai: "Mong Nai",
  painan: "Pai Nan",
  paradiseresort: "Paradise Resort",
  sahmee: "Sahmee",
  tatmok: "Tat Mok",

  // --- Karakin (Summerland_Main) ---
  alhabar: "Al Habar",
  alhayik: "Al Hayik",
  bahrsahir: "Bahr Sahir",
  hadiqanemo: "Hadiqa Nemo",

  // --- Deston (Kiki_Main) ---
  // Deston is the one map that ships a SPACED form of some slugs alongside the
  // flattened one, so its word breaks are read off the data instead of guessed.
  // Both forms are keyed, because either can arrive on a given event.
  arena: "Arena",
  assembly: "Assembly",
  barclift: "Barclift",
  buxley: "Buxley",
  cavala: "Cavala",
  concert: "Concert",
  constructionsite: "Construction Site",
  "construction site": "Construction Site",
  elkoro: "El Koro",
  "el koro": "El Koro",
  hydroelectricdam: "Hydroelectric Dam",
  "hydroelectric dam": "Hydroelectric Dam",
  lodge: "Lodge",
  // Misspelled upstream: the flattened form drops a letter that the spaced form
  // keeps ("losacros" against "los arcos"), so they are not the same string.
  // Same class of upstream typo as Miramar's "manisgenerales".
  losacros: "Los Arcos",
  "los arcos": "Los Arcos",
  ripton: "Ripton",
  swamp: "Swamp",
  turrita: "Turrita",

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
