// POST /api/player/launcher spends one PUBG lookup per call.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

const ACCOUNT = "account.3cc264b9e6754f459de7caf048f700b7";

const launcher = require("../modules/pcLauncher");
let calls = [];
launcher.checkPcLauncher = async (platform, accountId) => {
  calls.push({ platform, accountId });
  return { platform: "kakao", matches: 66 };
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

const post = async (port, body, ip) => {
  const response = await fetch(`http://127.0.0.1:${port}/api/player/launcher`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": ip },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
};

const withServer = async (run) => {
  const { server, port } = await startRouteServer();
  calls = [];
  try {
    await run(port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

test("a bogus platform or account id is rejected before it costs a lookup", () =>
  withServer(async (port) => {
    assert.equal((await post(port, { platform: "nintendo", accountId: ACCOUNT }, "10.3.0.1")).status, 422);
    assert.equal((await post(port, { platform: "steam", accountId: "WhiteChaseSmoker" }, "10.3.0.1")).status, 422);
    assert.equal((await post(port, { platform: "steam" }, "10.3.0.1")).status, 422);
    assert.equal(calls.length, 0);
  }));

test("a well-formed request answers with where the account plays", () =>
  withServer(async (port) => {
    const res = await post(port, { platform: "steam", accountId: ACCOUNT }, "10.3.0.2");
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { status: 200, data: { platform: "kakao", matches: 66 } });
    assert.deepEqual(calls, [{ platform: "steam", accountId: ACCOUNT }]);
  }));

test("one address gets ten checks a minute, then a 429 that costs nothing", () =>
  withServer(async (port) => {
    for (let i = 0; i < 10; i += 1) {
      assert.equal((await post(port, { platform: "steam", accountId: ACCOUNT }, "10.3.0.3")).status, 200);
    }
    assert.equal((await post(port, { platform: "steam", accountId: ACCOUNT }, "10.3.0.3")).status, 429);
    assert.equal(calls.length, 10);
  }));
