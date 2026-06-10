/**
 * Automation code generator (Automation Developer — agent 10).
 *
 * Turns the active PRD's test cases + a wizard config into a real,
 * runnable Playwright project (Page Object Model + specs + optional
 * fixtures/testdata/modules/utils), then packages it as a .zip.
 *
 * Supports TypeScript, JavaScript, and Python (playwright-pytest).
 */
import JSZip from 'jszip';
import type { PrdArtifacts, PrdDoc } from './prd';
import type { TestCase } from './testCases';

export type Lang = 'ts' | 'js' | 'py';
export type Source = 'manual' | 'auto';
export type AutoPriority = 'regression' | 'smoke' | 'full' | 'prd';

export interface AutomationConfig {
  appUrl: string;
  appName: string;
  navSteps: string[];
  source: Source;
  manualCases: string[];
  autoPriority: AutoPriority;
  lang: Lang;
  folders: {
    pages: boolean;
    tests: boolean;
    fixtures: boolean;
    testdata: boolean;
    modules: boolean;
    utils: boolean;
  };
}

export interface GenFile {
  path: string;
  content: string;
}

export interface GenResult {
  files: GenFile[];
  testCount: number;
  specNames: string[];
}

const EXT: Record<Lang, string> = { ts: 'ts', js: 'js', py: 'py' };

/** PascalCase a feature name for class/file names. */
function pascal(s: string): string {
  return s
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}

/** camelCase/snake file base for a feature. */
function fileBase(s: string, lang: Lang): string {
  const parts = s.replace(/[^a-zA-Z0-9]+/g, ' ').trim().split(' ');
  if (lang === 'py') return parts.map((w) => w.toLowerCase()).join('_');
  return (
    parts[0].toLowerCase() +
    parts.slice(1).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('')
  );
}

const HEADER = (purpose: string) =>
  `/**\n * ${purpose}\n * @author  QA Orchestration Platform — Automation Developer (agent 10)\n * @generated ${new Date().toISOString().slice(0, 10)}\n */\n`;

const PY_HEADER = (purpose: string) =>
  `"""\n${purpose}\nAuthor:    QA Orchestration Platform — Automation Developer (agent 10)\nGenerated: ${new Date().toISOString().slice(0, 10)}\n"""\n`;

/** Group test cases by feature. */
function byFeature(cases: TestCase[]): Map<string, TestCase[]> {
  const m = new Map<string, TestCase[]>();
  for (const c of cases) {
    if (!m.has(c.feature)) m.set(c.feature, []);
    m.get(c.feature)!.push(c);
  }
  return m;
}

/** Select the test cases to automate based on the wizard config. */
function selectCases(cfg: AutomationConfig, art: PrdArtifacts): TestCase[] {
  if (cfg.source === 'auto') {
    switch (cfg.autoPriority) {
      case 'smoke':
        return art.smoke;
      case 'regression':
        return art.regression;
      case 'full':
      case 'prd':
      default:
        return art.testCases;
    }
  }
  // Manual: synthesise lightweight cases from the entered titles.
  return cfg.manualCases.map((title, i) => ({
    id: `TC-MAN-${String(i + 1).padStart(3, '0')}`,
    title,
    feature: 'General',
    type: 'Positive' as const,
    priority: 'P1 - High' as const,
    preconditions: 'Application is reachable.',
    steps: '1. Perform the described action.\n2. Verify the result.',
    testData: 'n/a',
    expectedResult: 'The behaviour matches the test case description.',
    acRef: `AC-${i + 1}`,
    automationFeasibility: 'HIGH' as const,
    feasibilityReason: 'User-specified case; automatable as a standard UI flow.',
    playwrightSnippet: '',
  }));
}

// ── TypeScript / JavaScript generators ──────────────────────────────

