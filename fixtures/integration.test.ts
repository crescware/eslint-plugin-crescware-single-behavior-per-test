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

// Must match the message generator in src/index.ts exactly.
const genericMessage = (count: number): string => {
  return `This test makes ${count} top-level expect() assertions, but a test should verify a single behavior. Reduce it to one: consolidate assertions about the same value into a single exhaustive 'toEqual', split distinct behaviors into separate tests, or use 'test.each' for same-shaped input variations.`;
};

let defaultDiagnostics: Diagnostic[] = [];

beforeAll(() => {
  const probe = spawnSync(oxlintBin, ["--version"], { encoding: "utf8" });
  if (probe.status !== 0) {
    throw new Error(`oxlint not runnable: ${probe.stderr ?? ""}`);
  }
  defaultDiagnostics = runFixtures(defaultConfig, casesDir);
});

describe("default options", () => {
  test("a test with multiple top-level expects is reported once", () => {
    const expected = [genericMessage(2)];
    expect(messagesFor(defaultDiagnostics, "ng-multiple.ts")).toEqual(expected);
  });

  test("a test with a single top-level expect is allowed", () => {
    const expected: string[] = [];
    expect(messagesFor(defaultDiagnostics, "ok-single.ts")).toEqual(expected);
  });

  test("total diagnostics are fully accounted for", () => {
    expect(defaultDiagnostics.length).toBe(1);
  });
});
