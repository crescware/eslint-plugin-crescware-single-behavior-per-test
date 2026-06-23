// consolidate: optional-chain access (r?.a) still resolves to the same root.
test("optional chain fields", () => {
  const r = compute();
  expect(r?.a).toBe(1);
  expect(r?.b).toBe(2);
});
