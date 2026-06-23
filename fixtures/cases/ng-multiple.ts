// A test with two top-level expect() assertions is reported once.
test("multiple expects", () => {
  expect(1).toBe(1);
  expect(2).toBe(2);
});
