const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseReplayTelemetry } = require("./getMatchReplay");
const { decodePositions } = require("./replay/positions");

// Positions ship as delta-coded columns since format 2; decoding here keeps
// these assertions about the parser, not about the wire encoding.
const posOf = (player) => decodePositions(player.positions);

const matchAttributes = { mapName: "Baltic_Main", duration: 100, createdAt: "2026-01-01T00:00:00.000Z" };

const telemetry = [
  { _T: "LogMatchStart", characters: [
    { character: { accountId: "account.me", name: "Me", teamId: 1 } },
    { character: { accountId: "account.mate", name: "Mate", teamId: 1 } },
    { character: { accountId: "account.foe", name: "Foe", teamId: 2 } },
  ] },
  { _T: "LogPlayerPosition", common: { isGame: 0 }, elapsedTime: 0, character: { accountId: "account.me", name: "Me", teamId: 1, location: { x: 100000, y: 100000, z: 0 } } },
  { _T: "LogPlayerPosition", common: { isGame: 1 }, elapsedTime: 10, character: { accountId: "account.me", name: "Me", teamId: 1, location: { x: 400000, y: 400000, z: 0 } } },
  { _T: "LogPlayerPosition", common: { isGame: 1 }, elapsedTime: 20, character: { accountId: "account.me", name: "Me", teamId: 1, location: { x: 500000, y: 500000, z: 0 } } },
  { _T: "LogPlayerPosition", common: { isGame: 1 }, elapsedTime: 10, character: { accountId: "account.mate", name: "Mate", teamId: 1, location: { x: 405000, y: 405000, z: 0 } } },
  { _T: "LogPlayerPosition", common: { isGame: 1 }, elapsedTime: 10, character: { accountId: "account.foe", name: "Foe", teamId: 2, location: { x: 410000, y: 410000, z: 0 } } },
  { _T: "LogPlayerKillV2", elapsedTime: 15, killerDamageInfo: { damageCauserName: "WeapAUG_C", distance: 8700, damageReason: "TorsoShot" }, killer: { accountId: "account.me", name: "Me", teamId: 1, location: { x: 450000, y: 450000, z: 0 } }, victim: { accountId: "account.foe", name: "Foe", teamId: 2, location: { x: 460000, y: 460000, z: 0 } } },
  { _T: "LogGameStatePeriodic", elapsedTime: 0, gameState: { safetyZonePosition: { x: 400000, y: 400000, z: 0 }, safetyZoneRadius: 0, poisonGasWarningPosition: { x: 400000, y: 400000, z: 0 }, poisonGasWarningRadius: 0 } },
  { _T: "LogGameStatePeriodic", elapsedTime: 10, gameState: { safetyZonePosition: { x: 400000, y: 400000, z: 0 }, safetyZoneRadius: 300000, poisonGasWarningPosition: { x: 420000, y: 420000, z: 0 }, poisonGasWarningRadius: 200000 } },
  { _T: "LogGameStatePeriodic", elapsedTime: 20, gameState: { safetyZonePosition: { x: 410000, y: 410000, z: 0 }, safetyZoneRadius: 250000, poisonGasWarningPosition: { x: 420000, y: 420000, z: 0 }, poisonGasWarningRadius: 200000 } },
];

test("groups positions per player, sorted by t, dropping lobby (isGame<0.1)", () => {
  const r = parseReplayTelemetry(telemetry, { matchAttributes, accountId: "account.me" });
  const me = r.players.find((p) => p.accountId === "account.me");
  assert.deepEqual(posOf(me).map((p) => p.t), [10, 20]); // the isGame:0 sample at t=0 dropped
  assert.equal(posOf(me)[0].x, 4000); // 400000/100
});

test("extracts kills with scaled locations and sets victim deathTime", () => {
  const r = parseReplayTelemetry(telemetry, { matchAttributes, accountId: "account.me" });
  assert.equal(r.kills.length, 1);
  assert.equal(r.kills[0].killer, "Me");
  assert.equal(r.kills[0].vx, 4600);
  const foe = r.players.find((p) => p.accountId === "account.foe");
  assert.equal(foe.deathTime, 15);
});

