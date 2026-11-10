/**
 * DC operating-point solver: nodal analysis plus Newton's method.
 *
 * Kirchhoff's current law says the currents into every node add up to zero.
 * Resistors make that a set of linear equations; diodes and transistors make
 * it non-linear, so we solve it the way SPICE does: guess, linearize every
 * device around the guess, solve the linear equations, repeat until the
 * answer stops changing.
 */
import { evaluate, resetDevice, type Device, type Evaluation } from './devices';
import { solveDense } from './linalg';
import type { Netlist } from './netlist';

const MAX_ITER = 200;
/** Relative tolerance for "the answer stopped changing". */
const RELTOL = 1e-6;
/** Absolute tolerances: 1 µV for voltages, 1 fA for currents (much tighter than SPICE, which matters
 *  where a node is held only by picoamp leakage, like the far side of an open switch). */
const VNTOL = 1e-6;
const ABSTOL = 1e-15;

function voltagesSettled(x: Float64Array, xn: Float64Array): boolean {
  for (let k = 0; k < x.length; k++) {
    if (Math.abs(xn[k] - x[k]) > RELTOL * Math.max(Math.abs(xn[k]), Math.abs(x[k])) + VNTOL) return false;
  }
  return true;
}

/**
 * True when the last step changed no device current noticeably. This catches
 * a cluster of parts tied to 0 V only by picoamp leakage: its absolute voltage
 * can wobble with rounding error while every current is already exact.
 */
function currentsSettled(devices: Device[], evals: Evaluation[], x: Float64Array, xn: Float64Array): boolean {
  for (let d = 0; d < devices.length; d++) {
    const t = devices[d].t;
    const e = evals[d];
    const m = t.length;
    for (let k = 0; k < m; k++) {
      let di = 0;
      for (let j = 0; j < m; j++) if (t[j] >= 0) di += e.J[k * m + j] * (xn[t[j]] - x[t[j]]);
      if (Math.abs(di) > RELTOL * Math.abs(e.i[k]) + ABSTOL) return false;
    }
  }
  return true;
}

export interface Solution {
  /** Node voltages (V), indexed by node number. */
  x: Float64Array;
  ok: boolean;
  iterations: number;
}

/** Adds one device's linearized currents to the node equations. */
function stamp(A: Float64Array, b: Float64Array, n: number, nodes: number[], e: Evaluation): void {
  const m = nodes.length;
  for (let k = 0; k < m; k++) {
    const nk = nodes[k];
    if (nk < 0) continue;
    // i_k(v) ≈ i_k(v0) + Σ_j J_kj (v_j − v0_j)  ⇒  Σ_j J_kj v_j = −(i_k(v0) − Σ_j J_kj v0_j)
    let rest = e.i[k];
    for (let j = 0; j < m; j++) {
      const g = e.J[k * m + j];
      rest -= g * e.v0[j];
      const nj = nodes[j];
      if (nj >= 0) A[nk * n + nj] += g;
    }
    b[nk] -= rest;
  }
}

function newton(n: number, devices: Device[], x0: Float64Array, gmin: number, scale: number): Solution {
  const A = new Float64Array(n * n);
  const b = new Float64Array(n);
  let x = x0.slice();
  for (let it = 1; it <= MAX_ITER; it++) {
    A.fill(0);
    b.fill(0);
    for (let k = 0; k < n; k++) A[k * n + k] = gmin;
    let limited = false;
    const evals: Evaluation[] = [];
    for (const d of devices) {
      const e = evaluate(
        d,
        d.t.map((k) => (k < 0 ? 0 : x[k])),
        scale,
        true,
      );
      if (e.limited) limited = true;
      evals.push(e);
      stamp(A, b, n, d.t, e);
    }
    const xn = solveDense(A, b, n);
    if (!xn) return { x, ok: false, iterations: it };
    const converged = !limited && (voltagesSettled(x, xn) || currentsSettled(devices, evals, x, xn));
    x = xn;
    if (converged) return { x, ok: true, iterations: it };
  }
  return { x, ok: false, iterations: MAX_ITER };
}

/**
 * One time step: Newton's method starting from the previous step's answer,
 * keeping each junction's history so it settles in a few iterations. Falls back
 * to the full DC strategy if that fails (after a sudden change, say).
 */
export function solveFrom(net: Netlist, x0: Float64Array | null): Solution {
  const n = net.size;
  if (n === 0) return { x: new Float64Array(0), ok: true, iterations: 0 };
  const devices = net.parts.flatMap((p) => p.devices);
  if (x0 && x0.length === n) {
    const r = newton(n, devices, x0, 0, 1);
    if (r.ok) return r;
  }
  return solveDC(net);
}

/**
 * Finds every node voltage. If plain Newton fails to settle, falls back to the
 * standard SPICE tricks: first "gmin stepping" (start with every node lightly
 * tied to 0 V and loosen it), then "source stepping" (ramp the batteries up
 * from zero).
 */
export function solveDC(net: Netlist): Solution {
  const n = net.size;
  const devices = net.parts.flatMap((p) => p.devices);
  if (n === 0) return { x: new Float64Array(0), ok: true, iterations: 0 };

  let total = 0;
  const run = (x0: Float64Array, gmin: number, scale: number) => {
    const r = newton(n, devices, x0, gmin, scale);
    total += r.iterations;
    return r;
  };
  const fresh = () => {
    devices.forEach(resetDevice);
    return new Float64Array(n);
  };

  // The netlist gives every node a conducting path to its own 0 V reference
  // (devices carry their own tiny junction leakage), so no artificial leak
  // from each node to 0 V is needed. Adding one would skew circuits where
  // only picoamps flow.
  let r = run(fresh(), 0, 1);
  if (r.ok) return { ...r, iterations: total };

  // Gmin stepping: tie every node to 0 V through 10 mS, loosen it tenfold at a
  // time down to 1 pS, then remove it.
  let x = fresh();
  let ok = true;
  for (let k = 2; k <= 12; k++) {
    r = run(x, 10 ** -k, 1);
    if (!r.ok) {
      ok = false;
      break;
    }
    x = r.x;
  }
  if (ok) {
    r = run(x, 0, 1);
    if (r.ok) return { ...r, iterations: total };
  }

  // Source stepping.
  x = fresh();
  for (let s = 1; s <= 20; s++) {
    r = run(x, 0, s / 20);
    if (!r.ok) return { x: r.x, ok: false, iterations: total };
    x = r.x;
  }
  return { x, ok: true, iterations: total };
}
