// generic: the same field asserted twice (an exact duplicate), so there is no
// consolidation to make; the ban still holds.
test("exact duplicate", () => {
  const r = compute();
  expect(r.value).toBe(1);
  expect(r.value).toBe(1);
});
