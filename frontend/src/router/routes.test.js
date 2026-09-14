import routes from "./routes";

describe("route table", () => {
  it("declares 17 routes with only path, component and exact", () => {
    expect(routes).toHaveLength(17);
    for (const route of routes) {
      expect(Object.keys(route).sort()).toEqual([
        "component",
        "exact",
        "path",
      ]);
    }
  });
});
