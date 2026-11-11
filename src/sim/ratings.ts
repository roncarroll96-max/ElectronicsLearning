/**
 * Part ratings: how much each part can take before it runs hot, and before
 * it burns out. Values follow typical datasheets for small hobby parts.
 *
 * "max" is the continuous rating; above it the part is flagged as running
 * hot. "burn" is where it fails within moments; real parts usually die at
 * one and a half to two times their rating.
 */
import type { BurnInfo, Circuit, Part } from '../model/circuit';
import { UNO, type PartKind } from '../model/parts';
import type { PartReading, SimResult } from './simulate';

export type Quantity = BurnInfo['quantity'];

export interface Limit {
  quantity: Quantity;
  max: number;
  burn: number;
}

export const RATINGS: Partial<Record<PartKind, Limit[]>> = {
  // ¼ W carbon-film resistor.
  resistor: [{ quantity: 'power', max: 0.25, burn: 0.5 }],
  // Small trimmer potentiometer.
  potentiometer: [{ quantity: 'power', max: 0.25, burn: 0.5 }],
  // GL5528 LDR: 100 mW maximum.
  ldr: [{ quantity: 'power', max: 0.1, burn: 0.2 }],
  // 5 mm LED: 20 mA typical, 30 mA absolute maximum.
  led: [{ quantity: 'current', max: 0.03, burn: 0.06 }],
  // 1N4148: 200 mA continuous forward current.
  diode: [{ quantity: 'current', max: 0.2, burn: 0.4 }],
  // Active buzzer: about 30 mA, 3–12 V.
  buzzer: [{ quantity: 'current', max: 0.03, burn: 0.06 }],
  // 8 Ω, 0.5 W speaker: past about 1 W the voice coil overheats.
  speaker: [{ quantity: 'power', max: 0.5, burn: 1 }],
  // 9 V, 50 mA lamp (0.45 W): a little overdrive is fine, twice the power melts the filament.
  lamp: [{ quantity: 'power', max: 0.5, burn: 0.9 }],
  // 2N3904: 200 mA collector current, 625 mW.
  npn: [
    { quantity: 'current', max: 0.2, burn: 0.4 },
    { quantity: 'power', max: 0.625, burn: 1.25 },
  ],
  // 10 µF electrolytic, 16 V: must not be reversed.
  capacitor: [
    { quantity: 'reverse', max: 0.3, burn: 1.5 },
    { quantity: 'voltage', max: 16, burn: 24 },
  ],
  // Small 10 mH-class coil: about 0.5 W lost in its winding.
  inductor: [{ quantity: 'power', max: 0.5, burn: 1 }],
  // Small transformer: about 1 W of loss in its windings.
  transformer: [{ quantity: 'power', max: 1, burn: 2 }],
  // 1 A bridge rectifier (four 1N4001-type diodes).
  bridge: [{ quantity: 'current', max: 1, burn: 2 }],
  // NE555: 4.5–16 V supply (18 V absolute maximum), 200 mA output.
  timer555: [
    { quantity: 'voltage', max: 16, burn: 18 },
    { quantity: 'current', max: 0.2, burn: 0.4 },
  ],
  // Arduino Uno (ATmega328P): 20 mA per pin recommended, 40 mA absolute maximum.
  arduino: [{ quantity: 'current', max: 0.02, burn: 0.04 }],
  // A battery doesn't burn out here, but more than 1 A from a 9 V battery means a short circuit.
  battery: [{ quantity: 'current', max: 1, burn: Infinity }],
};

export interface Stress extends Limit {
  value: number;
  level: 'ok' | 'hot' | 'burn';
  /** value ÷ burn limit: above 1 means it burns. */
  severity: number;
}

function measure(kind: PartKind, q: Quantity, r: PartReading): number {
  switch (q) {
    case 'current':
      // Arduino: the busiest input/output pin.
      if (kind === 'arduino') return Math.max(...r.i.slice(0, UNO.io).map(Math.abs));
      // Transistor: its collector. Bridge: its + output. 555: its output pin.
      return Math.abs(kind === 'npn' ? r.i[1] : kind === 'bridge' ? r.i[2] : kind === 'timer555' ? r.i[2] : r.i[0]);
    case 'power':
      return Math.max(0, r.power);
    case 'reverse':
      return Math.max(0, r.v[1] - r.v[0]);
    case 'voltage':
      // 555: its supply, VCC to GND.
      return kind === 'timer555' ? Math.abs(r.v[7] - r.v[0]) : Math.abs(r.v[0] - r.v[1]);
  }
}

/** How hard a part is being pushed: its worst quantity relative to its limits. */
export function stressOf(part: Part, r: PartReading | undefined): Stress | null {
  const limits = RATINGS[part.kind];
  if (!limits || !r || part.burn) return null;
  let worst: Stress | null = null;
  for (const lim of limits) {
    const value = measure(part.kind, lim.quantity, r);
    const level = value > lim.burn ? 'burn' : value > lim.max ? 'hot' : 'ok';
    const severity = Number.isFinite(lim.burn) ? value / lim.burn : value / lim.max / 1e6;
    if (!worst || severity > worst.severity) worst = { ...lim, value, level, severity };
  }
  return worst;
}

/**
 * The single most overloaded part, if any part is past its burn limit. Only
 * one part burns at a time, as in real life: the weakest link fails first,
 * which often breaks the circuit and saves the rest.
 */
export function worstBurnout(c: Circuit, sim: SimResult): { id: string; burn: BurnInfo } | null {
  if (!sim.ok || sim.idle) return null;
  let best: { id: string; burn: BurnInfo; severity: number } | null = null;
  for (const p of c.parts) {
    if (p.id.startsWith('__')) continue; // the multimeter's own hidden parts
    const r = sim.parts.get(p.id);
    const s = stressOf(p, r);
    if (!s || s.level !== 'burn' || !r) continue;
    if (!best || s.severity > best.severity) {
      best = {
        id: p.id,
        severity: s.severity,
        burn: { quantity: s.quantity, value: s.value, limit: s.max, v: [...r.v], i: [...r.i] },
      };
    }
  }
  return best && { id: best.id, burn: best.burn };
}
