/**
 * Time-based simulation: the circuit moving forward in small time steps, so
 * capacitors charge and discharge, LEDs fade, and oscillators oscillate.
 *
 * Each step solves the circuit like the settled (DC) simulator does, except
 * that every capacitor is replaced by its "companion model": over one step of
 * length h, the current i = C·dv/dt is approximated from the capacitor's recent
 * voltages, which turns it into a conductance plus a current source.
 *
 * The approximation is BDF2 (the second-order backward difference formula used
 * by SPICE's "Gear" method):  i ≈ C·(3vₙ − 4vₙ₋₁ + vₙ₋₂) / (2h).
 * It is accurate (errors shrink with h²) and never goes unstable, however
 * fast or slow the circuit is compared with the step size: a capacitor far
 * smaller than one step simply settles at once, as it would really. The very
 * first step after any change uses the simpler backward Euler formula,
 * i ≈ C·(vₙ − vₙ₋₁) / h, which needs only one previous voltage.
 */
import type { Circuit, PinRef } from '../model/circuit';
import { storedCharge, type Device } from './devices';
import { JUNCTION_C, VT } from './models';
import { buildNetlist, type Netlist, type SimOptions } from './netlist';
import { readout, type SimResult } from './simulate';
import { solveAcross, solveFrom, type Solution } from './solver';

/** What a capacitor remembers between steps: its voltage now and one step ago (V). */
export interface CapHistory {
  v: number;
  vPrev: number;
  /** Steps of history available since the last change (0, 1, or 2+). */
  steps: number;
}

export type CapStates = Map<string, CapHistory>;

/**
 * No two real capacitors are identical (they're only made to within ±10–20 %),
 * and that's what lets a perfectly symmetrical circuit, like a two-transistor
 * blinker, start up: one side always wins. A simulation of identical parts
 * could balance there forever, like a pencil on its tip. So each capacitor gets
 * a tiny, fixed difference of at most ±0.1 %, taken from its id: far too small
 * to show in any reading, but enough to tip the balance as a real circuit does.
 */
export function mismatch(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193) >>> 0;
  return ((h % 2001) - 1000) / 1e6; // −0.001 … +0.001
}

interface CapEntry {
  id: string;
  device: Extract<Device, { type: 'cap' }>;
  /** Node of the + and − pins (−1 = 0 V). */
  nodes: [number, number];
  history: CapHistory;
  /** Voltage one step before vPrev (for the error estimate). */
  older: number;
}

/** A transistor's stored charge, remembered like a capacitor's voltage. */
interface ChargeEntry {
  device: Extract<Device, { type: 'npn' }>;
  /** Base, collector, emitter nodes. */
  nodes: number[];
  /** Forward charge now, one and two steps ago; then the same for the reverse charge (C). */
  q: Float64Array;
  /** Forward and reverse charge at the step being tried, the voltages they came from, and that step's x. */
  trial: Float64Array;
  vbe: number;
  vbc: number;
  trialFor: Float64Array | null;
}

/** Third divided difference of y0…y3 at times 0, −h, −h−h1, −h−h1−h2. */
function dd3(y0: number, y1: number, y2: number, y3: number, h: number, h1: number, h2: number): number {
  const d01 = (y0 - y1) / h;
  const d12 = (y1 - y2) / h1;
  const d23 = (y2 - y3) / h2;
  return ((d01 - d12) / (h + h1) - (d12 - d23) / (h1 + h2)) / (h + h1 + h2);
}

/**
 * How closely each step must follow the true curve. After every step, the
 * stepper estimates the error that step's formula made (from how sharply the
 * last few points bend) and keeps it within TR_RELTOL of the value plus a small
 * absolute amount: 1 mV for a capacitor, 10 fC for a transistor's stored charge.
 * Too big an error: the step is redone shorter. Small: the next one is longer.
 */
const TR_RELTOL = 5e-3;
const TR_VTOL = 5e-3;

