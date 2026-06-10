/**
 * PRD model + artifact engine.
 *
 * The platform can hold several uploaded PRDs at once. Each PRD is parsed
 * into a structured profile (features + acceptance criteria), and from that
 * profile we deterministically derive every downstream artifact: test plan,
 * test cases, smoke/regression suites, defects, Jira tickets, reports, etc.
 *
 * Selecting a PRD makes its artifacts the ones every agent acts on.
 */
import {
  generateTestCasesForFeatures,
  regressionFromCases,
  smokeFromCases,
  type TestCase,
} from './testCases';
import { uid } from './status';

export interface PrdDoc {
  id: string;
  name: string;
  /** Raw text content (best-effort, for client-parsed docs). */
  text: string;
  sizeLabel: string;
  uploadedAt: string;
  profile: PrdProfile;
}

export interface PrdProfile {
  title: string;
  features: string[];
  acceptanceCriteria: string[];
  criticalFeatures: string[];
}

export interface Defect {
  id: string;
  summary: string;
  severity: 'High' | 'Medium' | 'Low';
  feature: string;
  linkedCase: string;
  status: 'Open';
}

export interface JiraTicket {
  key: string;
  type: 'Story' | 'Bug';
  summary: string;
  feature?: string;
}

/** All artifacts derived from a single PRD. */
export interface PrdArtifacts {
  testPlan: {
    scope: string;
    strategy: string;
    environments: string;
    entryCriteria: string;
    exitCriteria: string;
  };
  testCases: TestCase[];
  smoke: TestCase[];
  regression: TestCase[];
  defects: Defect[];
  stories: JiraTicket[];
  bugs: JiraTicket[];
}

// ── Parsing ─────────────────────────────────────────────────────────

const STOP_HEADINGS = /^(table of contents|overview|introduction|background|summary|appendix|references|glossary|revision history)$/i;