test("marks focal player and teammates via isFocal", () => {
  const r = parseReplayTelemetry(telemetry, { matchAttributes, accountId: "account.me" });
  assert.equal(r.players.find((p) => p.accountId === "account.me").isFocal, true);
  assert.equal(r.players.find((p) => p.accountId === "account.foe").isFocal, false);
  assert.equal(r.players.find((p) => p.accountId === "account.mate").isFocal, true);
  assert.equal(r.mapMax, 8160);
  assert.equal(r.mapName, "Erangel");
});

test("parses LogGameStatePeriodic into a zones timeline, skipping pre-game zero-radius samples", () => {
  const r = parseReplayTelemetry(telemetry, { matchAttributes, accountId: "account.me" });
  assert.equal(r.zones.length, 2); // the radius-0 t=0 sample is skipped
  assert.deepEqual(r.zones.map((z) => z.t), [10, 20]);
  assert.equal(r.zones[0].bx, 4000); // 400000 / 100
  assert.equal(r.zones[0].br, 3000); // 300000 / 100
  assert.equal(r.zones[0].wx, 4200);
  assert.equal(r.zones[0].wr, 2000);
  assert.equal(r.zones[1].bx, 4100); // 410000 / 100
  assert.equal(r.zones[1].by, 4100); // 410000 / 100
  assert.equal(r.zones[1].br, 2500); // 250000 / 100
  assert.equal(r.zones[1].wr, 2000); // 200000 / 100
});

test("kills carry killer and victim identity, not just names", () => {
  const r = parseReplayTelemetry(telemetry, { matchAttributes, accountId: "account.me" });
  assert.equal(r.kills[0].killerAccountId, "account.me");
  assert.equal(r.kills[0].victimAccountId, "account.foe");
  assert.equal(r.kills[0].killerTeamId, 1);
  assert.equal(r.kills[0].victimTeamId, 2);
});

test("echoes the resolved focal identity and the roster totals", () => {
  const r = parseReplayTelemetry(telemetry, { matchAttributes, accountId: "account.me" });
  assert.equal(r.focalAccountId, "account.me");
  assert.equal(r.focalTeamId, 1);
  assert.equal(r.totalPlayers, 3);
  assert.equal(r.totalTeams, 2);
});

test("reports a missing focal player instead of silently marking everyone an enemy", () => {
  const r = parseReplayTelemetry(telemetry, { matchAttributes, playerName: "SomeoneElse" });
  assert.equal(r.focalAccountId, null);
  assert.equal(r.focalTeamId, null);
  assert.equal(r.players.every((p) => p.isFocal === false), true);
});

test("keeps roster players who emitted no position samples", () => {
  const trimmed = telemetry.filter((ev) => !(ev._T === "LogPlayerPosition" && ev.character.accountId === "account.mate"));
  const r = parseReplayTelemetry(trimmed, { matchAttributes, accountId: "account.me" });
  const mate = r.players.find((p) => p.accountId === "account.mate");
  assert.ok(mate, "roster-only player must still appear");
  assert.deepEqual(posOf(mate), []);
});

test("keeps a kill whose killer location is unreadable", () => {
  const withBlueZoneDeath = [...telemetry, {
    _T: "LogPlayerKillV2", elapsedTime: 40,
    killer: null, finisher: null,
    victim: { accountId: "account.mate", name: "Mate", teamId: 1, location: { x: 700000, y: 700000, z: 0 } },
  }];
  const r = parseReplayTelemetry(withBlueZoneDeath, { matchAttributes, accountId: "account.me" });
  const death = r.kills.find((k) => k.victimAccountId === "account.mate");
  assert.ok(death, "a killerless death must still be recorded");
  assert.equal(death.kx, null);
  assert.equal(death.vx, 7000);
  assert.equal(r.players.find((p) => p.accountId === "account.mate").deathTime, 40);
});

test("dedupes duplicate position samples at the same t", () => {
  const dup = telemetry.find((ev) => ev._T === "LogPlayerPosition" && ev.elapsedTime === 10 && ev.character.accountId === "account.me");
  const r = parseReplayTelemetry([...telemetry, { ...dup }], { matchAttributes, accountId: "account.me" });
  const me = r.players.find((p) => p.accountId === "account.me");
  assert.deepEqual(posOf(me).map((p) => p.t), [10, 20]);
});

