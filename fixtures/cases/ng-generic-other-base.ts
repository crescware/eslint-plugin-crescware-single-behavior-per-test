// generic: the value under test is a logical expression, not a member / call /
// identifier, so the exit cannot be named; the ban still holds.
test("other base", () => {
  const a = 1;
  const b = 2;
  expect(a || b).toBe(2);
  expect(a && b).toBe(2);
});
