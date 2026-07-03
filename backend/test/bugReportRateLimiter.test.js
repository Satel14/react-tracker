const { test } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { createBugReportLimiter } = require("../modules/bugReportRateLimiter");

const startServer = () =>
  new Promise((resolve) => {
    const app = express();
    app.use(createBugReportLimiter({ windowMs: 60_000, limit: 2 }));
    app.post("/api/bugreport/send", (req, res) => res.status(200).json({ ok: true }));
    const server = app.listen(0, () => resolve({ server, port: server.address().port }));
  });

test("allows requests up to the limit, then returns 429", async () => {
  const { server, port } = await startServer();
  try {
    const url = `http://127.0.0.1:${port}/api/bugreport/send`;
    const r1 = await fetch(url, { method: "POST" });
    const r2 = await fetch(url, { method: "POST" });
    const r3 = await fetch(url, { method: "POST" });
    assert.equal(r1.status, 200);
    assert.equal(r2.status, 200);
    assert.equal(r3.status, 429);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
