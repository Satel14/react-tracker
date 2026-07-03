import { classifyPlayerError } from "./playerError";

test("classifies a 200-wrapped rate limit message as rate_limit", () => {
  const result = classifyPlayerError("Rate limit exceeded, try again soon");
  expect(result.code).toBe("rate_limit");
  expect(result.message).toBe("Rate limit exceeded, try again soon");
});

test("classifies a private-profile message as private", () => {
  expect(classifyPlayerError("This profile is private").code).toBe("private");
});

test("classifies a not-found message as not_found", () => {
  expect(classifyPlayerError("Player not found").code).toBe("not_found");
});

test("classifies network and fetch failures as network", () => {
  expect(classifyPlayerError("Network error while contacting API").code).toBe("network");
  expect(classifyPlayerError("Failed to fetch").code).toBe("network");
});

test("falls back to generic for unrecognized messages", () => {
  expect(classifyPlayerError("Something unexpected happened").code).toBe("generic");
});

test("returns generic with null message when the message is missing", () => {
  const result = classifyPlayerError(undefined);
  expect(result.code).toBe("generic");
  expect(result.message).toBeNull();
});

test("matches keywords case-insensitively", () => {
  expect(classifyPlayerError("RATE LIMIT reached").code).toBe("rate_limit");
});
