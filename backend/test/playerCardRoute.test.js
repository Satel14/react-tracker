// GET /api/player/:platform/:gameId/card.png is the one route registered with
// neither a validator chain nor a rate limiter, and every miss costs a full
// parsePlayerRank -- four or five PUBG calls against a key measured at 100 a
// minute and shared with the live site.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

const card = require("../modules/getPlayerCard");
let cardCalls = 0;
let cardError = null;
card.getPlayerCard = async () => {
  cardCalls += 1;
  if (cardError) throw cardError;
  return Buffer.from("fake-png");
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

const getCard = async (port, path, ip) => {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    headers: { "X-Forwarded-For": ip },
  });
  return { status: response.status, body: await response.text() };
};

test("a bogus platform is rejected before it costs a PUBG lookup", async () => {
  const { server, port } = await startRouteServer();
  cardCalls = 0;
  cardError = null;
  try {
    const res = await getCard(port, "/api/player/nintendo/shroud/card.png", "10.1.0.1");
    assert.equal(res.status, 422);
    assert.equal(cardCalls, 0, "the lookup ran anyway");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("an over-long gameId is rejected before it costs a PUBG lookup", async () => {
  const { server, port } = await startRouteServer();
  cardCalls = 0;
  cardError = null;
  try {
    const res = await getCard(port, `/api/player/steam/${"x".repeat(65)}/card.png`, "10.1.0.2");
    assert.equal(res.status, 422);
    assert.equal(cardCalls, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("a well-formed request still reaches the card builder", async () => {
  const { server, port } = await startRouteServer();
  cardCalls = 0;
  cardError = null;
  try {
    const res = await getCard(port, "/api/player/steam/shroud/card.png", "10.1.0.3");
    assert.equal(res.status, 200);
    assert.equal(cardCalls, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

// "API Key Invalid" and "Rate Limit Reached" are what parsePlayerRank throws.
// Neither is any of a caller's business.
test("a failure does not echo the upstream message back to the caller", async () => {
  const { server, port } = await startRouteServer();
  cardCalls = 0;
  cardError = new Error("API Key Invalid");
  try {
    const res = await getCard(port, "/api/player/steam/shroud/card.png", "10.1.0.4");
    assert.equal(res.status, 500);
    assert.doesNotMatch(res.body, /API Key Invalid/i, `leaked: ${res.body}`);
  } finally {
    cardError = null;
    await new Promise((resolve) => server.close(resolve));
  }
});

test("the route is rate limited like every other costly one", async () => {
  const { server, port } = await startRouteServer();
  cardCalls = 0;
  cardError = null;
  try {
    let sawLimit = false;
    for (let i = 0; i < 80; i += 1) {
      const res = await getCard(port, `/api/player/steam/player${i}/card.png`, "10.1.9.9");
      if (res.status === 429) { sawLimit = true; break; }
    }
    assert.ok(sawLimit, "80 card builds from one IP went through unthrottled");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
