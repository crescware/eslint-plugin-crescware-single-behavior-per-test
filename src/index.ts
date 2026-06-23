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

type ChainExpression = { type: "ChainExpression"; expression: Node };

type AwaitExpression = { type: "AwaitExpression"; argument: Node };

type AssignmentExpression = { type: "AssignmentExpression"; left: Node };

type UpdateExpression = {
  type: "UpdateExpression";
  operator: string;
  argument: Node;
};

type ExpressionStatement = { type: "ExpressionStatement"; expression: Node };

type BlockStatement = { type: "BlockStatement"; body: Node[] };

type VariableDeclaration = {
  type: "VariableDeclaration";
  declarations: Node[];
};

type VariableDeclarator = {
  type: "VariableDeclarator";
  id: Node;
  init: Node | null;
};

type FunctionDeclaration = { type: "FunctionDeclaration"; id: Node | null };

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

// Method names that conventionally mutate their receiver. A call to one of these
// between assertions is treated as an Act regardless of the receiver.
const MUTATING_METHODS = new Set<string>([
  "push",
  "pop",
  "shift",
  "unshift",
  "splice",
  "sort",
  "reverse",
  "fill",
  "copyWithin",
  "set",
  "delete",
  "add",
  "clear",
  "dispatch",
]);

// Loop statements whose body, if it asserts, is a hand-rolled parametrized test.
const LOOP_TYPES = new Set<string>([
  "ForStatement",
  "ForOfStatement",
  "ForInStatement",
  "WhileStatement",
  "DoWhileStatement",
]);

// Array iteration methods whose callback, if it asserts, is the same anti-pattern
// as a loop (iterating assertions over data instead of using test.each).
const ITER_METHODS = new Set<string>([
  "forEach",
  "map",
  "flatMap",
  "filter",
  "reduce",
  "reduceRight",
  "some",
  "every",
  "find",
  "findIndex",
]);

// `await x` -> `x`; anything else is returned unchanged.
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

// The first argument that is an arrow / function expression: the test body.
// `test.each(table)(name, cb)` keeps the callback on the outer call, so this
// finds it there too.
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

