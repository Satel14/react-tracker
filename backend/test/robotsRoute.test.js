const { test } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

const registerRobots = require("../routes/robots");

const startServer = () =>
  new Promise((resolve) => {
    const app = express();
    registerRobots(app);
    const server = app.listen(0, () => resolve({ server, port: server.address().port }));
  });

// The API host answered 404 for /robots.txt, and a 404 there is not silence --
// every crawler reads a missing robots.txt as "no restrictions given". The
// service sleeps on a free plan and every endpoint costs either a database read
// or PUBG quota, so it is not a thing to leave open to whatever finds it.
test("the API tells every crawler to stay out", async () => {
  const { server, port } = await startServer();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/robots.txt`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /^text\/plain/);

    const body = await response.text();
    assert.match(body, /^User-agent:\s*\*$/m);
    assert.match(body, /^Disallow:\s*\/$/m);
    // A Sitemap line here would point a crawler back at the site from a host it
    // has just been told to leave; the site serves its own.
    assert.doesNotMatch(body, /Sitemap/i);
  } finally {
    server.close();
  }
});

// Browsers do not consult robots.txt before an XHR, so the site's own calls are
// unaffected -- but a rule that accidentally disallowed nothing would be worse
// than no rule, because it would look done.
test("the rule it serves covers every path, not just the root document", async () => {
  const { server, port } = await startServer();
  try {
    const body = await (await fetch(`http://127.0.0.1:${port}/robots.txt`)).text();
    const disallowed = body
      .split("\n")
      .filter((line) => line.toLowerCase().startsWith("disallow:"))
      .map((line) => line.split(":")[1].trim());
    assert.deepEqual(disallowed, ["/"]);
    assert.ok(!body.toLowerCase().includes("allow:") || body.toLowerCase().includes("disallow:"));
  } finally {
    server.close();
  }
});
