/**
 * The virtual multimeter. It behaves like a real one, because that is what
 * the learner will one day hold:
 *
 * - Volts: the meter sits ACROSS the circuit (in parallel) and draws a tiny
 *   current through its 10 MΩ input, like a real digital meter.
 * - Amps: the meter must be part of the loop (in series). Inside it is a
 *   0.5 Ω shunt, so placing it across a battery is nearly a short circuit and
 *   blows its fuse, exactly as it would on a real meter.
 * - Ohms: the meter pushes its own small test current through the part,
 *   which only works with the power off. If a battery is connected, it refuses.
 */
import { PART_DEFS } from '../model/parts';
import { pinKey, type Circuit, type Part, type PinRef, type Pt, type Wire } from '../model/circuit';
import { formatReading, formatValue } from '../model/parts';
import { simulate, type SimResult } from '../sim/simulate';
import { UnionFind } from '../sim/unionFind';

export const METER = {
  /** Input resistance in volts mode. */
  voltmeterR: 10e6,
  /** Shunt resistance in amps mode. */
  ammeterR: 0.5,
  /** The amps input's fuse. */
  fuseA: 0.4,
  /** Ohms mode: test voltage and its internal resistance. */
  ohmV: 1,
  ohmR: 1000,
  /** Above this the display reads OL (over limit). */
  ohmMax: 40e6,
};

export type MeterMode = 'V' | 'A' | 'Ω';
export type Probe = { pin: PinRef } | { at: Pt };

export interface MeterState {
  open: boolean;
  mode: MeterMode;
  red: Probe;
  black: Probe;
  /** Current that blew the fuse, if it has blown. */
  fuseBlownAt: number | null;
}

export const INITIAL_METER: MeterState = {
  open: false,
  mode: 'V',
  red: { at: { x: 0, y: 0 } },
  black: { at: { x: 0, y: 0 } },
  fuseBlownAt: null,
};

export const METER_ID = '__meter';

/** The pin a probe touches, if it touches one that still exists. */
export function probePin(c: Circuit, p: Probe): PinRef | null {
  if (!('pin' in p)) return null;
  return c.parts.some((x) => x.id === p.pin.part) ? p.pin : null;
}

function withMeter(c: Circuit, red: PinRef, black: PinRef, part: Part): Circuit {
  const wires: Wire[] = [
    { id: `${METER_ID}_r`, a: red, b: { part: METER_ID, pin: 0 } },
    { id: `${METER_ID}_b`, a: { part: METER_ID, pin: 1 }, b: black },
  ];
  return { parts: [...c.parts, part], wires: [...c.wires, ...wires] };
}

/** The circuit as the simulator should see it with the meter connected (volts and amps modes load the circuit). */
export function circuitWithMeter(c: Circuit, m: MeterState): Circuit {
  if (!m.open || m.mode === 'Ω') return c;
  if (m.mode === 'A' && m.fuseBlownAt !== null) return c;
  const red = probePin(c, m.red);
  const black = probePin(c, m.black);
  if (!red || !black) return c;
  const ohms = m.mode === 'V' ? METER.voltmeterR : METER.ammeterR;
  return withMeter(c, red, black, { id: METER_ID, kind: 'resistor', ref: 'METER', x: 0, y: 0, rot: 0, value: ohms });
}

export interface MeterReading {
  /** What the display shows. */
  display: string;
  /** Raw value in V, A or Ω (null when not measuring). */
  value: number | null;
  /** A short explanation under the display. */
  note: string;
  tone: 'idle' | 'ok' | 'warn';
}

