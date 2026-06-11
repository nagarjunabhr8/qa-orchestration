import * as XLSX from 'xlsx';
import type { TestCase, Priority } from './testCases';

interface ExcelOptions {
  /** Title shown on the summary sheet and used to derive the filename. */
  title: string;
  /** Base filename (no extension); a unique timestamp is appended. */
  fileBase: string;
  /** Sheet name for the case matrix. */
  sheetName: string;
  prdFileName?: string | null;
  /** Optional one-line description of the suite for the summary sheet. */
  note?: string;
}

/**
 * Map the internal P0–P3 priority onto the standard JIRA priority scale
 * (Highest / High / Medium / Low) so the export drops straight into a JIRA
 * test-case import without re-mapping.
 */
const JIRA_PRIORITY: Record<Priority, string> = {
  'P0 - Critical': 'Highest',
  'P1 - High': 'High',
  'P2 - Medium': 'Medium',
  'P3 - Low': 'Low',
};

/** JIRA labels are space-free tokens; build them from the case metadata. */
function labelsFor(c: TestCase): string {
  const feature = c.feature.replace(/[^a-zA-Z0-9]/g, '');
  const labels = [c.type.toLowerCase(), feature];
  if (c.type === 'Edge') labels.push('boundary');
  if (c.type === 'Destructive') labels.push('resilience');
  return labels.join(' ');
}

/** LOW-feasibility cases are run by hand; everything else is automatable. */
function testTypeFor(c: TestCase): 'Manual' | 'Automated' {
  return c.automationFeasibility === 'LOW' ? 'Manual' : 'Automated';
}

/**
 * Filename-safe local timestamp, unique to the second + millisecond so two
 * downloads in the same day (or same minute) never collide.
 * Example: 2026-06-11_14-30-52-417
 */
function fileStamp(d = new Date()): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}` +
    `-${p(d.getMilliseconds(), 3)}`
  );
}

/**
 * Build and trigger a download of an .xlsx workbook for a set of test
 * cases. Two sheets: a run summary and the full case matrix in JIRA
 * (single-row-per-test-case) format. Every download gets a unique,
 * timestamped filename.
 */
export function downloadCasesExcel(cases: TestCase[], opts: ExcelOptions): void {
  const wb = XLSX.utils.book_new();
  const generatedAt = new Date();

  // ── Sheet 1: Summary ───────────────────────────────────────────
  const byType = (t: TestCase['type']) =>
    cases.filter((c) => c.type === t).length;
  const byPriority = (p: Priority) =>
    cases.filter((c) => c.priority === p).length;
  const features = [...new Set(cases.map((c) => c.feature))];

  const summaryRows: (string | number)[][] = [
    [opts.title],
    [],
    ...(opts.note ? [['Description', opts.note], []] : []),
    ['Source PRD', opts.prdFileName ?? 'N/A'],
    ['Generated at', generatedAt.toLocaleString()],
    ['Total cases', cases.length],
    [],
    ['By type', ''],
    ['Positive', byType('Positive')],
    ['Negative', byType('Negative')],
    ['Edge / Boundary', byType('Edge')],
    ['Destructive', byType('Destructive')],
    [],
    ['By priority (JIRA)', ''],
    ['Highest (P0)', byPriority('P0 - Critical')],
    ['High (P1)', byPriority('P1 - High')],
    ['Medium (P2)', byPriority('P2 - Medium')],
    ['Low (P3)', byPriority('P3 - Low')],
    [],
    ['Feature areas', features.length],
    [],
    ['Feature', 'Case count'],
    ...features.map((f) => [f, cases.filter((c) => c.feature === f).length]),
  ];
  const summary = XLSX.utils.aoa_to_sheet(summaryRows);
  summary['!cols'] = [{ wch: 22 }, { wch: 46 }];
  XLSX.utils.book_append_sheet(wb, summary, 'Summary');

  // ── Sheet 2: Test Cases (JIRA single-row-per-case format) ──────
  const header = [
    'Key',
    'Summary',
    'Issue Type',
    'Priority',
    'Component/s',
    'Labels',
    'Test Type',
    'Status',
    'Precondition',
    'Test Steps',
    'Test Data',
    'Expected Result',
    'AC Reference',
    'Automation Feasibility',
    'PRD Requirement (source)',
  ];
  const rows = cases.map((c) => [
    c.id,
    c.title,
    'Test',
    JIRA_PRIORITY[c.priority],
    c.feature,
    labelsFor(c),
    testTypeFor(c),
    'Ready',
    c.preconditions,
    c.steps,
    c.testData,
    c.expectedResult,
    c.acRef,
    c.automationFeasibility,
    c.requirement || '(feature-level — no verbatim requirement)',
  ]);
  const sheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
  sheet['!cols'] = [
    { wch: 14 }, // Key
    { wch: 44 }, // Summary
    { wch: 10 }, // Issue Type
    { wch: 10 }, // Priority
    { wch: 16 }, // Component/s
    { wch: 22 }, // Labels
    { wch: 11 }, // Test Type
    { wch: 9 }, // Status
    { wch: 40 }, // Precondition
    { wch: 50 }, // Test Steps
    { wch: 30 }, // Test Data
    { wch: 50 }, // Expected Result
    { wch: 12 }, // AC Reference
    { wch: 14 }, // Automation Feasibility
    { wch: 50 }, // PRD Requirement
  ];
  // Freeze the header row.
  sheet['!freeze'] = { xSplit: 0, ySplit: 1 } as never;
  XLSX.utils.book_append_sheet(wb, sheet, opts.sheetName);

  XLSX.writeFile(wb, `${opts.fileBase}_${fileStamp(generatedAt)}.xlsx`);
}
