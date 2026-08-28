function readXY(loc) {
  if (!loc) return null;
  const x = Number(loc.x);
  const y = Number(loc.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: Math.round(x / 100), y: Math.round(y / 100) };
}

function eventTime(ev, matchStartMs) {
  if (Number.isFinite(ev?.elapsedTime)) return Math.round(ev.elapsedTime);
  const ms = Date.parse(ev?._D);
  if (Number.isFinite(ms) && Number.isFinite(matchStartMs)) {
    return Math.max(0, Math.round((ms - matchStartMs) / 1000));
  }
  return null;
}

function isFocalActor(actor, accountKey, lowerName) {
  if (!actor) return false;
  if (accountKey && actor.accountId === accountKey) return true;
  if (lowerName && typeof actor.name === "string" && actor.name.toLowerCase() === lowerName) return true;
  return false;
}

function median(sorted) {
  if (sorted.length === 0) return null;
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function buildMatchClock(telemetry) {
  const residuals = [];
  for (const ev of Array.isArray(telemetry) ? telemetry : []) {
    if (ev?._T !== "LogPlayerPosition") continue;
    if (Number(ev?.common?.isGame) < 0.1) continue;
    const elapsed = Number(ev.elapsedTime);
    const ms = Date.parse(ev?._D);
    if (!Number.isFinite(elapsed) || !Number.isFinite(ms)) continue;
    residuals.push(ms / 1000 - elapsed);
  }

  residuals.sort((a, b) => a - b);
  const originSeconds = median(residuals);
  let residualSeconds = 0;
  if (residuals.length >= 4) {
    const q = (f) => residuals[Math.min(residuals.length - 1, Math.floor(residuals.length * f))];
    residualSeconds = Math.round((q(0.75) - q(0.25)) * 100) / 100;
  }

  const timeOf = (ev) => {
    const top = ev?.elapsedTime;
    if (typeof top === "number" && Number.isFinite(top)) return Math.round(top);
    const nested = ev?.gameState?.elapsedTime;
    if (typeof nested === "number" && Number.isFinite(nested)) return Math.round(nested);
    const ms = Date.parse(ev?._D);
    if (!Number.isFinite(ms)) return null;
    if (originSeconds === null) return null;
    return Math.max(0, Math.round(ms / 1000 - originSeconds));
  };

  return { timeOf, originSeconds, residualSeconds, sampleCount: residuals.length };
}

module.exports = { readXY, eventTime, isFocalActor, buildMatchClock };
