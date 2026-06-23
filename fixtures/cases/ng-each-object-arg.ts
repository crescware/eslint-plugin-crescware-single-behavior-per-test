// each-or-split: object inputs that share a shape but differ in value.
test("object input cases", () => {
  expect(build({ id: 1 })).toBe(1);
  expect(build({ id: 2 })).toBe(2);
});
