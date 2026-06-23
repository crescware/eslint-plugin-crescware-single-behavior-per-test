// consolidate: the minimal two-field shape.
test("two fields", () => {
  const r = build();
  expect(r.a).toBe(1);
  expect(r.b).toBe(2);
});
