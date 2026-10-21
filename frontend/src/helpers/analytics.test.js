import { trackEvent } from "./analytics";

afterEach(() => {
  delete globalThis.window;
});

test("hands the event to gtag", () => {
  const gtag = vi.fn();
  globalThis.window = { gtag };

  trackEvent("player_lookup", { platform: "xbox", result: "not_found" });

  expect(gtag).toHaveBeenCalledWith("event", "player_lookup", { platform: "xbox", result: "not_found" });
});

test("does nothing when the GA snippet never ran", () => {
  globalThis.window = {};

  expect(() => trackEvent("player_lookup", { result: "found" })).not.toThrow();
});

test("does nothing outside a browser", () => {
  expect(() => trackEvent("player_lookup", { result: "found" })).not.toThrow();
});
