const { test } = require("node:test");
const assert = require("node:assert/strict");
const { toSeasonLabel } = require("./season");

test("a numbered season id still yields Season #N", () => {
  assert.equal(toSeasonLabel("division.bro.official.pc-2018-42"), "Season #42");
});

test("the unnumbered 2017-beta id gets an honest label, not Current Season", () => {
  const label = toSeasonLabel("division.bro.official.2017-beta");
  assert.equal(label, "Season 2017-beta");
  assert.notEqual(label, "Current Season");
});

test("degenerate ids do not throw", () => {
  assert.doesNotThrow(() => toSeasonLabel(""));
  assert.doesNotThrow(() => toSeasonLabel(null));
  assert.doesNotThrow(() => toSeasonLabel(undefined));
  assert.doesNotThrow(() => toSeasonLabel(42));
  assert.doesNotThrow(() => toSeasonLabel("no-trailing-digit"));
});
