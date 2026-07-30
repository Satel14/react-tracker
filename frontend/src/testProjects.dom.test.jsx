describe("dom test project", () => {
  it("runs with a DOM and loads the jest-dom matchers", () => {
    expect(typeof document).toBe("object");
    expect(typeof expect(document.body).toBeInTheDocument).toBe("function");
  });
});
