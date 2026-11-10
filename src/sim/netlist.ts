/**
 * Turns the drawn circuit into a netlist: numbered nodes and the primitive
 * devices between them.
 *
 * - Pins joined by wires form one node (wires are ideal: zero resistance).
 * - Every ground symbol is the same node, the 0 V reference.
 * - A separate piece of circuit with no ground symbol uses its battery's −
 *   terminal as 0 V (or any node, if it has no battery).
 */
import { PART_DEFS } from '../model/parts';
import { pinKey, type Circuit, type Part } from '../model/circuit';
import * as M from './models';
import { criticalVoltage, type Device } from './devices';
import { UnionFind } from './unionFind';

export interface SimOptions {
  /** Override the battery's internal resistance, Ω (tests use a tiny value for textbook answers). */
  batteryResistance?: number;
  /**
   * How capacitors appear. 'open' (the default): the settled (DC) state, where a
   * charged capacitor passes no current. 'companion': time-based simulation, where
   * the caller sets each capacitor's companion conductance and current every step.
   */
  capacitors?: 'open' | 'companion';
}

export interface PartNet {
  part: Part;
  /** Node of each pin (−1 = reference). */
  pinNodes: number[];
  devices: Device[];
}

export interface Netlist {
  /** Number of unknown node voltages. */
  size: number;
  parts: PartNet[];
  /** The net (a root pin key) each pin belongs to. */
  netOf: Map<string, string>;
  /** Whether anything can drive current (a battery). */
  hasSource: boolean;
}

export function buildNetlist(c: Circuit, opts: SimOptions = {}): Netlist {
  /* 1. Nets: pins joined by wires. */
  const nets = new UnionFind<string>();
  for (const p of c.parts) PART_DEFS[p.kind].pins.forEach((_, i) => nets.add(pinKey({ part: p.id, pin: i })));
  for (const w of c.wires) nets.union(pinKey(w.a), pinKey(w.b));

  const groundNets = new Set<string>();
  for (const p of c.parts) if (p.kind === 'ground') groundNets.add(nets.find(pinKey({ part: p.id, pin: 0 })));

  /* 2. Provisional node numbers. All ground-symbol nets share one. */
  let next = 0;
  const GROUND = groundNets.size > 0 ? next++ : -1;
  const netNode = new Map<string, number>();
  const internal = new Set<number>();
  const nodeOfNet = (root: string): number => {
    if (groundNets.has(root)) return GROUND;
    let id = netNode.get(root);
    if (id === undefined) {
      id = next++;
      netNode.set(root, id);
    }
    return id;
  };

  /* 3. Devices for each part, on local terminals (pins first, then internal nodes). */
  const built: { part: Part; local: number[]; devices: Device[] }[] = [];
  const batteryMinus: number[] = [];
  let hasSource = false;

  for (const part of c.parts) {
    const local = PART_DEFS[part.kind].pins.map((_, i) => nodeOfNet(nets.find(pinKey({ part: part.id, pin: i }))));
    const devices: Device[] = [];
    const addInternal = () => {
      internal.add(next);
      local.push(next++);
      return local.length - 1;
    };
    const resistor = (a: number, b: number, ohms: number) =>
      devices.push({ type: 'g', lt: [a, b], t: [], g: 1 / Math.max(ohms, M.MIN_R) });
    const diode = (a: number, k: number, m: M.DiodeModel) => {
      let j = a;
      if (m.rs > 0) {
        j = addInternal();
        resistor(a, j, m.rs);
      }
      const nvt = m.n * M.VT;
      devices.push({ type: 'pn', lt: [j, k], t: [], is: m.is, nvt, vcrit: criticalVoltage(m.is, nvt), s: [NaN] });
    };

    // A burned-out part is broken open: it conducts nothing.
    switch (part.burn ? 'burned' : part.kind) {
      case 'burned':
        break;
      case 'battery':
        hasSource = true;
        batteryMinus.push(local[1]);
        devices.push({
          type: 'source',
          lt: [0, 1],
          t: [],
          v: part.value ?? 9,
          g: 1 / (opts.batteryResistance ?? M.BATTERY_R),
        });
        break;
      case 'resistor':
        resistor(0, 1, part.value ?? 0);
        break;
      case 'potentiometer': {
        const r = part.value ?? 0;
        const pos = Math.min(1, Math.max(0, part.pos ?? 0.5));
        resistor(0, 2, r * pos);
        resistor(2, 1, r * (1 - pos));
        break;
      }
      case 'ldr':
        resistor(0, 1, M.ldrResistance(part.light ?? 0.5));
        break;
      case 'switch':
      case 'pushbutton':
        if (part.on) resistor(0, 1, M.SWITCH_R);
        break;
      case 'led':
        diode(0, 1, M.LED_RED);
        break;
      case 'diode':
        diode(0, 1, M.DIODE_1N4148);
        break;
      case 'buzzer':
        diode(0, 1, M.BUZZER);
        break;
      case 'lamp':
        devices.push({ type: 'lamp', lt: [0, 1], t: [] });
        break;
      case 'npn':
        devices.push({
          type: 'npn',
          lt: [0, 1, 2],
          t: [],
          m: M.NPN_2N3904,
          vcrit: criticalVoltage(M.NPN_2N3904.is, M.VT),
          s: [NaN, NaN],
        });
        break;
      case 'capacitor':
        // Settled (DC): a charged capacitor blocks current, so it is an open circuit.
        // Time-based: a companion model the time stepper updates every step.
        if (opts.capacitors === 'companion') devices.push({ type: 'cap', lt: [0, 1], t: [], c: part.value ?? 0, geq: 0, ieq: 0 });
        break;
      case 'ground':
        break;
    }
    built.push({ part, local, devices });
  }

  /* 4. Pick a 0 V reference for every separate piece of circuit. */
  const pieces = new UnionFind<number>();
  for (let k = 0; k < next; k++) pieces.add(k);
  for (const b of built) for (const d of b.devices) for (const l of d.lt.slice(1)) pieces.union(b.local[d.lt[0]], b.local[l]);

  const refOfPiece = new Map<number, number>();
  if (GROUND >= 0) refOfPiece.set(pieces.find(GROUND), GROUND);
  for (const n of batteryMinus) {
    const piece = pieces.find(n);
    if (!refOfPiece.has(piece)) refOfPiece.set(piece, n);
  }
  for (let k = 0; k < next; k++) {
    const piece = pieces.find(k);
    if (!refOfPiece.has(piece) && !internal.has(k)) refOfPiece.set(piece, k);
  }
  const refs = new Set(refOfPiece.values());

  /* 5. Final numbering: references become −1, the rest 0..size−1. */
  const final = new Array<number>(next);
  let size = 0;
  for (let k = 0; k < next; k++) final[k] = refs.has(k) ? -1 : size++;

  const parts: PartNet[] = built.map((b) => {
    for (const d of b.devices) d.t = d.lt.map((l) => final[b.local[l]]);
    const pinCount = PART_DEFS[b.part.kind].pins.length;
    return { part: b.part, pinNodes: b.local.slice(0, pinCount).map((k) => final[k]), devices: b.devices };
  });

  const netOf = new Map<string, string>();
  for (const p of c.parts) {
    PART_DEFS[p.kind].pins.forEach((_, i) => {
      const k = pinKey({ part: p.id, pin: i });
      netOf.set(k, nets.find(k));
    });
  }

  return { size, parts, netOf, hasSource };
}