export class TransientSim {
  readonly circuit: Circuit;
  /** Simulated time since power-on, s. */
  time: number;
  private readonly net: Netlist;
  private readonly caps: CapEntry[];
  private sol: Solution;
  /** The two solutions before sol (for the predictor), and the predicted starting point. */
  private x1: Float64Array | null = null;
  private x2: Float64Array | null = null;
  private xp: Float64Array | null = null;
  private readonly hasSource: boolean;
  private readonly pinNodes: Map<string, number[]>;
  private readonly charges: ChargeEntry[];
  /** Lengths of the last two steps taken. */
  private lastH = 0;
  private lastH2 = 0;
  /** Steps taken since the start or the last change (counting stops at 3). */
  private nHist = 0;

  /**
   * Builds the stepper for a circuit. `carry` holds capacitor voltages from
   * before an edit, so charge is kept when the circuit changes (a switch
   * flips, a part moves); capacitors not in it start empty.
   */
  constructor(c: Circuit, carry?: CapStates, time = 0, opts: SimOptions = {}) {
    this.circuit = c;
    this.time = time;
    this.net = buildNetlist(c, { ...opts, capacitors: 'companion' });
    this.hasSource = this.net.hasSource;
    this.pinNodes = new Map(this.net.parts.map((p) => [p.part.id, p.pinNodes]));
    this.caps = [];
    this.charges = [];
    for (const pn of this.net.parts) {
      let k = 0;
      for (const d of pn.devices) {
        if (d.type === 'npn')
          this.charges.push({ device: d, nodes: d.t, q: new Float64Array(6), trial: new Float64Array(2), vbe: 0, vbc: 0, trialFor: null });
        if (d.type !== 'cap') continue;
        // A capacitor part is its own id; a transistor's or diode's junction capacitances are "id#1", "id#2"…
        const id = pn.part.kind === 'capacitor' ? pn.part.id : `${pn.part.id}#${++k}`;
        d.c *= 1 + mismatch(id);
        const old = carry?.get(id);
        this.caps.push({
          id,
          device: d,
          nodes: [d.t[0], d.t[1]],
          // After any change, restart the formula: keep the voltage, drop the older history.
          history: { v: old?.v ?? 0, vPrev: old?.v ?? 0, steps: 0 },
          older: old?.v ?? 0,
        });
      }
    }
    // Before the first step: the circuit with every capacitor holding its voltage.
    this.sol = this.solveStep(Infinity, false);
    this.saveJunctions();
    for (const ch of this.charges) {
      this.chargeAt(ch, this.sol.x);
      ch.q[1] = ch.q[2] = ch.q[0];
      ch.q[4] = ch.q[5] = ch.q[3];
    }
  }

  /** Whether this circuit can change over time: it has a capacitor that is powered, or still charged. */
  get dynamic(): boolean {
    return this.caps.length > 0 && (this.hasSource || this.caps.some((c) => Math.abs(c.history.v) > 1e-9));
  }

  /** The largest capacitor voltage change in the last step, V (0 when nothing is changing). */
  get lastChange(): number {
    let m = 0;
    for (const c of this.caps) m = Math.max(m, c.history.steps > 0 ? Math.abs(c.history.v - c.history.vPrev) : Infinity);
    return m;
  }