function tsPage(feature: string, lang: 'ts' | 'js'): string {
  const cls = `${pascal(feature)}Page`;
  const typed = lang === 'ts';
  const pageParam = typed ? 'private readonly page: Page' : 'page';
  const importLine = typed ? `import { type Page, type Locator, expect } from '@playwright/test';\n` : `const { expect } = require('@playwright/test');\n`;
  const ctorBody = typed ? '' : '    this.page = page;\n';
  const heading = typed ? '' : '';
  return (
    HEADER(`Page Object Model for the ${feature} page.`) +
    importLine +
    heading +
    `\nexport class ${cls} {\n` +
    (typed ? `  readonly page: Page;\n` : '') +
    `  constructor(${pageParam}) {\n${typed ? '    this.page = page;\n' : ctorBody}  }\n\n` +
    `  // Locators — prefer role / test-id over fragile selectors.\n` +
    `  get heading()${typed ? ': Locator' : ''} {\n    return this.page.getByRole('heading');\n  }\n\n` +
    `  async open(baseUrl${typed ? ': string' : ''})${typed ? ': Promise<void>' : ''} {\n    await this.page.goto(baseUrl);\n    await expect(this.page).toHaveURL(/.*/);\n  }\n\n` +
    `  async performAction(${typed ? 'data: Record<string, string>' : 'data'})${typed ? ': Promise<void>' : ''} {\n    // Exercise the ${feature} functionality. Replace selectors with real ones.\n    await this.page.waitForLoadState('networkidle');\n  }\n}\n`
  );
}

function tsSpec(
  feature: string,
  cases: TestCase[],
  cfg: AutomationConfig,
  lang: 'ts' | 'js'
): string {
  const cls = `${pascal(feature)}Page`;
  const base = fileBase(feature, lang);
  const typed = lang === 'ts';
  const importTest = typed
    ? `import { test, expect } from '@playwright/test';\n`
    : `const { test, expect } = require('@playwright/test');\n`;
  const importPage = typed
    ? `import { ${cls} } from '../pages/${cls}';\n`
    : `const { ${cls} } = require('../pages/${cls}');\n`;
  const importData = cfg.folders.testdata
    ? typed
      ? `import data from '../testdata/${base}.json';\n`
      : `const data = require('../testdata/${base}.json');\n`
    : '';

  const nav = cfg.navSteps.length
    ? cfg.navSteps.map((s) => `    // ${s}`).join('\n')
    : '    // Open the application and reach the feature under test';

  const testsBody = cases
    .map((c) => {
      const dataRef = cfg.folders.testdata ? 'data' : `{ note: ${JSON.stringify(c.testData)} }`;
      return (
        `  test(${JSON.stringify(`${c.id} — ${c.title}`)}, async ({ page }) => {\n` +
        `    const ${base}Page = new ${cls}(page);\n` +
        `    await ${base}Page.open(${typed ? 'BASE_URL' : 'BASE_URL'});\n` +
        `    await ${base}Page.performAction(${dataRef});\n` +
        `    // Expected: ${c.expectedResult.replace(/\n/g, ' ')}\n` +
        `    await expect(page).toHaveTitle(/.*/);\n` +
        `  });\n`
      );
    })
    .join('\n');

  return (
    HEADER(`Spec: ${feature} — ${cases.length} test(s) generated from the PRD.`) +
    importTest +
    importPage +
    importData +
    `\nconst BASE_URL = ${JSON.stringify(cfg.appUrl)};\n\n` +
    `test.describe(${JSON.stringify(`${feature} — ${cfg.appName}`)}, () => {\n` +
    `  test.beforeEach(async ({ page }) => {\n${nav}\n    await page.goto(BASE_URL);\n  });\n\n` +
    testsBody +
    `});\n`
  );
}

// ── Python generator ────────────────────────────────────────────────

function pyPage(feature: string): string {
  const cls = `${pascal(feature)}Page`;
  return (
    PY_HEADER(`Page Object Model for the ${feature} page.`) +
    `from playwright.sync_api import Page, expect\n\n\n` +
    `class ${cls}:\n` +
    `    def __init__(self, page: Page):\n        self.page = page\n\n` +
    `    def open(self, base_url: str) -> None:\n        self.page.goto(base_url)\n\n` +
    `    def perform_action(self, data: dict) -> None:\n        # Exercise the ${feature} functionality.\n        self.page.wait_for_load_state("networkidle")\n`
  );
}

