// Type declarations for ai-universal-memory's public API.
// The implementation lives in templates/engine.mjs (the vendored,
// zero-dependency source of truth); src/core.js just re-exports it.

export interface MemoryConfig {
  schema_version: number;
  project_name: string;
  created_at: string;
  brief_max_chars: number;
  brief_max_events: number;
  brief_max_pending: number;
  brief_max_risks: number;
}

export interface MemoryEvent {
  time: string;
  agent: string;
  action: string;
  status: string;
  summary: string;
  next: unknown[];
  error: unknown;
}

export interface Decision {
  id: string;
  text: string;
  agent: string;
  created_at: string;
}

export interface Todo {
  id: string;
  text: string;
  done: boolean;
  agent: string;
  created_at: string;
  done_at: string | null;
}

export interface Risk {
  id: string;
  text: string;
  severity: string;
  agent: string;
  resolved: boolean;
  created_at: string;
  resolved_at: string | null;
}

export type FactStatus = "confirmed" | "probable" | "needs_validation";

export interface Fact {
  id: string;
  fact: string;
  source: string | null;
  confidence: number;
  agent: string;
  created_at: string;
}

export interface SearchResult {
  kind: string;
  id?: string;
  time: string;
  agent: string;
  text: string;
}

export interface CompactResult {
  rotated: number;
  kept: number;
}

export class ProjectMemory {
  constructor(root?: string);

  readonly root: string;
  readonly dir: string;

  isInitialized(): boolean;
  config(): MemoryConfig;
  init(opts?: { projectName?: string }): void;

  log(entry: {
    agent?: string;
    action?: string;
    status?: string;
    summary?: string;
    next?: unknown[];
    error?: unknown;
  }): MemoryEvent;

  setPhase(phase: string): void;
  lastEvents(limit?: number): MemoryEvent[];

  addDecision(text: string, opts?: { agent?: string }): Decision | null;

  addTodo(text: string, opts?: { agent?: string }): Todo | null;
  completeTodo(id: string, opts?: { agent?: string }): Todo | null;

  addRisk(text: string, opts?: { agent?: string; severity?: string }): Risk | null;
  resolveRisk(id: string, opts?: { agent?: string }): Risk | null;

  addFact(opts: {
    fact: string;
    status?: FactStatus;
    source?: string | null;
    confidence?: number;
    agent?: string;
  }): Fact | null;

  search(term: string, opts?: { limit?: number }): SearchResult[];
  compact(opts?: { keep?: number }): CompactResult;

  readSummary(): string;
  brief(): string;
  generateHandoff(): string;
}
