/**
 * Primitive devices the solver understands, and how each one's current
 * depends on its terminal voltages.
 *
 * Every device reports, for given terminal voltages:
 *   i — current flowing INTO each terminal (A)
 *   J — how each of those currents changes with each terminal voltage
 *       (the Jacobian, row-major), used by Newton's method
 *   v0 — the voltages it was actually evaluated at (after limiting)
 */
import { GMIN, LAMP, VT, type BjtModel } from './models';

interface Base {
  /** Global node index of each terminal (−1 = reference, 0 V). Filled in by the netlist. */
  t: number[];
  /** Terminal index within the owning part (pins first, then internal nodes). */
  lt: number[];
}

export type Device =
  | (Base & { type: 'g'; g: number })
  | (Base & { type: 'source'; v: number; g: number })
  /**
   * A capacitor during time-based simulation, as its "companion model": over one
   * time step it behaves like a conductance geq in parallel with a current
   * source ieq, both set by the step size and its recent voltages.
   * Current into + is geq·(v+ − v−) − ieq.
   */
  | (Base & { type: 'cap'; c: number; geq: number; ieq: number })
  | (Base & { type: 'pn'; is: number; nvt: number; vcrit: number; s: number[] })
  | (Base & { type: 'lamp' })
  /**
   * A transistor. In time-based simulation its stored charge adds a current
   * qa·Q + qhf (base–emitter) and qa·Q + qhr (base–collector), set by the time
   * stepper every step like a capacitor's companion model; qa = 0 means none (settled).
   */
  | (Base & { type: 'npn'; m: BjtModel; vcrit: number; s: number[]; qa: number; qhf: number; qhr: number });

export interface Evaluation {
  i: number[];
  J: number[];
  v0: number[];
  limited: boolean;
}

/** Voltage above which a junction's current grows so fast that Newton steps must be limited. */
export function criticalVoltage(is: number, nvt: number): number {
  return nvt * Math.log(nvt / (Math.SQRT2 * is));
}

/**
 * SPICE's junction voltage limiting (pnjlim). Stops Newton's method from
 * jumping to a voltage where exp() would explode; instead it approaches the
 * answer in steps of about one thermal voltage on a log scale.
 */
export function limitJunction(vnew: number, vold: number, nvt: number, vcrit: number): number {
  if (vnew > vcrit && Math.abs(vnew - vold) > 2 * nvt) {
    if (vold > 0) {
      const arg = 1 + (vnew - vold) / nvt;
      return arg > 0 ? vold + nvt * Math.log(arg) : vcrit;
    }
    return nvt * Math.log(vnew / nvt);
  }
  return vnew;
}

const EXP_LIMIT = 80;

/** Shockley current is·(e^(v/nvt) − 1) and its slope, continued linearly past e^80 to avoid overflow. */
/** Its results, left here rather than returned in a new array (this runs hundreds of thousands of times a second). */
let shI = 0;
let shG = 0;
function shockley(v: number, is: number, nvt: number): void {
  const x = v / nvt;
  if (x > EXP_LIMIT) {
    const e = Math.exp(EXP_LIMIT);
    shI = is * (e * (1 + x - EXP_LIMIT) - 1);
    shG = (is * e) / nvt;
    return;
  }
  const e = Math.exp(x);
  shI = is * (e - 1);
  shG = (is * e) / nvt;
}

function lamp(v: number): [number, number] {
  const gHot = LAMP.i / LAMP.v;
  const gCold = gHot / LAMP.coldRatio;
  // Below this voltage the filament is effectively cold: a plain resistor.
  const vCold = LAMP.v * LAMP.coldRatio ** (1 / (1 - LAMP.exponent));
  const a = Math.abs(v);
  if (a <= vCold) return [gCold * v, gCold];
  const i = LAMP.i * (a / LAMP.v) ** LAMP.exponent;
  return [Math.sign(v) * i, (LAMP.exponent * i) / a];
}

/** Where an evaluation is written: reused from one Newton iteration to the next, so the loop allocates nothing. */
export interface EvalBuffer {
  i: Float64Array;
  J: Float64Array;
  v0: Float64Array;
}

/** A buffer sized for a device with m terminals. */
export function evalBuffer(m: number): EvalBuffer {
  return { i: new Float64Array(m), J: new Float64Array(m * m), v0: new Float64Array(m) };
}

function twoTerminal(out: EvalBuffer, i: number, g: number, va: number, vb: number): void {
  out.i[0] = i;
  out.i[1] = -i;
  out.J[0] = g;
  out.J[1] = -g;
  out.J[2] = -g;
  out.J[3] = g;
  out.v0[0] = va;
  out.v0[1] = vb;
}

/**
 * Evaluates a device at terminal voltages v. With `limit`, junction voltages
 * are limited relative to the previous Newton step (and that step's state is
 * updated); without it, the device is evaluated exactly at v.
 * `scale` multiplies source voltages (used when ramping sources up).
 */
