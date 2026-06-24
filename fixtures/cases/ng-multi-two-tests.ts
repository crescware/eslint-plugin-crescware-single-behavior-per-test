// Two violating tests in one file: each is routed independently.
test("first violating", () => {
  const r = compute();
  expect(r.a).toBe(1);
  expect(r.b).toBe(2);
});

test("second violating", () => {
  expect(add(1, 2)).toBe(3);
  expect(add(3, 4)).toBe(7);
});