const aircraftExit = (accountId, name, teamId, t) => ({
  _T: "LogVehicleLeave", elapsedTime: t,
  character: { accountId, name, teamId, location: { x: 300000, y: 300000, z: 120000 } },
  vehicle: { vehicleType: "TransportAircraft", vehicleId: "DummyTransportAircraft_C", location: { x: 300000, y: 300000, z: 150000 } },
});

test("sets dropTime from the aircraft exit", () => {
  const r = parseReplayTelemetry([...telemetry, aircraftExit("account.me", "Me", 1, 42)], { matchAttributes, accountId: "account.me" });
  assert.equal(r.players.find((p) => p.accountId === "account.me").dropTime, 42);
  assert.equal(r.players.find((p) => p.accountId === "account.foe").dropTime, null);
});

test("ignores the Recall helicopter when setting dropTime", () => {
  const recall = {
    _T: "LogVehicleLeave", elapsedTime: 900,
    character: { accountId: "account.me", name: "Me", teamId: 1, location: { x: 500000, y: 500000, z: 90000 } },
    vehicle: { vehicleType: "TransportAircraft", vehicleId: "RedeployAircraft_Tiger_C", location: { x: 500000, y: 500000, z: 100000 } },
  };
  const r = parseReplayTelemetry([...telemetry, aircraftExit("account.me", "Me", 1, 42), recall], { matchAttributes, accountId: "account.me" });
  assert.equal(r.players.find((p) => p.accountId === "account.me").dropTime, 42);
});

test("keeps the earliest aircraft exit if the event repeats", () => {
  const r = parseReplayTelemetry(
    [...telemetry, aircraftExit("account.me", "Me", 1, 55), aircraftExit("account.me", "Me", 1, 42)],
    { matchAttributes, accountId: "account.me" }
  );
  assert.equal(r.players.find((p) => p.accountId === "account.me").dropTime, 42);
});

test("assigns a phase index that changes only when the warning circle jumps", () => {
  const gs = (t, wx, wy, wr) => ({
    _T: "LogGameStatePeriodic", elapsedTime: t,
    gameState: {
      elapsedTime: t,
      safetyZonePosition: { x: 400000, y: 400000, z: 0 }, safetyZoneRadius: 300000,
      poisonGasWarningPosition: { x: wx, y: wy, z: 0 }, poisonGasWarningRadius: wr,
    },
  });
  const r = parseReplayTelemetry([
    telemetry[0],
    gs(10, 400000, 400000, 0),        // no warning yet
    gs(20, 420000, 420000, 200000),   // first warning appears
    gs(30, 420000, 420000, 200000),   // unchanged
    gs(40, 460000, 430000, 120000),   // new phase
    gs(50, 460000, 430000, 120000),   // unchanged
  ], { matchAttributes, accountId: "account.me" });

  assert.deepEqual(r.zones.map((z) => z.t), [10, 20, 30, 40, 50]);
  assert.deepEqual(r.zones.map((z) => z.phase), [0, 1, 1, 2, 2]);
});

// --- format 5 payload wiring ---------------------------------------------

test("stamps the wire format so a stale cached payload is detectable", () => {
  const r = parseReplayTelemetry(telemetry, { matchAttributes, accountId: "account.me" });
  assert.equal(r.format, 5);
});

test("ships every new layer as an array, never undefined", () => {
  const r = parseReplayTelemetry(telemetry, { matchAttributes, accountId: "account.me" });
  for (const key of ["landings", "knocks", "revives", "packages", "specialZones", "phases"]) {
    assert.ok(Array.isArray(r[key]), `${key} must be an array`);
  }
  // shots and damage are column-oriented: parallel arrays, each set all the
  // same length as the others in its own layer.
  for (const [layer, keys] of [[r.shots, ["t", "a", "v", "ax", "ay", "vx", "vy"]],
    [r.damage, ["t", "a", "v", "d"]]]) {
    const lengths = keys.map((k) => layer[k].length);
    assert.equal(new Set(lengths).size, 1);
  }
});

