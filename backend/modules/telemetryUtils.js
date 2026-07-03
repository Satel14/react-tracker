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

module.exports = { readXY, eventTime, isFocalActor };
