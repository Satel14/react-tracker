const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const net = require("node:net");
const http = require("node:http");
const path = require("node:path");

const BACKEND_ROOT = path.join(__dirname, "..");
const SERVER = path.join(BACKEND_ROOT, "server.js");

// Ask the OS for a port nothing is on, rather than hoping a hard-coded one is
// free: 3003 is the dev port and is usually taken on a working machine.
const freePort = () =>
  new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });

const healthz = (port) =>
  new Promise((resolve) => {
    const req = http.get({ port, host: "127.0.0.1", path: "/healthz" }, (res) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => resolve({ code: res.statusCode, body }));
    });
    req.on("error", () => resolve(null));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(null);
    });
  });

const waitForHealthz = async (port, deadlineMs = 15000) => {
  const until = Date.now() + deadlineMs;
  while (Date.now() < until) {
    const answer = await healthz(port);
    if (answer?.code) return answer;
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
};

const post = (port, path, body, headers = {}) =>
  new Promise((resolve) => {
    const req = http.request(
      { port, host: "127.0.0.1", path, method: "POST", headers: { "Content-Type": "application/json", ...headers } },
      (res) => {
        let payload = "";
        res.on("data", (chunk) => { payload += chunk; });
        res.on("end", () => resolve({ code: res.statusCode, type: res.headers["content-type"], body: payload }));
      },
    );
    req.on("error", () => resolve(null));
    req.setTimeout(2000, () => { req.destroy(); resolve(null); });
    req.end(body);
  });

const startServer = async (t) => {
  const port = await freePort();
  const env = { ...process.env, NODE_ENV: "production", PORT: String(port) };
  // Set deliberately. server.js used to answer CI by calling process.exit(0)
  // right after listen, so under CI the process died before it could serve
  // anything -- meaning the environment that is supposed to check the build
  // was the one environment where the server did not run.
  env.CI = "1";
  // And prove the same boot survives a missing bug-report key, at the level
  // that actually matters: the process, not the route graph.
  delete env.RESEND_API_KEY;

  const child = spawn(process.execPath, [SERVER], { env, cwd: BACKEND_ROOT });
  let stderr = "";
  child.stderr.on("data", (d) => { stderr += d; });
  t.after(() => child.kill());

  const answer = await waitForHealthz(port);
  return { port, answer, stderr: () => stderr };
};

// The one thing no other test covers: that server.js itself -- its own module
// scope, its listen call -- comes up. optionalCredentials.test.js stops at
// routes(app) because it must not bind a port, and requireResolution.test.js
// never executes a module at all.
test("server.js comes up and serves /healthz", async (t) => {
  const { port, answer, stderr } = await startServer(t);
  assert.equal(answer?.code, 200, `/healthz never answered on port ${port}. stderr:\n${stderr()}`);

  // Every Postgres-backed store answers a failure with an empty list, so an
  // outage shows up nowhere a person looks. This is where it shows up. With no
  // DATABASE_URL nothing has queried yet, which reads as "unknown" rather than
  // as a claim that all is well.
  const payload = JSON.parse(answer.body);
  assert.ok(payload.db, "/healthz must report the database");
  assert.ok(
    ["unknown", "ok", "failing"].includes(payload.db.status),
    `unexpected db status: ${JSON.stringify(payload.db)}`,
  );
});

// Every route in this API answers with a { status, message } envelope, including
// its own errors. body-parser is the one thing upstream of them all: a malformed
// body rejects before any handler runs, and with no error handler registered
// express falls back to its own, which answers HTML -- with a stack trace unless
// NODE_ENV happens to be production.
test("a malformed body is answered in the API's own envelope", async (t) => {
  const { port, answer, stderr } = await startServer(t);
  assert.equal(answer?.code, 200, `server never came up. stderr:\n${stderr()}`);

  const res = await post(port, "/api/player/rank", "{not json");

  assert.equal(res?.code, 400);
  assert.match(res.type, /application\/json/, `answered ${res.type} with: ${res.body}`);
  const payload = JSON.parse(res.body);
  assert.equal(payload.status, 400);
  assert.equal(typeof payload.message, "string");
});

// The message is written for a person reading a response, not copied from the
// parser: "Unexpected token n in JSON at position 1" tells a caller where our
// parser is in its input, which is nobody's business but ours.
test("the malformed-body answer does not leak a stack trace", async (t) => {
  const { port, answer, stderr } = await startServer(t);
  assert.equal(answer?.code, 200, `server never came up. stderr:\n${stderr()}`);

  const res = await post(port, "/api/player/rank", "{not json");

  assert.doesNotMatch(res.body, /at \w+.*\(/, "a stack frame reached the client");
  assert.doesNotMatch(res.body, /node_modules/);
});
