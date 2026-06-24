// each-or-split: awaited `resolves` assertions over the same operation.
test("async cases", async () => {
  await expect(load(1)).resolves.toBe(1);
  await expect(load(2)).resolves.toBe(2);
});
