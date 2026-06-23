// split-by-heterogeneity: a member receiver and a call receiver differ in
// signature even with the same matcher.
test("member and call receivers", () => {
  const r = compute();
  expect(r.value).toBe(1);
  expect(size(r)).toBe(2);
});
