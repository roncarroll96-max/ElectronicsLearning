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
  | (Base & { type: 'pn'; is: number; nvt: number; vcrit: number; s: number[] })
  | (Base & { type: 'lamp' })
  | (Base & { type: 'npn'; m: BjtModel; vcrit: number; s: number[] });

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
function shockley(v: number, is: number, nvt: number): [number, number] {
  const x = v / nvt;
  if (x > EXP_LIMIT) {
    const e = Math.exp(EXP_LIMIT);
    return [is * (e * (1 + x - EXP_LIMIT) - 1), (is * e) / nvt];
  }
  const e = Math.exp(x);
  return [is * (e - 1), (is * e) / nvt];
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

function twoTerminal(i: number, g: number, v0: number[], limited = false): Evaluation {
  return { i: [i, -i], J: [g, -g, -g, g], v0, limited };
}

/**
 * Evaluates a device at terminal voltages v. With `limit`, junction voltages
 * are limited relative to the previous Newton step (and that step's state is
 * updated); without it, the device is evaluated exactly at v.
 * `scale` multiplies source voltages (used when ramping sources up).
 */
export function evaluate(d: Device, v: number[], scale: number, limit: boolean): Evaluation {
  switch (d.type) {
    case 'g':
      return twoTerminal(d.g * (v[0] - v[1]), d.g, v);

    case 'source':
      // A voltage source with internal resistance (Thevenin), written as its
      // Norton equivalent: current into + is g·(v+ − v− − V).
      return twoTerminal(d.g * (v[0] - v[1] - d.v * scale), d.g, v);

    case 'lamp': {
      const [i, g] = lamp(v[0] - v[1]);
      return twoTerminal(i, g, v);
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
      const [i, g] = shockley(vd, d.is, d.nvt);
      return twoTerminal(i + GMIN * vd, g + GMIN, [vd, 0], limited);
    }

    case 'npn': {
      // Terminals: base, collector, emitter.
      const { is, bf, br } = d.m;
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
      const [iF, gF] = shockley(vbe, is, VT);
      const [iR, gR] = shockley(vbc, is, VT);
      // Ebers–Moll (transport form), plus GMIN across each junction.
      const ic = iF - iR - iR / br - GMIN * vbc;
      const ib = iF / bf + iR / br + GMIN * (vbe + vbc);
      const ie = -(ic + ib);
      // Partial derivatives with respect to Vbe and Vbc.
      const icBe = gF;
      const icBc = -gR - gR / br - GMIN;
      const ibBe = gF / bf + GMIN;
      const ibBc = gR / br + GMIN;
      const ieBe = -(icBe + ibBe);
      const ieBc = -(icBc + ibBc);
      // Vbe = Vb − Ve and Vbc = Vb − Vc, so d/dVb = A + B, d/dVc = −B, d/dVe = −A.
      const row = (a: number, b: number) => [a + b, -b, -a];
      return {
        i: [ib, ic, ie],
        J: [...row(ibBe, ibBc), ...row(icBe, icBc), ...row(ieBe, ieBc)],
        v0: [vbe, vbe - vbc, 0],
        limited,
      };
    }
  }
}

/** Forgets Newton history so the next solve starts fresh. */
export function resetDevice(d: Device): void {
  if (d.type === 'pn' || d.type === 'npn') d.s.fill(NaN);
}