/** Whether the pins the probes touch are connected (through wires and parts) to a battery. */
function touchesBattery(c: Circuit, pins: PinRef[]): boolean {
  const uf = new UnionFind<string>();
  for (const p of c.parts) {
    const keys = PART_DEFS[p.kind].pins.map((_, i) => pinKey({ part: p.id, pin: i }));
    keys.forEach((k) => uf.add(k));
    const conducts =
      !p.burn && p.kind !== 'capacitor' && p.kind !== 'ground' && !((p.kind === 'switch' || p.kind === 'pushbutton') && !p.on);
    if (conducts) for (const k of keys.slice(1)) uf.union(keys[0], k);
  }
  for (const w of c.wires) uf.union(pinKey(w.a), pinKey(w.b));
  // Ground symbols are all connected to each other.
  const grounds = c.parts.filter((p) => p.kind === 'ground').map((p) => pinKey({ part: p.id, pin: 0 }));
  for (const g of grounds.slice(1)) uf.union(grounds[0], g);

  const roots = new Set(pins.map((p) => uf.find(pinKey(p))));
  return c.parts.some(
    (p) => p.kind === 'battery' && !p.burn && [0, 1].some((i) => roots.has(uf.find(pinKey({ part: p.id, pin: i })))),
  );
}

/** In amps mode, the current through the meter if it is enough to blow the fuse. */
export function fuseOverload(m: MeterState, sim: SimResult): number | null {
  if (!m.open || m.mode !== 'A' || m.fuseBlownAt !== null || !sim.ok) return null;
  const r = sim.parts.get(METER_ID);
  const amps = r ? Math.abs(r.i[0]) : 0;
  return amps > METER.fuseA ? amps : null;
}

/**
 * What the meter shows. `simCircuit` and `sim` are the main simulation (which
 * already includes the meter in volts/amps mode); `c` is the circuit as drawn,
 * with switch and button states applied.
 */
export function readMeter(c: Circuit, m: MeterState, sim: SimResult): MeterReading {
  const red = probePin(c, m.red);
  const black = probePin(c, m.black);
  const idle = (note: string): MeterReading => ({ display: '- - -', value: null, note, tone: 'idle' });

  if (m.mode === 'A' && m.fuseBlownAt !== null) {
    return {
      display: 'FUSE',
      value: null,
      note: `The meter’s fuse blew: ${formatReading(m.fuseBlownAt, 'A')} rushed through it. An ammeter is nearly a short circuit, so it must go in series (part of the loop), never across a battery or a part.`,
      tone: 'warn',
    };
  }
  if (!red || !black) return idle('Drag the red and black probes onto two pins.');

  if (m.mode === 'Ω') {
    if (touchesBattery(c, [red, black])) {
      return idle('Disconnect the battery first. An ohmmeter measures with its own small current, so it only works with the power off.');
    }
    const test = withMeter(c, red, black, {
      id: METER_ID,
      kind: 'battery',
      ref: 'METER',
      x: 0,
      y: 0,
      rot: 0,
      value: METER.ohmV,
    });
    const r = simulate(test, { batteryResistance: METER.ohmR }).parts.get(METER_ID);
    if (!r) return idle('');
    const current = -r.i[0];
    const ohms = (r.v[0] - r.v[1]) / current;
    if (!(current > 1e-12) || !(ohms < METER.ohmMax) || ohms < 0) {
      return { display: 'OL', value: Infinity, note: 'Over limit: no path for current between the probes (or more than 40 MΩ).', tone: 'ok' };
    }
    return {
      display: formatValue(Math.abs(ohms) < 0.05 ? 0 : ohms, 'Ω'),
      value: ohms,
      note: 'Resistance between the probes, measured with the meter’s own small current.',
      tone: 'ok',
    };
  }

  if (!sim.ok) return idle('The simulator couldn’t solve this circuit.');
  const r = sim.parts.get(METER_ID);
  if (m.mode === 'V') {
    const volts = r ? r.v[0] - r.v[1] : 0;
    return {
      display: formatReading(volts, 'V'),
      value: volts,
      note: 'Voltage at the red probe compared with the black one. A voltmeter goes across a part (in parallel).',
      tone: 'ok',
    };
  }
  const amps = r ? r.i[0] : 0;
  return {
    display: formatReading(amps, 'A'),
    value: amps,
    note: 'Current flowing in at the red probe and out at the black one. An ammeter goes in series: remove a wire and bridge the gap with the probes.',
    tone: 'ok',
  };
}
