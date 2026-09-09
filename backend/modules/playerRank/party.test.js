const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildPartyOverlap, PARTY_MIN_SHARED, PARTY_MIN_SHARE_PCT } = require("./party");

const ids = (prefix, count) => Array.from({ length: count }, (_, i) => `${prefix}-${i}`);

// PUBG's window held 71 matches for the account this was measured on.
const focalMatchIds = ids("mine", 71);

// A mate who shares `shared` of the focal player's matches and has `theirs`
// matches of their own.
const mate = (name, shared, theirs) => ({
  accountId: `account.${name}`,
  name,
  matchIds: [...focalMatchIds.slice(0, shared), ...ids(`${name}-own`, theirs - shared)],
});

const byName = (rows) => Object.fromEntries(rows.map((row) => [row.name, row]));

test("separates a party mate from fill on measured overlap", () => {
  // Numbers captured 2026-09-09 from steam/Satel14: the two mates the player
  // actually queues with sit at 69% and 86% of their own history, and every
  // one-off squad-mate lands under 5%. Nothing real falls in between.
  const rows = byName(
    buildPartyOverlap({
      focalMatchIds,
      mates: [
        mate("evheeen", 66, 77),
        mate("vacapaupau", 56, 81),
        mate("SluagherHFM", 2, 90),
        mate("Bandit", 4, 122),
        mate("A310RA", 1, 116),
      ],
    })
  );

  assert.deepEqual(
    [rows.evheeen.sharePct, rows.evheeen.sharedMatches, rows.evheeen.theirMatches, rows.evheeen.isParty],
    [85.7, 66, 77, true]
  );
  assert.deepEqual([rows.vacapaupau.sharePct, rows.vacapaupau.isParty], [69.1, true]);
  assert.deepEqual([rows.SluagherHFM.sharePct, rows.SluagherHFM.isParty], [2.2, false]);
  assert.deepEqual([rows.Bandit.sharePct, rows.Bandit.isParty], [3.3, false]);
  assert.deepEqual([rows.A310RA.sharePct, rows.A310RA.isParty], [0.9, false]);
});

test("holds the threshold exactly where it is set", () => {
  assert.equal(PARTY_MIN_SHARED, 2);
  assert.equal(PARTY_MIN_SHARE_PCT, 15);

  const rows = byName(
    buildPartyOverlap({
      focalMatchIds,
      mates: [mate("atThreshold", 3, 20), mate("belowThreshold", 2, 14)],
    })
  );

  assert.deepEqual([rows.atThreshold.sharePct, rows.atThreshold.isParty], [15, true]);
  assert.deepEqual([rows.belowThreshold.sharePct, rows.belowThreshold.isParty], [14.3, false]);
});

test("a thin history cannot buy the badge with a single shared match", () => {
  // A fresh account with three matches, one of them ours, is 33% -- the share
  // alone would call that a party. Two shared matches is the floor.
  const rows = byName(
    buildPartyOverlap({
      focalMatchIds,
      mates: [mate("newcomer", 1, 3), mate("twoNights", 2, 3)],
    })
  );

  assert.deepEqual([rows.newcomer.sharePct, rows.newcomer.isParty], [33.3, false]);
  assert.deepEqual([rows.twoNights.sharePct, rows.twoNights.isParty], [66.7, true]);
});

test("a mate with no history of their own divides by nothing", () => {
  const [row] = buildPartyOverlap({
    focalMatchIds,
    mates: [{ accountId: "account.blank", name: "Blank", matchIds: [] }],
  });

  assert.deepEqual([row.sharedMatches, row.theirMatches, row.sharePct, row.isParty], [0, 0, 0, false]);
});

test("counts each match once however often an id repeats", () => {
  const repeated = { accountId: "account.dupe", name: "Dupe", matchIds: ["mine-0", "mine-0", "mine-1", "own"] };
  const [row] = buildPartyOverlap({ focalMatchIds: [...focalMatchIds, "mine-0"], mates: [repeated] });

  assert.equal(row.sharedMatches, 2);
  assert.equal(row.theirMatches, 3);
});

test("no focal history means no verdict for anyone", () => {
  const rows = buildPartyOverlap({ focalMatchIds: [], mates: [mate("evheeen", 66, 77)] });
  assert.deepEqual([rows[0].sharedMatches, rows[0].sharePct, rows[0].isParty], [0, 0, false]);
});

test("orders by shared matches, then by share, then by name", () => {
  const rows = buildPartyOverlap({
    focalMatchIds,
    mates: [mate("fill", 1, 116), mate("regular", 56, 81), mate("closest", 66, 77), mate("tied", 56, 200)],
  });

  assert.deepEqual(rows.map((row) => row.name), ["closest", "regular", "tied", "fill"]);
});

test("survives a missing or malformed mate list", () => {
  assert.deepEqual(buildPartyOverlap({}), []);
  assert.deepEqual(buildPartyOverlap({ focalMatchIds, mates: null }), []);
  assert.deepEqual(buildPartyOverlap({ focalMatchIds, mates: [null, undefined] }), []);
});