test("reports the in-game end time, which is not the wall-clock duration", () => {
  const r = parseReplayTelemetry(telemetry, { matchAttributes, accountId: "account.me" });
  // Last position is t=20, last zone t=20; duration says 100 wall seconds.
  assert.equal(r.endTime, 20);
  assert.equal(r.duration, 100);
});

test("carries health and the vehicle/DBNO flags on decoded samples", () => {
  const withState = telemetry.map((ev) =>
    ev._T === "LogPlayerPosition" && ev.character.accountId === "account.me" && ev.elapsedTime === 20
      ? { ...ev, character: { ...ev.character, health: 42.4, isInVehicle: true, isDBNO: true } }
      : ev,
  );
  const r = parseReplayTelemetry(withState, { matchAttributes, accountId: "account.me" });
  const samples = posOf(r.players.find((p) => p.accountId === "account.me"));
  assert.equal(samples[0].h, 100); // no health on the fixture sample -> unhurt
  assert.equal(samples[0].f, 0);
  assert.equal(samples[1].h, 42); // rounded
  assert.equal(samples[1].f, 3); // in vehicle | knocked
});

test("derives the flight line from the two aircraft exits", () => {
  const withPlane = [
    ...telemetry,
    { _T: "LogVehicleLeave", elapsedTime: 5, character: { accountId: "account.me", name: "Me", teamId: 1, location: { x: 100000, y: 100000, z: 150000 } },
      vehicle: { vehicleId: "DummyTransportAircraft_C", velocity: 14180, location: { x: 100000, y: 100000, z: 150000 } } },
    { _T: "LogVehicleLeave", elapsedTime: 9, character: { accountId: "account.foe", name: "Foe", teamId: 2, location: { x: 700000, y: 300000, z: 150000 } },
      vehicle: { vehicleId: "DummyTransportAircraft_C", velocity: 14180, location: { x: 700000, y: 300000, z: 150000 } } },
  ];
  const r = parseReplayTelemetry(withPlane, { matchAttributes, accountId: "account.me" });
  assert.deepEqual(r.flight, { x1: 1000, y1: 1000, t1: 5, x2: 7000, y2: 3000, t2: 9, speed: 142 });
});

test("has no flight line when nobody left the aircraft", () => {
  const r = parseReplayTelemetry(telemetry, { matchAttributes, accountId: "account.me" });
  assert.equal(r.flight, null);
});

test("classifies the vehicle a player is riding, and when they are under canopy", () => {
  const ride = (id, type, t) => ({
    _T: "LogPlayerPosition", common: { isGame: 1 }, elapsedTime: t,
    character: { accountId: "account.me", name: "Me", teamId: 1, location: { x: 400000, y: 400000, z: 0 } },
    vehicle: { vehicleId: id, vehicleType: type },
  });
  const withRides = [
    telemetry[0],
    ride("BP_Motorbike_04_C", "WheeledVehicle", 10),
    ride("BP_PickupTruck_A_01_C", "WheeledVehicle", 20),
    ride("Boat_PG117_C", "FloatingVehicle", 30),
    ride("BP_Mirado_A_03_C", "WheeledVehicle", 40),
    ride("DummyTransportAircraft_C", "TransportAircraft", 50),
    ride("BP_EmergencyPickupVehicle_C", "EmergencyPickup", 60),
  ];
  const r = parseReplayTelemetry(withRides, { matchAttributes, accountId: "account.me" });
  const kinds = posOf(r.players.find((p) => p.accountId === "account.me")).map((s) => (s.f >> 2) & 7);
  // bike, truck, boat, car, plane, balloon -- the six the map draws apart.
  assert.deepEqual(kinds, [3, 4, 5, 0, 1, 2]);
});

