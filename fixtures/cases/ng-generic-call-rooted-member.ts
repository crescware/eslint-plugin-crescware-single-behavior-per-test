// generic: a member access rooted at a call (foo().a) is not a stable receiver,
// so it is not a safe consolidate.
test("member rooted at a call", () => {
  expect(foo().a).toBe(1);
  expect(foo().b).toBe(2);
});
