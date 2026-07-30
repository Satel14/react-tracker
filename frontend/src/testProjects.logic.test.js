describe("logic test project", () => {
  it("runs without a DOM", () => {
    expect(typeof document).toBe("undefined");
    expect(typeof window).toBe("undefined");
  });
});
