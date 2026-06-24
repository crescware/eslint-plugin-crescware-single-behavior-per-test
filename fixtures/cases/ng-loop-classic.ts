// loop-each: a classic for loop asserting per index.
test("doubles", () => {
  for (let i = 0; i < 3; i++) {
    expect(double(i)).toBe(i * 2);
  }
});
