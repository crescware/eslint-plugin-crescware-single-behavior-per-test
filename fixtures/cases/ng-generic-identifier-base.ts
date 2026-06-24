// generic: bare identifier receivers expose no field or operation to key on, so
// the exit cannot be named; the ban still holds.
test("identifier base", () => {
  const r = compute();
  const s = compute();
  expect(r).toBe(s);
  expect(s).toBe(r);
});
