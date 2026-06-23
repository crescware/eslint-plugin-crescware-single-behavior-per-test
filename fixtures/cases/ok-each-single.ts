// ok: a parameterized test with a single assertion in its body.
test.each([1, 2, 3])("case %s", (n) => {
  expect(n).toBeGreaterThan(0);
});
