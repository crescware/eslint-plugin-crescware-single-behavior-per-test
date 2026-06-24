// generic: fields of two different objects, so neither consolidate nor a single
// named exit applies; the ban still holds.
test("different objects", () => {
  const a = makeA();
  const b = makeB();
  expect(a.x).toBe(1);
  expect(b.y).toBe(2);
});
