// split-by-heterogeneity: an affirmative and a negated assertion differ in
// signature even on the same receiver.
test("affirm and negate", () => {
  const r = check();
  expect(r.ok).toBe(true);
  expect(r.ok).not.toBe(false);
});