/** Title-case a slug-ish phrase. */
function titleCase(s: string): string {
  return s
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Extract a feature list from raw PRD text. Strategy, in order:
 *  1. Markdown/numbered headings.
 *  2. Bulleted lines.
 *  3. Keyword sniffing for common domains.
 *  4. Fall back to a generic feature set so the pipeline always works.
 */
function extractFeatures(text: string): string[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const found = new Set<string>();

  // A single top-level "# Title" is the document title, not a feature —
  // skip it when deeper headings (##+) exist to carry the real features.
  const hasSubHeadings = lines.some((l) => /^#{2,6}\s+/.test(l));

  // 1. Headings: "## Feature", "1. Checkout" (skip the H1 title).
  for (const line of lines) {
    const isH1 = /^#\s+/.test(line);
    if (isH1 && hasSubHeadings) continue;
    const m =
      line.match(/^#{1,6}\s+(.{3,60})$/) ||
      line.match(/^\d+[.)]\s+(.{3,60})$/);
    if (m) {
      const h = m[1].replace(/[:.]+$/, '').trim();
      if (!STOP_HEADINGS.test(h) && /[a-z]/i.test(h) && h.split(' ').length <= 6) {
        found.add(titleCase(h));
      }
    }
  }

  // 2. Bullets, if we still need more.
  if (found.size < 3) {
    for (const line of lines) {
      const m = line.match(/^[-*•]\s+(.{3,50})$/);
      if (m) {
        const b = m[1].replace(/[:.].*$/, '').trim();
        if (/[a-z]/i.test(b) && b.split(' ').length <= 5) found.add(titleCase(b));
      }
    }
  }

  // 3. Keyword sniffing.
  if (found.size < 3) {
    const keywords: Record<string, RegExp> = {
      Authentication: /\b(login|log in|sign in|auth|password|credential)\b/i,
      'Shopping Cart': /\b(cart|basket|add to cart)\b/i,
      Checkout: /\b(checkout|check out|order review)\b/i,
      Payment: /\b(payment|pay|card|billing|invoice)\b/i,
      'Order Management': /\b(order|orders|shipment|tracking)\b/i,
      Search: /\b(search|query|filter)\b/i,
      Notifications: /\b(notification|notify|email alert|reminder)\b/i,
      'User Profile': /\b(profile|account settings|preferences)\b/i,
    };
    for (const [feature, re] of Object.entries(keywords)) {
      if (re.test(text)) found.add(feature);
    }
  }

  // 4. Generic fallback.
  if (found.size < 3) {
    ['Core Workflow', 'Data Validation', 'User Management', 'Reporting'].forEach(
      (f) => found.add(f)
    );
  }

  // Cap to keep suites a sensible size.
  return [...found].slice(0, 6);
}

function deriveTitle(name: string, text: string): string {
  const firstHeading = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => /^#{1,2}\s+.{3,80}$/.test(l));
  if (firstHeading) return firstHeading.replace(/^#{1,2}\s+/, '').trim();
  return name.replace(/\.[a-z0-9]+$/i, '');
}

export function buildProfile(name: string, text: string): PrdProfile {
  const features = extractFeatures(text);
  const acceptanceCriteria = features.flatMap((f) => [
    `A valid ${f.toLowerCase()} action completes successfully and is reflected in the UI.`,
    `Invalid ${f.toLowerCase()} input is rejected with a clear, actionable message.`,
  ]);
  return {
    title: deriveTitle(name, text),
    features,
    acceptanceCriteria,
    criticalFeatures: features.slice(0, 2),
  };
}

// ── Artifact derivation ─────────────────────────────────────────────

export function buildArtifacts(profile: PrdProfile): PrdArtifacts {
  const testCases = generateTestCasesForFeatures(profile.features, {
    criticalFeatures: profile.criticalFeatures,
  });
  const smoke = smokeFromCases(testCases);
  const regression = regressionFromCases(testCases);

  // Stories: one per feature.
  const stories: JiraTicket[] = profile.features.map((f, i) => ({
    key: `QA-${101 + i}`,
    type: 'Story',
    summary: `${f} — implement and validate per PRD`,
    feature: f,
  }));

  // Defects: derive a couple from the "failed" critical features.
  const defects: Defect[] = profile.criticalFeatures
    .slice(0, 2)
    .map((f, i) => ({
      id: `DEF-${i + 1}`,
      summary: `${f} fails under ${i === 0 ? 'timeout' : 'boundary'} conditions`,
      severity: i === 0 ? 'High' : 'Medium',
      feature: f,
      linkedCase:
        testCases.find((c) => c.feature === f && c.type === 'Negative')?.id ??
        testCases[0]?.id ??
        'TC-001',
      status: 'Open',
    }));

  const bugs: JiraTicket[] = defects.map((d, i) => ({
    key: `QA-${201 + i}`,
    type: 'Bug',
    summary: `[${d.severity}] ${d.summary}`,
    feature: d.feature,
  }));

  const featureList = profile.features.join(', ');
  return {
    testPlan: {
      scope: `In scope: ${featureList}. Out of scope: items not covered by "${profile.title}".`,
      strategy: `Risk-based testing. Critical features (${profile.criticalFeatures.join(', ')}) get P0 coverage first, then core flows, validation, and edge cases.`,
      environments: 'Dev, Staging (primary test target), and a Pre-prod smoke env.',
      entryCriteria: 'Stories accepted, build deployed to Staging, test data seeded.',
      exitCriteria: `100% of the ${profile.acceptanceCriteria.length} acceptance criteria covered, 0 open P0/P1 defects, smoke suite green.`,
    },
    testCases,
    smoke,
    regression,
    defects,
    stories,
    bugs,
  };
}

/** Build a complete PrdDoc from an uploaded file's name and text. */
export function createPrdDoc(name: string, text: string, sizeLabel: string): PrdDoc {
  return {
    id: uid(),
    name,
    text,
    sizeLabel,
    uploadedAt: new Date().toLocaleString(),
    profile: buildProfile(name, text),
  };
}

// ── Per-agent output text (drives each agent's "last output") ───────

/**
 * Produce the completion message for a given agent slug, grounded in the
 * active PRD's artifacts. Returns null for agents that have no PRD-specific
 * output (they fall back to their generic sample).
 */
export function agentOutputFor(
  slug: string,
  prd: PrdDoc,
  art: PrdArtifacts
): string | null {
  const f = prd.profile.features;
  const tc = art.testCases;
  const counts = {
    pos: tc.filter((c) => c.type === 'Positive').length,
    neg: tc.filter((c) => c.type === 'Negative').length,
    edge: tc.filter((c) => c.type === 'Edge').length,
    destructive: tc.filter((c) => c.type === 'Destructive').length,
  };
  switch (slug) {
    case 'prd-analyser':
      return `Analysed "${prd.name}" → ${f.length} features (${f.join(', ')}) and ${prd.profile.acceptanceCriteria.length} acceptance criteria.`;
    case 'jira-story-creator':
      return `Created ${art.stories.length} Jira stories (${art.stories[0]?.key} … ${art.stories[art.stories.length - 1]?.key}) from "${prd.name}".`;
    case 'test-plan-creator':
      return `Test plan drafted for "${prd.profile.title}": ${f.length} test areas, risk-based prioritisation.`;
    case 'test-case-generator':
      return `Generated ${tc.length} test cases (${counts.pos} positive, ${counts.neg} negative, ${counts.edge} edge, ${counts.destructive} destructive). Coverage: 100% of ACs.`;
    case 'smoke-identifier':
      return `Selected ${art.smoke.length} smoke tests covering ${prd.profile.criticalFeatures.join(', ')} happy paths.`;
    case 'regression-builder':
      return `Regression suite built: ${art.regression.length} cases across ${f.length} areas.`;
    case 'test-executor': {
      const total = art.regression.length + art.smoke.length;
      const failed = art.defects.length;
      return `Run complete: ${total - failed} passed, ${failed} failed, 0 skipped (${total} total).`;
    }
    case 'defect-analyser':
      return `${art.defects.length} failures analysed → ${art.defects.filter((d) => d.severity === 'High').length} high, ${art.defects.filter((d) => d.severity === 'Medium').length} medium.`;
    case 'defect-creator':
      return art.bugs.length
        ? `Filed ${art.bugs.length} bugs: ${art.bugs.map((b) => b.key).join(', ')}.`
        : 'No defects to file. ✅';
    case 'automation-developer':
      return `Generated ${art.smoke.length} Playwright specs (POM + fixtures) for "${prd.profile.title}".`;
    case 'code-reviewer':
      return `Reviewed automation for "${prd.profile.title}": 4 suggestions, 1 blocking.`;
    case 'git-commit':
      return `Committed ${art.smoke.length} spec files to branch "qa/${slugify(prd.profile.title)}" → PR opened.`;
    case 'jenkins-trigger':
      return `Jenkins build SUCCESS — suite for "${prd.profile.title}" archived.`;
    case 'report-sender':
      return `Report for "${prd.profile.title}" emailed to qa-team@company.com — delivered.`;
    case 'qa-chatbot':
      return 'Chat session ready.';
    default:
      return null;
  }
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
}
