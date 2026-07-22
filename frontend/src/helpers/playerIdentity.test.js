import { resolveRouteIdentifier } from "./playerIdentity";

const ACCOUNT_ID = "account.fa405e76bea343a59dc8bc4d3cece7a6";

test("prefers the nickname when it is a proper handle", () => {
  expect(
    resolveRouteIdentifier({ nickname: "Neo", gameId: ACCOUNT_ID, accountId: ACCOUNT_ID, id: ACCOUNT_ID })
  ).toBe("Neo");
});

test("falls back to gameId when the nickname is account-shaped", () => {
  expect(resolveRouteIdentifier({ nickname: ACCOUNT_ID, gameId: "Trinity", id: ACCOUNT_ID })).toBe("Trinity");
});

test("falls back through accountId and id when nickname and gameId are missing", () => {
  expect(resolveRouteIdentifier({ accountId: ACCOUNT_ID })).toBe(ACCOUNT_ID);
  expect(resolveRouteIdentifier({ id: "steam-id" })).toBe("steam-id");
});

test("returns an empty string for empty input", () => {
  expect(resolveRouteIdentifier({})).toBe("");
  expect(resolveRouteIdentifier()).toBe("");
});

test("trims whitespace-only nicknames away", () => {
  expect(resolveRouteIdentifier({ nickname: "   ", gameId: "Morpheus" })).toBe("Morpheus");
});
