const { test } = require("node:test");
const assert = require("node:assert/strict");
const { lobbyMix, ROW_MIN_LOBBIES } = require("./lobbyMix");

// Two players in one lobby see each other and nobody else.
const lobby = (id, ...tiers) => tiers.map((tier) => ({ matchId: id, tier }));

test("a player's own row counts the others in the lobby, not themselves", () => {
  const rows = lobbyMix(lobby(1, "gold", "gold", "silver"));
  const gold = rows.find((r) => r.tier === "gold");
  // Two gold focals. Each sees one gold and one silver.
  assert.equal(gold.focals, 2);
  assert.equal(gold.opponents, 4);
  assert.equal(gold.mix.find((m) => m.tier === "gold").count, 2);
  assert.equal(gold.mix.find((m) => m.tier === "silver").count, 2);
});

test("a published row's shares add to one", () => {
  const rows = [];
  for (let i = 1; i <= ROW_MIN_LOBBIES; i += 1) rows.push(...lobby(i, "gold", "silver", "bronze"));
  const gold = lobbyMix(rows).find((r) => r.tier === "gold");
  assert.equal(gold.publishable, true);
  const total = gold.mix.reduce((sum, m) => sum + m.share, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, `shares summed to ${total}`);
});

test("a tier seen in too few lobbies is reported unpublishable, not omitted", () => {
  const rows = [...lobby(1, "master", "gold"), ...lobby(2, "gold", "gold")];
  const master = lobbyMix(rows).find((r) => r.tier === "master");
  assert.equal(master.publishable, false);
  assert.equal(master.lobbies, 1);
});

// The gate counts LOBBIES, not players. Thirty golds in one lobby are one
// witness to what a gold lobby looks like, not thirty.
test("many players in one lobby do not clear the gate", () => {
  const many = Array.from({ length: ROW_MIN_LOBBIES * 3 }, () => "gold");
  const gold = lobbyMix(lobby(1, ...many)).find((r) => r.tier === "gold");
  assert.equal(gold.publishable, false);
});

test("a lobby with one sampled player contributes no pairs", () => {
  const rows = lobbyMix(lobby(1, "gold"));
  const gold = rows.find((r) => r.tier === "gold");
  assert.equal(gold.opponents, 0);
  assert.equal(gold.mix.length, 0);
});

test("unranked players are opponents but never get a row of their own", () => {
  const rows = lobbyMix(lobby(1, "gold", null, null));
  assert.equal(rows.some((r) => r.tier === "unranked"), false);
  const gold = rows.find((r) => r.tier === "gold");
  assert.equal(gold.mix.find((m) => m.tier === "unranked").count, 2);
});

test("rows come back in ladder order", () => {
  const rows = [];
  for (let i = 1; i <= ROW_MIN_LOBBIES; i += 1) rows.push(...lobby(i, "diamond", "bronze", "gold"));
  assert.deepEqual(lobbyMix(rows).map((r) => r.tier), ["bronze", "gold", "diamond"]);
});

// The point of the whole file. Both fixtures hold the same 30 lobbies and the
// same 100% silver opponents; the second holds three times as many PAIRS. An
// interval computed from pairs would narrow; one computed from lobbies cannot.
test("tripling the pairs inside the same lobbies does not narrow the interval", () => {
  const sparse = [];
  const dense = [];
  for (let i = 1; i <= ROW_MIN_LOBBIES; i += 1) {
    sparse.push(...lobby(i, "gold", "silver"));
    dense.push(...lobby(i, "gold", "silver", "silver", "silver"));
  }

  const widthOf = (rows) => {
    const cell = lobbyMix(rows)
      .find((r) => r.tier === "gold")
      .mix.find((m) => m.tier === "silver");
    assert.equal(cell.share, 1, "fixture should be all-silver opponents");
    return cell.high - cell.low;
  };

  assert.ok(
    Math.abs(widthOf(dense) - widthOf(sparse)) < 1e-9,
    `interval moved with the pair count: ${widthOf(sparse)} -> ${widthOf(dense)}`,
  );
});

// An opponent bucket with no name in the ladder must not get a silent vote in
// the denominator either, or every other bucket's share is deflated by it.
test("an opponent tier outside the ladder does not deflate the shares we can name", () => {
  const rows = [];
  for (let i = 1; i <= ROW_MIN_LOBBIES; i += 1) rows.push(...lobby(i, "gold", "silver", "grandmaster"));
  const gold = lobbyMix(rows).find((r) => r.tier === "gold");
  assert.equal(gold.mix.some((m) => m.tier === "grandmaster"), false);
  assert.equal(gold.opponents, ROW_MIN_LOBBIES);
  const total = gold.mix.reduce((sum, m) => sum + m.share, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, `shares summed to ${total}`);
});

// n >= ROW_MIN_LOBBIES is necessary but not sufficient: a row with no
// opponents at all has nothing to publish a mix for.
test("a row with no opponents at all is not publishable", () => {
  const rows = [];
  for (let i = 1; i <= ROW_MIN_LOBBIES; i += 1) rows.push(...lobby(i, "gold"));
  const gold = lobbyMix(rows).find((r) => r.tier === "gold");
  assert.equal(gold.opponents, 0);
  assert.equal(gold.publishable, false);
});