  /**
   * Advances by h seconds. Returns false if the step couldn't be solved.
   *
   * Inside, it takes steps of its own size, as SPICE does: after each one it
   * estimates the error that step made (see TR_RELTOL) and picks the next step
   * to keep that error just within bounds. So it strides through calm
   * stretches and slows down where things change fast.
   *
   * A step that won't settle is cut to a quarter and tried again. Below 1/64
   * of h, what's left is a sudden snap, like the two transistors of an
   * oscillator trading places (it takes a few nanoseconds in a real circuit,
   * set by the transistors' stored charge). Following it nanosecond by
   * nanosecond would be far too slow to keep up with sound, and it is far too
   * quick to hear or see at the step h, so that one step is solved straight
   * to its far side (see solveAcross) and the formula restarts after it, as
   * after any sudden change. It lands within 1/64 of h of the true moment.
   */
  step(h: number): boolean {
    let left = h;
    const hSnap = h / 64;
    const hMin = h * 1e-6; // never shrink below this for accuracy alone
    while (left > h * 1e-9) {
      // Land exactly on the requested time, without leaving a sliver for later (split what's left in two).
      const hi = left <= this.hInner ? left : left < 1.25 * this.hInner ? left / 2 : this.hInner;
      const shortened = hi < this.hInner;
      let sol = this.solveStep(hi, false);
      if (!sol.ok) {
        if (hi > hSnap) {
          this.hInner = hi / 4;
          continue;
        }
        sol = this.solveStep(hi, true);
        if (!sol.ok) return false;
        this.commit(sol, hi);
        this.nHist = 0; // restart the formula: the history before a snap says nothing about after it
        left -= hi;
        continue;
      }
      const r = this.errorRatio(sol.x, hi);
      if (Number.isNaN(r)) {
        // Too little history for an estimate (just started, changed or snapped): grow while calm.
        this.commit(sol, hi);
        left -= hi;
        this.hInner = sol.iterations <= 4 ? hi * 2 : hi;
        continue;
      }
      // The error grows with the cube of the step: aim for the step that just meets the tolerance, with
      // a margin, and change by at most 2× at a time (the formula is only stable for gentle changes).
      let f = Math.min(2, Math.max(0.25, 0.9 / Math.cbrt(r)));
      if (r > 1 && hi > hMin) {
        this.hInner = hi * Math.min(f, 0.9);
        continue;
      }
      this.commit(sol, hi);
      left -= hi;
      if (sol.iterations > 4) f = Math.min(f, 1); // hard to settle: don't push it
      // A step shortened only to land on the requested time says nothing against a longer one.
      this.hInner = shortened && f >= 1 ? Math.max(this.hInner, hi * f) : hi * f;
    }
    return true;
  }

  /**
   * The estimated error of a step of length h ending at x, as a fraction of
   * what's allowed (≤ 1 is fine), or NaN without enough history. For the
   * formula used (BDF2) the error is about (x‴/6)·h²(h + h₁)²/(2h + h₁),
   * with x‴/6 estimated by the third divided difference of the last four points.
   */
  private errorRatio(x: Float64Array, h: number): number {
    if (this.nHist < 2 || !(this.lastH > 0) || !(this.lastH2 > 0)) return NaN;
    const h1 = this.lastH;
    const h2 = this.lastH2;
    const scale = (h * h * (h + h1) * (h + h1)) / (2 * h + h1);
    let worst = 0;
    for (const cap of this.caps) {
      const { v, vPrev } = cap.history;
      const vn = this.capVoltage(cap, x);
      const err = Math.abs(dd3(vn, v, vPrev, cap.older, h, h1, h2)) * scale;
      worst = Math.max(worst, err / (TR_RELTOL * Math.max(Math.abs(vn), Math.abs(v)) + TR_VTOL));
    }
    for (const ch of this.charges) {
      this.trialCharges(ch, x);
      const { q, vbe, vbc } = ch;
      const qf = ch.trial[0];
      const qr = ch.trial[1];
      const { m } = ch.device;
      // An error δQ in the stored charge shifts the junction's voltage by δQ ÷ (its capacitance:
      // dQ/dv = τ·(I + Is)/VT, plus the junction's own), so it is judged like a capacitor's voltage.
      const cf = (Math.abs(qf) + m.tf * m.is) / VT + JUNCTION_C.npnBe;
      const cr = (Math.abs(qr) + m.tr * m.is) / VT + JUNCTION_C.npnBc;
      const ef = (Math.abs(dd3(qf, q[0], q[1], q[2], h, h1, h2)) * scale) / cf;
      const er = (Math.abs(dd3(qr, q[3], q[4], q[5], h, h1, h2)) * scale) / cr;
      worst = Math.max(worst, ef / (TR_RELTOL * Math.abs(vbe) + TR_VTOL), er / (TR_RELTOL * Math.abs(vbc) + TR_VTOL));
    }
    return worst;
  }

