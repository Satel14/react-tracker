const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const BACKEND_ROOT = path.join(__dirname, "..");
const FIXTURES = path.join(__dirname, "fixtures");

// requireResolution.test.js walks the same graph with `require.resolve`, which
// only proves a specifier points at a file -- it never executes a module, so a
// credential read at module scope is invisible to it. These fixtures load the
// graph for real, in a child process so the runner's own environment and the
// port stay untouched.
const runFixture = (name, missing = []) => {
  const env = { ...process.env };
  for (const key of missing) delete env[key];
  return spawnSync(process.execPath, [path.join(FIXTURES, name)], {
    cwd: BACKEND_ROOT,
    env,
    encoding: "utf8",
  });
};

test("the whole route graph loads without RESEND_API_KEY", () => {
  // A key only the bug-report form needs must not be able to take down player
  // stats, replays, leaderboards and the census with it. It could: the Resend
  // client was constructed at module scope, so a missing key threw inside
  // require and server.js died before app.listen.
  const result = runFixture("loadRoutes.cjs", ["RESEND_API_KEY"]);
  assert.equal(
    result.status,
    0,
    `loading the route graph without RESEND_API_KEY failed:\n${result.stderr}`
  );
});

test("no route module reads a credential at import time", () => {
  // The same failure with any other key would be the same outage, so this is
  // the general form rather than one case. DATABASE_URL is already absent from
  // local .env, which is why recent searches fall back to the file store --
  // that fallback is the shape every optional credential should have.
  for (const key of ["PUBG_API_KEY", "STEAM_API_KEY", "DATABASE_URL", "EMAIL_USER"]) {
    const result = runFixture("loadRoutes.cjs", [key]);
    assert.equal(result.status, 0, `loading the route graph without ${key} failed:\n${result.stderr}`);
  }
});

test("an unconfigured bug report answers 503 without leaking the SDK's message", () => {
  // The generic catch would return 500 with e.message, which is the Resend
  // constructor's "Pass it to the constructor `new Resend(\"re_123\")`" -- a
  // send failure and a missing key are different things, and the second is
  // ours, not the reporter's.
  const result = runFixture("sendBugReport.cjs", ["RESEND_API_KEY"]);
  assert.equal(result.status, 0, `the fixture itself failed:\n${result.stderr}`);

  const { code, body } = JSON.parse(result.stdout.trim());
  assert.equal(code, 503);
  assert.doesNotMatch(JSON.stringify(body), /re_123|Missing API key/);
});
