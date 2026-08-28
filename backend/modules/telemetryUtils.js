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

// The gap between _D and elapsedTime is not a constant: measured across 8 real
// matches it climbs monotonically by +4.9 s to +18.7 s over a match, on a
// saturating curve. Binned medians track that curve; a least-squares line does
// not, because every lobby sample carries elapsedTime 0 while its _D spans a
// minute, and those outliers dominate the fit.
const RESIDUAL_BIN_SECONDS = 120;

function buildMatchClock(telemetry) {
  const residuals = [];
  const bins = new Map();
  for (const ev of Array.isArray(telemetry) ? telemetry : []) {
    if (ev?._T !== "LogPlayerPosition") continue;
    if (Number(ev?.common?.isGame) < 0.1) continue;
    const elapsed = Number(ev.elapsedTime);
    const ms = Date.parse(ev?._D);
    if (!Number.isFinite(elapsed) || !Number.isFinite(ms)) continue;
    const residual = ms / 1000 - elapsed;
    residuals.push(residual);
    const key = Math.floor(elapsed / RESIDUAL_BIN_SECONDS);
    let bin = bins.get(key);
    if (!bin) {
      bin = { elapsed: [], residual: [] };
      bins.set(key, bin);
    }
    bin.elapsed.push(elapsed);
    bin.residual.push(residual);
  }

  residuals.sort((a, b) => a - b);
  const originSeconds = median(residuals);
  let residualSeconds = 0;
  if (residuals.length >= 4) {
    const q = (f) => residuals[Math.min(residuals.length - 1, Math.floor(residuals.length * f))];
    residualSeconds = Math.round((q(0.75) - q(0.25)) * 100) / 100;
  }

  const residualBins = [...bins.keys()]
    .sort((a, b) => a - b)
    .map((key) => {
      const bin = bins.get(key);
      return {
        t: median(bin.elapsed.slice().sort((a, b) => a - b)),
        r: median(bin.residual.slice().sort((a, b) => a - b)),
      };
    });
  // Clamping to non-decreasing keeps d(t) = t + R(t) strictly increasing, which
  // is what makes it invertible below.
  for (let i = 1; i < residualBins.length; i += 1) {
    if (residualBins[i].r < residualBins[i - 1].r) residualBins[i].r = residualBins[i - 1].r;
  }

  const invert = (wall) => {
    const n = residualBins.length;
    if (n === 0) return null;
    const first = residualBins[0];
    const last = residualBins[n - 1];
    if (n === 1 || wall <= first.t + first.r) return wall - first.r;
    if (wall >= last.t + last.r) return wall - last.r;
    for (let i = 0; i < n - 1; i += 1) {
      const a = residualBins[i];
      const b = residualBins[i + 1];
      const da = a.t + a.r;
      const db = b.t + b.r;
      if (wall >= da && wall <= db) {
        const span = b.t - a.t;
        const slope = span === 0 ? 0 : (b.r - a.r) / span;
        return a.t + (wall - da) / (1 + slope);
      }
    }
    return wall - last.r;
  };

  const timeOf = (ev) => {
    const top = ev?.elapsedTime;
    if (typeof top === "number" && Number.isFinite(top)) return Math.round(top);
    const nested = ev?.gameState?.elapsedTime;
    if (typeof nested === "number" && Number.isFinite(nested)) return Math.round(nested);
    const ms = Date.parse(ev?._D);
    if (!Number.isFinite(ms)) return null;
    if (residualBins.length === 0) return null;
    return Math.max(0, Math.round(invert(ms / 1000)));
  };

  return { timeOf, originSeconds, residualSeconds, residualBins, sampleCount: residuals.length };
}

module.exports = { readXY, eventTime, isFocalActor, buildMatchClock };