test("reports when each player stopped falling, so the map can draw a canopy", () => {
  const withDrop = [
    ...telemetry,
    { _T: "LogVehicleLeave", elapsedTime: 5,
      character: { accountId: "account.me", name: "Me", teamId: 1, location: { x: 100000, y: 100000, z: 150000 } },
      vehicle: { vehicleId: "DummyTransportAircraft_C", velocity: 14180, location: { x: 100000, y: 100000, z: 150000 } } },
    { _T: "LogParachuteLanding", elapsedTime: 42, distance: 300,
      character: { accountId: "account.me", name: "Me", teamId: 1, location: { x: 400000, y: 400000, z: 0 } } },
  ];
  const r = parseReplayTelemetry(withDrop, { matchAttributes, accountId: "account.me" });
  const me = r.players.find((p) => p.accountId === "account.me");
  assert.equal(me.dropTime, 5);
  assert.equal(me.landTime, 42);
  // A player who never jumped has neither, rather than a misleading zero.
  const mate = r.players.find((p) => p.accountId === "account.mate");
  assert.equal(mate.landTime, null);
});

// The kill feed shows what killed whom with what, so the weapon has to reach
// the payload. It is resolved the way getMatchAnalysis already resolves it --
// killerDamageInfo, then finishDamageInfo, then the event -- and prettified
// through weaponMeta, because the raw "WeapAUG_C" is not a thing to show a
// reader and the frontend has no copy of that table.
test("a kill carries the weapon it was made with and the range it was made at", () => {
  const r = parseReplayTelemetry(telemetry, { matchAttributes, accountId: "account.me" });
  assert.equal(r.kills[0].w, "AUG");
  assert.equal(r.kills[0].dist, 87); // centimetres in the telemetry, metres here
  assert.equal(r.kills[0].r, "TorsoShot");
  // The feed draws the weapon as a silhouette, so the record says which one.
  // Classified here, not on the client, for the same reason the name is.
  assert.equal(r.kills[0].wi, "ar");
  // The game's own icon for that exact gun; wi is only the fallback.
  assert.equal(r.kills[0].wk, "aug_a3");
});

// The blue zone, a fall and the red zone all kill with nobody credited. A feed
// that invented a killer for those would report something that did not happen,
// so the killer stays null and what did it goes in the same field a weapon
// would -- which is how the game writes those lines too.
test("a kill nobody made names what did it and credits no killer", () => {
  const zoneDeath = [
    { _T: "LogMatchStart", characters: [
      { character: { accountId: "account.me", name: "Me", teamId: 1 } },
      { character: { accountId: "account.foe", name: "Foe", teamId: 2 } },
    ] },
    { _T: "LogPlayerPosition", common: { isGame: 1 }, elapsedTime: 10, character: { accountId: "account.me", name: "Me", teamId: 1, location: { x: 400000, y: 400000, z: 0 } } },
    { _T: "LogPlayerKillV2", elapsedTime: 30, killer: null, finisher: null, dBNOMaker: null,
      finishDamageInfo: { damageCauserName: "BlueZone", damageTypeCategory: "Damage_BlueZone" },
      victim: { accountId: "account.foe", name: "Foe", teamId: 2, location: { x: 460000, y: 460000, z: 0 } } },
  ];
  const r = parseReplayTelemetry(zoneDeath, { matchAttributes, accountId: "account.me" });

  assert.equal(r.kills.length, 1);
  assert.equal(r.kills[0].killer, null);
  assert.equal(r.kills[0].killerAccountId, null);
  assert.equal(r.kills[0].w, "Blue Zone");
  // Nothing shot them, so there is no silhouette to draw either.
  assert.equal(r.kills[0].wi, null);
});

// A vehicle is a legitimate killer and reads as one -- the feed says a car did
// it rather than falling back to the victim's own name or to nothing.
test("a roadkill names the vehicle", () => {
  const roadkill = [
    { _T: "LogMatchStart", characters: [
      { character: { accountId: "account.me", name: "Me", teamId: 1 } },
      { character: { accountId: "account.foe", name: "Foe", teamId: 2 } },
    ] },
    { _T: "LogPlayerPosition", common: { isGame: 1 }, elapsedTime: 10, character: { accountId: "account.me", name: "Me", teamId: 1, location: { x: 400000, y: 400000, z: 0 } } },
    { _T: "LogPlayerKillV2", elapsedTime: 20,
      killerDamageInfo: { damageCauserName: "BP_CoupeRB_C", distance: 0 },
      killer: { accountId: "account.me", name: "Me", teamId: 1, location: { x: 455000, y: 455000, z: 0 } },
      victim: { accountId: "account.foe", name: "Foe", teamId: 2, location: { x: 456000, y: 456000, z: 0 } } },
  ];
  const r = parseReplayTelemetry(roadkill, { matchAttributes, accountId: "account.me" });

  assert.equal(r.kills[0].w, "Coupe RB");
  assert.equal(r.kills[0].wi, "vehicle");
  assert.equal(r.kills[0].wk, null);
});