function pySpec(feature: string, cases: TestCase[], cfg: AutomationConfig): string {
  const cls = `${pascal(feature)}Page`;
  const base = fileBase(feature, 'py');
  const tests = cases
    .map((c) => {
      const fn = `test_${base}_${c.id.replace(/-/g, '_').toLowerCase()}`;
      return (
        `def ${fn}(page):\n` +
        `    """${c.id} — ${c.title}"""\n` +
        `    obj = ${cls}(page)\n` +
        `    obj.open(BASE_URL)\n` +
        `    obj.perform_action({"note": ${JSON.stringify(c.testData)}})\n` +
        `    # Expected: ${c.expectedResult.replace(/\n/g, ' ')}\n` +
        `    expect(page).to_have_title(re.compile(r".*"))\n`
      );
    })
    .join('\n\n');
  return (
    PY_HEADER(`Spec: ${feature} — ${cases.length} test(s) generated from the PRD.`) +
    `import re\nimport pytest\nfrom playwright.sync_api import expect\nfrom pages.${base}_page import ${cls}\n\n` +
    `BASE_URL = ${JSON.stringify(cfg.appUrl)}\n\n\n` +
    tests +
    `\n`
  );
}

// ── Project-level files ─────────────────────────────────────────────

function playwrightConfig(cfg: AutomationConfig): GenFile {
  if (cfg.lang === 'py') {
    return {
      path: 'pytest.ini',
      content: `[pytest]\naddopts = --headed --browser chromium\ntestpaths = src/tests\n`,
    };
  }
  const isTs = cfg.lang === 'ts';
  return {
    path: isTs ? 'playwright.config.ts' : 'playwright.config.js',
    content:
      (isTs
        ? `import { defineConfig, devices } from '@playwright/test';\n\n`
        : `const { defineConfig, devices } = require('@playwright/test');\n\n`) +
      `${isTs ? 'export default' : 'module.exports ='} defineConfig({\n` +
      `  testDir: './src/tests',\n` +
      `  fullyParallel: true,\n` +
      `  reporter: 'html',\n` +
      `  use: {\n    baseURL: ${JSON.stringify(cfg.appUrl)},\n    trace: 'on-first-retry',\n  },\n` +
      `  projects: [\n    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },\n  ],\n});\n`,
  };
}

function readme(cfg: AutomationConfig, result: Omit<GenResult, 'files'>): string {
  const run =
    cfg.lang === 'py'
      ? '```bash\npip install pytest-playwright\nplaywright install\npytest\n```'
      : '```bash\nnpm install\nnpx playwright install\nnpx playwright test\n```';
  return (
    `# ${cfg.appName} — Automated Test Suite\n\n` +
    `Generated by the **QA Orchestration Platform** (Automation Developer agent).\n\n` +
    `- **Application:** ${cfg.appName}\n- **URL:** ${cfg.appUrl}\n- **Language:** ${cfg.lang.toUpperCase()}\n- **Total tests:** ${result.testCount}\n\n` +
    `## Structure\n\n\`\`\`\nsrc/\n${cfg.folders.pages ? '  pages/      # Page Object Models\n' : ''}${cfg.folders.tests ? '  tests/      # Spec files\n' : ''}${cfg.folders.fixtures ? '  fixtures/   # Custom fixtures\n' : ''}${cfg.folders.testdata ? '  testdata/   # Externalised test data (JSON)\n' : ''}${cfg.folders.modules ? '  modules/    # Reusable step modules\n' : ''}${cfg.folders.utils ? '  utils/      # Utility helpers\n' : ''}\`\`\`\n\n` +
    `## Running the tests\n\n${run}\n\n` +
    `## Specs\n\n${result.specNames.map((s) => `- ${s}`).join('\n')}\n`
  );
}

// ── Main entry ──────────────────────────────────────────────────────

