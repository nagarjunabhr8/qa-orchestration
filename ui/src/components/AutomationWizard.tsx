import { useMemo, useState } from 'react';
import type { PrdArtifacts, PrdDoc } from '../lib/prd';
import {
  downloadAutomationZip,
  generateAutomation,
  type AutoPriority,
  type AutomationConfig,
  type GenResult,
  type Lang,
  type Source,
} from '../lib/automation';

interface Props {
  open: boolean;
  activePrd: PrdDoc | null;
  artifacts: PrdArtifacts | null;
  onClose: () => void;
  /** Called when code is generated so the agent can be marked complete. */
  onGenerated?: (summary: string) => void;
}

const NAV_OPTIONS = [
  { id: 'login', label: 'Login / Authentication', sub: 'Enter credentials and sign in' },
  { id: 'route', label: 'Go to specific page / route', sub: 'Navigate to a dashboard, form, or module' },
  { id: 'menu', label: 'Click menu / sidebar item', sub: 'Expand nav and select a section' },
  { id: 'search', label: 'Search / filter to find an entity', sub: 'Use search bar or filters before acting' },
  { id: 'modal', label: 'Accept cookies / dismiss modal', sub: 'Handle pop-up before core flow' },
];

const NAV_TEXT: Record<string, string> = {
  login: 'Open the application URL and sign in with valid credentials',
  route: 'Navigate to the target page / route',
  menu: 'Expand the navigation menu / sidebar and select the required section',
  search: 'Use search or filters to locate the target entity',
  modal: 'Accept cookies / dismiss any modal or overlay before proceeding',
};

const LANGS: { id: Lang; name: string; ext: string; note: string }[] = [
  { id: 'ts', name: 'TypeScript', ext: '.ts', note: 'Full type safety, interfaces, generics. Recommended.' },
  { id: 'js', name: 'JavaScript', ext: '.js', note: 'Lighter setup, no compilation step.' },
  { id: 'py', name: 'Python', ext: '.py', note: 'Uses playwright-pytest, ideal for Python teams.' },
];

const FOLDER_OPTS: { key: keyof AutomationConfig['folders']; label: string; sub: string }[] = [
  { key: 'pages', label: 'src/pages/ — Page Object Models', sub: 'One POM class per page/component' },
  { key: 'tests', label: 'src/tests/ — Spec files', sub: 'One spec per feature' },
  { key: 'fixtures', label: 'src/fixtures/ — Custom fixtures', sub: 'Shared setup/teardown' },
  { key: 'testdata', label: 'src/testdata/ — Test data JSON', sub: 'Externalised test data' },
  { key: 'modules', label: 'src/modules/ — Reusable modules', sub: 'Step-level reusable helpers' },
  { key: 'utils', label: 'src/utils/ — Utility functions', sub: 'Date/data/wait helpers' },
];

