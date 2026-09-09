const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseMatchRegion, readMatchContext } = require("./matchContext");

// Real LogMatchDefinition.MatchId strings, captured 2026-09-09 by range-reading
// the head of five telemetry files (/samples plus one ranked match of our own).
// The API's own match record carries no region field at all, which is why this
// string is the only source for one.
const REAL_MATCH_IDS = [
  ["match.bro.competitive.pc-2018-42.steam.squad-fpp.eu.2026.09.08.21.35a745ff-0450-40d8-9eb9-bd99755a41c0", "eu"],
  ["match.bro.official.pc-2018-42.steam.duo-fpp.as.2026.09.07.22.cf9a89ab-e55b-4721-a71f-3e3ccf77064c", "as"],
  ["match.bro.airoyale.pc-2018-42.steam.squad.as.2026.09.08.06.3c71d8f2-d39b-42dd-9287-493846867784", "as"],
  ["match.bro.trainingroom.pc-2018-42.steam.clansolo.as.2026.09.08.14.8117317c-553d-4b9c-8417-89279fa0fa62", "as"],
  ["match.bro.tutorialatoz.pc-2018-42.steam.solo.ru.2026.09.08.19.82af2244-aa8d-49b0-9e8d-ba7359c4cf9e", "ru"],
];

test("reads the region out of every real match id shape", () => {
  REAL_MATCH_IDS.forEach(([matchId, region]) => {
    assert.equal(parseMatchRegion(matchId), region, matchId);
  });
});

test("reads the region positionally, so an unseen region or mode still resolves", () => {
  // The token before the date is the region whatever sits around it: match type,
  // game mode and platform all vary, and the region list is not ours to know.
  assert.equal(
    parseMatchRegion("match.bro.official.pc-2018-43.psn.squad.krjp.2026.10.01.03.abc"),
    "krjp",
  );
  assert.equal(
    parseMatchRegion("match.bro.event.pc-2018-42.kakao.esports-squad-fpp.sea.2026.09.08.11.abc"),
    "sea",
  );
});

test("refuses to guess when the string is not a match id", () => {
  [
    "",
    null,
    undefined,
    42,
    "not-a-match-id",
    "match.bro.official",
    // No date, so nothing marks where the region sits.
    "match.bro.official.pc-2018-42.steam.squad-fpp.eu",
    // A digit run is a date, never a region.
    "match.bro.official.pc-2018-42.steam.squad-fpp.2026.09.08.21.abc",
  ].forEach((value) => {
    assert.equal(parseMatchRegion(value), null, JSON.stringify(value));
  });
});

test("readMatchContext takes the region from the definition and the weather from the start", () => {
  const context = readMatchContext([
    { _T: "LogMatchDefinition", MatchId: REAL_MATCH_IDS[0][0], PingQuality: "" },
    { _T: "LogMatchStart", mapName: "Tiger_Main", weatherId: "Clear", teamSize: 4 },
    { _T: "LogPlayerPosition" },
  ]);

  assert.deepEqual(context, { region: "eu", weather: "Clear" });
});

test("readMatchContext reports null for whatever the telemetry omits", () => {
  assert.deepEqual(readMatchContext([{ _T: "LogMatchStart", weatherId: "Overcast" }]), {
    region: null,
    weather: "Overcast",
  });
  assert.deepEqual(readMatchContext([{ _T: "LogMatchDefinition", MatchId: REAL_MATCH_IDS[1][0] }]), {
    region: "as",
    weather: null,
  });
  assert.deepEqual(readMatchContext([{ _T: "LogMatchStart", weatherId: "" }]), {
    region: null,
    weather: null,
  });
  assert.deepEqual(readMatchContext([]), { region: null, weather: null });
  assert.deepEqual(readMatchContext(null), { region: null, weather: null });
});

test("readMatchContext stops reading once it holds both values", () => {
  // A real telemetry file is ~39 000 events and both of these sit at the top, so
  // the scan must not walk the whole array to find what it already has.
  let visited = 0;
  const events = [
    { _T: "LogMatchDefinition", MatchId: REAL_MATCH_IDS[0][0] },
    { _T: "LogMatchStart", weatherId: "Clear" },
    ...Array.from({ length: 50 }, () => ({ _T: "LogPlayerPosition" })),
  ];
  const watched = events.map((event) => ({
    get _T() {
      visited += 1;
      return event._T;
    },
    MatchId: event.MatchId,
    weatherId: event.weatherId,
  }));

  readMatchContext(watched);
  assert.equal(visited, 2);
});
