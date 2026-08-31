import routes from "./routes";

describe("route table", () => {
  it("declares 12 routes with only path, component and exact", () => {
    expect(routes).toHaveLength(12);
    for (const route of routes) {
      expect(Object.keys(route).sort()).toEqual([
        "component",
        "exact",
        "path",
      ]);
    }
  });
});
