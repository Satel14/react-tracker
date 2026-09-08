const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const BACKEND_ROOT = path.join(__dirname, "..");
const FIXTURE = path.join(BACKEND_ROOT, "test", "fixtures", "sendBugReport.cjs");

// The Resend SDK resolves with `{ data, error }` instead of rejecting, so an
// API failure never reaches a try/catch. The controller has to read the result.
//
// The fixture stubs global fetch with the reply this case needs, so nothing
// here touches the network or needs a real key.
const sendWith = (reply) => {
  const result = spawnSync(process.execPath, [FIXTURE], {
    cwd: BACKEND_ROOT,
    env: { ...process.env, RESEND_API_KEY: "re_stubbed_key", STUB_REPLY: JSON.stringify(reply) },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `the fixture itself failed:\n${result.stderr}`);
  return JSON.parse(result.stdout.trim());
};

const REFUSED = {
  status: 401,
  body: { statusCode: 401, name: "validation_error", message: "API key is invalid" },
};

test("a rejected send is reported as a failure, not as success", () => {
  // The whole point of the form is that a report reaches us. Telling the
  // reporter "sent successfully" when the API refused it loses the report and
  // the reporter's willingness to send another.
  const { code, body } = sendWith(REFUSED);
  assert.notEqual(code, 200);
  assert.equal(code, 502);
  assert.match(body.message, /failed/i);
});

test("a rejected send does not repeat the upstream's message to the client", () => {
  // "API key is invalid" is a fact about our configuration, on a public
  // endpoint anyone can post to.
  const { body } = sendWith(REFUSED);
  assert.doesNotMatch(JSON.stringify(body), /API key|re_/);
});

test("an accepted send is still reported as success", () => {
  const { code, body } = sendWith({ status: 200, body: { id: "b7a1-stubbed" } });
  assert.equal(code, 200);
  assert.match(body.message, /success/i);
});
