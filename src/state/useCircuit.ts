import { useCallback, useReducer } from 'react';
import { EMPTY_CIRCUIT, type Circuit } from '../model/circuit';

/**
 * Undo/redo history around the circuit.
 *
 * An edit is a pure function from one circuit to the next. `record: true`
 * saves the previous circuit so it can be undone; `record: false` folds the
 * change into the current step (used while dragging, so one drag = one undo).
 */
const MAX_HISTORY = 200;

interface History {
  past: Circuit[];
  present: Circuit;
  future: Circuit[];
}

type Action =
  | { type: 'edit'; recipe: (c: Circuit) => Circuit; record: boolean }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'load'; circuit: Circuit; previous?: Circuit };

function reducer(h: History, a: Action): History {
  switch (a.type) {
    case 'edit': {
      const next = a.recipe(h.present);
      if (next === h.present) return h;
      if (!a.record) return { ...h, present: next };
      return { past: [...h.past, h.present].slice(-MAX_HISTORY), present: next, future: [] };
    }
    case 'undo': {
      if (h.past.length === 0) return h;
      return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] };
    }
    case 'load':
      // A different circuit (switching between the sandbox and a lesson): fresh history.
      // Opening a saved circuit over existing work keeps that work one undo away.
      return { past: a.previous && a.previous.parts.length ? [a.previous] : [], present: a.circuit, future: [] };
    case 'redo': {
      if (h.future.length === 0) return h;
      return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) };
    }
  }
}

export type EditFn = (recipe: (c: Circuit) => Circuit, record?: boolean) => void;

export function useCircuit(initial: Circuit = EMPTY_CIRCUIT) {
  const [h, dispatch] = useReducer(reducer, { past: [], present: initial, future: [] });

  const edit = useCallback<EditFn>((recipe, record = true) => dispatch({ type: 'edit', recipe, record }), []);
  const undo = useCallback(() => dispatch({ type: 'undo' }), []);
  const redo = useCallback(() => dispatch({ type: 'redo' }), []);
  /** Replaces the circuit with a fresh history; `previous` (if given) stays one undo away. */
  const load = useCallback((circuit: Circuit, previous?: Circuit) => dispatch({ type: 'load', circuit, previous }), []);

  return {
    circuit: h.present,
    edit,
    undo,
    redo,
    load,
    canUndo: h.past.length > 0,
    canRedo: h.future.length > 0,
  };
}
