import { mergeProfileExtras } from "./playerExtras";

const DEFERRED_DATA = {
  platformInfo: { platformUserHandle: "Neo" },
  profile: { status: "deferred", error: null, banType: "Innocent", clan: null, survivalMastery: null, weaponMastery: null },
  matches: { summary: { total: 2 }, items: [] },
};

const EXTRAS = {
  status: "ok",
  error: null,
  banType: "Innocent",
  clan: { tag: "NAVI" },
  survivalMastery: { tier: "Gold", level: 3 },
  weaponMastery: [{ raw: "Item_Weapon_FNFal_C", kills: 455 }],
};

test("merges extras over a deferred profile without touching siblings", () => {
  const merged = mergeProfileExtras(DEFERRED_DATA, EXTRAS);
  expect(merged.profile.status).toBe("ok");
  expect(merged.profile.clan.tag).toBe("NAVI");
  expect(merged.profile.weaponMastery).toHaveLength(1);
  expect(merged.matches.summary.total).toBe(2);
  expect(merged.platformInfo.platformUserHandle).toBe("Neo");
});

test("returns the same reference when the profile is not deferred", () => {
  const settled = { ...DEFERRED_DATA, profile: { ...DEFERRED_DATA.profile, status: "ok" } };
  expect(mergeProfileExtras(settled, EXTRAS)).toBe(settled);
});

test("ignores malformed extras payloads", () => {
  expect(mergeProfileExtras(DEFERRED_DATA, null)).toBe(DEFERRED_DATA);
  expect(mergeProfileExtras(DEFERRED_DATA, { data: [] })).toBe(DEFERRED_DATA);
});

test("passes through null data", () => {
  expect(mergeProfileExtras(null, EXTRAS)).toBeNull();
});

test("keeps the known banType when partial extras carry null", () => {
  const partial = { ...EXTRAS, status: "partial", banType: null };
  const merged = mergeProfileExtras(DEFERRED_DATA, partial);
  expect(merged.profile.banType).toBe("Innocent");
  expect(merged.profile.status).toBe("partial");
});
