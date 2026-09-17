import routes from "./routes";

describe("route table", () => {
  const ALLOWED = ["component", "exact", "fallback", "path"];

  it("declares 19 routes with only path, component, exact and an optional fallback", () => {
    expect(routes).toHaveLength(19);
    for (const route of routes) {
      const keys = Object.keys(route).sort();
      for (const key of keys) {
        expect(ALLOWED, `${route.path} carries ${key}`).toContain(key);
      }
      expect(keys, route.path).toEqual(expect.arrayContaining(["component", "exact", "path"]));
    }
  });

  // `fallback` is not a general-purpose option and is not free: it puts a second
  // Suspense boundary in front of the route. /leaderboards has one because the
  // shared spinner throws its prerendered page away for a frame, which measured
  // 0.14 CLS. Anything else that wants one should have the measurement first.
  it("gives a Suspense fallback to /leaderboards and to nothing else", () => {
    const withFallback = routes.filter((route) => route.fallback).map((route) => route.path);
    expect(withFallback).toEqual(["/leaderboards"]);
  });
});
