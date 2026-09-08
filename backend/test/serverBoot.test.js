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
      res.resume();
      resolve(res.statusCode);
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
    const code = await healthz(port);
    if (code) return code;
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
};

// The one thing no other test covers: that server.js itself -- its own module
// scope, its listen call -- comes up. optionalCredentials.test.js stops at
// routes(app) because it must not bind a port, and requireResolution.test.js
// never executes a module at all.
test("server.js comes up and serves /healthz", async (t) => {
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

  const code = await waitForHealthz(port);
  assert.equal(code, 200, `/healthz never answered on port ${port}. stderr:\n${stderr}`);
});
