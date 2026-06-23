import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, test } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const oxlintBin = resolve(repoRoot, "node_modules/.bin/oxlint");
const fixturesDir = resolve(repoRoot, "fixtures");
// The deliberately-violating case files live in their own directory so the
// project's own lint can ignore just that directory while still dogfooding this
// rule on the test harness. The harness therefore obeys the rule for real:
// every test below makes exactly one assertion.
const casesDir = resolve(fixturesDir, "cases");
const defaultConfig = resolve(fixturesDir, "oxlintrc.default.json");

type Diagnostic = {
  message: string;
  filename: string;
  severity: string;
};

type OxlintReport = { diagnostics: Diagnostic[] };

const runFixtures = (configPath: string, targetDir: string): Diagnostic[] => {
  const result = spawnSync(
    oxlintBin,
    ["-c", configPath, "--no-ignore", "-f", "json", resolve(targetDir) + "/"],
    { cwd: repoRoot, encoding: "utf8" },
  );
  if (result.error !== undefined && result.error !== null) {
    throw result.error;
  }
  const parsed = JSON.parse(result.stdout ?? "") as OxlintReport;
  return parsed.diagnostics;
};

const messagesFor = (diagnostics: Diagnostic[], filename: string): string[] => {
  return diagnostics
    .filter((v) => v.filename.endsWith(`/${filename}`))
    .map((v) => v.message);
};

// The message generators below must match those in src/index.ts exactly.
const consolidateMessage = (root: string, fields: string[]): string => {
  return `This test asserts ${fields.length} fields of the same object '${root}' (${fields.join(", ")}) with separate expect() calls. Consolidate them into ONE exhaustive 'expect(${root}).toEqual({ ... })' listing every field. Do not use a partial-match matcher (toMatchObject etc.): a field you omit would go unchecked. This is not a split and not test.each — it is one object compared once.`;
};

const splitByActMessage = (description: string): string => {
  return `This test asserts state both before and after a change (${description}) in the same test. The before- and after-states are two different behaviors. Split into separate test() calls at that boundary, giving the second its own Arrange/Act (never leave an empty test). The problem is not the number of expects; it is the Act sitting between them. This is not a toEqual consolidation.`;
};

const splitByHeterogeneityMessage = (summary: string): string => {
  return `This test mixes assertions of different shapes (${summary}), so it verifies more than one contract. Split it into one test() per contract. This is not a toEqual consolidation and not test.each.`;
};

const eachOrSplitMessage = (operation: string, caseCount: number): string => {
  return `This test calls the same operation '${operation}' ${caseCount} times with only the inputs changing. Syntax cannot decide the fix, so this is a question, not a verdict. Option 1: if these are the same logic with different data, rewrite as test.each. Option 2: if they assert different contracts (e.g. normal vs boundary/error), split into separate test() calls. Criterion: restate each case as one sentence — same sentence with different values means test.each, a different claim means split. You, who know the intent, decide.`;
};

const genericMessage = (count: number): string => {
  return `This test makes ${count} top-level expect() assertions, but a test must verify a single behavior. The exit could not be named automatically, so keep the ban and pick the fix with this checklist: (1) Is there a state change (assignment, mutation, await, call) between assertions? Split into separate tests at that boundary. (2) Do the matchers or asserted shapes differ? Split into one test per contract. (3) Are these different fields of the same object? Consolidate into one exhaustive toEqual (no partial match). (4) Is it the same operation with only inputs changing? Use test.each if it is the same claim with different data, otherwise split. Do not silence this by deleting an assertion.`;
};

// Each NG case file maps to the single diagnostic message it must produce.
const ngCases: [string, string][] = [
  [
    "ng-consolidate-fields.ts",
    consolidateMessage("result", ["status", "code", "body"]),
  ],
  ["ng-consolidate-two.ts", consolidateMessage("r", ["a", "b"])],
  [
    "ng-consolidate-nested-path.ts",
    consolidateMessage("r", ["meta.id", "meta.name"]),
  ],
  ["ng-act-increment.ts", splitByActMessage("c.increment()")],
  ["ng-act-assignment.ts", splitByActMessage("x = …")],
  ["ng-act-update.ts", splitByActMessage("i++")],
  ["ng-act-mutating-method.ts", splitByActMessage("arr.push()")],
  ["ng-act-await.ts", splitByActMessage("await store.init()")],
  [
    "ng-hetero-matcher.ts",
    splitByHeterogeneityMessage("toEqual on parse() vs toThrow on parseThrows"),
  ],
  [
    "ng-hetero-negation.ts",
    splitByHeterogeneityMessage("toBe on r.ok vs not.toBe on r.ok"),
  ],
  [
    "ng-hetero-modifier.ts",
    splitByHeterogeneityMessage("toBe on r.ready vs resolves.toBe on r.task"),
  ],
  [
    "ng-hetero-basekind.ts",
    splitByHeterogeneityMessage("toBe on r.value vs toBe on size()"),
  ],
  [
    "ng-hetero-callee.ts",
    splitByHeterogeneityMessage("toEqual on parse() vs toEqual on serialize()"),
  ],
  ["ng-each-add.ts", eachOrSplitMessage("add", 2)],
  ["ng-each-three.ts", eachOrSplitMessage("double", 3)],
  ["ng-generic-computed-matcher.ts", genericMessage(2)],
  ["ng-generic-other-base.ts", genericMessage(2)],
  ["ng-generic-different-objects.ts", genericMessage(2)],
  ["ng-generic-exact-dup.ts", genericMessage(2)],
  ["ng-generic-identifier-base.ts", genericMessage(2)],
  ["ng-generic-call-argshape.ts", genericMessage(2)],
];

const okFiles = [
  "ok-single.ts",
  "ok-none.ts",
  "ok-concise-arrow.ts",
  "ok-nested-loop.ts",
  "ok-nested-helper.ts",
  "ok-separate-tests.ts",
  "ok-each-single.ts",
];

let defaultDiagnostics: Diagnostic[] = [];

beforeAll(() => {
  const probe = spawnSync(oxlintBin, ["--version"], { encoding: "utf8" });
  if (probe.status !== 0) {
    throw new Error(`oxlint not runnable: ${probe.stderr ?? ""}`);
  }
  defaultDiagnostics = runFixtures(defaultConfig, casesDir);
});

describe("default options", () => {
  test.each(ngCases)("%s reports its verdict", (file, expectedMessage) => {
    expect(messagesFor(defaultDiagnostics, file)).toEqual([expectedMessage]);
  });

  test.each(okFiles)("%s has no diagnostics", (file) => {
    expect(messagesFor(defaultDiagnostics, file)).toEqual([]);
  });

  test("every NG case produces exactly one diagnostic and OK cases none", () => {
    expect(defaultDiagnostics.length).toBe(ngCases.length);
  });
});
