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
  return `This test asserts ${fields.length} fields of the same object '${root}' (${fields.join(", ")}) with separate expect() calls. Replace them with ONE exhaustive 'expect(${root}).toEqual({ ... })' that lists every field, and delete the individual expect() statements. A dotted field denotes nesting ('meta.id' becomes { meta: { id: ... } }). Do not use a partial-match matcher (toMatchObject etc.): a field you omit would go unchecked. This is not a split and not test.each — it is one object compared once.`;
};

const splitByActMessage = (description: string): string => {
  return `This test asserts state both before and after a change (${description}) in the same test, so it verifies two behaviors. Criterion: name what each side guarantees — the first the state before ${description}, the second its effect; if both guarantees matter, they are two tests. Split into separate test() calls at that boundary, giving the second its own Arrange/Act; never leave an empty test, and do not just delete the before-state assertion to silence this. The problem is not the number of expects but the Act between them. This is not a toEqual consolidation.`;
};

const splitByHeterogeneityMessage = (summary: string): string => {
  return `This test mixes assertions of different shapes (${summary}), so it verifies more than one contract. Criterion: each distinct shape is its own contract; give each its own test() with its own setup. Do not delete the odd assertion to make the shapes match — that silences the check instead of restoring single behavior. This is not a toEqual consolidation and not test.each.`;
};

const eachOrSplitMessage = (operation: string, caseCount: number): string => {
  return `This test calls the same operation '${operation}' ${caseCount} times with only the inputs changing. Syntax cannot decide the fix, so this is a question, not a verdict. Option 1: if these are the same logic with different data, rewrite as test.each. Option 2: if they assert different contracts (e.g. normal vs boundary/error), split into separate test() calls. Criterion: restate each case as one sentence — same sentence with different values means test.each, a different claim means split. Either way keep every case; do not clear this by deleting cases down to one. You, who know the intent, decide.`;
};

const genericMessage = (count: number): string => {
  return `This test makes ${count} top-level expect() assertions, but a test must verify a single behavior. The exit could not be named automatically, so keep the ban and pick the fix with this checklist: (1) Is there a state change (assignment, mutation, await, or a call on the value under test) between assertions? Split into separate tests at that boundary. (2) Do the matchers or asserted shapes differ? Split into one test per contract. (3) Are these different fields of the same object? Replace them with one exhaustive toEqual (no partial match). (4) Is it the same operation with only the inputs changing? Syntax cannot decide this one — restate each case as a sentence: the same sentence with different values suggests test.each, a different claim suggests split; ask, do not guess. Do not silence this by deleting an assertion.`;
};

// Each NG case file maps to the ordered list of diagnostic messages it produces
// (one per violating test in the file).
const ngCases: [string, string[]][] = [
  // consolidate
  [
    "ng-consolidate-fields.ts",
    [consolidateMessage("result", ["status", "code", "body"])],
  ],
  ["ng-consolidate-two.ts", [consolidateMessage("r", ["a", "b"])]],
  [
    "ng-consolidate-nested-path.ts",
    [consolidateMessage("r", ["meta.id", "meta.name"])],
  ],
  ["ng-consolidate-with-benign-call.ts", [consolidateMessage("r", ["a", "b"])]],
  ["ng-consolidate-optional-chain.ts", [consolidateMessage("r", ["a", "b"])]],
  ["ng-consolidate-function-expr.ts", [consolidateMessage("r", ["a", "b"])]],
  ["ng-consolidate-expect-soft.ts", [consolidateMessage("r", ["a", "b"])]],
  ["ng-it-consolidate.ts", [consolidateMessage("r", ["a", "b"])]],
  ["ng-describe-nested-consolidate.ts", [consolidateMessage("r", ["a", "b"])]],
  // split-by-act
  ["ng-act-increment.ts", [splitByActMessage("c.increment()")]],
  ["ng-act-assignment.ts", [splitByActMessage("x = …")]],
  ["ng-act-update.ts", [splitByActMessage("i++")]],
  ["ng-act-mutating-method.ts", [splitByActMessage("arr.push()")]],
  ["ng-act-await.ts", [splitByActMessage("await store.init()")]],
  // split-by-heterogeneity
  [
    "ng-hetero-matcher.ts",
    [
      splitByHeterogeneityMessage(
        "toEqual on parse() vs toThrow on parseThrows",
      ),
    ],
  ],
  [
    "ng-hetero-negation.ts",
    [splitByHeterogeneityMessage("toBe on r.ok vs not.toBe on r.ok")],
  ],
  [
    "ng-hetero-modifier.ts",
    [splitByHeterogeneityMessage("toBe on r.ready vs resolves.toBe on r.task")],
  ],
  [
    "ng-hetero-basekind.ts",
    [splitByHeterogeneityMessage("toBe on r.value vs toBe on size()")],
  ],
  [
    "ng-hetero-callee.ts",
    [
      splitByHeterogeneityMessage(
        "toEqual on parse() vs toEqual on serialize()",
      ),
    ],
  ],
  [
    "ng-hetero-negation-modifier.ts",
    [
      splitByHeterogeneityMessage(
        "toBe on r.value vs not.rejects.toBe on r.task",
      ),
    ],
  ],
  // each-or-split
  ["ng-each-add.ts", [eachOrSplitMessage("add", 2)]],
  ["ng-each-three.ts", [eachOrSplitMessage("double", 3)]],
  ["ng-each-await-resolves.ts", [eachOrSplitMessage("load", 2)]],
  ["ng-each-object-arg.ts", [eachOrSplitMessage("build", 2)]],
  // generic
  ["ng-generic-computed-matcher.ts", [genericMessage(2)]],
  ["ng-generic-other-base.ts", [genericMessage(2)]],
  ["ng-generic-different-objects.ts", [genericMessage(2)]],
  ["ng-generic-exact-dup.ts", [genericMessage(2)]],
  ["ng-generic-identifier-base.ts", [genericMessage(2)]],
  ["ng-generic-call-argshape.ts", [genericMessage(2)]],
  ["ng-generic-call-same-input.ts", [genericMessage(2)]],
  ["ng-generic-call-spread.ts", [genericMessage(2)]],
  ["ng-generic-computed-member.ts", [genericMessage(2)]],
  ["ng-generic-call-rooted-member.ts", [genericMessage(2)]],
  // multiple violations in one file (source order: consolidate, then each)
  [
    "ng-multi-two-tests.ts",
    [consolidateMessage("r", ["a", "b"]), eachOrSplitMessage("add", 2)],
  ],
];

const okFiles = [
  "ok-single.ts",
  "ok-none.ts",
  "ok-concise-arrow.ts",
  "ok-nested-loop.ts",
  "ok-nested-helper.ts",
  "ok-separate-tests.ts",
  "ok-each-single.ts",
  "ok-describe-single.ts",
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
  test.each(ngCases)("%s reports its verdict(s)", (file, expectedMessages) => {
    expect(messagesFor(defaultDiagnostics, file)).toEqual(expectedMessages);
  });

  test.each(okFiles)("%s has no diagnostics", (file) => {
    expect(messagesFor(defaultDiagnostics, file)).toEqual([]);
  });

  test("the diagnostic total is fully accounted for", () => {
    const total = ngCases.reduce((sum, entry) => sum + entry[1].length, 0);
    expect(defaultDiagnostics.length).toBe(total);
  });
});
