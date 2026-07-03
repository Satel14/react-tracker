process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || "re_test_key";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { validationResult } = require("express-validator");
const EmailController = require("../controllers/email");

const runValidators = async (chain, req) => {
  for (const validator of chain) {
    await validator.run(req);
  }
};

const makeRes = () => {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (payload) => { res.body = payload; return res; };
  return res;
};

test("validate('sendBugReport') returns a non-empty validation chain", () => {
  const chain = EmailController.validate("sendBugReport");
  assert.ok(Array.isArray(chain));
  assert.ok(chain.length >= 3);
});

test("sendBugReport responds 422 when the email is invalid", async () => {
  const chain = EmailController.validate("sendBugReport");
  const req = { body: { name: "Bob", email: "not-an-email", description: "It broke" } };
  await runValidators(chain, req);
  const res = makeRes();
  await EmailController.sendBugReport(req, res);
  assert.equal(res.statusCode, 422);
  assert.equal(res.body.status, 422);
});

test("a valid email and description produce no validation errors", async () => {
  const chain = EmailController.validate("sendBugReport");
  const req = { body: { name: "Bob", email: "bob@example.com", description: "It broke" } };
  await runValidators(chain, req);
  assert.equal(validationResult(req).isEmpty(), true);
});