  /** A transistor's stored charges at node voltages x, into ch.trial (worked out once per x). */
  private trialCharges(ch: ChargeEntry, x: Float64Array): void {
    if (ch.trialFor === x) return;
    const [b, c, e] = ch.nodes;
    const vb = b < 0 ? 0 : x[b];
    ch.vbe = vb - (e < 0 ? 0 : x[e]);
    ch.vbc = vb - (c < 0 ? 0 : x[c]);
    const { m } = ch.device;
    ch.trial[0] = storedCharge(m, m.tf, ch.vbe);
    ch.trial[1] = storedCharge(m, m.tr, ch.vbc);
    ch.trialFor = x;
  }

  /** Puts the charges at x into slots 0 (forward) and 3 (reverse). */
  private chargeAt(ch: ChargeEntry, x: Float64Array): void {
    this.trialCharges(ch, x);
    ch.q[0] = ch.trial[0];
    ch.q[3] = ch.trial[1];
  }

  /** Preferred internal step, s: shrinks through sudden changes, grows back when calm. */
  private hInner = Infinity;
  /** Each junction's limiting memory at the last good step, restored before every attempt. */
  private junctions: { s: number[]; saved: number[] }[] | null = null;
  private saveJunctions(): void {
    if (!this.junctions) {
      this.junctions = [];
      for (const pn of this.net.parts)
        for (const d of pn.devices) if (d.type === 'pn' || d.type === 'npn') this.junctions.push({ s: d.s, saved: [...d.s] });
    }
    for (const j of this.junctions) for (let k = 0; k < j.s.length; k++) j.saved[k] = j.s[k];
  }
  private restoreJunctions(): void {
    if (this.junctions) for (const j of this.junctions) for (let k = 0; k < j.s.length; k++) j.s[k] = j.saved[k];
  }

  private commit(sol: Solution, h: number): void {
    this.x2 = this.x1;
    this.x1 = this.sol.x;
    this.sol = sol;
    this.time += h;
    this.lastH2 = this.lastH;
    this.lastH = h;
    this.nHist = Math.min(3, this.nHist + 1);
    for (const cap of this.caps) {
      const s = cap.history;
      cap.older = s.vPrev;
      s.vPrev = s.v;
      s.v = this.capVoltage(cap, sol.x);
      s.steps = Math.min(2, s.steps + 1);
    }
    for (const ch of this.charges) {
      const q = ch.q;
      q[2] = q[1];
      q[1] = q[0];
      q[5] = q[4];
      q[4] = q[3];
      this.chargeAt(ch, sol.x);
    }
    this.saveJunctions();
  }

