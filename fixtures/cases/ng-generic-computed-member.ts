// generic: a computed member access (r[k]) has no statically known field name,
// so it cannot be safely consolidated.
test("computed member access", () => {
  const r = compute();
  const k = key();
  const j = key();
  expect(r[k]).toBe(1);
  expect(r[j]).toBe(2);
});
