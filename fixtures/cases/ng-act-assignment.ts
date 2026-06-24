// split-by-act: an assignment changes state between the assertions.
test("reassignment", () => {
  let x = 0;
  expect(x).toBe(0);
  x = 5;
  expect(x).toBe(5);
});
