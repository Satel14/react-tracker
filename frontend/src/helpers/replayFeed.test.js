import { describe, it, expect } from "vitest";
import { buildFeedEvents, feedAt, FEED } from "./replayFeed";

// One team of two and one enemy, the shape decodeReplay hands over.
const players = [
  { accountId: "account.me", name: "Me", teamId: 1, isFocal: true },
  { accountId: "account.mate", name: "Mate", teamId: 1, isFocal: true },
  { accountId: "account.foe", name: "Foe", teamId: 22, isFocal: false },
];

const kill = (over = {}) => ({
  t: 100,
  killer: "Me",
  victim: "Foe",
  killerAccountId: "account.me",
  victimAccountId: "account.foe",
  killerTeamId: 1,
  victimTeamId: 22,
  w: "AUG",
  dist: 87,
  ...over,
});

const knock = (over = {}) => ({
  t: 90,
  a: "account.me",
  v: "account.foe",
  w: "M416",
  dist: 40,
  id: 7,
  ...over,
});

describe("buildFeedEvents", () => {
  it("makes one line per kill and one per knock, oldest first", () => {
    const events = buildFeedEvents([kill()], [knock()], players);

    expect(events.map((e) => [e.t, e.kind])).toEqual([[90, "knock"], [100, "kill"]]);
  });

  it("resolves a knock's account ids, which are all it carries", () => {
    const [line] = buildFeedEvents([], [knock()], players);

    expect(line.killer).toEqual({ name: "Me", teamId: 1, isFocal: true });
    expect(line.victim).toEqual({ name: "Foe", teamId: 22, isFocal: false });
    expect(line.weapon).toBe("M416");
    expect(line.dist).toBe(40);
  });

  it("takes a kill's own names over the roster, since it carries them", () => {
    // A player who left before the match start event was recorded is in the
    // kill record and not in the roster; the line still has to read.
    const [line] = buildFeedEvents(
      [kill({ killer: "Ghost", killerAccountId: "account.ghost", killerTeamId: 9 })],
      [],
      players,
    );

    expect(line.killer).toEqual({ name: "Ghost", teamId: 9, isFocal: false });
  });

  it("gives a death nobody caused no killer side", () => {
    const [line] = buildFeedEvents(
      [kill({ killer: null, killerAccountId: null, killerTeamId: null, w: "Blue Zone", dist: null })],
      [],
      players,
    );

    expect(line.killer).toBeNull();
    expect(line.weapon).toBe("Blue Zone");
    expect(line.victim.name).toBe("Foe");
  });

  it("drops a line it cannot name a victim for, rather than rendering a blank one", () => {
    const events = buildFeedEvents(
      [kill({ victim: null, victimAccountId: "account.nobody" })],
      [knock({ v: "account.nobody" })],
      players,
    );

    expect(events).toEqual([]);
  });

  it("keeps a knock and the kill that finished it as two lines", () => {
    const events = buildFeedEvents([kill()], [knock()], players);

    expect(events).toHaveLength(2);
    expect(events[0].id).not.toBe(events[1].id);
  });

  it("survives a payload with nothing in it", () => {
    for (const args of [[null, null, null], [undefined, undefined, players], [[], [], []]]) {
      expect(buildFeedEvents(...args)).toEqual([]);
    }
  });
});

describe("feedAt", () => {
  const events = buildFeedEvents(
    [kill({ t: 100 }), kill({ t: 130, victim: "Mate", victimAccountId: "account.mate", victimTeamId: 1 })],
    [knock({ t: 90 }), knock({ t: 20 })],
    players,
  );

  it("shows nothing before the first event", () => {
    expect(feedAt(events, 0)).toEqual([]);
  });

  it("shows only what has already happened, newest first", () => {
    expect(feedAt(events, 95).map((e) => e.t)).toEqual([90]);
    // The kill at 130 has not happened yet at 100, and the knock at 90 has
    // already aged out of the 8 second window by then.
    expect(feedAt(events, 100).map((e) => e.t)).toEqual([100]);
    expect(feedAt(events, 100, { window: 20 }).map((e) => e.t)).toEqual([100, 90]);
  });

  it("lets a line age out of the window", () => {
    // 90 is still inside an 8 second window at 97 and outside it at 99.
    expect(feedAt(events, 97).map((e) => e.t)).toEqual([90]);
    expect(feedAt(events, 99)).toEqual([]);
  });

  it("keeps the newest when more happen at once than fit", () => {
    const burst = buildFeedEvents(
      Array.from({ length: 9 }, (_, i) => kill({ t: 200 + i * 0.1 })),
      [],
      players,
    );
    const shown = feedAt(burst, 201);

    expect(shown).toHaveLength(FEED.cap);
    expect(shown[0].t).toBeCloseTo(200.8, 5);
  });

  it("answers the same for a time whether or not it was asked a later one first", () => {
    // The whole reason this is a function of t rather than a swept cursor:
    // scrubbing backwards has nothing to reset.
    const forward = feedAt(events, 95);
    feedAt(events, 400);
    expect(feedAt(events, 95)).toEqual(forward);
  });

  it("takes a window and a cap from the caller when it is given them", () => {
    // 45 reaches the knock at 90 and stops short of the one at 20, which is 110
    // seconds behind the playhead.
    expect(feedAt(events, 130, { window: 45 }).map((e) => e.t)).toEqual([130, 100, 90]);
    expect(feedAt(events, 130, { window: 45, cap: 2 }).map((e) => e.t)).toEqual([130, 100]);
    expect(feedAt(events, 130, { window: 120 }).map((e) => e.t)).toEqual([130, 100, 90, 20]);
  });
});