  /**
   * Solves one step of length h. With h = Infinity, each capacitor is held at
   * its present voltage (a stiff source), giving a consistent starting point.
   */
  private solveStep(h: number, lastResort: boolean): Solution {
    // Over the step, dQ/dt ≈ a0·Qₙ + a1·Qₙ₋₁ + a2·Qₙ₋₂ (for a capacitor, Q = C·v).
    let a0 = 0;
    let a1 = 0;
    let a2 = 0;
    if (Number.isFinite(h) && this.nHist >= 2 && this.lastH > 0) {
      // BDF2 for unequal steps (w = this step ÷ the last one); with equal steps it is
      // i = C·(3vₙ − 4vₙ₋₁ + vₙ₋₂) / (2h).
      const w = h / this.lastH;
      a0 = (1 + 2 * w) / ((1 + w) * h);
      a1 = -(1 + w) / h;
      a2 = (w * w) / ((1 + w) * h);
    } else if (Number.isFinite(h)) {
      // Backward Euler.
      a0 = 1 / h;
      a1 = -1 / h;
    }
    for (const { device: d, history: s } of this.caps) {
      if (!Number.isFinite(h)) {
        // Hold the voltage: a very large conductance to a source at v.
        d.geq = 1e3;
        d.ieq = 1e3 * s.v;
      } else {
        d.geq = d.c * a0;
        d.ieq = -d.c * (a1 * s.v + a2 * s.vPrev);
      }
    }
    // A transistor's stored charge: no current while held (h = ∞), the same formula otherwise.
    for (const { device: d, q } of this.charges) {
      d.qa = a0;
      d.qhf = a1 * q[0] + a2 * q[1];
      d.qhr = a1 * q[3] + a2 * q[4];
    }
    if (!this.hasSource && this.caps.every((c) => c.history.v === 0)) {
      return { x: new Float64Array(this.net.size), ok: true, iterations: 0 };
    }
    if (!Number.isFinite(h)) return solveFrom(this.net, this.sol?.x ?? null);
    if (lastResort) {
      this.restoreJunctions();
      return solveAcross(this.net, this.sol.x);
    }
    // Each attempt starts from the junctions as they were at the last good step, never from a failed attempt.
    this.restoreJunctions();
    // Start from where the curve is heading, and give up after 5 iterations: a step that hasn't settled
    // by then is in a sudden change, and cutting it is cheaper than grinding on.
    return solveFrom(this.net, this.predict(h), 5, false);
  }

  /**
   * Where the step should end up if things carry on as they were: the curve
   * through the last three points, continued. Newton's method starts there,
   * so it usually settles in two iterations. (Where it lands is still
   * decided only by the circuit's equations; this only shortens the search.)
   */
  private predict(h: number): Float64Array {
    const x0 = this.sol.x;
    const { x1, x2 } = this;
    if (!x1 || this.nHist < 1 || !(this.lastH > 0) || x1.length !== x0.length) return x0;
    const n = x0.length;
    if (!this.xp || this.xp.length !== n) this.xp = new Float64Array(n);
    const xp = this.xp;
    const h1 = this.lastH;
    if (!x2 || this.nHist < 2 || !(this.lastH2 > 0)) {
      for (let k = 0; k < n; k++) xp[k] = x0[k] + ((x0[k] - x1[k]) * h) / h1;
      return xp;
    }
    // Lagrange extrapolation through (0, x0), (−h1, x1), (−h1−h2, x2), evaluated at +h.
    const h2 = this.lastH2;
    const t1 = -h1;
    const t2 = -h1 - h2;
    const l0 = ((h - t1) * (h - t2)) / (t1 * t2);
    const l1 = (h * (h - t2)) / (t1 * (t1 - t2));
    const l2 = (h * (h - t1)) / (t2 * (t2 - t1));
    for (let k = 0; k < n; k++) xp[k] = l0 * x0[k] + l1 * x1[k] + l2 * x2[k];
    return xp;
  }

  private capVoltage(cap: CapEntry, x: Float64Array): number {
    const at = (k: number) => (k < 0 ? 0 : x[k]);
    return at(cap.nodes[0]) - at(cap.nodes[1]);
  }

  /** The voltage at one pin right now, relative to 0 V (cheap: for sampling every step). Null if the pin doesn't exist. */
  voltageAt(ref: PinRef): number | null {
    const k = this.pinNodes.get(ref.part)?.[ref.pin];
    if (k === undefined) return null;
    return k < 0 ? 0 : (this.sol.x[k] ?? 0);
  }

  /** Every voltage and current at the present moment. */
  result(): SimResult {
    const idle = !this.hasSource && this.caps.every((c) => Math.abs(c.history.v) < 1e-9);
    return readout(this.circuit, this.net, this.sol, idle);
  }

  /** Capacitor voltages, to carry across a rebuild. */
  capStates(): CapStates {
    return new Map(this.caps.map((c) => [c.id, { ...c.history }]));
  }
}
