/**
 * Everything the app remembers between visits, kept in this browser's
 * storage: the sandbox and lesson circuits, lesson progress, named saved
 * circuits, and where you were. Nothing leaves the computer.
 *
 * Storage can be missing or full (private windows, blocked site data), so
 * every read falls back to a sensible default and every write reports
 * whether it worked. Everything read back is checked before it's used.
 */
import { checkCircuit } from '../model/circuitFile';
import type { Circuit } from '../model/circuit';

const PREFIX = 'circuitlab.';
export const KEYS = {
  session: `${PREFIX}session`,
  workspaces: `${PREFIX}workspaces`,
  progress: `${PREFIX}progress`,
  saved: `${PREFIX}saved`,
} as const;

/** Reads and parses a stored value; undefined if it's missing, unreadable, or storage is blocked. */
function read(key: string): unknown {
  try {
    const text = localStorage.getItem(key);
    return text === null ? undefined : JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Stores a value. Returns false if the browser refused (storage blocked or full). */
function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/* ---------- Where you were ---------- */

export interface Session {
  mode: 'learn' | 'sandbox';
  view: 'realistic' | 'schematic';
  /** The lesson open in Learn mode (null: the track list). */
  lessonId: string | null;
  /** The lesson you worked on most recently, for "Continue". */
  lastLessonId: string | null;
  /** The named save the sandbox circuit came from, if any. */
  sandboxSaveId: string | null;
}

export const DEFAULT_SESSION: Session = { mode: 'learn', view: 'realistic', lessonId: null, lastLessonId: null, sandboxSaveId: null };

export function loadSession(): Session {
  const raw = read(KEYS.session);
  if (!isObj(raw)) return DEFAULT_SESSION;
  const str = (x: unknown) => (typeof x === 'string' ? x : null);
  return {
    mode: raw.mode === 'sandbox' ? 'sandbox' : 'learn',
    view: raw.view === 'schematic' ? 'schematic' : 'realistic',
    lessonId: str(raw.lessonId),
    lastLessonId: str(raw.lastLessonId),
    sandboxSaveId: str(raw.sandboxSaveId),
  };
}

export const saveSession = (s: Session) => write(KEYS.session, s);

/* ---------- The sandbox and lesson circuits ---------- */

/** Circuits by workspace: "sandbox", or "lesson:<id>". Damaged entries are dropped. */
export function loadWorkspaces(): Map<string, Circuit> {
  const raw = read(KEYS.workspaces);
  const out = new Map<string, Circuit>();
  if (!isObj(raw)) return out;
  for (const [key, value] of Object.entries(raw)) {
    const c = checkCircuit(value);
    if (c.ok) out.set(key, c.value);
  }
  return out;
}

export const saveWorkspaces = (w: ReadonlyMap<string, Circuit>) => write(KEYS.workspaces, Object.fromEntries(w));

/* ---------- Lesson progress ---------- */

export interface Progress {
  /** Steps done, by lesson. */
  steps: Record<string, string[]>;
  /** Lessons completed at least once. */
  completed: string[];
}

export function loadProgress(): Progress {
  const raw = read(KEYS.progress);
  const steps: Record<string, string[]> = {};
  let completed: string[] = [];
  if (isObj(raw)) {
    if (isObj(raw.steps)) {
      for (const [id, list] of Object.entries(raw.steps)) {
        if (Array.isArray(list)) steps[id] = list.filter((s): s is string => typeof s === 'string');
      }
    }
    if (Array.isArray(raw.completed)) completed = raw.completed.filter((s): s is string => typeof s === 'string');
  }
  return { steps, completed };
}

export const saveProgress = (p: Progress) => write(KEYS.progress, p);

/* ---------- Named saved circuits ---------- */

export interface SavedCircuit {
  id: string;
  name: string;
  /** ISO date and time of the last save. */
  savedAt: string;
  circuit: Circuit;
}

export function loadSaved(): SavedCircuit[] {
  const raw = read(KEYS.saved);
  if (!Array.isArray(raw)) return [];
  const out: SavedCircuit[] = [];
  for (const s of raw) {
    if (!isObj(s) || typeof s.id !== 'string' || typeof s.name !== 'string' || typeof s.savedAt !== 'string') continue;
    const c = checkCircuit(s.circuit);
    if (c.ok) out.push({ id: s.id, name: s.name, savedAt: s.savedAt, circuit: c.value });
  }
  return out;
}

export const saveSaved = (list: SavedCircuit[]) => write(KEYS.saved, list);

/** Whether this browser lets the app store anything at all. */
export function storageAvailable(): boolean {
  try {
    const k = `${PREFIX}probe`;
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}
