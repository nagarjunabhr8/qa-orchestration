/**
 * Test-case generation engine (Test Case Generator — agent 04).
 *
 * Implements the agent spec (agents/04-test-case-generator.md): for each
 * feature/acceptance criterion it produces positive, negative, edge, and
 * destructive cases, each with atomic steps, specific expected results,
 * concrete test data, an automation-feasibility rating + reason, and a
 * minimal Playwright snippet for automatable cases.
 *
 * Cases are derived from a PRD's feature list, so different PRDs produce
 * different suites. Per feature: 5 positive, 4 negative, 6 edge/boundary,
 * 2 destructive = 17/feature.
 */

export type CaseType = 'Positive' | 'Negative' | 'Edge' | 'Destructive';
export type Priority = 'P0 - Critical' | 'P1 - High' | 'P2 - Medium' | 'P3 - Low';
export type Feasibility = 'HIGH' | 'MEDIUM' | 'LOW';

export interface TestCase {
  id: string;
  title: string;
  feature: string;
  type: CaseType;
  priority: Priority;
  preconditions: string;
  steps: string;
  testData: string;
  expectedResult: string;
  acRef: string;
  /** Automation feasibility rating (HIGH | MEDIUM | LOW). */
  automationFeasibility: Feasibility;
  /** Why the case has that feasibility / whether manual execution is needed. */
  feasibilityReason: string;
  /** Minimal Playwright snippet for automatable cases ('' when manual). */
  playwrightSnippet: string;
  /** The verbatim PRD requirement this case traces to ('' for legacy cases). */
  requirement?: string;
}

/** Minimal requirement shape consumed by the grounded generator. */
export interface RequirementInput {
  id: string;
  feature: string;
  text: string;
  dataTokens: string[];
}

/** Rich, human-sounding copy for well-known feature names. */
const KNOWN_COPY: Record<string, { action: string; data: string; expect: string }> = {
  Authentication: {
    action: 'navigate to the login page and submit credentials',
    data: 'username=qa_user, password=Valid@123',
    expect: 'the user is authenticated and redirected to the dashboard',
  },
  Login: {
    action: 'submit valid login credentials',
    data: 'username=qa_user, password=Valid@123',
    expect: 'the user is signed in successfully',
  },
  'Shopping Cart': {
    action: 'add an in-stock product to the cart and view the cart',
    data: 'SKU=PRD-1001, qty=2',
    expect: 'the item appears in the cart with the correct quantity and subtotal',
  },
  Checkout: {
    action: 'proceed through the checkout flow with a valid address',
    data: 'address=221B Baker St, shipping=Standard',
    expect: 'the order summary shows the correct totals and shipping option',
  },
  Payment: {
    action: 'submit payment using a valid card',
    data: 'card=4111 1111 1111 1111, exp=12/29, cvv=123',
    expect: 'the payment is authorised and a confirmation number is returned',
  },
  'Order Management': {
    action: 'open the order history and view an order',
    data: 'orderId=ORD-50012',
    expect: 'the order details and status are displayed accurately',
  },
  Search: {
    action: 'enter a query and run a search',
    data: 'query="wireless headphones"',
    expect: 'relevant results are returned and ranked correctly',
  },
  Notifications: {
    action: 'trigger an event that should notify the user',
    data: 'channel=email, event=order_shipped',
    expect: 'the notification is delivered through the chosen channel',
  },
};

