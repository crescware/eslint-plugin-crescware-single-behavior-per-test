// split-by-heterogeneity: two different operations checked in one test.
test("different operations", () => {
  expect(parse("x")).toEqual({ ok: true });
  expect(serialize(42)).toEqual("42");
});
