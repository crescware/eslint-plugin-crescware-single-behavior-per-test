// Minimal structural types for the ESTree / TS-ESTree nodes this rule reads.
// oxlint hands the JS plugin ESTree-compatible nodes; only the fields actually
// inspected here are modeled and the rest are left opaque.
type Node = { type: string };

type Identifier = { type: "Identifier"; name: string };

type Literal = { type: "Literal"; value: unknown; raw?: string };

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

type AwaitExpression = { type: "AwaitExpression"; argument: Node };

type AssignmentExpression = { type: "AssignmentExpression"; left: Node };

type UpdateExpression = {
  type: "UpdateExpression";
  operator: string;
  argument: Node;
};

type TemplateLiteral = { type: "TemplateLiteral"; expressions: Node[] };

type ArrayExpression = { type: "ArrayExpression"; elements: (Node | null)[] };

type ObjectExpression = { type: "ObjectExpression"; properties: Node[] };

type Property = {
  type: "Property";
  key: Node;
  value: Node;
  computed: boolean;
};

type SpreadElement = { type: "SpreadElement"; argument: Node };

type UnaryExpression = {
  type: "UnaryExpression";
  operator: string;
  argument: Node;
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

// ---------------------------------------------------------------------------
// Shared AST helpers
// ---------------------------------------------------------------------------

// The callee identifiers whose callback bodies this rule treats as a test.
const TEST_CALLEES = new Set<string>(["test", "it"]);

// `await x` -> `x`; anything else is returned unchanged. Used so an async
// assertion (`await expect(p).resolves.toBe(1)`) is seen as an expect, not an
// Act.
const unwrapAwait = (node: Node): Node => {
  return node.type === "AwaitExpression"
    ? (node as AwaitExpression).argument
    : node;
};

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
// `expect(x).resolves.toBe(...)`) and async forms (`await expect(...)`) are
// recognized. Each step descends to a strictly deeper child, so it terminates.
const isExpectExpression = (node: Node): boolean => {
  let current: Node = unwrapAwait(node);
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

// A statement that is a top-level assertion: `expect(...).matcher(...)` (or its
// awaited form) written as an ExpressionStatement.
const isExpectStatement = (statement: Node): boolean => {
  return (
    statement.type === "ExpressionStatement" &&
    isExpectExpression((statement as ExpressionStatement).expression)
  );
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

// A readable name for a callee / assignment target: `foo` -> "foo",
// `obj.method` -> "obj.method". Computed and exotic forms collapse to "…".
const readable = (node: Node): string => {
  if (node.type === "Identifier") {
    return (node as Identifier).name;
  }
  if (node.type === "MemberExpression") {
    const member = node as MemberExpression;
    if (!member.computed && member.property.type === "Identifier") {
      return `${readable(member.object)}.${(member.property as Identifier).name}`;
    }
  }
  return "…";
};

// A structural fingerprint of a node. Literal *values* are dropped but
// identifier and property *names* are kept, so `add(1, 2)` and `add(3, 4)` share
// a key (same shape, different data) while `r.a` and `r.b` do not. With
// `keepValues`, literal values are kept too, which distinguishes "same shape,
// different values" from an exact duplicate.
const nodeKey = (node: Node, keepValues: boolean): string => {
  switch (node.type) {
    case "Identifier": {
      return `Id:${(node as Identifier).name}`;
    }
    case "Literal": {
      const literal = node as Literal;
      return keepValues ? `Lit:${literal.raw ?? String(literal.value)}` : "Lit";
    }
    case "TemplateLiteral": {
      const template = node as TemplateLiteral;
      const parts = template.expressions
        .map((expression) => nodeKey(expression, keepValues))
        .join(",");
      return `Tpl(${parts})`;
    }
    case "MemberExpression": {
      const member = node as MemberExpression;
      const property = member.computed
        ? `[${nodeKey(member.property, keepValues)}]`
        : `.${readableProperty(member.property)}`;
      return `${nodeKey(member.object, keepValues)}${property}`;
    }
    case "CallExpression": {
      const call = node as CallExpression;
      return `${nodeKey(call.callee, keepValues)}(${tupleKey(call.arguments, keepValues)})`;
    }
    case "ArrayExpression": {
      const array = node as ArrayExpression;
      const elements = array.elements
        .map((element) =>
          element === null ? "Hole" : nodeKey(element, keepValues),
        )
        .join(",");
      return `[${elements}]`;
    }
    case "ObjectExpression": {
      const object = node as ObjectExpression;
      const properties = object.properties
        .map((property) => nodeKey(property, keepValues))
        .join(",");
      return `{${properties}}`;
    }
    case "Property": {
      const property = node as Property;
      const key = property.computed
        ? `[${nodeKey(property.key, keepValues)}]`
        : readableProperty(property.key);
      return `${key}:${nodeKey(property.value, keepValues)}`;
    }
    case "SpreadElement": {
      return `...${nodeKey((node as SpreadElement).argument, keepValues)}`;
    }
    case "UnaryExpression": {
      const unary = node as UnaryExpression;
      return `${unary.operator}${nodeKey(unary.argument, keepValues)}`;
    }
    default: {
      return node.type;
    }
  }
};

const readableProperty = (node: Node): string => {
  if (node.type === "Identifier") {
    return (node as Identifier).name;
  }
  if (node.type === "Literal") {
    const literal = node as Literal;
    return literal.raw ?? String(literal.value);
  }
  return "#prop";
};

const tupleKey = (nodes: Node[], keepValues: boolean): string => {
  return nodes.map((node) => nodeKey(node, keepValues)).join(",");
};

const hasSpread = (nodes: Node[]): boolean => {
  return nodes.some((node) => node.type === "SpreadElement");
};

// ---------------------------------------------------------------------------
// ExpectOccurrence: a normalized view of one `expect(base).<mods>.matcher(args)`
// ---------------------------------------------------------------------------

type BaseShape =
  | { kind: "member"; root: string; accessPath: string[] }
  | { kind: "call"; calleeNode: Node; argsNode: Node[] }
  | { kind: "identifier"; root: string }
  | { kind: "other" };

const baseShapeOf = (base: Node | undefined): BaseShape => {
  if (base === undefined) {
    return { kind: "other" };
  }
  if (base.type === "Identifier") {
    return { kind: "identifier", root: (base as Identifier).name };
  }
  if (base.type === "CallExpression") {
    const call = base as CallExpression;
    return { kind: "call", calleeNode: call.callee, argsNode: call.arguments };
  }
  if (base.type === "MemberExpression") {
    const accessPath: string[] = [];
    let current: Node = base;
    while (current.type === "MemberExpression") {
      const member = current as MemberExpression;
      if (member.computed) {
        accessPath.unshift("#computed");
      } else {
        accessPath.unshift(readableProperty(member.property));
      }
      current = member.object;
    }
    if (current.type !== "Identifier") {
      // Rooted at a call / `this` / etc.: not safely consolidatable.
      return { kind: "other" };
    }
    return { kind: "member", root: (current as Identifier).name, accessPath };
  }
  return { kind: "other" };
};

type ExpectOccurrence = {
  matcherName: string | null;
  negation: boolean;
  modifier: string | null;
  matcherCall: CallExpression;
  baseShape: BaseShape;
};

// Parse `expect(base).<not?>.<resolves|rejects?>.matcher(args)` into a record.
// Returns null when the expression is not a matcher call anchored at expect
// (e.g. a bare `expect(x)` with no matcher).
const parseExpectChain = (expression: Node): ExpectOccurrence | null => {
  const root = unwrapAwait(expression);
  if (root.type !== "CallExpression") {
    return null;
  }
  const matcherCall = root as CallExpression;
  const callee = matcherCall.callee;
  if (callee.type !== "MemberExpression") {
    return null;
  }
  const matcherMember = callee as MemberExpression;
  let matcherName: string | null;
  if (matcherMember.computed) {
    matcherName = null;
  } else if (matcherMember.property.type === "Identifier") {
    matcherName = (matcherMember.property as Identifier).name;
  } else {
    matcherName = null;
  }
  let negation = false;
  let modifier: string | null = null;
  let current: Node = matcherMember.object;
  while (current.type === "MemberExpression") {
    const member = current as MemberExpression;
    if (!member.computed && member.property.type === "Identifier") {
      const name = (member.property as Identifier).name;
      if (name === "not") {
        negation = true;
      } else if (name === "resolves" || name === "rejects") {
        modifier = name;
      }
    }
    current = member.object;
  }
  if (!isExpectCall(current)) {
    return null;
  }
  const base = (current as CallExpression).arguments[0];
  return {
    matcherName,
    negation,
    modifier,
    matcherCall,
    baseShape: baseShapeOf(base),
  };
};

// ---------------------------------------------------------------------------
// Act detection (Step 0)
// ---------------------------------------------------------------------------

// A statement that changes observable state, used to detect "assert, act,
// assert" inside one test. Conservative: declarations are setup, expect
// statements are assertions, and only assignments / updates / awaits / bare
// calls (a call whose result is discarded, presumed side-effecting) count.
const isActStatement = (statement: Node): boolean => {
  if (statement.type !== "ExpressionStatement") {
    return false;
  }
  const expression = (statement as ExpressionStatement).expression;
  return (
    expression.type === "AwaitExpression" ||
    expression.type === "AssignmentExpression" ||
    expression.type === "UpdateExpression" ||
    expression.type === "CallExpression"
  );
};

const actDescription = (statement: Node): string => {
  const expression = (statement as ExpressionStatement).expression;
  if (expression.type === "CallExpression") {
    return `${readable((expression as CallExpression).callee)}()`;
  }
  if (expression.type === "AwaitExpression") {
    const argument = (expression as AwaitExpression).argument;
    if (argument.type === "CallExpression") {
      return `await ${readable((argument as CallExpression).callee)}()`;
    }
    return "an await";
  }
  if (expression.type === "AssignmentExpression") {
    return `${readable((expression as AssignmentExpression).left)} = …`;
  }
  if (expression.type === "UpdateExpression") {
    const update = expression as UpdateExpression;
    return `${readable(update.argument)}${update.operator}`;
  }
  return "a state change";
};

// ---------------------------------------------------------------------------
// Messages: each carries the fix as a prompt for the reader (a coding agent).
// ---------------------------------------------------------------------------

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

// A human description of each occurrence's shape, used to explain a
// heterogeneity split: "toEqual on parse()" vs "toThrow on errs".
const shapeSummary = (occurrences: ExpectOccurrence[]): string => {
  const describe = (occurrence: ExpectOccurrence): string => {
    const matcher = `${occurrence.negation ? "not." : ""}${
      occurrence.modifier !== null ? `${occurrence.modifier}.` : ""
    }${occurrence.matcherName ?? "?"}`;
    const shape = occurrence.baseShape;
    let receiver: string;
    if (shape.kind === "call") {
      receiver = `${readable(shape.calleeNode)}()`;
    } else if (shape.kind === "member") {
      receiver = [shape.root, ...shape.accessPath].join(".");
    } else if (shape.kind === "identifier") {
      receiver = shape.root;
    } else {
      receiver = "an expression";
    }
    return `${matcher} on ${receiver}`;
  };
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const occurrence of occurrences) {
    const label = describe(occurrence);
    if (!seen.has(label)) {
      seen.add(label);
      labels.push(label);
    }
  }
  return labels.join(" vs ");
};

// ---------------------------------------------------------------------------
// routeTest: the heuristic router. Returns the message to report, or null when
// the test is not a violation (0 or 1 direct expect).
// ---------------------------------------------------------------------------

const routeTest = (body: BlockStatement): string | null => {
  const statements = body.body;
  const expectIndices: number[] = [];
  statements.forEach((statement, index) => {
    if (isExpectStatement(statement)) {
      expectIndices.push(index);
    }
  });
  const count = expectIndices.length;
  if (count <= 1) {
    return null;
  }

  // Step 0: an Act between the first and last assertion means the test observes
  // two states; split at the boundary.
  const first = expectIndices[0] ?? 0;
  const last = expectIndices[count - 1] ?? 0;
  for (let index = first + 1; index < last; index++) {
    const statement = statements[index];
    if (statement === undefined || isExpectStatement(statement)) {
      continue;
    }
    if (isActStatement(statement)) {
      return splitByActMessage(actDescription(statement));
    }
  }

  const parsed = expectIndices.map((index) =>
    parseExpectChain((statements[index] as ExpressionStatement).expression),
  );

  // Guard: anything we cannot classify safely keeps the ban but falls back to
  // the generic self-diagnosis message.
  if (
    parsed.some(
      (occurrence) =>
        occurrence === null ||
        occurrence.matcherName === null ||
        occurrence.baseShape.kind === "other",
    )
  ) {
    return genericMessage(count);
  }
  const occurrences = parsed as ExpectOccurrence[];

  // Step 1: homogeneity of the assertion shape.
  const signature = (occurrence: ExpectOccurrence): string => {
    return `${occurrence.matcherName}|${occurrence.negation}|${occurrence.modifier}|${occurrence.baseShape.kind}`;
  };
  if (new Set(occurrences.map(signature)).size > 1) {
    return splitByHeterogeneityMessage(shapeSummary(occurrences));
  }

  // Step 2: where the variation lives.
  const kind = occurrences[0]?.baseShape.kind;
  if (kind === "member") {
    const shapes = occurrences.map(
      (occurrence) =>
        occurrence.baseShape as {
          kind: "member";
          root: string;
          accessPath: string[];
        },
    );
    const roots = new Set(shapes.map((shape) => shape.root));
    if (roots.size > 1) {
      return genericMessage(count);
    }
    const paths = shapes.map((shape) => shape.accessPath.join("."));
    if (new Set(paths).size >= 2) {
      return consolidateMessage(shapes[0]?.root ?? "", paths);
    }
    return genericMessage(count);
  }
  if (kind === "call") {
    const shapes = occurrences.map(
      (occurrence) =>
        occurrence.baseShape as {
          kind: "call";
          calleeNode: Node;
          argsNode: Node[];
        },
    );
    if (
      new Set(shapes.map((shape) => nodeKey(shape.calleeNode, false))).size > 1
    ) {
      return splitByHeterogeneityMessage(shapeSummary(occurrences));
    }
    if (shapes.some((shape) => hasSpread(shape.argsNode))) {
      return genericMessage(count);
    }
    if (
      new Set(shapes.map((shape) => tupleKey(shape.argsNode, false))).size > 1
    ) {
      return genericMessage(count);
    }
    if (
      new Set(
        occurrences.map((occurrence) => nodeKey(occurrence.matcherCall, true)),
      ).size <= 1
    ) {
      return genericMessage(count);
    }
    return eachOrSplitMessage(
      readable(shapes[0]?.calleeNode ?? { type: "" }),
      count,
    );
  }
  return genericMessage(count);
};

// ---------------------------------------------------------------------------
// Rule / Plugin
// ---------------------------------------------------------------------------

const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow multiple top-level expect() assertions in a single test, and tell the author how to fix it (consolidate, split, or test.each).",
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
      const message = routeTest(callback.body as BlockStatement);
      if (message !== null) {
        context.report({ message, node });
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
