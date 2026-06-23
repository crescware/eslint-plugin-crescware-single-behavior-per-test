// each-or-split: the same operation, only the inputs (and expected) change.
test("add cases", () => {
  expect(add(1, 2)).toBe(3);
  expect(add(3, 4)).toBe(7);
});
