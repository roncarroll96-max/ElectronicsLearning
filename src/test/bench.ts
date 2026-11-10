/** Helpers for building small test circuits in code. Used only by tests. */
import { expect } from 'vitest';
import type { Circuit, Part, Wire } from '../model/circuit';
import { PART_DEFS, type PartKind } from '../model/parts';
import { simulate, type SimOptions, type SimResult } from '../sim/simulate';

export type Pin = [Part, number];

export function bench() {
  const parts: Part[] = [];
  const wires: Wire[] = [];
  const add = (kind: PartKind, value?: number, extra: Partial<Part> = {}): Part => {
    const p: Part = {
      id: `${kind}${parts.length}`,
      kind,
      ref: `${PART_DEFS[kind].prefix}${parts.length}`,
      x: 0,
      y: 0,
      rot: 0,
      value: value ?? PART_DEFS[kind].defaultValue,
      ...extra,
    };
    parts.push(p);
    return p;
  };
  const wire = (a: Pin, b: Pin): Wire => {
    const w = { id: `w${wires.length}`, a: { part: a[0].id, pin: a[1] }, b: { part: b[0].id, pin: b[1] } };
    wires.push(w);
    return w;
  };
  const run = (opts?: SimOptions): SimResult => {
    const r = simulate({ parts, wires }, opts);
    expect(r.ok).toBe(true);
    return r;
  };
  const circuit = (): Circuit => ({ parts, wires });
  return { parts, wires, add, wire, run, circuit };
}

export const reading = (r: SimResult, p: Part) => r.parts.get(p.id)!;
/** Current through a two-terminal part, from pin 0 to pin 1. */
export const current = (r: SimResult, p: Part) => reading(r, p).i[0];
/** Voltage across a two-terminal part, pin 0 minus pin 1. */
export const across = (r: SimResult, p: Part) => reading(r, p).v[0] - reading(r, p).v[1];

/** expect a ≈ b to a relative tolerance. */
export function near(actual: number, expected: number, rel = 1e-6, abs = 1e-12) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(rel * Math.abs(expected) + abs);
}

