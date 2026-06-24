# @crescware/eslint-plugin-crescware-single-behavior-per-test

An ESLint-compatible rule, run through [oxlint](https://oxc.rs/docs/guide/usage/linter)'s `jsPlugins`, that forbids writing more than one top-level `expect()` in a single `test()` / `it()` — and, instead of merely banning it, tells you exactly how to fix it.

## Why

A test should verify a single behavior, but agents and humans alike pile several `expect`s into one test. Plain prose (CLAUDE.md, review comments) does not stop this because prose has no binding force — it can be ignored. A lint rule does: it fails the edit loop and the build.

But a bare ban (e.g. `max-expects: 1`) is weak. If it only says "no" without showing the way out, the reader optimizes for the cheapest way to clear the error — commenting out one `expect`. A ban with no exit is not a norm. This rule carries the exit in the error message itself. The message is written as a prompt for the reader (today, usually a coding agent): it names the concrete next edit, and for the one genuinely undecidable case it asks rather than commands.

The ban is the floor; the guidance rides on top of it. The severity is always `error`.

## Install

```sh
pnpm add -D @crescware/eslint-plugin-crescware-single-behavior-per-test
```

## Usage

Register the plugin in your `.oxlintrc.json` and enable the rule:

```json
{
  "jsPlugins": ["@crescware/eslint-plugin-crescware-single-behavior-per-test"],
  "rules": {
    "crescware-single-behavior-per-test/single-behavior-per-test": "error"
  }
}
```

## What it reports

The rule counts the **direct** `expect()` assertions in a `test` / `it` callback — the ones written as statements directly in the callback body. When there are two or more, it classifies the test by _what varies between the assertions_ and emits one of these verdicts. Each message is either an assertion (the fix is determined by the syntax) or a question (the syntax cannot decide).

### consolidate (assertion)

Several fields of the **same object** are asserted separately. Compare the object once.

```ts
// reported
test("compute result", () => {
  const r = compute();
  expect(r.status).toBe("ok");
  expect(r.code).toBe(200);
});

// fix: one exhaustive toEqual (list every field; no partial-match matcher)
test("compute result", () => {
  expect(compute()).toEqual({ status: "ok", code: 200 });
});
```

### split-by-act (assertion)

A state change (assignment, mutation, `await`, or a call on the value under test) sits **between** assertions. The before- and after-states are two behaviors.

```ts
// reported
test("counter", () => {
  const c = new Counter();
  expect(c.value).toBe(0);
  c.increment();
  expect(c.value).toBe(1);
});

// fix: split at the Act into two tests, each with its own Arrange/Act
```

### split-by-heterogeneity (assertion)

The matchers or the asserted shapes differ — the test checks more than one contract.

```ts
// reported (a value contract and an error contract)
test("parse", () => {
  expect(parse("x")).toEqual({ ok: true });
  expect(parseThrows).toThrow();
});

// fix: one test() per contract
```

### each-or-split (question)

The **same operation** is called with only the inputs changing. Syntax cannot tell whether these are the same claim over different data (→ `test.each`) or different contracts (→ split), so the rule asks and hands you the criterion: restate each case as one sentence — same sentence with different values means `test.each`, a different claim means split.

```ts
// reported — you decide test.each vs split
test("add", () => {
  expect(add(1, 2)).toBe(3);
  expect(add(3, 4)).toBe(7);
});
```

### loop-each (assertion)

Assertions run inside a loop, an iteration callback (`forEach` / `map` / …), or a repeated call to a local assertion helper — a hand-rolled parametrized test. A loop applies an identical body per item, so this is unambiguously `test.each` (and `test.each` reports _which_ case failed, where a loop stops at the first).

```ts
// reported
test("all positive", () => {
  for (const x of items) {
    expect(x).toBeGreaterThan(0);
  }
});

// fix
test.each(items)("%s is positive", (x) => {
  expect(x).toBeGreaterThan(0);
});
```

### generic (question)

When the exit cannot be named — a computed matcher, an unusual receiver, different objects, an exact duplicate, mismatched call arguments — the ban still holds and the message hands you the four-branch self-diagnosis checklist so you can route the fix yourself.

## Scope

- Only **direct** assertions are classified. Assertions in a loop / iteration callback / repeated local helper are routed to `loop-each`; assertions behind a cross-file or imported helper are a static-analysis blind spot and are not counted.
- Modifier and async chains are understood: `expect(x).not.toBe(...)`, `expect(x).resolves.toBe(...)`, `await expect(x).resolves.toBe(...)`, `expect.soft(x).toBe(...)`.
- `test`, `it`, `it.only`, and `test.each(table)(...)` callbacks are recognized.
- The rule never autofixes — a lazy set of partial assertions cannot be mechanically rebuilt into an exhaustive `toEqual` — it reports only.

## Companion: `no-restricted-matchers`

The `consolidate` fix asks for an exhaustive `toEqual` and forbids partial-match matchers (`toMatchObject` etc.), because a field you omit goes unchecked. This rule states that in prose but does not enforce it; pair it with your test framework's `no-restricted-matchers` to give that prohibition real teeth. The two cooperate loosely and toggle independently.

## Stack

- **Runtime**: Node.js 24 (via [mise](https://mise.jdx.dev/))
- **Package manager**: pnpm (via corepack)
- **Language**: TypeScript ([native preview](https://github.com/microsoft/typescript-go))
- **Test**: [Vitest](https://vitest.dev/) (fixture integration tests that run oxlint over `fixtures/cases`)
- **Lint**: [oxlint](https://oxc.rs/docs/guide/usage/linter) (the repo dogfoods this very rule)
- **Format**: [oxfmt](https://github.com/oxc-project/oxc)
- **Unused code**: [Knip](https://knip.dev/)

## Setup

```sh
mise install
corepack enable
pnpm install
```

## Scripts

| Command            | Description                              |
| ------------------ | ---------------------------------------- |
| `pnpm build`       | Compile `src` to `dist`                  |
| `pnpm check`       | Run all checks (types, lint, knip, test) |
| `pnpm check:types` | Type check                               |
| `pnpm check:lint`  | Lint and format check                    |
| `pnpm check:knip`  | Unused files/exports check               |
| `pnpm test`        | Run fixture integration tests            |
| `pnpm format`      | Fix lint and format                      |
