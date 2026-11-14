/**
 * Turns the drawn circuit into a netlist: numbered nodes and the primitive
 * devices between them.
 *
 * - Pins joined by wires form one node (wires are ideal: zero resistance).
 * - Every ground symbol is the same node, the 0 V reference.
 * - A separate piece of circuit with no ground symbol uses its battery's −
 *   terminal as 0 V (or any node, if it has no battery).
 */
import { AC_DEFAULT_F, AC_MAX_V, P555, PART_DEFS, SEG, ledLook, logicPins, UNO } from '../model/parts';
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
  /** Whether anything can drive current (a battery or an AC source). */
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
    // Time-based only: a junction's own small capacitance, across it.
    const junctionCap = (a: number, b: number, farads: number) => {
      if (opts.capacitors === 'companion') devices.push({ type: 'cap', lt: [a, b], t: [], c: farads, geq: 0, ieq: 0 });
    };
    const diode = (a: number, k: number, m: M.DiodeModel, cj = 0) => {
      let j = a;
      if (m.rs > 0) {
        j = addInternal();
        resistor(a, j, m.rs);
      }
      const nvt = m.n * M.VT;
      devices.push({ type: 'pn', lt: [j, k], t: [], is: m.is, nvt, vcrit: criticalVoltage(m.is, nvt), s: [NaN] });
      if (cj > 0) junctionCap(j, k, cj);
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
        diode(0, 1, !part.color || part.color === 'red' ? M.LED_RED : M.ledModel(ledLook(part.color).vf), M.JUNCTION_C.led);
        break;
      case 'diode':
        diode(0, 1, M.DIODE_1N4148, M.JUNCTION_C.diode);
        break;
      case 'buzzer':
        diode(0, 1, M.BUZZER);
        break;
      case 'speaker':
        resistor(0, 1, M.SPEAKER.r);
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
          qa: 0,
          qhf: 0,
          qhr: 0,
        });
        junctionCap(0, 2, M.JUNCTION_C.npnBe);
        junctionCap(0, 1, M.JUNCTION_C.npnBc);
        break;
      case 'capacitor':
        // Settled (DC): a charged capacitor blocks current, so it is an open circuit.
        // Time-based: a companion model the time stepper updates every step.
        if (opts.capacitors === 'companion') devices.push({ type: 'cap', lt: [0, 1], t: [], c: part.value ?? 0, geq: 0, ieq: 0 });
        break;
      case 'acsource':
        hasSource = true;
        batteryMinus.push(local[1]);
        devices.push({
          type: 'ac',
          lt: [0, 1],
          t: [],
          amp: Math.min(AC_MAX_V, part.value ?? 5),
          freq: part.freq ?? AC_DEFAULT_F,
          wave: part.wave ?? 'sine',
          g: 1 / (opts.batteryResistance ?? M.AC_SOURCE_R),
          // Settled (DC) view: the source at t = 0, which is 0 V; the time stepper sets ieq every step.
          geq: 1 / (opts.batteryResistance ?? M.AC_SOURCE_R),
          ieq: 0,
        });
        break;
      case 'inductor': {
        const l = part.value ?? 0;
        // Settled (DC): a coil is just its wire, so only its winding resistance is left.
        if (opts.capacitors !== 'companion') {
          resistor(0, 1, M.inductorResistance(l));
          break;
        }
        const j = addInternal();
        resistor(0, j, M.inductorResistance(l));
        devices.push({ type: 'ind', lt: [j, 1], t: [], l, geq: 0, ieq: 0 });
        break;
      }
      case 'transformer': {
        const n = part.value ?? 0.5;
        const { l1, k, r1 } = M.TRANSFORMER;
        const r2 = r1 * n * n;
        if (opts.capacitors !== 'companion') {
          resistor(0, 1, r1);
          resistor(2, 3, r2);
          break;
        }
        const a = addInternal();
        const b = addInternal();
        resistor(0, a, r1);
        resistor(2, b, r2);
        const l2 = l1 * n * n;
        devices.push({ type: 'xfmr', lt: [a, 1, b, 3], t: [], l1, l2, m: k * Math.sqrt(l1 * l2), g: [0, 0, 0, 0], ie: [0, 0] });
        break;
      }
      case 'bridge': {
        const cj = M.RECTIFIER_CJ;
        diode(0, 2, M.DIODE_1N4001, cj);
        diode(1, 2, M.DIODE_1N4001, cj);
        diode(3, 0, M.DIODE_1N4001, cj);
        diode(3, 1, M.DIODE_1N4001, cj);
        break;
      }
      case 'timer555': {
        const T = M.TIMER555;
        const { gnd, trig, out, reset, ctrl, thr, dis, vcc } = P555;
        const mid = addInternal();
        resistor(vcc, ctrl, T.divider);
        resistor(ctrl, mid, T.divider);
        resistor(mid, gnd, T.divider);
        resistor(vcc, gnd, T.supplyR);
        resistor(reset, vcc, T.resetPullUp);
        resistor(trig, gnd, 1 / T.off);
        resistor(thr, gnd, 1 / T.off);
        // Starts reset (output low, discharge on); the time stepper sets the real state.
        devices.push({ type: 'gi', role: 'high', lt: [vcc, out], t: [], geq: T.off, ieq: 0 });
        devices.push({ type: 'gi', role: 'low', lt: [out, gnd], t: [], geq: 1 / T.outR, ieq: 0 });
        devices.push({ type: 'gi', role: 'discharge', lt: [dis, gnd], t: [], geq: 1 / T.dischargeR, ieq: 0 });
        break;
      }
      case 'arduino': {
        const A = M.ARDUINO;
        // Powered over USB: its GND is a 0 V reference, like a battery's − terminal.
        hasSource = true;
        batteryMinus.push(local[UNO.gnd]);
        resistor(UNO.gnd2, UNO.gnd, M.MIN_R); // both GND pins are the same copper
        devices.push({ type: 'source', lt: [UNO.v5, UNO.gnd], t: [], v: A.vcc, g: 1 / A.usbR });
        devices.push({ type: 'source', lt: [UNO.v33, UNO.gnd], t: [], v: A.v33, g: 1 / A.r33 });
        // Each input/output pin: driven high, driven low, or pulled up, switched by the
        // running program (transient.ts). It starts as an input, as after a reset.
        for (let pin = 0; pin < UNO.io; pin++) {
          devices.push({ type: 'gi', role: 'pin-high', pin, lt: [UNO.v5, pin], t: [], geq: 0, ieq: 0 });
          devices.push({ type: 'gi', role: 'pin-low', pin, lt: [pin, UNO.gnd], t: [], geq: A.off, ieq: 0 });
          devices.push({ type: 'gi', role: 'pin-pullup', pin, lt: [UNO.v5, pin], t: [], geq: 0, ieq: 0 });
        }
        break;
      }
      case 'and':
      case 'or':
      case 'not':
      case 'nand':
      case 'nor':
      case 'xor':
      case 'dff': {
        const L = M.LOGIC;
        const lp = logicPins(part.kind);
        // Its hidden 5 V supply, between its 5V and GND pins; its GND is a 0 V reference.
        hasSource = true;
        batteryMinus.push(local[lp.gnd]);
        devices.push({ type: 'source', lt: [lp.v5, lp.gnd], t: [], v: L.vcc, g: 1 / L.supplyR });
        for (const i of lp.inputs) resistor(i, lp.gnd, L.pullDown);
        // Each output: switched to 5 V or to GND by its logic (transient.ts). Starts low.
        for (const o of lp.outputs) {
          devices.push({ type: 'gi', role: 'logic-high', pin: o, lt: [lp.v5, o], t: [], geq: 0, ieq: 0 });
          devices.push({ type: 'gi', role: 'logic-low', pin: o, lt: [o, lp.gnd], t: [], geq: 1 / L.outR, ieq: 0 });
        }
        break;
      }
      case 'sevenseg':
        // Eight LEDs (segments a–g and the dot) sharing one cathode.
        resistor(SEG.com2, SEG.com, M.MIN_R);
        for (let k = 0; k < SEG.count; k++) diode(k, SEG.com, M.LED_RED);
        break;
      case 'ground':
        break;
    }
    built.push({ part, local, devices });
  }

  /* 4. Pick a 0 V reference for every separate piece of circuit. */
  const pieces = new UnionFind<number>();
  for (let k = 0; k < next; k++) pieces.add(k);
  for (const b of built)
    for (const d of b.devices) {
      // A transformer's windings share no wire: each is its own piece (the secondary floats, as it really does).
      if (d.type === 'xfmr') {
        pieces.union(b.local[d.lt[0]], b.local[d.lt[1]]);
        pieces.union(b.local[d.lt[2]], b.local[d.lt[3]]);
        continue;
      }
      for (const l of d.lt.slice(1)) pieces.union(b.local[d.lt[0]], b.local[l]);
    }

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