export function evaluate(d: Device, v: ArrayLike<number>, scale: number, limit: boolean): Evaluation {
  const out = evalBuffer(d.t.length);
  const limited = evaluateInto(d, v, scale, limit, out);
  return { i: Array.from(out.i), J: Array.from(out.J), v0: Array.from(out.v0), limited };
}

/** Same as evaluate(), writing into `out`; returns whether the voltages were limited. */
export function evaluateInto(d: Device, v: ArrayLike<number>, scale: number, limit: boolean, out: EvalBuffer): boolean {
  switch (d.type) {
    case 'g':
      twoTerminal(out, d.g * (v[0] - v[1]), d.g, v[0], v[1]);
      return false;

    case 'source':
      // A voltage source with internal resistance (Thevenin), written as its
      // Norton equivalent: current into + is g·(v+ − v− − V).
      twoTerminal(out, d.g * (v[0] - v[1] - d.v * scale), d.g, v[0], v[1]);
      return false;

    case 'cap':
      twoTerminal(out, d.geq * (v[0] - v[1]) - d.ieq, d.geq, v[0], v[1]);
      return false;

    case 'lamp': {
      const [i, g] = lamp(v[0] - v[1]);
      twoTerminal(out, i, g, v[0], v[1]);
      return false;
    }

    case 'pn': {
      const raw = v[0] - v[1];
      let vd = raw;
      let limited = false;
      if (limit) {
        if (Number.isNaN(d.s[0])) {
          vd = d.vcrit; // first step: start near the knee, as SPICE does
          limited = true;
        } else {
          vd = limitJunction(raw, d.s[0], d.nvt, d.vcrit);
          limited = vd !== raw;
        }
        d.s[0] = vd;
      }
      shockley(vd, d.is, d.nvt);
      twoTerminal(out, shI + GMIN * vd, shG + GMIN, vd, 0);
      return limited;
    }

    case 'npn': {
      // Terminals: base, collector, emitter.
      const { is, bf, br, tf, tr } = d.m;
      const rawBe = v[0] - v[2];
      const rawBc = v[0] - v[1];
      let vbe = rawBe;
      let vbc = rawBc;
      let limited = false;
      if (limit) {
        if (Number.isNaN(d.s[0])) {
          vbe = d.vcrit;
          vbc = 0;
          limited = true;
        } else {
          vbe = limitJunction(rawBe, d.s[0], VT, d.vcrit);
          vbc = limitJunction(rawBc, d.s[1], VT, d.vcrit);
          limited = vbe !== rawBe || vbc !== rawBc;
        }
        d.s[0] = vbe;
        d.s[1] = vbc;
      }
      shockley(vbe, is, VT);
      const iF = shI;
      const gF = shG;
      shockley(vbc, is, VT);
      const iR = shI;
      const gR = shG;
      // Ebers–Moll (transport form), plus GMIN across each junction.
      let ic = iF - iR - iR / br - GMIN * vbc;
      let ib = iF / bf + iR / br + GMIN * (vbe + vbc);
      let icBe = gF;
      let icBc = -gR - gR / br - GMIN;
      let ibBe = gF / bf + GMIN;
      let ibBc = gR / br + GMIN;
      // Stored (diffusion) charge, time-based only: τF·iF across base–emitter and τR·iR across
      // base–collector. Its current, dQ/dt, uses the time stepper's formula, i = qa·Q + history.
      if (d.qa !== 0) {
        ib += d.qa * (tf * iF + tr * iR) + d.qhf + d.qhr;
        ic -= d.qa * tr * iR + d.qhr;
        ibBe += d.qa * tf * gF;
        ibBc += d.qa * tr * gR;
        icBc -= d.qa * tr * gR;
      }
      // Vbe = Vb − Ve and Vbc = Vb − Vc, so d/dVb = A + B, d/dVc = −B, d/dVe = −A.
      const ieBe = -(icBe + ibBe);
      const ieBc = -(icBc + ibBc);
      const { i, J, v0 } = out;
      i[0] = ib;
      i[1] = ic;
      i[2] = -(ic + ib);
      J[0] = ibBe + ibBc;
      J[1] = -ibBc;
      J[2] = -ibBe;
      J[3] = icBe + icBc;
      J[4] = -icBc;
      J[5] = -icBe;
      J[6] = ieBe + ieBc;
      J[7] = -ieBc;
      J[8] = -ieBe;
      v0[0] = vbe;
      v0[1] = vbe - vbc;
      v0[2] = 0;
      return limited;
    }
  }
}

/** A transistor's stored charge (C) at junction voltage v, for transit time τ: τ·i. */
export function storedCharge(m: BjtModel, tau: number, v: number): number {
  shockley(v, m.is, VT);
  return tau * shI;
}

/** Forgets Newton history so the next solve starts fresh. */
export function resetDevice(d: Device): void {
  if (d.type === 'pn' || d.type === 'npn') d.s.fill(NaN);
}
