// split-by-act: a method call mutates state between the two assertions.
test("counter increments", () => {
  const c = new Counter();
  expect(c.value).toBe(0);
  c.increment();
  expect(c.value).toBe(1);
});
