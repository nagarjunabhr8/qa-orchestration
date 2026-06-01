import { useState } from 'react';
import type { Agent, Phase } from '../types';
import { STATUS_STYLES } from '../lib/status';
import StatusBadge from './StatusBadge';
import type { TestCase } from '../lib/testCases';
import type { PrdArtifacts, PrdDoc } from '../lib/prd';
import { downloadCasesExcel } from '../lib/excel';
import { downloadTestPlanWord } from '../lib/word';
import AutomationWizard from './AutomationWizard';

/**
 * Agents that can export their output to Excel, keyed by slug. The dataset
 * is pulled from the active PRD's artifacts so each export reflects the
 * selected document.
 */
const EXCEL_EXPORTS: Record<
  string,
  {
    pick: (art: PrdArtifacts) => TestCase[];
    title: string;
    fileBase: string;
    sheetName: string;
    note: string;
  }
> = {
  'test-case-generator': {
    pick: (art) => art.testCases,
    title: 'QA Orchestration — Generated Test Cases',
    fileBase: 'test-cases',
    sheetName: 'Test Cases',
    note: 'Full test-case set generated from the active PRD (100% AC coverage).',
  },
  'smoke-identifier': {
    pick: (art) => art.smoke,
    title: 'QA Orchestration — Smoke Suite',
    fileBase: 'smoke-suite',
    sheetName: 'Smoke Cases',
    note: 'Critical-path smoke tests derived from the active PRD.',
  },
  'regression-builder': {
    pick: (art) => art.regression,
    title: 'QA Orchestration — Regression Suite',
    fileBase: 'regression-suite',
    sheetName: 'Regression Cases',
    note: 'Regression suite across all feature areas of the active PRD.',
  },
};

interface Props {
  phase: Phase;
  agents: Agent[];
  selectedId: string | null;
  activePrd: PrdDoc | null;
  artifacts: PrdArtifacts | null;
  onSelect: (id: string) => void;
  onRequestRun: (id: string) => void;
  onReset: (id: string) => void;
}

export default function PhaseView({
  phase,
  agents,
  selectedId,
  activePrd,
  artifacts,
  onSelect,
  onRequestRun,
  onReset,
}: Props) {
  const [wizardOpen, setWizardOpen] = useState(false);

  return (
    <div className="flex-1 overflow-y-auto p-5">
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-slate-100">{phase.label}</h1>
        <p className="text-sm text-slate-400">{phase.blurb}</p>
      </div>

      {agents.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-800 p-10 text-center text-sm text-slate-500">
          No agents in this phase.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {agents.map((agent) => {
            const s = STATUS_STYLES[agent.status];
            const busy =
              agent.status === 'running' || agent.status === 'awaiting';
            const isSelected = agent.id === selectedId;

            return (
              <div
                key={agent.id}
                onClick={() => onSelect(agent.id)}
                className={`cursor-pointer rounded-xl border-l-4 ${s.border} border-y border-r border-y-slate-800 border-r-slate-800 bg-slate-900/50 p-4 transition hover:bg-slate-900
                  ${isSelected ? 'ring-2 ring-sky-500/50' : ''}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{agent.glyph}</span>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[11px] text-slate-500">
                          {agent.id}
                        </span>
                        <h3 className="text-sm font-semibold text-slate-100">
                          {agent.name}
                        </h3>
                      </div>
                      <p className="text-xs text-slate-400">
                        {agent.description}
                      </p>
                    </div>
                  </div>
                  <StatusBadge status={agent.status} />
                </div>

                {/* Output area */}
                <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    Last output
                  </div>
                  {agent.status === 'running' ? (
                    <div className="flex items-center gap-2 text-xs text-sky-300">
                      <span className="h-1.5 w-1.5 animate-pulseSoft rounded-full bg-sky-400" />
                      Working…
                    </div>
                  ) : agent.lastOutput ? (
                    <p
                      className={`text-xs leading-relaxed ${
                        agent.status === 'failed'
                          ? 'text-red-300'
                          : 'text-slate-300'
                      }`}
                    >
                      {agent.lastOutput}
                    </p>
                  ) : (
                    <p className="text-xs italic text-slate-600">
                      No output yet — run this agent to produce results.
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div
                  className="mt-3 flex items-center gap-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    disabled={busy}
                    onClick={() => onRequestRun(agent.id)}
                    className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition enabled:hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {agent.status === 'complete' ? 'Run again' : 'Run agent'}
                  </button>
                  {(agent.status === 'complete' ||
                    agent.status === 'failed') && (
                    <button
                      onClick={() => onReset(agent.id)}
                      className="rounded-md border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-800"
                    >
                      Reset
                    </button>
                  )}
                  {EXCEL_EXPORTS[agent.slug] &&
                    agent.status === 'complete' &&
                    artifacts && (
                      <button
                        onClick={() => {
                          const cfg = EXCEL_EXPORTS[agent.slug];
                          downloadCasesExcel(cfg.pick(artifacts), {
                            title: cfg.title,
                            fileBase: cfg.fileBase,
                            sheetName: cfg.sheetName,
                            note: cfg.note,
                            prdFileName: activePrd?.name ?? null,
                          });
                        }}
                        className="ml-auto flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500"
                        title="Download this suite as an Excel workbook"
                      >
                        <span>⬇️</span> Download Excel
                      </button>
                    )}
                  {agent.slug === 'test-plan-creator' &&
                    agent.status === 'complete' &&
                    activePrd &&
                    artifacts && (
                      <button
                        onClick={() => downloadTestPlanWord(activePrd, artifacts)}
                        className="ml-auto flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-500"
                        title="Download the test plan as a Word document"
                      >
                        <span>⬇️</span> Download Word
                      </button>
                    )}
                  {agent.slug === 'automation-developer' && (
                    <button
                      onClick={() => setWizardOpen(true)}
                      className="ml-auto flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-500"
                      title="Configure and generate Playwright automation code"
                    >
                      <span>✨</span> Generate Code
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AutomationWizard
        open={wizardOpen}
        activePrd={activePrd}
        artifacts={artifacts}
        onClose={() => setWizardOpen(false)}
      />
    </div>
  );
}
