// loop-each: assertions inside a for-of loop are a hand-rolled parametrized test.
test("all positive", () => {
  const items = [1, 2, 3];
  for (const x of items) {
    expect(x).toBeGreaterThan(0);
  }
});
