const fs = require("fs/promises");
const path = require("path");

const DEFAULT_FILE = path.join(__dirname, "..", "json", "heatmap-points.json");
const DEFAULT_MAX_MATCHES = 60;
let mutationQueue = Promise.resolve();

function enqueueMutation(task) {
  const run = mutationQueue.then(task, task);
  mutationQueue = run.catch(() => {});
  return run;
}

function aggregateKey({ shard, accountId, playerName, rawMapName }) {
  const who = accountId || playerName || "unknown";
  return `${shard || "steam"}:${who}:${rawMapName || "unknown"}`;
}

async function readStore(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    if (!raw || !raw.trim()) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (e) {
    return {};
  }
}

async function writeStore(filePath, store) {
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(store), "utf8");
  } catch (e) {
    console.log(`[HEATMAP] Failed to write store: ${e.message}`);
  }
}

function emptyPoints() {
  return { drop: [], kill: [], death: [] };
}

function addMatchPoints({ key, matchId, points, filePath = DEFAULT_FILE, maxMatches = DEFAULT_MAX_MATCHES }) {
  return enqueueMutation(async () => {
    if (!key || !matchId) return;
    const store = await readStore(filePath);
    const entry = store[key] && typeof store[key] === "object" ? store[key] : { matches: [] };
    const matches = Array.isArray(entry.matches) ? entry.matches : [];

    const without = matches.filter((m) => m && m.matchId !== matchId);
    const safe = { ...emptyPoints(), ...(points || {}) };
    without.push({
      matchId,
      drop: safe.drop || [],
      kill: safe.kill || [],
      death: safe.death || [],
    });

    while (without.length > maxMatches) without.shift();

    store[key] = { matches: without };
    await writeStore(filePath, store);
  });
}

async function getAggregate({ key, filePath = DEFAULT_FILE }) {
  const store = await readStore(filePath);
  const entry = store[key];
  const matches = entry && Array.isArray(entry.matches) ? entry.matches : [];
  const layers = emptyPoints();
  for (const m of matches) {
    if (!m) continue;
    if (Array.isArray(m.drop)) layers.drop.push(...m.drop);
    if (Array.isArray(m.kill)) layers.kill.push(...m.kill);
    if (Array.isArray(m.death)) layers.death.push(...m.death);
  }
  return { layers, matchesCount: matches.length };
}

module.exports = { aggregateKey, addMatchPoints, getAggregate };