// A bleed-out carries three damage blocks: killerDamageInfo present but blank,
// finishDamageInfo naming the pawn that stopped ticking, and dBNODamageInfo
// naming what actually did it. Picking the first block that EXISTS lands on
// the blank one and the kill loses its cause entirely; picking the first that
// names a causer, knock before finish, is what the game's own feed shows.
test("reads through a blank damage block to the one that names the cause", () => {
  const bleedOut = [
    { _T: "LogMatchStart", characters: [
      { character: { accountId: "account.me", name: "Me", teamId: 1 } },
      { character: { accountId: "account.foe", name: "Foe", teamId: 2 } },
    ] },
    { _T: "LogPlayerPosition", common: { isGame: 1 }, elapsedTime: 10, character: { accountId: "account.me", name: "Me", teamId: 1, location: { x: 400000, y: 400000, z: 0 } } },
    { _T: "LogPlayerKillV2", elapsedTime: 30, killer: null,
      killerDamageInfo: { damageCauserName: "", damageReason: "", distance: -1 },
      finishDamageInfo: { damageCauserName: "UltAIPawn_Base_Female_C", damageTypeCategory: "Damage_DBNO" },
      dBNODamageInfo: { damageCauserName: "ProjGrenade_C", damageReason: "NonSpecific", distance: 1500 },
      victim: { accountId: "account.foe", name: "Foe", teamId: 2, location: { x: 460000, y: 460000, z: 0 } } },
  ];
  const r = parseReplayTelemetry(bleedOut, { matchAttributes, accountId: "account.me" });

  assert.equal(r.kills[0].w, "Frag Grenade");
  assert.equal(r.kills[0].wk, "grenade");
  assert.equal(r.kills[0].dist, 15);
});

// Raw asset names must not reach a reader. Found by running every causer in a
// real match through the chain: the red zone came out "Red Zone Bombing Field
// Def", and the pawn behind fall damage as "Ult AIPawn Base Male".
test("names the things that kill without being weapons", () => {
  const { telemetryWeaponName } = require("./weaponMeta");
  assert.equal(telemetryWeaponName("RedZoneBombingField_Def_C"), "Red Zone");
  assert.equal(telemetryWeaponName("BlueZone"), "Blue Zone");
  assert.equal(telemetryWeaponName("Bluezone"), "Blue Zone");
  assert.equal(telemetryWeaponName("UltAIPawn_Base_Male_C"), "Falling");
  assert.equal(telemetryWeaponName("UltAIPawn_Base_Female_C"), "Falling");
  assert.equal(telemetryWeaponName("PlayerMale_A_C"), "Fists");
  assert.equal(telemetryWeaponName("PlayerFemale_A_C"), "Fists");
  assert.equal(telemetryWeaponName("ProjMolotov_DamageField_C"), "Molotov");
  // Guns are untouched by any of this.
  assert.equal(telemetryWeaponName("WeapAUG_C"), "AUG");
});

// --- format 5: the damage layer ------------------------------------------

