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
import type { Device } from './devices';
import { buildNetlist, type Netlist, type SimOptions } from './netlist';
import { readout, type SimResult } from './simulate';
import { solveFrom, type Solution } from './solver';

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
}

export class TransientSim {
  readonly circuit: Circuit;
  /** Simulated time since power-on, s. */
  time: number;
  private readonly net: Netlist;
  private readonly caps: CapEntry[];
  private sol: Solution;
  private readonly hasSource: boolean;
  private readonly pinNodes: Map<string, number[]>;
  /** Length of the last step taken: BDF2's formula assumes equal steps, so a different one restarts it. */
  private lastH = 0;

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
    for (const pn of this.net.parts) {
      let k = 0;
      for (const d of pn.devices) {
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
        });
      }
    }
    // Before the first step: the circuit with every capacitor holding its voltage.
    this.sol = this.solveStep(Infinity, false);
    this.saveJunctions();
  }

  /** Whether this circuit can change over time: it has a capacitor that is powered, or still charged. */
  get dynamic(): boolean {
    return this.caps.length > 0 && (this.hasSource || this.caps.some((c) => Math.abs(c.history.v) > 1e-9));
  }

  /** The largest capacitor voltage change in the last step, V (0 when nothing is changing). */
  get lastChange(): number {
    return Math.max(0, ...this.caps.map((c) => (c.history.steps > 0 ? Math.abs(c.history.v - c.history.vPrev) : Infinity)));
  }

  /**
   * Advances by h seconds. Returns false if the step couldn't be solved.
   *
   * Inside, it may take several smaller steps: when a step won't settle (a
   * transistor snapping on or off in the middle of it), it cuts the step to a
   * quarter and tries again, then grows the step back (doubling) once things
   * are calm. Small steps through a sudden change settle in a few iterations
   * each; big steps elsewhere keep it fast. SPICE controls its steps the same way.
   */
  step(h: number): boolean {
    let left = h;
    while (left > h * 1e-9) {
      let hi = Math.min(left, this.hInner);
      if (left - hi < 0.25 * hi) hi = left; // don't leave a sliver for later
      let sol = this.solveStep(hi, false);
      if (!sol.ok) {
        // Cut down to 1/64 of the step; past that, the change is a transistor flipping state
        // (instant in this model), so solve straight to its far side with every trick.
        if (hi > h / 64) {
          this.hInner = hi / 4;
          continue;
        }
        sol = this.solveStep(hi, true);
        if (!sol.ok) return false;
      }
      this.commit(sol, hi);
      left -= hi;
      // Calm (settled in a few iterations): try a bigger step next time.
      this.hInner = sol.iterations <= 4 ? hi * 2 : hi;
    }
    return true;
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
    this.sol = sol;
    this.time += h;
    this.lastH = h;
    for (const cap of this.caps) {
      const v = this.capVoltage(cap, sol.x);
      cap.history = { v, vPrev: cap.history.v, steps: Math.min(2, cap.history.steps + 1) };
    }
    this.saveJunctions();
  }

  /**
   * Solves one step of length h. With h = Infinity, each capacitor is held at
   * its present voltage (a stiff source), giving a consistent starting point.
   */
  private solveStep(h: number, lastResort: boolean): Solution {
    for (const { device: d, history: s } of this.caps) {
      if (!Number.isFinite(h)) {
        // Hold the voltage: a very large conductance to a source at v.
        d.geq = 1e3;
        d.ieq = 1e3 * s.v;
      } else if (s.steps >= 2 && this.lastH > 0) {
        // BDF2 for unequal steps (w = this step ÷ the last one); with equal steps it is
        // i = C·(3vₙ − 4vₙ₋₁ + vₙ₋₂) / (2h).
        const w = h / this.lastH;
        d.geq = ((d.c / h) * (1 + 2 * w)) / (1 + w);
        d.ieq = (d.c / h) * ((1 + w) * s.v - ((w * w) / (1 + w)) * s.vPrev);
      } else {
        d.geq = d.c / h;
        d.ieq = (d.c * s.v) / h;
      }
    }
    if (!this.hasSource && this.caps.every((c) => c.history.v === 0)) {
      return { x: new Float64Array(this.net.size), ok: true, iterations: 0 };
    }
    if (!Number.isFinite(h) || lastResort) return solveFrom(this.net, this.sol?.x ?? null);
    // Each attempt starts from the junctions as they were at the last good step, never from a failed attempt.
    this.restoreJunctions();
    // Give up after 10 iterations: cutting the step is cheaper than grinding on. (Starting from a
    // straight-line prediction instead of the last answer was tried: it made pitches less accurate.)
    return solveFrom(this.net, this.sol.x, 10, false);
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
