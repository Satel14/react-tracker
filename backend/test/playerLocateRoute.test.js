// POST /api/player/locate spends up to three PUBG lookups per call, against a
// key measured at 100 a minute and shared with the live site.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

const locate = require("../modules/locatePlayer");
let locateCalls = [];
locate.locatePlayer = async (platform, gameId) => {
  locateCalls.push({ platform, gameId });
  return { found: [{ platform: "xbox", name: gameId }], complete: true };
};
delete require.cache[require.resolve("../controllers/player")];
delete require.cache[require.resolve("../routes/player")];
const registerPlayerRoutes = require("../routes/player");

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

const postLocate = async (port, body, ip) => {
  const response = await fetch(`http://127.0.0.1:${port}/api/player/locate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": ip },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
};

const withServer = async (run) => {
  const { server, port } = await startRouteServer();
  locateCalls = [];
  try {
    await run(port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

test("a bogus platform is rejected before it costs a lookup", () =>
  withServer(async (port) => {
    const res = await postLocate(port, { platform: "nintendo", gameId: "shroud" }, "10.2.0.1");
    assert.equal(res.status, 422);
    assert.equal(locateCalls.length, 0);
  }));

test("a missing or over-long name is rejected before it costs a lookup", () =>
  withServer(async (port) => {
    assert.equal((await postLocate(port, { platform: "steam" }, "10.2.0.2")).status, 422);
    assert.equal(
      (await postLocate(port, { platform: "steam", gameId: "x".repeat(65) }, "10.2.0.2")).status,
      422
    );
    assert.equal(locateCalls.length, 0);
  }));

test("a well-formed request answers with what the lookup found", () =>
  withServer(async (port) => {
    const res = await postLocate(port, { platform: "steam", gameId: "shroud" }, "10.2.0.3");
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, {
      status: 200,
      data: { found: [{ platform: "xbox", name: "shroud" }], complete: true },
    });
    assert.deepEqual(locateCalls, [{ platform: "steam", gameId: "shroud" }]);
  }));

test("one address gets ten lookups a minute, then a 429 that costs nothing", () =>
  withServer(async (port) => {
    for (let i = 0; i < 10; i += 1) {
      assert.equal((await postLocate(port, { platform: "steam", gameId: `p${i}` }, "10.2.0.4")).status, 200);
    }
    assert.equal((await postLocate(port, { platform: "steam", gameId: "p10" }, "10.2.0.4")).status, 429);
    assert.equal(locateCalls.length, 10);
    assert.equal((await postLocate(port, { platform: "steam", gameId: "other" }, "10.2.0.5")).status, 200);
  }));
