const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { aggregateKey, addMatchPoints, getAggregate } = require("./heatmapAggregate");

const tmp = path.join(os.tmpdir(), `heatmap-test-${process.pid}.json`);

beforeEach(() => {
  if (fs.existsSync(tmp)) fs.rmSync(tmp);
});

test("aggregateKey is stable and shard/map specific", () => {
  const k = aggregateKey({ shard: "steam", accountId: "account.1", rawMapName: "Baltic_Main" });
  assert.equal(k, aggregateKey({ shard: "steam", accountId: "account.1", rawMapName: "Baltic_Main" }));
  assert.notEqual(k, aggregateKey({ shard: "steam", accountId: "account.1", rawMapName: "Desert_Main" }));
});

test("addMatchPoints is idempotent by matchId", async () => {
  const key = aggregateKey({ shard: "steam", accountId: "account.1", rawMapName: "Baltic_Main" });
  const points = { drop: [{ x: 1, y: 2 }], kill: [{ x: 3, y: 4 }], death: [] };
  await addMatchPoints({ key, matchId: "m1", points, filePath: tmp });
  await addMatchPoints({ key, matchId: "m1", points, filePath: tmp });
  const agg = await getAggregate({ key, filePath: tmp });
  assert.equal(agg.matchesCount, 1);
  assert.equal(agg.layers.drop.length, 1);
  assert.equal(agg.layers.kill.length, 1);
});

test("addMatchPoints merges multiple matches and caps count", async () => {
  const key = aggregateKey({ shard: "steam", accountId: "account.1", rawMapName: "Baltic_Main" });
  for (let i = 0; i < 65; i += 1) {
    await addMatchPoints({ key, matchId: `m${i}`, points: { drop: [{ x: i, y: i }], kill: [], death: [] }, filePath: tmp, maxMatches: 60 });
  }
  const agg = await getAggregate({ key, filePath: tmp });
  assert.equal(agg.matchesCount, 60);
  assert.equal(agg.layers.drop.length, 60);
});
