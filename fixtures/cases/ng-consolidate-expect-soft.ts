// consolidate: expect.soft(...) is still anchored at expect.
test("soft assertions", () => {
  const r = compute();
  expect.soft(r.a).toBe(1);
  expect.soft(r.b).toBe(2);
});
