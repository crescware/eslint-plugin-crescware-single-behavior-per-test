// split-by-heterogeneity: one plain assertion and one negated async assertion.
test("negation and modifier", () => {
  const r = compute();
  expect(r.value).toBe(1);
  expect(r.task).rejects.not.toBe(2);
});
