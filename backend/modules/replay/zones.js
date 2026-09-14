const { readXY } = require("../telemetryUtils");

function timeOf(clock, ev) {
  if (!clock || typeof clock.timeOf !== "function") return null;
  let t = null;
  try {
    t = clock.timeOf(ev);
  } catch {
    return null;
  }
  return typeof t === "number" && Number.isFinite(t) ? t : null;
}

function hasUniqueId(uid) {
  if (typeof uid === "number") return Number.isFinite(uid);
  return typeof uid === "string" && uid.trim() !== "";
}

// Red zone / sandstorm / EMP instances, one entry per (zoneType, uniqueId).
// A static instance (RedZone, EMP) collapses to a one-point path; a moving one
// (SandStorm) keeps every position it visits.
function extractSpecialZones(telemetry, clock) {
  const groups = new Map();

  for (const ev of Array.isArray(telemetry) ? telemetry : []) {
    if (ev?._T !== "LogSpecialZoneInCharacters") continue;
    const info = ev.zoneInfo;
    if (!info || !hasUniqueId(info.uniqueId)) continue;
    const t = timeOf(clock, ev);
    if (t === null) continue;
    const xy = readXY(info.position);
    if (!xy) continue;

    // Keyed by type as well as id: nothing guarantees uniqueId is unique across
    // two zone systems running at once, and a merged entry would be silent.
    const type = typeof info.zoneType === "string" && info.zoneType ? info.zoneType : null;
    let byUid = groups.get(type);
    if (!byUid) {
      byUid = new Map();
      groups.set(type, byUid);
    }

    let group = byUid.get(info.uniqueId);
    if (!group) {
      group = { type, uid: info.uniqueId, t0: t, t1: t, r: 0, rAt: -Infinity, path: [] };
      byUid.set(info.uniqueId, group);
    }

    if (t < group.t0) group.t0 = t;
    if (t > group.t1) group.t1 = t;

    // Telemetry radii are centimetres; the newest reading of the group wins.
    // By TIME, not by position in the file -- t0/t1 are min/max above precisely
    // because the two are not the same thing.
    const radius = Number(info.horizontalRadius);
    if (Number.isFinite(radius) && t >= group.rAt) {
      group.r = Math.round(radius / 100);
      group.rAt = t;
    }

    group.path.push({ t, x: xy.x, y: xy.y });
  }

  // Sorted before the repeats collapse, because "consecutive" is a statement
  // about time: the frontend binary-searches this array by t, and an
  // arrival-ordered path parks a moving zone at the wrong position or
  // interpolates it across a negative span.
  const settle = (group) => {
    group.path.sort((a, b) => a.t - b.t);
    group.path = group.path.filter(
      (point, i) => i === 0 || point.x !== group.path[i - 1].x || point.y !== group.path[i - 1].y,
    );
    delete group.rAt;
    return group;
  };

  return [...groups.values()]
    .flatMap((byUid) => [...byUid.values()])
    .map(settle)
    .sort((a, b) => a.t0 - b.t0);
}

// The game emits LogPhaseChange in pairs, so distinct phases are kept once.
function extractPhases(telemetry, clock) {
  const earliest = new Map();

  for (const ev of Array.isArray(telemetry) ? telemetry : []) {
    if (ev?._T !== "LogPhaseChange") continue;
    const p = ev.phase;
    if (typeof p !== "number" || !Number.isFinite(p)) continue;
    const t = timeOf(clock, ev);
    if (t === null) continue;
    const prev = earliest.get(p);
    if (prev === undefined || t < prev) earliest.set(p, t);
  }

  return [...earliest.entries()]
    .map(([p, t]) => ({ t, p }))
    .sort((a, b) => a.t - b.t || a.p - b.p);
}

module.exports = { extractSpecialZones, extractPhases };
