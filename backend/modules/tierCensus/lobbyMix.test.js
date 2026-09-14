const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { lobbyMix, LADDER, ROW_MIN_LOBBIES } = require("./lobbyMix");

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

// A lobby that never yielded an opponent for this tier is not a witness to
// what a gold lobby looks like, so it must not count toward n. Thirty lonely
// golds plus one shared lobby is one witness, not thirty-one -- and must not
// clear the publishable gate on the strength of lobbies that saw nothing.
test("a lobby that yields no opponent for a tier does not count toward its n", () => {
  const rows = [];
  for (let i = 1; i <= ROW_MIN_LOBBIES; i += 1) rows.push(...lobby(i, "gold"));
  rows.push(...lobby(ROW_MIN_LOBBIES + 1, "gold", "silver"));
  const gold = lobbyMix(rows).find((r) => r.tier === "gold");
  assert.equal(gold.focals, ROW_MIN_LOBBIES + 1, "every sampled gold still counts as a focal");
  assert.equal(gold.opponents, 1);
  assert.equal(gold.lobbies, 1, "only the one lobby that produced an opponent counts toward n");
  assert.equal(gold.publishable, false, "one witnessing lobby cannot clear the thirty-lobby gate");
});

// LADDER mirrors RANK_LADDER by hand, and neither side can import the other --
// this repo is two separate Node projects. Adding a tier to RANK_LADDER
// without adding it here would make lobbyMix silently drop it from every mix
// while shares still summed to 1, so nothing else would notice. Read as text
// rather than imported: rankLadder.js is ESM and this suite runs on node:test.
test("LADDER mirrors RANK_LADDER in frontend/src/helpers/rankLadder.js", () => {
  const file = path.join(__dirname, "..", "..", "..", "frontend", "src", "helpers", "rankLadder.js");
  const src = fs.readFileSync(file, "utf8");
  const block = src.match(/RANK_LADDER\s*=\s*\[([\s\S]*?)\];/);
  assert.ok(block, `RANK_LADDER array not found in ${file}`);
  const keys = [...block[1].matchAll(/key:\s*"([a-z]+)"/g)].map((m) => m[1]);
  assert.ok(keys.length, `no tier keys found in RANK_LADDER in ${file}`);
  assert.deepEqual(LADDER, keys, "backend LADDER and frontend RANK_LADDER must agree in content and order");
});
