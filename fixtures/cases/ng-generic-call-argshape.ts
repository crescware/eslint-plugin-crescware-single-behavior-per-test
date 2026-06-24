// generic: same callee but a different argument structure, so this is not a
// same-shape each candidate; the ban still holds.
test("call arg shape differs", () => {
  expect(build(1)).toBe(1);
  expect(build(1, 2)).toBe(2);
});
