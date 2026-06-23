// consolidate: a test nested inside describe is still a test.
describe("group", () => {
  test("nested fields", () => {
    const r = compute();
    expect(r.a).toBe(1);
    expect(r.b).toBe(2);
  });
});
