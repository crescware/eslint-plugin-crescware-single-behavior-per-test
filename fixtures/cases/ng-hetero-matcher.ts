// split-by-heterogeneity: a value contract and an error contract together.
test("normal and error contracts", () => {
  expect(parse("x")).toEqual({ ok: true });
  expect(parseThrows).toThrow();
});
