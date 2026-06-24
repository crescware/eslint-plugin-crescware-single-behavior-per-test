// ok: an asserting helper called once is a single assertion.
test("helper called once", () => {
  const check = (v) => expect(v).toBe(1);
  check(1);
});
