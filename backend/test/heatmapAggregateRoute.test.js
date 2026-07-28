const { test } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

const heatmap = require("../modules/getMatchHeatmap");
let warmCalls = 0;
heatmap.warmHeatmapMatches = async () => {
  warmCalls += 1;
};
delete require.cache[require.resolve("../controllers/player")];
delete require.cache[require.resolve("../routes/player")];
const registerPlayerRoutes = require("../routes/player");
const { createHeatmapAggregateLimiter } = require("../modules/heatmapAggregateRateLimiter");

const startRouteServer = () =>
  new Promise((resolve) => {
    const app = express();
    app.set("trust proxy", 1);
    app.use(express.json());
    const router = express.Router();
    registerPlayerRoutes(router);
    app.use(router);
    const server = app.listen(0, () => resolve({ server, port: server.address().port }));
  });

// Per-request client IP, so the route's own shared limiter can never be the reason a validator assertion fails.
const postAggregate = async (port, body, ip) => {
  const response = await fetch(`http://127.0.0.1:${port}/api/player/heatmap/aggregate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": ip },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
};

const validBody = { shard: "steam", accountId: "account.me", map: "Baltic_Main", matchIds: ["m1"] };

test("the aggregate route rejects malformed bodies with 422 and never reaches the loader", async () => {
  const { server, port } = await startRouteServer();
  warmCalls = 0;
  try {
    const badBodies = {
      "matchIds is not an array": { ...validBody, matchIds: "m1" },
      "too many matchIds": { ...validBody, matchIds: Array.from({ length: 13 }, (_, i) => `m${i}`) },
      "a 5000-character matchId": { ...validBody, matchIds: ["x".repeat(5000)] },
      "a bogus shard": { ...validBody, shard: "nintendo" },
      "a 5000-character playerName": { ...validBody, accountId: null, playerName: "x".repeat(5000) },
    };

    let n = 0;
    for (const [label, body] of Object.entries(badBodies)) {
      n += 1;
      const res = await postAggregate(port, body, `10.0.0.${n}`);
      assert.equal(res.status, 422, label);
      assert.equal(res.body.status, 422, label);
    }

    assert.equal(warmCalls, 0, "no malformed body may reach warmHeatmapMatches");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("a well-formed body still passes validation and reaches the handler", async () => {
  const { server, port } = await startRouteServer();
  warmCalls = 0;
  try {
    const res = await postAggregate(port, validBody, "10.0.1.1");
    assert.equal(res.status, 200);
    assert.equal(warmCalls, 1);

    const { matchIds, ...withoutMatchIds } = validBody;
    const omitted = await postAggregate(port, withoutMatchIds, "10.0.1.2");
    assert.equal(omitted.status, 200);
    assert.equal(warmCalls, 2);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("the pre-existing 400 guards keep their status and never reach the loader", async () => {
  const { server, port } = await startRouteServer();
  warmCalls = 0;
  try {
    const noPlayer = await postAggregate(port, { ...validBody, accountId: null }, "10.0.2.1");
    assert.equal(noPlayer.status, 400);
    assert.match(noPlayer.body.message, /accountId or playerName/);

    const noMap = await postAggregate(port, { ...validBody, map: null }, "10.0.2.2");
    assert.equal(noMap.status, 400);
    assert.match(noMap.body.message, /map is required/);

    assert.equal(warmCalls, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("the aggregate limiter returns 429 once the per-window limit is spent", async () => {
  const app = express();
  app.use(createHeatmapAggregateLimiter({ windowMs: 60_000, limit: 2 }));
  app.post("/api/player/heatmap/aggregate", (req, res) => res.status(200).json({ status: 200 }));
  const { server, port } = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve({ server: s, port: s.address().port }));
  });
  try {
    const url = `http://127.0.0.1:${port}/api/player/heatmap/aggregate`;
    const first = await fetch(url, { method: "POST" });
    const second = await fetch(url, { method: "POST" });
    const third = await fetch(url, { method: "POST" });
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(third.status, 429);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
