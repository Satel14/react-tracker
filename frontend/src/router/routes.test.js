import routes from "./routes";

describe("route table", () => {
  it("declares 19 routes with only path, component and exact", () => {
    expect(routes).toHaveLength(19);
    for (const route of routes) {
      expect(Object.keys(route).sort()).toEqual([
        "component",
        "exact",
        "path",
      ]);
    }
  });
});
