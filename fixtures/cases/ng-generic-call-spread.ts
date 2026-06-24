// generic: spread call arguments have no statically comparable shape.
test("spread call args", () => {
  const xs = [1];
  const ys = [2];
  expect(build(...xs)).toBe(1);
  expect(build(...ys)).toBe(2);
});
