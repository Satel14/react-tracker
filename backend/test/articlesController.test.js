const test = require("node:test");
const assert = require("node:assert");
const ArticlesController = require("../controllers/articles");
const articles = require("../constant/articles");

function makeRes() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test("getBugReport responds 200 with a { status, data } envelope", async () => {
  const res = makeRes();
  await ArticlesController.getBugReport({}, res);
  assert.strictEqual(res.statusCode, 200);
  assert.ok(res.body, "expected a response body");
  assert.strictEqual(res.body.status, 200);
  assert.ok(res.body.data, "expected a data payload");
});

test("getBugReport returns the bugReportText constant, not undefined", async () => {
  const res = makeRes();
  await ArticlesController.getBugReport({}, res);
  assert.notStrictEqual(
    res.body.data.bugReportText,
    undefined,
    "bugReportText must be defined (regression: was reading non-existent bugReportPage)"
  );
  assert.strictEqual(res.body.data.bugReportText, articles.bugReportText);
});

test("getBugReport includes the bugReportList", async () => {
  const res = makeRes();
  await ArticlesController.getBugReport({}, res);
  assert.ok(Array.isArray(res.body.data.bugReportList));
  assert.deepStrictEqual(res.body.data.bugReportList, articles.bugReportList);
});
