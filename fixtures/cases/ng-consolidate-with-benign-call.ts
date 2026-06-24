// consolidate: a pure call (console.log) between the assertions is NOT an Act —
// it does not touch the value under test — so the verdict stays consolidate.
test("benign call between fields", () => {
  const r = compute();
  expect(r.a).toBe(1);
  console.log("checkpoint");
  expect(r.b).toBe(2);
});