export default function AutomationWizard({
  open,
  activePrd,
  artifacts,
  onClose,
  onGenerated,
}: Props) {
  const [step, setStep] = useState(0);
  const [appUrl, setAppUrl] = useState('');
  const [appName, setAppName] = useState('');
  const [navSel, setNavSel] = useState<Record<string, boolean>>({});
  const [navNotes, setNavNotes] = useState('');
  const [source, setSource] = useState<Source | null>(null);
  const [manualCases, setManualCases] = useState<string[]>(['', '', '']);
  const [autoPriority, setAutoPriority] = useState<AutoPriority>('regression');
  const [lang, setLang] = useState<Lang>('ts');
  const [folders, setFolders] = useState<AutomationConfig['folders']>({
    pages: true,
    tests: true,
    fixtures: false,
    testdata: false,
    modules: false,
    utils: false,
  });
  const [result, setResult] = useState<GenResult | null>(null);

  // Default the app name to the active PRD title.
  useMemo(() => {
    if (activePrd && !appName) setAppName(activePrd.profile.title);
  }, [activePrd]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  const cfg = (): AutomationConfig => ({
    appUrl: appUrl.trim() || 'https://your-app.com',
    appName: appName.trim() || activePrd?.profile.title || 'the application',
    navSteps: [
      ...NAV_OPTIONS.filter((o) => navSel[o.id]).map((o) => NAV_TEXT[o.id]),
      ...(navNotes.trim() ? [`Additional: ${navNotes.trim()}`] : []),
    ],
    source: source ?? 'auto',
    manualCases: manualCases.map((c) => c.trim()).filter(Boolean),
    autoPriority,
    lang,
    folders,
  });

  function generate() {
    if (!activePrd || !artifacts) return;
    const res = generateAutomation(cfg(), activePrd, artifacts);
    setResult(res);
    setStep(4);
    onGenerated?.(
      `Generated ${res.files.length} files (${res.testCount} tests) — ${lang.toUpperCase()} Playwright suite for "${appName || activePrd.profile.title}".`
    );
  }

  const canContinue0 = appUrl.trim().length > 0;
  const canContinue1 = source !== null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        {/* Header + progress */}
        <div className="border-b border-slate-800 p-5">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-indigo-400">
                Step {step + 1} of 5 · Automation Developer
              </div>
              <h2 className="mt-1 text-lg font-semibold text-slate-100">
                {['Application details', 'Test case source', 'Language', 'Framework scope', 'Generated code'][step]}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="rounded-md px-2 py-1 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
            >
              ✕
            </button>
          </div>
          <div className="mt-4 flex gap-1.5">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full ${i < step ? 'bg-emerald-500' : i === step ? 'bg-indigo-500' : 'bg-slate-700'}`}
              />
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {!activePrd && (
            <div className="mb-4 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              No active PRD selected. Auto-generation needs a PRD — manual test cases still work.
            </div>
          )}

          {/* Step 0 — App details */}
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm text-slate-400">
                  Application URL <span className="text-red-400">*</span>
                </label>
                <input
                  type="url"
                  value={appUrl}
                  onChange={(e) => setAppUrl(e.target.value)}
                  placeholder="https://your-app.com"
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-400">Application name / module</label>
                <input
                  type="text"
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  placeholder="e.g. CURA Healthcare, Shopping Cart"
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-400">Navigation steps to reach test area</label>
                <div className="space-y-1.5">
                  {NAV_OPTIONS.map((o) => (
                    <label
                      key={o.id}
                      className="flex cursor-pointer items-start gap-2 rounded-md border border-slate-800 px-3 py-2 hover:bg-slate-800/50"
                    >
                      <input
                        type="checkbox"
                        checked={!!navSel[o.id]}
                        onChange={(e) => setNavSel((s) => ({ ...s, [o.id]: e.target.checked }))}
                        className="mt-0.5 accent-indigo-500"
                      />
                      <span>
                        <span className="block text-sm text-slate-200">{o.label}</span>
                        <span className="block text-xs text-slate-500">{o.sub}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-400">Additional navigation notes (optional)</label>
                <textarea
                  value={navNotes}
                  onChange={(e) => setNavNotes(e.target.value)}
                  placeholder="e.g. After login, click 'Make Appointment' → select facility → fill form"
                  className="min-h-[70px] w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Step 1 — Source */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setSource('manual')}
                  className={`rounded-xl border p-4 text-left transition ${source === 'manual' ? 'border-indigo-500 bg-indigo-950/30 ring-1 ring-indigo-500/40' : 'border-slate-700 hover:bg-slate-800/50'}`}
                >
                  <div className="text-xl">✏️</div>
                  <div className="mt-1 text-sm font-semibold text-slate-100">Provide my own test cases</div>
                  <div className="text-xs text-slate-500">Supply a list to automate.</div>
                </button>
                <button
                  onClick={() => setSource('auto')}
                  className={`rounded-xl border p-4 text-left transition ${source === 'auto' ? 'border-indigo-500 bg-indigo-950/30 ring-1 ring-indigo-500/40' : 'border-slate-700 hover:bg-slate-800/50'}`}
                >
                  <div className="text-xl">🤖</div>
                  <div className="mt-1 text-sm font-semibold text-slate-100">Auto-generate from PRD</div>
                  <div className="text-xs text-slate-500">Derive from the active PRD's suites.</div>
                </button>
              </div>

              {source === 'manual' && (
                <div className="space-y-2">
                  {manualCases.map((tc, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-5 text-xs text-slate-500">{i + 1}</span>
                      <input
                        type="text"
                        value={tc}
                        onChange={(e) =>
                          setManualCases((arr) => arr.map((v, j) => (j === i ? e.target.value : v)))
                        }
                        placeholder="e.g. Verify login with valid credentials"
                        className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
                      />
                      {manualCases.length > 1 && (
                        <button
                          onClick={() => setManualCases((arr) => arr.filter((_, j) => j !== i))}
                          className="text-slate-500 hover:text-red-400"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={() => setManualCases((arr) => [...arr, ''])}
                    className="text-xs text-indigo-400 hover:text-indigo-300"
                  >
                    + Add test case
                  </button>
                </div>
              )}

              {source === 'auto' && (
                <div>
                  <div className="mb-3 rounded-lg border-l-2 border-indigo-500 bg-slate-800/40 px-3 py-2 text-xs text-slate-400">
                    The agent derives test cases from the active PRD
                    {activePrd ? ` "${activePrd.name}"` : ''}: functional flows, negative scenarios, and edge cases.
                  </div>
                  <label className="mb-1 block text-sm text-slate-400">Prioritise by test type</label>
                  <select
                    value={autoPriority}
                    onChange={(e) => setAutoPriority(e.target.value as AutoPriority)}
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="regression">Regression — cover all existing flows</option>
                    <option value="smoke">Smoke — critical paths only</option>
                    <option value="full">Full suite — regression + edge cases</option>
                    <option value="prd">PRD-derived — all acceptance criteria</option>
                  </select>
                  {artifacts && (
                    <p className="mt-2 text-xs text-slate-500">
                      Available: {artifacts.testCases.length} total · {artifacts.smoke.length} smoke · {artifacts.regression.length} regression.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 2 — Language */}
          {step === 2 && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                {LANGS.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => setLang(l.id)}
                    className={`rounded-lg border p-3 text-center transition ${lang === l.id ? 'border-indigo-500 bg-indigo-950/30 ring-1 ring-indigo-500/40' : 'border-slate-700 hover:bg-slate-800/50'}`}
                  >
                    <div className="text-sm font-semibold text-slate-100">{l.name}</div>
                    <div className="text-xs text-slate-500">{l.ext} files</div>
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-500">{LANGS.find((l) => l.id === lang)?.note}</p>
            </div>
          )}

          {/* Step 3 — Framework scope */}
          {step === 3 && (
            <div className="space-y-3">
              <div className="rounded-lg border-l-2 border-indigo-500 bg-slate-800/40 px-3 py-2 text-xs text-slate-400">
                Output follows the <strong>Advance-Playwright-Framework</strong> <code>src/</code> structure.
              </div>
              <div className="space-y-1.5">
                {FOLDER_OPTS.map((f) => (
                  <label
                    key={f.key}
                    className="flex cursor-pointer items-start gap-2 rounded-md border border-slate-800 px-3 py-2 hover:bg-slate-800/50"
                  >
                    <input
                      type="checkbox"
                      checked={folders[f.key]}
                      onChange={(e) => setFolders((s) => ({ ...s, [f.key]: e.target.checked }))}
                      className="mt-0.5 accent-indigo-500"
                    />
                    <span>
                      <span className="block text-sm text-slate-200">{f.label}</span>
                      <span className="block text-xs text-slate-500">{f.sub}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Step 4 — Result */}
          {step === 4 && result && (
            <div className="space-y-4">
              <div className="rounded-lg border border-emerald-700 bg-emerald-950/20 p-4">
                <div className="text-sm font-semibold text-emerald-300">
                  ✅ Generated {result.files.length} files · {result.testCount} tests
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  {lang.toUpperCase()} Playwright suite for "{appName || activePrd?.profile.title}".
                </p>
              </div>
              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Files
                </div>
                <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/60 p-3 font-mono text-[11px] text-slate-300">
                  {result.files.map((f) => (
                    <div key={f.path}>📄 {f.path}</div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div className="flex items-center gap-2 border-t border-slate-800 p-4">
          {step > 0 && step < 4 && (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="text-sm text-slate-400 transition hover:text-slate-200"
            >
              ← Back
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            {step === 0 && (
              <button
                disabled={!canContinue0}
                onClick={() => setStep(1)}
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition enabled:hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Continue →
              </button>
            )}
            {step === 1 && (
              <button
                disabled={!canContinue1}
                onClick={() => setStep(2)}
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition enabled:hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Continue →
              </button>
            )}
            {step === 2 && (
              <button
                onClick={() => setStep(3)}
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
              >
                Continue →
              </button>
            )}
            {step === 3 && (
              <button
                onClick={generate}
                disabled={!activePrd && source !== 'manual'}
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition enabled:hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                ✨ Generate code
              </button>
            )}
            {step === 4 && result && (
              <>
                <button
                  onClick={() => setStep(3)}
                  className="rounded-md border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800"
                >
                  Edit
                </button>
                <button
                  onClick={() => downloadAutomationZip(result, cfg())}
                  className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
                >
                  ⬇️ Download .zip
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
