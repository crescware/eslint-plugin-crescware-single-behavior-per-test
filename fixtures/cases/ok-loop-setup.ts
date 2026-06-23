// ok: a loop used only to build state (no assertion inside) plus one assertion.
test("accumulates", () => {
  const acc = [];
  for (const x of [1, 2, 3]) {
    acc.push(x);
  }
  expect(acc).toEqual([1, 2, 3]);
});
