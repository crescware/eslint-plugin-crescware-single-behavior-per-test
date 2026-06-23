// consolidate: same root object, differing nested access paths.
test("nested paths", () => {
  const r = build();
  expect(r.meta.id).toBe(1);
  expect(r.meta.name).toBe("x");
});
