// loop-each: an asserting local helper called repeatedly is parametrization.
test("helper called per input", () => {
  const check = (v) => expect(v).toBeGreaterThan(0);
  check(1);
  check(2);
});
