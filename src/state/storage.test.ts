import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addPart, createPart, type Circuit } from '../model/circuit';
import {
  DEFAULT_SESSION,
  KEYS,
  loadProgress,
  loadSaved,
  loadSession,
  loadWorkspaces,
  saveProgress,
  saveSaved,
  saveSession,
  saveWorkspaces,
  storageAvailable,
} from './storage';

/** A stand-in for the browser's localStorage. */
class MemoryStorage {
  data = new Map<string, string>();
  full = false;
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    if (this.full) throw new Error('QuotaExceededError');
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

let store: MemoryStorage;
beforeEach(() => {
  store = new MemoryStorage();
  (globalThis as any).localStorage = store;
});
afterEach(() => {
  delete (globalThis as any).localStorage;
});

const circuit = (): Circuit => addPart({ parts: [], wires: [] }, createPart('battery', 0, 0));

describe('storage', () => {
  it('remembers where you were', () => {
    expect(loadSession()).toEqual(DEFAULT_SESSION);
    const s = { mode: 'sandbox', view: 'schematic', lessonId: 'diodes', lastLessonId: 'diodes', sandboxSaveId: 's1' } as const;
    expect(saveSession(s)).toBe(true);
    expect(loadSession()).toEqual(s);
  });

  it('remembers the sandbox and lesson circuits, and drops damaged ones', () => {
    const w = new Map([
      ['sandbox', circuit()],
      ['lesson:first-led', circuit()],
    ]);
    saveWorkspaces(w);
    expect(loadWorkspaces()).toEqual(w);
    const raw = JSON.parse(store.getItem(KEYS.workspaces)!);
    raw['lesson:first-led'].wires = [{ id: 'w', a: { part: 'x', pin: 0 }, b: { part: 'y', pin: 0 } }];
    store.setItem(KEYS.workspaces, JSON.stringify(raw));
    expect([...loadWorkspaces().keys()]).toEqual(['sandbox']);
  });

  it('remembers lesson progress', () => {
    const p = { steps: { 'first-led': ['battery', 'resistor'] }, completed: ['voltage'] };
    saveProgress(p);
    expect(loadProgress()).toEqual(p);
  });

  it('remembers named saves, skipping damaged entries', () => {
    const list = [{ id: 's1', name: 'Blinker', savedAt: '2026-11-10T10:00:00.000Z', circuit: circuit() }];
    saveSaved(list);
    expect(loadSaved()).toEqual(list);
    store.setItem(KEYS.saved, JSON.stringify([...list, { id: 's2', name: 'Broken' }, 'junk']));
    expect(loadSaved()).toEqual(list);
  });

  it('survives garbage, blocked storage, and a full disk', () => {
    store.setItem(KEYS.session, '{not json');
    store.setItem(KEYS.progress, '[1,2,3]');
    expect(loadSession()).toEqual(DEFAULT_SESSION);
    expect(loadProgress()).toEqual({ steps: {}, completed: [] });

    store.full = true;
    expect(saveSession(DEFAULT_SESSION)).toBe(false);
    expect(storageAvailable()).toBe(false);

    delete (globalThis as any).localStorage; // storage blocked entirely
    expect(loadWorkspaces().size).toBe(0);
    expect(loadSaved()).toEqual([]);
    expect(saveProgress({ steps: {}, completed: [] })).toBe(false);
  });
});
