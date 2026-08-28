const { readXY } = require("../telemetryUtils");

// PUBG ships the typo "Carapackage_" on most ids but the correct "Carepackage_"
// on the Bluechip one, so both spellings have to be stripped before matching.
const PACKAGE_PREFIX = /^car[ae]package_/;

function packageKind(itemPackageId) {
  const id = typeof itemPackageId === "string" ? itemPackageId.toLowerCase() : "";
  const tail = id.replace(PACKAGE_PREFIX, "");
  if (tail.includes("brdm")) return "brdm";
  // Bluechip must be tested before the small fallback: its id also says SmallPackage.
  if (tail.includes("bluechip")) return "bluechip";
  if (tail.includes("redbox")) return "redbox";
  if (tail.includes("flare")) return "flare";
  return "small";
}

// The join key stays at raw centimetre precision: collapsing it to the metres we
// emit would merge two genuinely distinct packages that land within a metre.
function keyOf(id, loc) {
  return id + "|" + Math.round(Number(loc.x)) + "|" + Math.round(Number(loc.y));
}

function extractPackages(telemetry, clock) {
  const events = Array.isArray(telemetry) ? telemetry : [];
  const timeOf = typeof clock?.timeOf === "function" ? (ev) => clock.timeOf(ev) : () => null;

  const spawns = new Map();
  const lands = [];

  for (const ev of events) {
    const type = ev?._T;
    if (type !== "LogCarePackageSpawn" && type !== "LogCarePackageLand") continue;

    const pkg = ev.itemPackage;
    const id = pkg?.itemPackageId;
    if (typeof id !== "string" || !id) continue;

    // Keep the raw (centimetre) location for the join key; emit metres.
    const loc = [pkg.location, ev.location].find((candidate) => readXY(candidate));
    if (!loc) continue;
    const xy = readXY(loc);

    const t = timeOf(ev);
    if (!Number.isFinite(t)) continue;

    const key = keyOf(id, loc);
    if (type === "LogCarePackageSpawn") {
      if (!spawns.has(key)) spawns.set(key, []);
      spawns.get(key).push(t);
      continue;
    }

    lands.push({ key, id, t, x: xy.x, y: xy.y, n: Array.isArray(pkg.items) ? pkg.items.length : 0 });
  }

  const packages = lands.map((land) => {
    const queued = spawns.get(land.key);
    const ts = queued && queued.length ? queued.shift() : null;
    return { kind: packageKind(land.id), id: land.id, t: land.t, ts, x: land.x, y: land.y, n: land.n };
  });

  packages.sort((a, b) => a.t - b.t);
  return packages;
}

module.exports = { extractPackages };