test("ships every point of health that came off a player", () => {
  const withDamage = [
    ...telemetry,
    { _T: "LogPlayerTakeDamage", elapsedTime: 12, damage: 21.6, damageTypeCategory: "Damage_Gun",
      attacker: { accountId: "account.me" }, victim: { accountId: "account.foe" } },
    { _T: "LogPlayerTakeDamage", elapsedTime: 18, damage: 4, damageTypeCategory: "Damage_BlueZone",
      attacker: null, victim: { accountId: "account.mate" } },
  ];
  const r = parseReplayTelemetry(withDamage, { matchAttributes, accountId: "account.me" });
  const at = (i) => ({ t: r.damage.t[i], a: r.damage.a[i], v: r.damage.v[i], d: r.damage.d[i] });

  assert.equal(r.damage.t.length, 2);
  // Indices into r.players, not account ids.
  const me = r.players.findIndex((p) => p.accountId === "account.me");
  const foe = r.players.findIndex((p) => p.accountId === "account.foe");
  const mate = r.players.findIndex((p) => p.accountId === "account.mate");
  assert.deepEqual(at(0), { t: 12, a: me, v: foe, d: 22 });
  // The zone has nobody to credit, and that is a -1 rather than a missing row:
  // the number still comes off the victim's health.
  assert.deepEqual(at(1), { t: 18, a: -1, v: mate, d: 4 });
});

test("stops shipping a per-shot damage column now that damage has its own layer", () => {
  // Nothing ever read shots[].dmg -- it was decoded on the client and dropped.
  // Two sources for one number is how they drift, and the damage layer is the
  // one that covers the zone and a fall as well as a bullet.
  const r = parseReplayTelemetry(telemetry, { matchAttributes, accountId: "account.me" });
  assert.equal(r.shots.dmg, undefined);
});

// Raw asset names must not reach a reader. Found in the feed: a blue-zone
// death that read "Tsl Game Mode Base Battle Royale BP".
test("names the blue zone the same whichever of its two names the game used", () => {
  const { telemetryWeaponName } = require("./weaponMeta");
  assert.equal(telemetryWeaponName("TslGameModeBase_BattleRoyaleBP_C"), "Blue Zone");
  assert.equal(telemetryWeaponName("BlueZone"), "Blue Zone");
});

test("refuses to invent a name out of an asset it does not recognise", () => {
  // The catch-all that stops the next one of these reaching the feed rather
  // than waiting for someone to report it. Every real weapon and vehicle
  // prettifies to three words or fewer -- "Coupe RB", "Motorbike 04", "Uaz C
  // 01", "Frag Grenade" -- and every game-system object to four or more.
  const { telemetryWeaponName } = require("./weaponMeta");
  assert.equal(telemetryWeaponName("SomeFuture_Internal_Object_Name_Thing_C"), null);
  assert.equal(telemetryWeaponName("None"), null);
  // Not at the cost of the things that do read: guns and vehicles survive.
  assert.equal(telemetryWeaponName("WeapAK47_C"), "AKM");
  assert.equal(telemetryWeaponName("BP_CoupeRB_C"), "Coupe RB");
  assert.equal(telemetryWeaponName("Uaz_C_01_C"), "Uaz C 01");
});

test("a kill whose only named cause is the engine's empty name credits none", () => {
  const noName = [
    { _T: "LogMatchStart", characters: [
      { character: { accountId: "account.me", name: "Me", teamId: 1 } },
      { character: { accountId: "account.foe", name: "Foe", teamId: 2 } },
    ] },
    { _T: "LogPlayerPosition", common: { isGame: 1 }, elapsedTime: 10, character: { accountId: "account.me", name: "Me", teamId: 1, location: { x: 400000, y: 400000, z: 0 } } },
    { _T: "LogPlayerKillV2", elapsedTime: 20,
      killerDamageInfo: { damageCauserName: "None" },
      dBNODamageInfo: { damageCauserName: "WeapAUG_C", distance: 5000 },
      killer: { accountId: "account.me", name: "Me", teamId: 1, location: { x: 450000, y: 450000, z: 0 } },
      victim: { accountId: "account.foe", name: "Foe", teamId: 2, location: { x: 460000, y: 460000, z: 0 } } },
  ];
  const r = parseReplayTelemetry(noName, { matchAttributes, accountId: "account.me" });
  // "None" is truthy, so picking the first block with a non-empty string put it
  // ahead of the block that names the gun that actually did it.
  assert.equal(r.kills[0].w, "AUG");
  assert.equal(r.kills[0].wk, "aug_a3");
  assert.equal(r.kills[0].dist, 50);
});
