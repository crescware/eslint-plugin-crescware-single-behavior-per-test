// ok: assertions hidden inside a helper are not direct expects.
test("helper assertions", () => {
  const check = (v) => expect(v).toBe(1);
  check(1);
  check(1);
});
