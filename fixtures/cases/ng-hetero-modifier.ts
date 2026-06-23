// split-by-heterogeneity: a sync assertion and a `resolves` assertion differ in
// signature.
test("sync and async", () => {
  const r = load();
  expect(r.ready).toBe(true);
  expect(r.task).resolves.toBe(true);
});
