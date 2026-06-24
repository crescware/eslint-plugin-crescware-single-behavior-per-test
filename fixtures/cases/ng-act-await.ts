// split-by-act: an awaited side effect sits between the assertions.
test("store initializes", async () => {
  const store = makeStore();
  expect(store.ready).toBe(false);
  await store.init();
  expect(store.ready).toBe(true);
});
