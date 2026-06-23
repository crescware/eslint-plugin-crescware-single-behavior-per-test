// consolidate: a function-expression callback is handled like an arrow.
test("function expression callback", function () {
  const r = compute();
  expect(r.a).toBe(1);
  expect(r.b).toBe(2);
});
