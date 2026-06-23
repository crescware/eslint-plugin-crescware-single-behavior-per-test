// generic: identical inputs with only the expected value differing — nothing to
// parameterize, so this is not an each candidate.
test("same input different expected", () => {
  expect(add(1, 2)).toBe(3);
  expect(add(1, 2)).toBe(4);
});
