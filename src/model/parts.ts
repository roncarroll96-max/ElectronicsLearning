/**
 * Part catalog: every placeable part's pins, size and default value.
 * Coordinates are in canvas units (1 grid square = GRID units), relative to
 * the part's origin, drawn horizontally (rotation 0).
 */
export const GRID = 20;

export type PartKind =
  | 'battery'
  | 'ground'
  | 'resistor'
  | 'potentiometer'
  | 'capacitor'
  | 'ldr'
  | 'led'
  | 'lamp'
  | 'buzzer'
  | 'switch'
  | 'pushbutton'
  | 'diode'
  | 'npn';

export type Dir = 'l' | 'r' | 'u' | 'd';
export type Rotation = 0 | 90 | 180 | 270;
export type Unit = 'Ω' | 'F' | 'V' | 'A' | 'W';

export interface PinDef {
  name: string;
  x: number;
  y: number;
  /** Which way a wire leaves this pin. */
  dir: Dir;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PartDef {
  kind: PartKind;
  name: string;
  /** Reference-designator prefix: R1, C1, LED1... */
  prefix: string;
  pins: PinDef[];
  /** Body outline used for selection and labels. */
  bounds: Box;
  unit?: Unit;
  defaultValue?: number;
}

function twoPin(a = 'Pin 1', b = 'Pin 2'): PinDef[] {
  return [
    { name: a, x: -40, y: 0, dir: 'l' },
    { name: b, x: 40, y: 0, dir: 'r' },
  ];
}

export const PART_DEFS: Record<PartKind, PartDef> = {
  battery: {
    kind: 'battery',
    name: 'Battery',
    prefix: 'B',
    pins: twoPin('+', '−'),
    bounds: { x: -30, y: -20, w: 60, h: 40 },
    unit: 'V',
    defaultValue: 9,
  },
  ground: {
    kind: 'ground',
    name: 'Ground',
    prefix: 'GND',
    pins: [{ name: 'Ground', x: 0, y: -20, dir: 'u' }],
    bounds: { x: -16, y: -20, w: 32, h: 36 },
  },
  resistor: {
    kind: 'resistor',
    name: 'Resistor',
    prefix: 'R',
    pins: twoPin(),
    bounds: { x: -24, y: -12, w: 48, h: 24 },
    unit: 'Ω',
    defaultValue: 330,
  },
  potentiometer: {
    kind: 'potentiometer',
    name: 'Potentiometer',
    prefix: 'VR',
    pins: [
      { name: 'End A', x: -40, y: 0, dir: 'l' },
      { name: 'End B', x: 40, y: 0, dir: 'r' },
      { name: 'Wiper', x: 0, y: -40, dir: 'u' },
    ],
    bounds: { x: -24, y: -26, w: 48, h: 42 },
    unit: 'Ω',
    defaultValue: 10_000,
  },
  capacitor: {
    kind: 'capacitor',
    name: 'Capacitor',
    prefix: 'C',
    pins: twoPin('+', '−'),
    bounds: { x: -18, y: -18, w: 36, h: 36 },
    unit: 'F',
    defaultValue: 10e-6,
  },
  ldr: {
    kind: 'ldr',
    name: 'Light sensor',
    prefix: 'LDR',
    pins: twoPin(),
    bounds: { x: -24, y: -28, w: 48, h: 42 },
  },
  led: {
    kind: 'led',
    name: 'LED',
    prefix: 'LED',
    pins: twoPin('Anode (+)', 'Cathode (−)'),
    bounds: { x: -18, y: -22, w: 40, h: 36 },
  },
  lamp: {
    kind: 'lamp',
    name: 'Lamp',
    prefix: 'L',
    pins: twoPin(),
    bounds: { x: -18, y: -18, w: 36, h: 36 },
  },
  buzzer: {
    kind: 'buzzer',
    name: 'Buzzer',
    prefix: 'BZ',
    pins: twoPin('+', '−'),
    bounds: { x: -20, y: -20, w: 40, h: 40 },
  },
  switch: {
    kind: 'switch',
    name: 'Switch',
    prefix: 'SW',
    pins: twoPin(),
    bounds: { x: -22, y: -16, w: 44, h: 28 },
  },
  pushbutton: {
    kind: 'pushbutton',
    name: 'Push button',
    prefix: 'PB',
    pins: twoPin(),
    bounds: { x: -22, y: -22, w: 44, h: 34 },
  },
  diode: {
    kind: 'diode',
    name: 'Diode',
    prefix: 'D',
    pins: twoPin('Anode (+)', 'Cathode (−)'),
    bounds: { x: -16, y: -12, w: 32, h: 24 },
  },
  npn: {
    kind: 'npn',
    name: 'NPN transistor',
    prefix: 'Q',
    pins: [
      { name: 'Base', x: -40, y: 0, dir: 'l' },
      { name: 'Collector', x: 20, y: -40, dir: 'u' },
      { name: 'Emitter', x: 20, y: 40, dir: 'd' },
    ],
    bounds: { x: -24, y: -28, w: 56, h: 56 },
  },
};

/* ---------- Geometry helpers ---------- */

export function rotatePoint(x: number, y: number, rot: Rotation): { x: number; y: number } {
  switch (rot) {
    case 0:
      return { x, y };
    case 90:
      return { x: -y, y: x };
    case 180:
      return { x: -x, y: -y };
    case 270:
      return { x: y, y: -x };
  }
}

const DIR_ORDER: Dir[] = ['r', 'd', 'l', 'u'];

export function rotateDir(d: Dir, rot: Rotation): Dir {
  return DIR_ORDER[(DIR_ORDER.indexOf(d) + rot / 90) % 4];
}

export const DIR_VEC: Record<Dir, { x: number; y: number }> = {
  l: { x: -1, y: 0 },
  r: { x: 1, y: 0 },
  u: { x: 0, y: -1 },
  d: { x: 0, y: 1 },
};

export function rotatedBounds(b: Box, rot: Rotation): Box {
  const corners = [
    rotatePoint(b.x, b.y, rot),
    rotatePoint(b.x + b.w, b.y, rot),
    rotatePoint(b.x, b.y + b.h, rot),
    rotatePoint(b.x + b.w, b.y + b.h, rot),
  ];
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/* ---------- Value formatting ---------- */

const PREFIXES: Record<number, string> = { [-12]: 'p', [-9]: 'n', [-6]: 'µ', [-3]: 'm', 0: '', 3: 'k', 6: 'M' };

/** 330 → "330 Ω", 10000 → "10 kΩ", 0.00001 → "10 µF". */
export function formatValue(v: number, unit: Unit): string {
  if (v === 0) return `0 ${unit}`;
  let e = Math.floor(Math.log10(Math.abs(v)) / 3) * 3;
  e = Math.max(-12, Math.min(6, e));
  // Capacitors are never labelled in millifarads: 1000 µF, 4700 µF.
  if (unit === 'F' && e === -3) e = -6;
  const num = parseFloat((v / 10 ** e).toPrecision(e === -6 && unit === 'F' && Math.abs(v) >= 1e-3 ? 4 : 3));
  return `${num} ${PREFIXES[e]}${unit}`;
}

/**
 * A measured value for display: like formatValue, but anything below what a
 * real meter would show (1 µV, 1 nA, 1 nW) reads as zero.
 */
export function formatReading(v: number, unit: 'V' | 'A' | 'W'): string {
  if (!Number.isFinite(v)) return '—';
  const floor = unit === 'V' ? 1e-6 : 1e-9;
  if (Math.abs(v) < floor) return `0 ${unit}`;
  return formatValue(v, unit);
}

const BAND_COLORS = [
  '#1c1c1c', // 0 black
  '#7b4a2a', // 1 brown
  '#d63a2f', // 2 red
  '#f08a24', // 3 orange
  '#f2cc2f', // 4 yellow
  '#3a9a4a', // 5 green
  '#2f6fd6', // 6 blue
  '#8a4fc7', // 7 violet
  '#8f949c', // 8 grey
  '#f4f4f4', // 9 white
];
const GOLD = '#c9a43a';
const SILVER = '#b8bec7';

/** The real color code a resistor of this value would carry: digit, digit, multiplier, tolerance. */
export function resistorBands(ohms: number): string[] {
  if (!(ohms > 0)) return [BAND_COLORS[0], BAND_COLORS[0], BAND_COLORS[0], GOLD];
  let e = Math.floor(Math.log10(ohms)) - 1;
  let sig = Math.round(ohms / 10 ** e);
  if (sig >= 100) {
    sig = Math.round(sig / 10);
    e += 1;
  }
  const mult = e >= 0 ? BAND_COLORS[Math.min(e, 9)] : e === -1 ? GOLD : SILVER;
  return [BAND_COLORS[Math.floor(sig / 10)], BAND_COLORS[sig % 10], mult, GOLD];
}
