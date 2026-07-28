import { buildCompareResolveBatches } from "./compareBatchResolve";

test("batches 2+ ids on the same platform", () => {
  const batches = buildCompareResolveBatches([
    { platform: "steam", id: "Neo" },
    { platform: "steam", id: "Trinity" },
  ]);
  expect(batches).toEqual([{ platform: "steam", gameIds: ["Neo", "Trinity"] }]);
});

test("skips a platform group with fewer than 2 ids to resolve", () => {
  expect(buildCompareResolveBatches([{ platform: "steam", id: "Neo" }])).toEqual([]);
});

test("drops account identifiers, which need no resolve", () => {
  const batches = buildCompareResolveBatches([
    { platform: "steam", id: "account.fa405e76bea343a59dc8bc4d3cece7a6" },
    { platform: "steam", id: "Neo" },
  ]);
  expect(batches).toEqual([]);
});

test("returns nothing when every slot is an account identifier", () => {
  const batches = buildCompareResolveBatches([
    { platform: "steam", id: "account.aaaa" },
    { platform: "steam", id: "account.bbbb" },
    { platform: "psn", id: "account.cccc" },
  ]);
  expect(batches).toEqual([]);
});

test("groups mixed platforms independently and drops the undersized group", () => {
  const batches = buildCompareResolveBatches([
    { platform: "steam", id: "Neo" },
    { platform: "steam", id: "Trinity" },
    { platform: "psn", id: "Morpheus" },
  ]);
  expect(batches).toEqual([{ platform: "steam", gameIds: ["Neo", "Trinity"] }]);
});

test("normalizes platform aliases before grouping (xbl -> xbox)", () => {
  const batches = buildCompareResolveBatches([
    { platform: "xbl", id: "Neo" },
    { platform: "xbox", id: "Trinity" },
  ]);
  expect(batches).toEqual([{ platform: "xbox", gameIds: ["Neo", "Trinity"] }]);
});

test("dedupes exact-string repeats but keeps ids differing only in case", () => {
  const batches = buildCompareResolveBatches([
    { platform: "steam", id: "Neo" },
    { platform: "steam", id: "Neo" },
    { platform: "steam", id: "neo" },
  ]);
  expect(batches).toEqual([{ platform: "steam", gameIds: ["Neo", "neo"] }]);
});

test("trims whitespace and ignores empty/blank ids", () => {
  const batches = buildCompareResolveBatches([
    { platform: "steam", id: "  Neo  " },
    { platform: "steam", id: "Trinity " },
    { platform: "steam", id: "   " },
    { platform: "steam", id: "" },
  ]);
  expect(batches).toEqual([{ platform: "steam", gameIds: ["Neo", "Trinity"] }]);
});

test("returns an empty array for a single slot", () => {
  expect(buildCompareResolveBatches([{ platform: "steam", id: "Neo" }])).toEqual([]);
});

test("returns an empty array for no slots", () => {
  expect(buildCompareResolveBatches([])).toEqual([]);
  expect(buildCompareResolveBatches()).toEqual([]);
});

test("tolerates malformed slot entries", () => {
  expect(buildCompareResolveBatches([null, undefined, { platform: "steam" }])).toEqual([]);
});
