import * as XLSX from 'xlsx';
import type { TestCase } from './testCases';

interface ExcelOptions {
  /** Title shown on the summary sheet and used to derive the filename. */
  title: string;
  /** Base filename (no extension); a date stamp is appended. */
  fileBase: string;
  /** Sheet name for the case matrix. */
  sheetName: string;
  prdFileName?: string | null;
  /** Optional one-line description of the suite for the summary sheet. */
  note?: string;
}

/**
 * Build and trigger a download of an .xlsx workbook for a set of test
 * cases. Two sheets: a run summary and the full case matrix.
 */
export function downloadCasesExcel(cases: TestCase[], opts: ExcelOptions): void {
  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Summary ───────────────────────────────────────────
  const byType = (t: TestCase['type']) =>
    cases.filter((c) => c.type === t).length;
  const features = [...new Set(cases.map((c) => c.feature))];

  const summaryRows: (string | number)[][] = [
    [opts.title],
    [],
    ...(opts.note ? [['Description', opts.note], []] : []),
    ['Source PRD', opts.prdFileName ?? 'N/A'],
    ['Generated at', new Date().toLocaleString()],
    ['Total cases', cases.length],
    ['Positive', byType('Positive')],
    ['Negative', byType('Negative')],
    ['Edge', byType('Edge')],
    ['Destructive', byType('Destructive')],
    ['Feature areas', features.length],
    [],
    ['Feature', 'Case count'],
    ...features.map((f) => [f, cases.filter((c) => c.feature === f).length]),
  ];
  const summary = XLSX.utils.aoa_to_sheet(summaryRows);
  summary['!cols'] = [{ wch: 20 }, { wch: 44 }];
  XLSX.utils.book_append_sheet(wb, summary, 'Summary');

  // ── Sheet 2: Cases ─────────────────────────────────────────────
  const header = [
    'Case ID',
    'Title',
    'Feature',
    'Type',
    'Priority',
    'Preconditions',
    'Steps',
    'Test Data',
    'Expected Result',
    'AC Reference',
    'Automation Feasibility',
    'Feasibility Reason',
    'Playwright Snippet',
  ];
  const rows = cases.map((c) => [
    c.id,
    c.title,
    c.feature,
    c.type,
    c.priority,
    c.preconditions,
    c.steps,
    c.testData,
    c.expectedResult,
    c.acRef,
    c.automationFeasibility,
    c.feasibilityReason,
    c.playwrightSnippet || '(manual — no snippet)',
  ]);
  const sheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
  sheet['!cols'] = [
    { wch: 14 }, // ID
    { wch: 34 }, // Title
    { wch: 16 }, // Feature
    { wch: 12 }, // Type
    { wch: 14 }, // Priority
    { wch: 42 }, // Preconditions
    { wch: 48 }, // Steps
    { wch: 30 }, // Test Data
    { wch: 50 }, // Expected Result
    { wch: 12 }, // AC Ref
    { wch: 14 }, // Feasibility
    { wch: 40 }, // Feasibility Reason
    { wch: 50 }, // Playwright Snippet
  ];
  // Freeze the header row.
  sheet['!freeze'] = { xSplit: 0, ySplit: 1 } as never;
  XLSX.utils.book_append_sheet(wb, sheet, opts.sheetName);

  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `${opts.fileBase}_${stamp}.xlsx`);
}
