// split-by-act: an update expression (i++) changes state between assertions.
test("update expression", () => {
  let i = 0;
  expect(i).toBe(0);
  i++;
  expect(i).toBe(1);
});
