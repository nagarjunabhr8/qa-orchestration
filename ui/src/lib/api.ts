import type { AgentStatus, LogEntry, PhaseId } from '../types';

const CONFIGURED_URL = import.meta.env.VITE_API_URL as string | undefined;

// In production we only talk to a backend if one is explicitly configured via
// VITE_API_URL; otherwise we skip the (doomed) localhost probe and run the
// dashboard in offline/simulation mode. In dev we default to the local server.
const BASE: string =
  CONFIGURED_URL ?? (import.meta.env.DEV ? 'http://localhost:8787' : '');

/** Minimal agent shape the server owns. */
export interface ServerAgent {
  id: string;
  slug: string;
  name: string;
  phase: PhaseId;
  status: AgentStatus;
  lastOutput: string | null;
}

/** Quick health probe — decides whether we run in live or offline mode. */
export async function probe(timeoutMs = 1200): Promise<boolean> {
  if (!BASE) return false; // no backend configured → offline mode
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}/api/health`, { signal: ctrl.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

export async function fetchAgents(): Promise<{
  agents: ServerAgent[];
  prd: string | null;
}> {
  const res = await fetch(`${BASE}/api/agents`);
  if (!res.ok) throw new Error('Failed to load agents');
  return res.json();
}

export async function runAgent(id: string): Promise<void> {
  await fetch(`${BASE}/api/agents/${id}/run`, { method: 'POST' });
}

export async function resetAgent(id: string): Promise<void> {
  await fetch(`${BASE}/api/agents/${id}/reset`, { method: 'POST' });
}

export async function uploadPrd(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${BASE}/api/prd`, { method: 'POST', body: form });
  if (!res.ok) throw new Error('Upload failed');
  const data = (await res.json()) as { fileName: string };
  return data.fileName;
}

/**
 * Subscribe to the live SSE stream. Returns a disposer that closes it.
 * `onAgent` fires on status changes; `onLog` fires per log line;
 * `onSnapshot` fires once on (re)connect with the full agent list.
 */
export function connectStream(handlers: {
  onAgent: (a: ServerAgent) => void;
  onLog: (l: LogEntry) => void;
  onSnapshot?: (agents: ServerAgent[]) => void;
}): () => void {
  const es = new EventSource(`${BASE}/api/stream`);

  es.addEventListener('agent', (e) =>
    handlers.onAgent(JSON.parse((e as MessageEvent).data))
  );
  es.addEventListener('log', (e) =>
    handlers.onLog(JSON.parse((e as MessageEvent).data))
  );
  es.addEventListener('snapshot', (e) =>
    handlers.onSnapshot?.(JSON.parse((e as MessageEvent).data))
  );

  return () => es.close();
}
