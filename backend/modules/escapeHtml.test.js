const { test } = require("node:test");
const assert = require("node:assert/strict");
const { escapeHtml } = require("./escapeHtml");

test("escapeHtml escapes the five HTML-significant characters", () => {
  assert.equal(escapeHtml("<script>"), "&lt;script&gt;");
  assert.equal(escapeHtml("a & b"), "a &amp; b");
  assert.equal(escapeHtml('"quoted"'), "&quot;quoted&quot;");
  assert.equal(escapeHtml("it's"), "it&#39;s");
});

test("escapeHtml replaces ampersands first so entities are not double-encoded", () => {
  assert.equal(
    escapeHtml('<a href="x">t&t</a>'),
    "&lt;a href=&quot;x&quot;&gt;t&amp;t&lt;/a&gt;"
  );
});

test("escapeHtml returns an empty string for null and undefined", () => {
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(undefined), "");
});
