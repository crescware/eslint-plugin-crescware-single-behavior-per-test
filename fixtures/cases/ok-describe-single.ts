// ok: a single-assertion test nested in describe stays silent.
describe("group", () => {
  test("single", () => {
    expect(1).toBe(1);
  });
});
