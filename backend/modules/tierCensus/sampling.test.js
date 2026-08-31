const { test } = require("node:test");
const assert = require("node:assert/strict");
const { pickParticipants, accountsFromMatch, estimateIcc, PER_MATCH } = require("./sampling");

const participant = (id) => ({
  type: "participant",
  attributes: { stats: { playerId: `account.${id}`, name: `p${id}` } },
});

const match = (count, extra = {}) => ({
  data: { id: "m1", attributes: { matchType: "competitive", gameMode: "squad", createdAt: "2026-08-30T21:42:49Z", ...extra } },
  included: Array.from({ length: count }, (_, i) => participant(String(i).padStart(32, "0"))),
});

test("reads every account id out of a match", () => {
  const ids = accountsFromMatch(match(63));
  assert.equal(ids.length, 63);
  assert.ok(ids.every((id) => /^account\.[0-9a-f]{32}$/.test(id)));
});

test("ignores anything that is not a participant with an account id", () => {
  const payload = match(3);
  payload.included.push({ type: "roster", attributes: { stats: { rank: 4 } } });
  payload.included.push({ type: "participant", attributes: { stats: { playerId: "bot-42" } } });
  assert.equal(accountsFromMatch(payload).length, 3);
});

test("survives a match with nothing included", () => {
  assert.deepEqual(accountsFromMatch({ data: {}, included: [] }), []);
  assert.deepEqual(accountsFromMatch({}), []);
});

// Reading every player of every lobby costs 2.5x the API calls for barely more
// precision: the binding constraint is the number of LOBBIES, which the daily
// sample fixes at ~126 whatever we do. Precision comes from pooling days.
test("takes a bounded sample from each match rather than everyone", () => {
  const picked = pickParticipants(accountsFromMatch(match(63)), () => 0.5);
  assert.equal(picked.length, PER_MATCH);
  assert.ok(PER_MATCH < 63);
});

test("takes everyone when a lobby is smaller than the quota", () => {
  const ids = accountsFromMatch(match(9));
  assert.equal(pickParticipants(ids, () => 0.5).length, 9);
});

test("picks without repeating a player", () => {
  const picked = pickParticipants(accountsFromMatch(match(63)), Math.random);
  assert.equal(new Set(picked).size, picked.length);
});

// A biased pick would quietly select by finishing position: participants arrive
// in placement order, so taking the first N would sample winners.
test("does not just take the front of the list", () => {
  const ids = accountsFromMatch(match(63));
  const head = ids.slice(0, PER_MATCH).join();
  let differs = 0;
  for (let i = 0; i < 20; i += 1) {
    if (pickParticipants(ids, Math.random).join() !== head) differs += 1;
  }
  assert.ok(differs >= 18, `only ${differs}/20 draws differed from the head of the list`);
});

test("every player is reachable across many draws", () => {
  const ids = accountsFromMatch(match(30));
  const seen = new Set();
  for (let i = 0; i < 300; i += 1) {
    for (const id of pickParticipants(ids, Math.random)) seen.add(id);
  }
  assert.equal(seen.size, 30);
});

describe_icc();

function describe_icc() {
  // The intra-cluster correlation is what turns a raw count into an effective
  // one. It must be measured from the collected data -- assuming a value is how
  // an interval ends up several times too narrow.
  test("icc is zero when tiers are spread evenly across lobbies", () => {
    const rows = [];
    for (let m = 0; m < 20; m += 1) {
      for (const tier of ["gold", "platinum", "crystal", "diamond"]) {
        rows.push({ matchId: `m${m}`, tier });
      }
    }
    const icc = estimateIcc(rows, "gold");
    assert.ok(icc < 0.05, `expected ~0 for an even spread, got ${icc}`);
  });

  test("icc approaches one when each lobby is a single tier", () => {
    const rows = [];
    for (let m = 0; m < 20; m += 1) {
      const tier = m % 2 ? "gold" : "diamond";
      for (let p = 0; p < 15; p += 1) rows.push({ matchId: `m${m}`, tier });
    }
    const icc = estimateIcc(rows, "gold");
    assert.ok(icc > 0.8, `expected near 1 for homogeneous lobbies, got ${icc}`);
  });

  test("icc is clamped into 0..1 and never NaN", () => {
    for (const rows of [[], [{ matchId: "m1", tier: "gold" }]]) {
      const icc = estimateIcc(rows, "gold");
      assert.ok(Number.isFinite(icc), `got ${icc}`);
      assert.ok(icc >= 0 && icc <= 1);
    }
  });

  test("a tier nobody in the sample holds has no correlation to report", () => {
    const rows = [{ matchId: "m1", tier: "gold" }, { matchId: "m1", tier: "gold" }];
    assert.equal(estimateIcc(rows, "survivor"), 0);
  });
}
