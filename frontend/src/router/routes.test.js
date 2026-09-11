import routes from "./routes";

describe("route table", () => {
  it("declares 15 routes with only path, component and exact", () => {
    expect(routes).toHaveLength(15);
    for (const route of routes) {
      expect(Object.keys(route).sort()).toEqual([
        "component",
        "exact",
        "path",
      ]);
    }
  });
});
