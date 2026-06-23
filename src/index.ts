// Minimal structural types for the ESTree / TS-ESTree nodes this rule reads.
// oxlint hands the JS plugin ESTree-compatible nodes; only the fields actually
// inspected here are modeled and the rest are left opaque.
type Node = { type: string };

type Identifier = { type: "Identifier"; name: string };

type MemberExpression = {
  type: "MemberExpression";
  object: Node;
  property: Node;
  computed: boolean;
};

type CallExpression = {
  type: "CallExpression";
  callee: Node;
  arguments: Node[];
};

type ExpressionStatement = { type: "ExpressionStatement"; expression: Node };

type BlockStatement = { type: "BlockStatement"; body: Node[] };

// A test callback: an arrow / function expression whose `body`, when it is a
// block, holds the statements the test runs.
type FunctionNode = { type: string; body: Node };

type ReportDescriptor = { message: string; node: unknown };

type RuleContext = {
  report: (descriptor: ReportDescriptor) => void;
};

type Visitor = Record<string, (node: never) => void>;

type Rule = {
  meta?: Record<string, unknown>;
  create: (context: RuleContext) => Visitor;
};

type Plugin = {
  meta: { name: string };
  rules: Record<string, Rule>;
};

// The callee identifiers whose callback bodies this rule treats as a test.
const TEST_CALLEES = new Set<string>(["test", "it"]);

// `expect(actual)` and its dotted forms (`expect.soft(actual)`): a call whose
// callee is the identifier `expect`, or a member access on it. This anchor is
// what separates a real assertion from an unrelated `foo.toBe(...)`.
const isExpectCall = (node: Node): boolean => {
  if (node.type !== "CallExpression") {
    return false;
  }
  const callee = (node as CallExpression).callee;
  if (callee.type === "Identifier") {
    return (callee as Identifier).name === "expect";
  }
  if (callee.type === "MemberExpression") {
    const object = (callee as MemberExpression).object;
    return (
      object.type === "Identifier" && (object as Identifier).name === "expect"
    );
  }
  return false;
};

// Whether an expression is a matcher chain anchored at an `expect(...)` call.
// Walks down the receiver chain so modifier forms (`expect(x).not.toBe(...)`,
// `expect(x).resolves.toBe(...)`) are recognized. Each step descends to a
// strictly deeper child, so the walk always terminates.
const isExpectExpression = (node: Node): boolean => {
  let current: Node = node;
  while (
    current.type === "MemberExpression" ||
    current.type === "CallExpression"
  ) {
    if (isExpectCall(current)) {
      return true;
    }
    current =
      current.type === "MemberExpression"
        ? (current as MemberExpression).object
        : (current as CallExpression).callee;
  }
  return false;
};

// The identifier at the root of a call's callee, seen through member and call
// layers: `test(...)` -> "test", `it.only(...)` -> "it", and
// `test.each(table)(...)` -> "test". Returns null when the callee bottoms out in
// something other than an identifier.
const rootCalleeName = (call: CallExpression): string | null => {
  let current: Node = call.callee;
  while (true) {
    if (current.type === "Identifier") {
      return (current as Identifier).name;
    }
    if (current.type === "MemberExpression") {
      current = (current as MemberExpression).object;
      continue;
    }
    if (current.type === "CallExpression") {
      current = (current as CallExpression).callee;
      continue;
    }
    return null;
  }
};

// The function passed as the test body: the first argument that is an arrow or
// function expression. `test.each(table)(name, cb)` keeps the callback as an
// argument of the outer call, so this finds it there too.
const testCallback = (call: CallExpression): FunctionNode | null => {
  for (const arg of call.arguments) {
    if (
      arg.type === "ArrowFunctionExpression" ||
      arg.type === "FunctionExpression"
    ) {
      return arg as FunctionNode;
    }
  }
  return null;
};

// Count the direct `expect(...)` assertions: ExpressionStatements in the test
// callback's block body whose expression is anchored at an `expect(...)` call.
// Assertions nested in loops, conditionals, callbacks, or helper functions are
// not counted -- how many run per test execution is not statically known.
const countDirectExpects = (body: BlockStatement): number => {
  let count = 0;
  for (const statement of body.body) {
    if (statement.type !== "ExpressionStatement") {
      continue;
    }
    const expression = (statement as ExpressionStatement).expression;
    if (isExpectExpression(expression)) {
      count++;
    }
  }
  return count;
};

// The prohibition message. A test with more than one assertion is a hard error;
// the foundation of this plugin is the ban, and the fix is named here so the
// reader (often a coding agent) has a concrete next step rather than just a
// "too many expects" complaint.
const genericMessage = (count: number): string => {
  return `This test makes ${count} top-level expect() assertions, but a test should verify a single behavior. Reduce it to one: consolidate assertions about the same value into a single exhaustive 'toEqual', split distinct behaviors into separate tests, or use 'test.each' for same-shaped input variations.`;
};

const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow multiple top-level expect() assertions in a single test, and guide the author to the right fix (consolidate, split, or test.each).",
    },
    schema: [],
  },
  create(context: RuleContext): Visitor {
    const checkCall = (node: CallExpression): void => {
      const root = rootCalleeName(node);
      if (root === null || !TEST_CALLEES.has(root)) {
        return;
      }
      const callback = testCallback(node);
      if (callback === null || callback.body.type !== "BlockStatement") {
        return;
      }
      const count = countDirectExpects(callback.body as BlockStatement);
      if (count >= 2) {
        context.report({ message: genericMessage(count), node });
      }
    };

    return {
      CallExpression: checkCall as unknown as (node: never) => void,
    };
  },
} satisfies Rule;

const plugin = {
  meta: { name: "crescware-single-behavior-per-test" },
  rules: {
    "single-behavior-per-test": rule,
  },
} satisfies Plugin;

export default plugin;