function copyFor(feature: string): { action: string; data: string; expect: string } {
  return (
    KNOWN_COPY[feature] ?? {
      action: `exercise the ${feature} functionality with valid input`,
      data: `valid ${feature.toLowerCase()} input`,
      expect: `${feature} behaves exactly as specified in the requirements`,
    }
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function priorityFor(feature: string, type: CaseType, criticalFeatures: string[]): Priority {
  if (type === 'Positive' && criticalFeatures.includes(feature)) return 'P0 - Critical';
  if (type === 'Positive') return 'P1 - High';
  if (type === 'Negative') return 'P2 - Medium';
  if (type === 'Destructive') return 'P2 - Medium';
  return 'P3 - Low';
}

/** Short uppercase module token for the TC-{MODULE}-{n} id format. */
function moduleToken(feature: string): string {
  const letters = feature.replace(/[^a-zA-Z]/g, '');
  return letters.slice(0, 4).toUpperCase() || 'GEN';
}

/** A minimal Playwright snippet for an automatable case. */
function snippetFor(feature: string, type: CaseType): string {
  if (type === 'Destructive') return ''; // requires manual/chaos setup
  const expectLine =
    type === 'Negative'
      ? `await expect(page.getByRole('alert')).toBeVisible();`
      : `await expect(page).toHaveURL(/.*/);`;
  return [
    `test('${feature} ${type.toLowerCase()}', async ({ page }) => {`,
    `  await page.goto(BASE_URL);`,
    `  // ${cap(copyFor(feature).action)}`,
    `  ${expectLine}`,
    `});`,
  ].join('\n');
}

interface BuiltCase {
  title: string;
  preconditions: string;
  steps: string;
  testData: string;
  expectedResult: string;
  automationFeasibility: Feasibility;
  feasibilityReason: string;
}

/**
 * Distinct scenario variants per test type. Each variant produces a
 * genuinely different case (its own scenario, steps, data, and expected
 * result) so no two generated cases are duplicates of one another.
 */
interface Variant {
  /** Short scenario label, appended to the title to keep cases unique. */
  scenario: string;
  build: (f: string, c: { action: string; data: string; expect: string }) => BuiltCase;
}

const POSITIVE_VARIANTS: Variant[] = [
  {
    scenario: 'valid happy path',
    build: (f, c) => ({
      title: `${f}: valid happy path succeeds`,
      preconditions: 'User is authenticated; system is in a known good state.',
      steps: `1. Open the ${f} module.\n2. ${cap(c.action)} with valid input.\n3. Confirm the result.`,
      testData: c.data,
      expectedResult: `Successfully completes — ${c.expect}.`,
      automationFeasibility: 'HIGH',
      feasibilityReason: 'Deterministic happy path with stable selectors.',
    }),
  },
  {
    scenario: 'minimum required fields',
    build: (f, c) => ({
      title: `${f}: succeeds with only the required fields`,
      preconditions: 'User is authenticated; optional fields left blank.',
      steps: `1. Open the ${f} module.\n2. ${cap(c.action)} providing only mandatory fields.\n3. Submit.`,
      testData: `${c.data} (required fields only)`,
      expectedResult: `The action completes successfully using only required data — ${c.expect}.`,
      automationFeasibility: 'HIGH',
      feasibilityReason: 'Mandatory-field path is deterministic.',
    }),
  },
  {
    scenario: 'persists after reload',
    build: (f) => ({
      title: `${f}: result persists after page reload`,
      preconditions: 'A successful action has just been performed.',
      steps: `1. Complete a valid ${f} action.\n2. Reload the page.\n3. Re-open the ${f} module.`,
      testData: 'Previously saved record',
      expectedResult: `The saved ${f} data is still present and unchanged after reload.`,
      automationFeasibility: 'HIGH',
      feasibilityReason: 'State persistence is observable after navigation.',
    }),
  },
  {
    scenario: 'confirmation feedback',
    build: (f) => ({
      title: `${f}: shows a success confirmation`,
      preconditions: 'User is on the relevant screen.',
      steps: `1. Perform a valid ${f} action.\n2. Observe the on-screen feedback.`,
      testData: 'Valid input',
      expectedResult: `A clear success message/toast is shown confirming the ${f} action.`,
      automationFeasibility: 'HIGH',
      feasibilityReason: 'Confirmation element is assertable.',
    }),
  },
  {
    scenario: 'audit/history updated',
    build: (f) => ({
      title: `${f}: action is recorded in history/audit`,
      preconditions: 'History/activity view is accessible.',
      steps: `1. Perform a valid ${f} action.\n2. Open the history/activity view.`,
      testData: 'Valid input',
      expectedResult: `The ${f} action appears in history with a correct timestamp and details.`,
      automationFeasibility: 'MEDIUM',
      feasibilityReason: 'Requires navigating to a secondary view.',
    }),
  },
];

const NEGATIVE_VARIANTS: Variant[] = [
  {
    scenario: 'missing required field',
    build: (f) => ({
      title: `${f}: missing required field is rejected`,
      preconditions: 'User is on the relevant screen.',
      steps: `1. Open the ${f} module.\n2. Submit with a required field left empty.\n3. Observe validation.`,
      testData: 'Required field omitted',
      expectedResult:
        'A field-level validation error "This field is required" is shown; submission is blocked (no state change).',
      automationFeasibility: 'HIGH',
      feasibilityReason: 'Required-field validation is assertable.',
    }),
  },
  {
    scenario: 'invalid format',
    build: (f, c) => ({
      title: `${f}: invalid input format is rejected`,
      preconditions: 'User is on the relevant screen.',
      steps: `1. Open the ${f} module.\n2. Enter badly formatted input and submit.\n3. Observe error handling.`,
      testData: `${c.data} → malformed format`,
      expectedResult:
        'A clear format error is shown (HTTP 400); the action is blocked and nothing is saved.',
      automationFeasibility: 'HIGH',
      feasibilityReason: 'Format error message and status code are assertable.',
    }),
  },
  {
    scenario: 'unauthorized access',
    build: (f) => ({
      title: `${f}: unauthorized access is denied`,
      preconditions: 'User is not logged in / lacks permission.',
      steps: `1. Attempt to access the ${f} module without authorization.\n2. Observe the response.`,
      testData: 'No / insufficient credentials',
      expectedResult:
        'Access is denied with HTTP 401/403 and the user is redirected to login or shown a permission error.',
      automationFeasibility: 'HIGH',
      feasibilityReason: 'Auth response is assertable.',
    }),
  },
  {
    scenario: 'duplicate submission',
    build: (f) => ({
      title: `${f}: duplicate submission is prevented`,
      preconditions: 'A valid record already exists.',
      steps: `1. Perform a ${f} action that already exists.\n2. Submit again.\n3. Observe handling.`,
      testData: 'Duplicate of an existing record',
      expectedResult:
        'A duplicate error (HTTP 409) is shown; no second record is created.',
      automationFeasibility: 'MEDIUM',
      feasibilityReason: 'Requires seeding an existing record first.',
    }),
  },
];

const EDGE_VARIANTS: Variant[] = [
  {
    scenario: 'empty / zero state',
    build: (f) => ({
      title: `${f}: empty / zero boundary handled`,
      preconditions: 'No data exists for this feature yet.',
      steps: `1. Open the ${f} module with no existing data / a zero value.\n2. Submit or observe the empty state.\n3. Confirm handling.`,
      testData: 'Empty dataset / value = 0 [boundary: zero]',
      expectedResult:
        'A friendly empty-state message is shown (or zero is rejected where invalid); no errors and no broken layout.',
      automationFeasibility: 'HIGH',
      feasibilityReason: 'Empty/zero state is deterministic and assertable.',
    }),
  },
  {
    scenario: 'minimum valid value',
    build: (f, c) => ({
      title: `${f}: minimum valid boundary is accepted`,
      preconditions: 'System ready at the lower valid boundary.',
      steps: `1. Open the ${f} module.\n2. ${cap(c.action)} at the smallest allowed value/length (e.g. 1).\n3. Submit and verify.`,
      testData: `${c.data} → minimum allowed [boundary: min valid, e.g. 1]`,
      expectedResult:
        'The minimum valid value is accepted and processed normally; no off-by-one rejection.',
      automationFeasibility: 'MEDIUM',
      feasibilityReason: 'Lower-boundary fixtures are scriptable.',
    }),
  },
  {
    scenario: 'maximum valid value',
    build: (f, c) => ({
      title: `${f}: maximum valid boundary is accepted`,
      preconditions: 'System ready at the upper valid boundary.',
      steps: `1. Open the ${f} module.\n2. ${cap(c.action)} at the largest allowed value/length.\n3. Submit and verify.`,
      testData: `${c.data} → maximum allowed [boundary: max valid]`,
      expectedResult:
        'The maximum allowed value is accepted without truncation, rounding, or crash.',
      automationFeasibility: 'MEDIUM',
      feasibilityReason: 'Upper-boundary fixtures are scriptable.',
    }),
  },
  {
    scenario: 'one above maximum',
    build: (f, c) => ({
      title: `${f}: one above maximum is rejected`,
      preconditions: 'System ready just past the upper valid boundary.',
      steps: `1. Open the ${f} module.\n2. ${cap(c.action)} at one unit ABOVE the maximum allowed.\n3. Observe rejection.`,
      testData: `${c.data} → max + 1 [boundary: one above max — should reject]`,
      expectedResult:
        'The value is rejected with a clear, specific limit message; nothing is saved and no overflow occurs.',
      automationFeasibility: 'MEDIUM',
      feasibilityReason: 'Just-past-boundary rejection is assertable.',
    }),
  },
  {
    scenario: 'special characters',
    build: (f) => ({
      title: `${f}: special / unicode characters handled safely`,
      preconditions: 'User is on the relevant input screen.',
      steps: `1. Open the ${f} module.\n2. Enter special/unicode input such as O'Brien-García, "Apt #5", or emoji.\n3. Submit and verify rendering + storage.`,
      testData: `name="O'Brien-García", note="Apt #5, Floor 2 🚀" [boundary: special chars]`,
      expectedResult:
        'Special/unicode characters are accepted, stored, and rendered correctly (no encoding corruption, no injection).',
      automationFeasibility: 'MEDIUM',
      feasibilityReason: 'Character-set fixtures are scriptable.',
    }),
  },
  {
    scenario: 'very long input',
    build: (f) => ({
      title: `${f}: oversized input beyond field limit is rejected`,
      preconditions: 'A field with a defined maximum length exists.',
      steps: `1. Open the ${f} module.\n2. Paste input ONE character beyond the field's max length (e.g. 1001 chars in a 1000-char field).\n3. Observe handling.`,
      testData: '1001-character string in a 1000-char field [boundary: one over max length]',
      expectedResult:
        'Input is rejected or capped at the limit with a clear message; no layout break and no silent truncation of saved data.',
      automationFeasibility: 'MEDIUM',
      feasibilityReason: 'Length-boundary fixtures are scriptable.',
    }),
  },
];

const DESTRUCTIVE_VARIANTS: Variant[] = [
  {
    scenario: 'concurrent requests',
    build: (f, c) => ({
      title: `${f}: resilience under concurrent load`,
      preconditions: 'Ability to issue many simultaneous requests.',
      steps: `1. Open the ${f} module.\n2. Fire 100 concurrent ${f} requests.\n3. Observe stability and data integrity.`,
      testData: `${c.data} × 100 concurrent`,
      expectedResult:
        'No data corruption or deadlock; excess load is queued or rejected with HTTP 429/503 and recovers when load subsides.',
      automationFeasibility: 'LOW',
      feasibilityReason: 'MANUAL: needs load tooling and infra access.',
    }),
  },
  {
    scenario: 'corrupted / oversized payload',
    build: (f) => ({
      title: `${f}: rejects corrupted / oversized payload`,
      preconditions: 'Ability to send a malformed/oversized request.',
      steps: `1. Send a corrupted or oversized payload to the ${f} endpoint.\n2. Observe handling.`,
      testData: 'Malformed + oversized payload',
      expectedResult:
        'The request is rejected (HTTP 400/413) without crashing the service; no partial/corrupt data is persisted.',
      automationFeasibility: 'LOW',
      feasibilityReason: 'MANUAL: needs crafted payloads and backend access.',
    }),
  },
];

const VARIANTS: Record<CaseType, Variant[]> = {
  Positive: POSITIVE_VARIANTS,
  Negative: NEGATIVE_VARIANTS,
  Edge: EDGE_VARIANTS,
  Destructive: DESTRUCTIVE_VARIANTS,
};

/**
 * Cases generated per feature, by type. Counts are bounded by the number
 * of distinct variants available so no scenario repeats within a feature.
 */
const PER_FEATURE: Array<[CaseType, number]> = [
  ['Positive', POSITIVE_VARIANTS.length],
  ['Negative', NEGATIVE_VARIANTS.length],
  ['Edge', EDGE_VARIANTS.length],
  ['Destructive', DESTRUCTIVE_VARIANTS.length],
];

export interface CaseSetOptions {
  /** Features considered business-critical (their positives become P0). */
  criticalFeatures?: string[];
  /** Prefix for case ids when not using the TC-{module}-{n} format. */
  idPrefix?: string;
}

/**
 * Fingerprint for strict deduplication (agent 04 spec, RULE 1):
 * feature | scenario(title) | inputClass(type) | condition(testData).
 */
function fingerprint(c: Pick<TestCase, 'feature' | 'type' | 'title' | 'testData'>): string {
  return [c.feature, c.type, c.title, c.testData]
    .map((s) => s.trim().toLowerCase())
    .join('|');
}

/** Drop any case whose fingerprint has already been seen. */
function dedupe(cases: TestCase[]): TestCase[] {
  const seen = new Set<string>();
  const out: TestCase[] = [];
  for (const c of cases) {
    const fp = fingerprint(c);
    if (seen.has(fp)) continue;
    seen.add(fp);
    out.push(c);
  }
  return out;
}

/**
 * Generate the full test-case set for a list of features. Each feature
 * gets one case per distinct scenario variant (no repeated scenarios), and
 * a final fingerprint pass removes any residual duplicates.
 */
export function generateTestCasesForFeatures(
  features: string[],
  opts: CaseSetOptions = {}
): TestCase[] {
  const critical = opts.criticalFeatures ?? features.slice(0, 2);
  const cases: TestCase[] = [];
  // Per-module counter for TC-{MODULE}-{number} ids.
  const moduleCounters: Record<string, number> = {};
  let acCounter = 0;

  for (const [type, count] of PER_FEATURE) {
    const variants = VARIANTS[type];
    for (const feature of features) {
      const copy = copyFor(feature);
      const token = moduleToken(feature);
      for (let i = 0; i < count && i < variants.length; i++) {
        acCounter += 1;
        moduleCounters[token] = (moduleCounters[token] ?? 0) + 1;
        const built = variants[i].build(feature, copy);
        cases.push({
          id: opts.idPrefix
            ? `${opts.idPrefix}-${String(acCounter).padStart(3, '0')}`
            : `TC-${token}-${String(moduleCounters[token]).padStart(3, '0')}`,
          feature,
          type,
          priority: priorityFor(feature, type, critical),
          acRef: `AC-${String(((acCounter - 1) % (features.length * 7)) + 1).padStart(2, '0')}`,
          playwrightSnippet: snippetFor(feature, type),
          ...built,
        });
      }
    }
  }
  return dedupe(cases);
}

/** Smoke subset: positive P0/P1 cases of the critical features, capped. */
export function smokeFromCases(cases: TestCase[], cap = 9): TestCase[] {
  const smoke = cases.filter(
    (c) =>
      c.type === 'Positive' &&
      (c.priority === 'P0 - Critical' || c.priority === 'P1 - High')
  );
  return smoke.slice(0, cap).map((c, i) => ({
    ...c,
    id: `SMK-${String(i + 1).padStart(3, '0')}`,
    title: c.title.replace('valid flow succeeds', 'critical-path smoke check'),
  }));
}

/**
 * Regression suite: stable positive + negative core (excludes edge and
 * destructive cases, which are slower / less deterministic).
 */
export function regressionFromCases(cases: TestCase[]): TestCase[] {
  const core = cases.filter((c) => c.type === 'Positive' || c.type === 'Negative');
  return core.map((c, i) => ({
    ...c,
    id: `REG-${String(i + 1).padStart(3, '0')}`,
  }));
}

// ── Requirement-grounded generation (agent 04, strict PRD mode) ─────

/** Lower-case the first letter so the requirement reads inside a sentence. */
function lc(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/** Render the literal data tokens, or note that the PRD specified none. */
function dataFrom(tokens: string[]): string {
  return tokens.length
    ? tokens.join('; ')
    : 'As specified in the requirement (PRD states no explicit values).';
}

/**
 * Build the test cases for ONE requirement: a positive, a negative, and —
 * when the requirement implies limits/data — an edge case. Every field is
 * derived from the requirement text and its extracted data tokens; nothing
 * is invented.
 */
function casesForRequirement(
  req: RequirementInput,
  index: number,
  critical: boolean
): TestCase[] {
  const token = moduleToken(req.feature);
  const reqText = req.text.replace(/\s+/g, ' ').trim();
  const dataStr = dataFrom(req.dataTokens);
  const out: TestCase[] = [];
  let sub = 0;
  const nextId = () => {
    sub += 1;
    return `TC-${token}-${String(index).padStart(2, '0')}${String.fromCharCode(64 + sub)}`;
  };

  // Positive — the requirement is satisfied as written.
  out.push({
    id: nextId(),
    feature: req.feature,
    type: 'Positive',
    priority: critical ? 'P0 - Critical' : 'P1 - High',
    title: `${req.feature}: ${lc(reqText).slice(0, 80)}`,
    preconditions: `System is in a valid state for the "${req.feature}" feature.`,
    steps: `1. Open the ${req.feature} area.\n2. Exercise the behaviour: ${lc(reqText)}.\n3. Observe the outcome against the requirement.`,
    testData: dataStr,
    expectedResult: `The system behaves exactly as the PRD requires: ${reqText}`,
    acRef: req.id,
    automationFeasibility: 'HIGH',
    feasibilityReason: 'Requirement is explicit and assertable from the document.',
    playwrightSnippet: snippetFor(req.feature, 'Positive'),
    requirement: reqText,
  });

  // Negative — the requirement is violated; system must handle it.
  out.push({
    id: nextId(),
    feature: req.feature,
    type: 'Negative',
    priority: 'P2 - Medium',
    title: `${req.feature}: violating "${lc(reqText).slice(0, 60)}" is handled`,
    preconditions: `User is on the ${req.feature} screen with input that violates the requirement.`,
    steps: `1. Open the ${req.feature} area.\n2. Attempt to break the rule: ${lc(reqText)}.\n3. Observe the error handling.`,
    testData: req.dataTokens.length
      ? `Invalid variants of: ${req.dataTokens.join('; ')}`
      : 'Invalid / missing input for this requirement.',
    expectedResult: `The action is blocked with a clear, specific message; the rule "${reqText}" is enforced and no invalid state is saved.`,
    acRef: req.id,
    automationFeasibility: 'HIGH',
    feasibilityReason: 'The enforced rule and rejection are observable.',
    playwrightSnippet: snippetFor(req.feature, 'Negative'),
    requirement: reqText,
  });

  // Edge — only when the requirement actually names limits / quantities.
  const hasLimits = /\b(\d|max|min|maximum|minimum|limit|up to|at least|at most|range|between|character|length)\b/i.test(
    reqText
  );
  if (hasLimits) {
    out.push({
      id: nextId(),
      feature: req.feature,
      type: 'Edge',
      priority: 'P3 - Low',
      title: `${req.feature}: boundary of "${lc(reqText).slice(0, 55)}"`,
      preconditions: `System ready to test the boundary stated in the requirement.`,
      steps: `1. Open the ${req.feature} area.\n2. Drive the values to the boundary named in: ${lc(reqText)}.\n3. Verify behaviour exactly at, below, and above the limit.`,
      testData: req.dataTokens.length
        ? `Boundary values around: ${req.dataTokens.join('; ')}`
        : 'Boundary values implied by the requirement.',
      expectedResult: `At the stated limit the behaviour matches the PRD; beyond it the system rejects/handles gracefully per "${reqText}".`,
      acRef: req.id,
      automationFeasibility: 'MEDIUM',
      feasibilityReason: 'Boundary values are scriptable but need varied fixtures.',
      playwrightSnippet: snippetFor(req.feature, 'Edge'),
      requirement: reqText,
    });
  }

  return out;
}

/**
 * Generate test cases STRICTLY from the requirements extracted from the
 * PRD. If no requirements were found, returns an empty array (the caller
 * must report this rather than fabricate cases).
 */
export function generateTestCasesFromRequirements(
  requirements: RequirementInput[],
  criticalFeatures: string[] = []
): TestCase[] {
  const cases: TestCase[] = [];
  requirements.forEach((req, i) => {
    const critical = criticalFeatures.includes(req.feature);
    cases.push(...casesForRequirement(req, i + 1, critical));
  });
  return dedupe(cases);
}

// ── Backwards-compatible default (e-commerce) helpers ───────────────
const DEFAULT_FEATURES = [
  'Authentication',
  'Shopping Cart',
  'Checkout',
  'Payment',
  'Order Management',
];

export function generateTestCases(): TestCase[] {
  return generateTestCasesForFeatures(DEFAULT_FEATURES, {
    criticalFeatures: ['Authentication', 'Payment'],
  });
}

export function generateSmokeCases(): TestCase[] {
  return smokeFromCases(generateTestCases());
}

export function generateRegressionCases(): TestCase[] {
  return regressionFromCases(generateTestCases());
}