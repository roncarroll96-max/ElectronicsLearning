/**
 * DC operating-point solver: nodal analysis plus Newton's method.
 *
 * Kirchhoff's current law says the currents into every node add up to zero.
 * Resistors make that a set of linear equations; diodes and transistors make
 * it non-linear, so we solve it the way SPICE does: guess, linearize every
 * device around the guess, solve the linear equations, repeat until the
 * answer stops changing.
 */
import { evalBuffer, evaluateInto, isCompanion, resetDevice, type Companion, type Device, type EvalBuffer } from './devices';
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
function currentsSettled(w: Workspace, x: Float64Array, xn: Float64Array, scale: number): boolean {
  for (let d = 0; d < w.devices.length; d++) {
    const t = w.devices[d].t;
    const e = w.bufs[d];
    const m = t.length;
    // Fixed (linear) parts were evaluated only once, at the start: bring their currents up to x.
    if (!w.nonlinear[d]) evaluateInto(w.devices[d], terminalVoltages(w, d, x), scale, false, e);
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
function stamp(A: Float64Array, b: Float64Array, n: number, nodes: number[], e: EvalBuffer): void {
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

/**
 * Everything Newton's method needs, allocated once per netlist and reused by
 * every iteration of every solve: at audio rates the solver runs hundreds of
 * thousands of iterations a second, and creating arrays in each one used to
 * cost more than the arithmetic.
 */
interface Workspace {
  devices: Device[];
  bufs: EvalBuffer[];
  /** Terminal voltages handed to each device. */
  tv: Float64Array[];
  /** Which devices are re-evaluated every iteration (all but resistors, sources and capacitors). */
  nonlinear: boolean[];
  /** The non-linear devices, and the capacitors (companion models, which change every time step). */
  nl: number[];
  /** Capacitors, inductors, AC sources and switched elements: a conductance plus a current, set before each solve. */
  caps: Companion[];
  /** Resistors' and sources' share of A, and the sources' share of b at full voltage: these never change. */
  Afixed: Float64Array;
  bSource: Float64Array;
  /** A and b with every linear part stamped, for the solve in progress. */
  A0: Float64Array;
  b0: Float64Array;
  A: Float64Array;
  b: Float64Array;
  x: Float64Array;
  xn: Float64Array;
}
const workspaces = new WeakMap<Netlist, Workspace>();
function workspace(net: Netlist): Workspace {
  let w = workspaces.get(net);
  if (!w) {
    const n = net.size;
    const devices = net.parts.flatMap((p) => p.devices);
    // Everything but resistors, sources and capacitors is evaluated afresh on every pass (any new kind of device too).
    const nonlinear = devices.map((d) => d.type !== 'g' && d.type !== 'source' && !isCompanion(d));
    w = {
      devices,
      nonlinear,
      nl: devices.flatMap((_, k) => (nonlinear[k] ? [k] : [])),
      caps: devices.filter(isCompanion),
      Afixed: new Float64Array(n * n),
      bSource: new Float64Array(n),
      A0: new Float64Array(n * n),
      b0: new Float64Array(n),
      bufs: devices.map((d) => evalBuffer(d.t.length)),
      tv: devices.map((d) => new Float64Array(d.t.length)),
      A: new Float64Array(n * n),
      b: new Float64Array(n),
      x: new Float64Array(n),
      xn: new Float64Array(n),
    };
    const zero = new Float64Array(n);
    for (let d = 0; d < devices.length; d++) {
      const dev = devices[d];
      if (dev.type !== 'g' && dev.type !== 'source') continue;
      evaluateInto(dev, terminalVoltages(w, d, zero), 1, false, w.bufs[d]);
      stamp(w.Afixed, w.bSource, n, dev.t, w.bufs[d]);
    }
    workspaces.set(net, w);
  }
  return w;
}

function terminalVoltages(w: Workspace, d: number, x: Float64Array): Float64Array {
  const t = w.devices[d].t;
  const v = w.tv[d];
  for (let k = 0; k < t.length; k++) v[k] = t[k] < 0 ? 0 : x[t[k]];
  return v;
}

function newton(w: Workspace, n: number, x0: Float64Array, gmin: number, scale: number, maxIter = MAX_ITER): Solution {
  const { A, b, A0, b0, devices, bufs, nl } = w;
  let x = w.x;
  let xn = w.xn;
  x.set(x0);
  // The linear parts don't change between iterations: stamp them once. Resistors and
  // sources were stamped when the workspace was made; add each capacitor's companion model
  // (current into + is geq·(v+ − v−) − ieq).
  A0.set(w.Afixed);
  for (let k = 0; k < n; k++) {
    A0[k * n + k] += gmin;
    b0[k] = w.bSource[k] * scale;
  }
  for (const c of w.caps) {
    const [p, m] = c.t;
    if (p >= 0) {
      A0[p * n + p] += c.geq;
      b0[p] += c.ieq;
      if (m >= 0) A0[p * n + m] -= c.geq;
    }
    if (m >= 0) {
      A0[m * n + m] += c.geq;
      b0[m] -= c.ieq;
      if (p >= 0) A0[m * n + p] -= c.geq;
    }
  }
  for (let it = 1; it <= maxIter; it++) {
    A.set(A0);
    b.set(b0);
    let limited = false;
    for (let j = 0; j < nl.length; j++) {
      const d = nl[j];
      if (evaluateInto(devices[d], terminalVoltages(w, d, x), scale, true, bufs[d])) limited = true;
      stamp(A, b, n, devices[d].t, bufs[d]);
    }
    if (!solveDense(A, b, n, xn)) return { x: x.slice(), ok: false, iterations: it };
    const converged = !limited && (voltagesSettled(x, xn) || currentsSettled(w, x, xn, scale));
    const swap = x;
    x = xn;
    xn = swap;
    if (converged) return { x: x.slice(), ok: true, iterations: it };
  }
  return { x: x.slice(), ok: false, iterations: maxIter };
}

/**
 * Newton's method starting from a nearby answer (the previous time step's),
 * keeping each junction's history so it settles in a few iterations.
 * With `fallback`, a failure falls back to the full DC strategy; without it,
 * it just reports failure after `maxIter` iterations, so the time stepper can
 * cut its step instead, which is much faster (SPICE does the same).
 */
export function solveFrom(net: Netlist, x0: Float64Array | null, maxIter = MAX_ITER, fallback = true): Solution {
  const n = net.size;
  if (n === 0) return { x: new Float64Array(0), ok: true, iterations: 0 };
  if (x0 && x0.length === n) {
    const r = newton(workspace(net), n, x0, 0, 1, maxIter);
    if (r.ok || !fallback) return r;
  } else if (!fallback) {
    return { x: new Float64Array(n), ok: false, iterations: 0 };
  }
  return solveDC(net);
}

/**
 * Solves a time step across a sudden change, like a transistor snapping over
 * in a two-transistor oscillator, where the answer is far from where the
 * circuit was and Newton's method from there just circles. Goes straight to
 * gmin stepping from the present state: every node starts lightly tied to
 * 0 V, which makes the equations easy, and the tie is loosened in stages
 * until it is gone. Falls back to the full DC strategy if that fails.
 */
export function solveAcross(net: Netlist, x0: Float64Array): Solution {
  const n = net.size;
  if (n === 0 || x0.length !== n) return solveDC(net);
  const w = workspace(net);
  let x = x0;
  let total = 0;
  // 10 mS, then 10 µS, 10 nS and 10 pS (three decades at a time is enough here), then none.
  for (let k = 2; k <= 11; k += 3) {
    const r = newton(w, n, x, 10 ** -k, 1);
    total += r.iterations;
    if (!r.ok) return solveDC(net);
    x = r.x;
  }
  const r = newton(w, n, x, 0, 1);
  total += r.iterations;
  return r.ok ? { ...r, iterations: total } : solveDC(net);
}

/**
 * Finds every node voltage. If plain Newton fails to settle, falls back to the
 * standard SPICE tricks: first "gmin stepping" (start with every node lightly
 * tied to 0 V and loosen it), then "source stepping" (ramp the batteries up
 * from zero).
 */
export function solveDC(net: Netlist): Solution {
  const n = net.size;
  if (n === 0) return { x: new Float64Array(0), ok: true, iterations: 0 };
  const w = workspace(net);
  const devices = w.devices;

  let total = 0;
  const run = (x0: Float64Array, gmin: number, scale: number) => {
    const r = newton(w, n, x0, gmin, scale);
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
