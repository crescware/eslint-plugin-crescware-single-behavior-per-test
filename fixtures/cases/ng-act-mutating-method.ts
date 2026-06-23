// split-by-act: a mutating method call sits between the assertions.
test("array grows", () => {
  const arr = [];
  expect(arr.length).toBe(0);
  arr.push(1);
  expect(arr.length).toBe(1);
});
