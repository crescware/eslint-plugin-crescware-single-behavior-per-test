// consolidate: several fields of the same object asserted separately.
test("compute result", () => {
  const result = compute();
  expect(result.status).toBe("ok");
  expect(result.code).toBe(200);
  expect(result.body).toBe("done");
});
