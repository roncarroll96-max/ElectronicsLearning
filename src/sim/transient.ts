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
import type { Circuit } from '../model/circuit';
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
    this.caps = [];
    for (const pn of this.net.parts) {
      for (const d of pn.devices) {
        if (d.type !== 'cap') continue;
        d.c *= 1 + mismatch(pn.part.id);
        const old = carry?.get(pn.part.id);
        this.caps.push({
          id: pn.part.id,
          device: d,
          nodes: [d.t[0], d.t[1]],
          // After any change, restart the formula: keep the voltage, drop the older history.
          history: { v: old?.v ?? 0, vPrev: old?.v ?? 0, steps: 0 },
        });
      }
    }
    // Before the first step: the circuit with every capacitor holding its voltage.
    this.sol = this.solveStep(Infinity);
  }

  /** Whether this circuit can change over time: it has a capacitor that is powered, or still charged. */
  get dynamic(): boolean {
    return this.caps.length > 0 && (this.hasSource || this.caps.some((c) => Math.abs(c.history.v) > 1e-9));
  }

  /** The largest capacitor voltage change in the last step, V (0 when nothing is changing). */
  get lastChange(): number {
    return Math.max(0, ...this.caps.map((c) => (c.history.steps > 0 ? Math.abs(c.history.v - c.history.vPrev) : Infinity)));
  }

  /** Advances by h seconds. Returns false if the step couldn't be solved. */
  step(h: number): boolean {
    const sol = this.solveStep(h);
    if (!sol.ok) {
      this.sol = sol;
      return false;
    }
    this.sol = sol;
    this.time += h;
    for (const cap of this.caps) {
      const v = this.capVoltage(cap, sol.x);
      cap.history = { v, vPrev: cap.history.v, steps: Math.min(2, cap.history.steps + 1) };
    }
    return true;
  }

  /**
   * Solves one step of length h. With h = Infinity, each capacitor is held at
   * its present voltage (a stiff source), giving a consistent starting point.
   */
  private solveStep(h: number): Solution {
    for (const { device: d, history: s } of this.caps) {
      if (!Number.isFinite(h)) {
        // Hold the voltage: a very large conductance to a source at v.
        d.geq = 1e3;
        d.ieq = 1e3 * s.v;
      } else if (s.steps >= 2) {
        d.geq = (3 * d.c) / (2 * h);
        d.ieq = (d.c * (4 * s.v - s.vPrev)) / (2 * h);
      } else {
        d.geq = d.c / h;
        d.ieq = (d.c * s.v) / h;
      }
    }
    if (!this.hasSource && this.caps.every((c) => c.history.v === 0)) {
      return { x: new Float64Array(this.net.size), ok: true, iterations: 0 };
    }
    return solveFrom(this.net, this.sol?.x ?? null);
  }

  private capVoltage(cap: CapEntry, x: Float64Array): number {
    const at = (k: number) => (k < 0 ? 0 : x[k]);
    return at(cap.nodes[0]) - at(cap.nodes[1]);
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