// The deepest object identifier of a member chain: `a.b.c` -> "a", `a` -> "a".
// Returns null when the chain bottoms out in something else (a call, `this`).
const memberRoot = (node: Node): string | null => {
  let current: Node = node;
  while (current.type === "MemberExpression") {
    current = (current as MemberExpression).object;
  }
  return current.type === "Identifier" ? (current as Identifier).name : null;
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

// A readable name for a callee / target: `foo` -> "foo", `obj.method` ->
// "obj.method", `arr[0]` -> "arr[0]". Exotic forms collapse to "…".
const readable = (node: Node): string => {
  if (node.type === "Identifier") {
    return (node as Identifier).name;
  }
  if (node.type === "MemberExpression") {
    const member = node as MemberExpression;
    if (member.computed) {
      return `${readable(member.object)}[${readableProperty(member.property)}]`;
    }
    return `${readable(member.object)}.${readableProperty(member.property)}`;
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

const tupleKey = (nodes: Node[], keepValues: boolean): string => {
  return nodes.map((node) => nodeKey(node, keepValues)).join(",");
};

const hasSpread = (nodes: Node[]): boolean => {
  return nodes.some((node) => node.type === "SpreadElement");
};

// `items.forEach(...)`, `items.map(...)`, etc.: a call whose callee is one of the
// iteration methods.
const isIterationCall = (node: Node): boolean => {
  if (node.type !== "CallExpression") {
    return false;
  }
  const callee = (node as CallExpression).callee;
  if (callee.type !== "MemberExpression") {
    return false;
  }
  const member = callee as MemberExpression;
  return (
    !member.computed &&
    member.property.type === "Identifier" &&
    ITER_METHODS.has((member.property as Identifier).name)
  );
};

// Whether an arbitrary AST subtree contains an `expect(...)` anchor. Walks the
// real node objects generically (skipping the `parent` back-reference to avoid
// cycles) so it works on nodes whose shape this file does not model.
const containsExpectCall = (value: unknown): boolean => {
  if (value === null || typeof value !== "object") {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some((item) => containsExpectCall(item));
  }
  const record = value as Record<string, unknown>;
  if (typeof record["type"] === "string" && isExpectCall(value as Node)) {
    return true;
  }
  for (const key of Object.keys(record)) {
    if (key === "parent") {
      continue;
    }
    if (containsExpectCall(record[key])) {
      return true;
    }
  }
  return false;
};

// Whether the test body iterates assertions: a loop, or an iteration-method
// callback, whose subtree contains an `expect(...)`. That is a hand-rolled
// parametrized test and should become test.each.
const hasLoopAssertion = (value: unknown): boolean => {
  if (value === null || typeof value !== "object") {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some((item) => hasLoopAssertion(item));
  }
  const record = value as Record<string, unknown>;
  const type = record["type"];
  if (typeof type === "string") {
    if (LOOP_TYPES.has(type) && containsExpectCall(value)) {
      return true;
    }
    if (isIterationCall(value as Node) && containsExpectCall(value)) {
      return true;
    }
  }
  for (const key of Object.keys(record)) {
    if (key === "parent") {
      continue;
    }
    if (hasLoopAssertion(record[key])) {
      return true;
    }
  }
  return false;
};

// The names of locally-declared functions whose body asserts (`const check =
// (v) => expect(v)...`, `function check() { expect... }`). Calling such a helper
// repeatedly is the same hand-rolled parametrization as a loop.
const assertingHelperNames = (statements: Node[]): Set<string> => {
  const names = new Set<string>();
  for (const statement of statements) {
    if (statement.type === "FunctionDeclaration") {
      const fn = statement as FunctionDeclaration;
      if (
        fn.id !== null &&
        fn.id.type === "Identifier" &&
        containsExpectCall(statement)
      ) {
        names.add((fn.id as Identifier).name);
      }
      continue;
    }
    if (statement.type === "VariableDeclaration") {
      for (const declarator of (statement as VariableDeclaration)
        .declarations) {
        if (declarator.type !== "VariableDeclarator") {
          continue;
        }
        const declared = declarator as VariableDeclarator;
        const init = declared.init;
        if (
          init !== null &&
          (init.type === "ArrowFunctionExpression" ||
            init.type === "FunctionExpression") &&
          declared.id.type === "Identifier" &&
          containsExpectCall(init)
        ) {
          names.add((declared.id as Identifier).name);
        }
      }
    }
  }
  return names;
};

// Whether an asserting local helper is invoked two or more times as direct
// statements: the helper form of a parametrized test.
const hasRepeatedHelperAssertion = (body: BlockStatement): boolean => {
  const helpers = assertingHelperNames(body.body);
  if (helpers.size === 0) {
    return false;
  }
  const counts = new Map<string, number>();
  for (const statement of body.body) {
    if (statement.type !== "ExpressionStatement") {
      continue;
    }
    const expression = unwrapAwait(
      (statement as ExpressionStatement).expression,
    );
    if (expression.type !== "CallExpression") {
      continue;
    }
    const callee = (expression as CallExpression).callee;
    if (callee.type !== "Identifier") {
      continue;
    }
    const name = (callee as Identifier).name;
    if (!helpers.has(name)) {
      continue;
    }
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  for (const count of counts.values()) {
    if (count >= 2) {
      return true;
    }
  }
  return false;
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
  // `r?.a` parses as a ChainExpression wrapping the (optional) member access.
  const node =
    base.type === "ChainExpression"
      ? (base as ChainExpression).expression
      : base;
  if (node.type === "Identifier") {
    return { kind: "identifier", root: (node as Identifier).name };
  }
  if (node.type === "CallExpression") {
    const call = node as CallExpression;
    return { kind: "call", calleeNode: call.callee, argsNode: call.arguments };
  }
  if (node.type === "MemberExpression") {
    const accessPath: string[] = [];
    let computed = false;
    let current: Node = node;
    while (current.type === "MemberExpression") {
      const member = current as MemberExpression;
      if (member.computed) {
        // A dynamic field (`r[i]`) has no statically known name, so we cannot
        // safely assert a consolidate; treat the whole base as unclassifiable.
        computed = true;
      } else {
        accessPath.unshift(readableProperty(member.property));
      }
      current = member.object;
    }
    if (current.type !== "Identifier" || computed) {
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
// (e.g. a bare `expect(x)` with no matcher), so such a statement neither counts
// as a direct assertion nor pollutes routing.
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
// assert" inside one test. Conservative on calls: a bare function call is NOT an
// Act (it may be pure logging), but a method call IS an Act when it either names
// a known mutating method or is invoked on the value under test (e.g.
// `counter.increment()` while the test asserts `counter.value`).
const isActStatement = (
  statement: Node,
  underTestRoots: Set<string>,
): boolean => {
  if (statement.type !== "ExpressionStatement") {
    return false;
  }
  const expression = (statement as ExpressionStatement).expression;
  if (
    expression.type === "AwaitExpression" ||
    expression.type === "AssignmentExpression" ||
    expression.type === "UpdateExpression"
  ) {
    return true;
  }
  if (expression.type !== "CallExpression") {
    return false;
  }
  const callee = (expression as CallExpression).callee;
  if (callee.type !== "MemberExpression") {
    return false;
  }
  const member = callee as MemberExpression;
  if (
    !member.computed &&
    member.property.type === "Identifier" &&
    MUTATING_METHODS.has((member.property as Identifier).name)
  ) {
    return true;
  }
  const root = memberRoot(member.object);
  return root !== null && underTestRoots.has(root);
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
// Messages: each carries the fix as a prompt for the reader (a coding agent),
// an evaluable criterion, and a guard against the cheap dodge of deleting an
// assertion to silence the rule.
// ---------------------------------------------------------------------------

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

const loopEachMessage = (): string => {
  return `This test runs the same assertion logic over several inputs by hand — via a loop, an iteration callback, or a repeated call to a local assertion helper. That is a hand-rolled parametrized test. Rewrite it as test.each(cases)(name, (case) => { ... }) so every case becomes a named, independently-reported test — a loop or repeated call stops at the first failure and hides which input failed. This is parametrization, not a consolidation or a split.`;
};

// A human description of each occurrence's shape, used to explain a
// heterogeneity split: "toEqual on parse() vs toThrow on errs".
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
  // A loop / iteration callback that asserts, or an asserting local helper
  // called repeatedly, is a hand-rolled parametrized test; route it to test.each
  // before counting direct expects.
  if (hasLoopAssertion(body) || hasRepeatedHelperAssertion(body)) {
    return loopEachMessage();
  }
  const statements = body.body;
  const entries: { index: number; occurrence: ExpectOccurrence }[] = [];
  statements.forEach((statement, index) => {
    if (statement.type !== "ExpressionStatement") {
      return;
    }
    const occurrence = parseExpectChain(
      (statement as ExpressionStatement).expression,
    );
    if (occurrence !== null) {
      entries.push({ index, occurrence });
    }
  });
  const count = entries.length;
  if (count <= 1) {
    return null;
  }
  const occurrences = entries.map((entry) => entry.occurrence);

  // The objects under direct test, used to recognize a mutation of the subject
  // (e.g. `counter.increment()`) as an Act.
  const underTestRoots = new Set<string>();
  for (const occurrence of occurrences) {
    const shape = occurrence.baseShape;
    if (shape.kind === "member" || shape.kind === "identifier") {
      underTestRoots.add(shape.root);
    }
  }

  // Step 0: an Act between the first and last assertion means the test observes
  // two states; split at the boundary.
  const expectIndices = new Set(entries.map((entry) => entry.index));
  const first = entries[0]?.index ?? 0;
  const last = entries[count - 1]?.index ?? 0;
  for (let index = first + 1; index < last; index++) {
    if (expectIndices.has(index)) {
      continue;
    }
    const statement = statements[index];
    if (statement === undefined) {
      continue;
    }
    if (isActStatement(statement, underTestRoots)) {
      return splitByActMessage(actDescription(statement));
    }
  }

  // Guard: anything we cannot classify safely keeps the ban but falls back to
  // the generic self-diagnosis message.
  if (
    occurrences.some(
      (occurrence) =>
        occurrence.matcherName === null ||
        occurrence.baseShape.kind === "other",
    )
  ) {
    return genericMessage(count);
  }

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
    if (new Set(shapes.map((shape) => shape.root)).size > 1) {
      return genericMessage(count);
    }
    const paths = shapes.map((shape) => shape.accessPath.join("."));
    const distinct = [...new Set(paths)];
    if (distinct.length >= 2) {
      return consolidateMessage(shapes[0]?.root ?? "", distinct);
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
    // Same callee, same argument shape: an each candidate only if the input
    // values actually differ. Identical inputs (only the expected value varies,
    // or an exact duplicate) are not parameterizable.
    if (
      new Set(shapes.map((shape) => tupleKey(shape.argsNode, true))).size <= 1
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
