// loop-each: assertions inside a forEach callback are the same anti-pattern.
test("all valid", () => {
  const items = [1, 2, 3];
  items.forEach((x) => {
    expect(x).toBeGreaterThan(0);
  });
});
