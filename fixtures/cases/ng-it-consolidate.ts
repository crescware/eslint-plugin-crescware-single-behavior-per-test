// consolidate: the `it` alias is treated like `test`.
it("it callback fields", () => {
  const r = compute();
  expect(r.a).toBe(1);
  expect(r.b).toBe(2);
});
