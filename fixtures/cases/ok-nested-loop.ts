// ok: assertions inside a loop are not direct expects; how many run is not
// statically known, so they are not counted.
test("loop assertions", () => {
  const items = [1, 2, 3];
  for (const item of items) {
    expect(item).toBeGreaterThan(0);
  }
});
