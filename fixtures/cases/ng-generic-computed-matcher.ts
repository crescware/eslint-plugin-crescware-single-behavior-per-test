// generic: a computed matcher name has no statically known matcher, so the exit
// cannot be named; the ban still holds.
test("computed matcher", () => {
  const r = compute();
  expect(r.a)["toBe"](1);
  expect(r.b)["toBe"](2);
});