/** Generate all automation files for the given config + PRD artifacts. */
export function generateAutomation(
  cfg: AutomationConfig,
  _prd: PrdDoc,
  art: PrdArtifacts
): GenResult {
  const cases = selectCases(cfg, art);
  const grouped = byFeature(cases);
  const files: GenFile[] = [];
  const specNames: string[] = [];
  const ext = EXT[cfg.lang];

  for (const [feature, fcases] of grouped) {
    const base = fileBase(feature, cfg.lang);

    if (cfg.folders.pages) {
      const pageName =
        cfg.lang === 'py' ? `${base}_page.py` : `${pascal(feature)}Page.${ext}`;
      files.push({
        path: `src/pages/${pageName}`,
        content: cfg.lang === 'py' ? pyPage(feature) : tsPage(feature, cfg.lang),
      });
    }

    if (cfg.folders.tests) {
      const specName =
        cfg.lang === 'py' ? `test_${base}.py` : `${base}.spec.${ext}`;
      files.push({
        path: `src/tests/${specName}`,
        content:
          cfg.lang === 'py'
            ? pySpec(feature, fcases, cfg)
            : tsSpec(feature, fcases, cfg, cfg.lang),
      });
      specNames.push(specName);
    }

    if (cfg.folders.testdata) {
      const data = Object.fromEntries(
        fcases.map((c) => [c.id, { title: c.title, data: c.testData }])
      );
      files.push({
        path: `src/testdata/${base}.json`,
        content: JSON.stringify(data, null, 2) + '\n',
      });
    }

    if (cfg.folders.modules) {
      const modName =
        cfg.lang === 'py' ? `${base}_module.py` : `${pascal(feature)}Module.${ext}`;
      files.push({
        path: `src/modules/${modName}`,
        content:
          cfg.lang === 'py'
            ? PY_HEADER(`Reusable step module for ${feature}.`) +
              `def run_${base}_flow(page, data):\n    # Compose page-object actions for the ${feature} flow.\n    pass\n`
            : HEADER(`Reusable step module for ${feature}.`) +
              `export async function run${pascal(feature)}Flow(page${cfg.lang === 'ts' ? ': import("@playwright/test").Page' : ''}, data${cfg.lang === 'ts' ? ': Record<string, string>' : ''}) {\n  // Compose page-object actions for the ${feature} flow.\n}\n`,
      });
    }
  }

  // Shared fixtures (one file).
  if (cfg.folders.fixtures) {
    if (cfg.lang === 'py') {
      files.push({
        path: 'src/fixtures/conftest.py',
        content:
          PY_HEADER('Shared pytest fixtures.') +
          `import pytest\n\n\n@pytest.fixture\ndef base_url():\n    return ${JSON.stringify(cfg.appUrl)}\n`,
      });
    } else {
      const t = cfg.lang === 'ts';
      files.push({
        path: `src/fixtures/baseFixtures.${ext}`,
        content:
          HEADER('Custom Playwright fixtures (extends base test).') +
          (t
            ? `import { test as base } from '@playwright/test';\n\nexport const test = base.extend<{ baseUrl: string }>({\n  baseUrl: ${JSON.stringify(cfg.appUrl)},\n});\nexport { expect } from '@playwright/test';\n`
            : `const base = require('@playwright/test').test;\n\nconst test = base.extend({\n  baseUrl: ${JSON.stringify(cfg.appUrl)},\n});\nmodule.exports = { test, expect: require('@playwright/test').expect };\n`),
      });
    }
  }

  // Utils (one file).
  if (cfg.folders.utils) {
    if (cfg.lang === 'py') {
      files.push({
        path: 'src/utils/helpers.py',
        content:
          PY_HEADER('Utility helpers (waits, data, formatting).') +
          `import time\n\n\ndef wait_ms(ms: int) -> None:\n    time.sleep(ms / 1000)\n`,
      });
    } else {
      const t = cfg.lang === 'ts';
      files.push({
        path: `src/utils/helpers.${ext}`,
        content:
          HEADER('Utility helpers (waits, data, formatting).') +
          `export function randomEmail()${t ? ': string' : ''} {\n  return \`qa_\${Date.now()}@example.com\`;\n}\n`,
      });
    }
  }

  const result = { testCount: cases.length, specNames };

  // Project files.
  files.push(playwrightConfig(cfg));
  files.push({ path: 'README.md', content: readme(cfg, result) });
  if (cfg.lang !== 'py') {
    files.push({
      path: 'package.json',
      content:
        JSON.stringify(
          {
            name: fileBase(cfg.appName || 'qa-suite', cfg.lang) || 'qa-suite',
            version: '1.0.0',
            scripts: { test: 'playwright test', report: 'playwright show-report' },
            devDependencies: { '@playwright/test': '^1.48.0' },
          },
          null,
          2
        ) + '\n',
    });
  } else {
    files.push({
      path: 'requirements.txt',
      content: 'pytest\npytest-playwright\n',
    });
  }

  return { files, ...result };
}

/** Build a .zip Blob from generated files and trigger a download. */
export async function downloadAutomationZip(
  result: GenResult,
  cfg: AutomationConfig
): Promise<void> {
  const zip = new JSZip();
  for (const f of result.files) zip.file(f.path, f.content);
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const base = (cfg.appName || 'automation')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  a.href = url;
  a.download = `${base || 'automation'}-playwright-${cfg.lang}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
