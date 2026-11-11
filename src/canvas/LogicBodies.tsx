/**
 * How the digital parts look: logic gates (standard distinctive-shape
 * symbols), the D flip-flop, and the 7-segment display. Pins: gate inputs at
 * x = −60, outputs at x = 60, 5V on top and GND at the bottom (y = ∓60).
 */
import type { PartKind } from '../model/parts';

/** The real chip each part comes on (one gate or flip-flop of it is used). */
export const CHIP_NUMBER: Partial<Record<PartKind, string>> = {
  and: '74HC08',
  or: '74HC32',
  not: '74HC04',
  nand: '74HC00',
  nor: '74HC02',
  xor: '74HC86',
  dff: '74HC74',
};

const AND = 'M-26 -24H0a24 24 0 0 1 0 48H-26Z';
const OR = 'M-28 -24Q2 -24 26 0Q2 24 -28 24Q-16 0 -28 -24Z';
const NOT = 'M-22 -20L18 0L-22 20Z';

/** The gate's outline, and where its output lead starts (after any bubble). */
function gateShape(kind: PartKind): { d: string; bubble: number | null; inX: number } {
  switch (kind) {
    case 'and':
      return { d: AND, bubble: null, inX: -26 };
    case 'nand':
      return { d: AND, bubble: 28, inX: -26 };
    case 'or':
      return { d: OR, bubble: null, inX: -22 };
    case 'nor':
      return { d: OR, bubble: 30, inX: -22 };
    case 'xor':
      return { d: `${OR}M-35 -24Q-23 0 -35 24`, bubble: null, inX: -29 };
    default:
      return { d: NOT, bubble: 22, inX: -22 };
  }
}

function PowerLeads({ cls, top = -24, bottom = 24, real = false }: { cls: string; top?: number; bottom?: number; real?: boolean }) {
  return (
    <>
      <path className={cls} d={`M0 -60V${top}M0 ${bottom}V60`} />
      <text className={`chip-pin${real ? ' real' : ''}`} x="4" y="-46" textAnchor="start">5V</text>
      <text className={`chip-pin${real ? ' real' : ''}`} x="4" y="52" textAnchor="start">GND</text>
    </>
  );
}

export function GateSymbol({ kind }: { kind: PartKind }) {
  const { d, bubble, inX } = gateShape(kind);
  const outX = bubble !== null ? bubble + 4 : kind === 'not' ? 18 : 24;
  const ins = kind === 'not' ? [0] : [-20, 20];
  return (
    <>
      <path className="sym" d={ins.map((y) => `M-60 ${y}H${inX}`).join('') + `M${outX} 0H60`} />
      <path className="sym" d={d} />
      {bubble !== null && <circle className="sym" cx={bubble} cy="0" r="4" />}
      <PowerLeads cls="sym" top={kind === 'not' ? -10 : -24} bottom={kind === 'not' ? 10 : 24} />
    </>
  );
}

/** A small black chip, printed with what it does and its part number. */
export function LogicChip({ kind }: { kind: PartKind }) {
  const ins = kind === 'not' ? [0] : [-20, 20];
  const outs = kind === 'dff' ? [-20, 20] : [0];
  return (
    <>
      <path className="lead" d={ins.map((y) => `M-60 ${y}H-34`).join('') + outs.map((y) => `M34 ${y}H60`).join('') + 'M0 -60V-34M0 34V60'} />
      <rect x="-34" y="-34" width="68" height="68" rx="4" fill="#1f2228" stroke="#0e1013" />
      <circle cx="-24" cy="-24" r="3" fill="#2f333b" />
      <text className="chip-name real" y="0">{kind === 'dff' ? 'D FF' : kind.toUpperCase()}</text>
      <text className="chip-pin real" y="14" textAnchor="middle">{CHIP_NUMBER[kind]}</text>
      {kind === 'dff' && <FlipFlopLabels real />}
    </>
  );
}

function FlipFlopLabels({ real = false }: { real?: boolean }) {
  const c = `chip-pin${real ? ' real' : ''}`;
  const e = real ? 30 : 36;
  return (
    <>
      <text className={c} x={-e} y="-17" textAnchor="start">D</text>
      <text className={c} x={e} y="-17" textAnchor="end">Q</text>
      <text className={c} x={e} y="23" textAnchor="end">Q̄</text>
      {!real && <path className="sym" d="M-40 13L-32 20L-40 27" />}
      {real && <text className={c} x={-e} y="23" textAnchor="start">CLK</text>}
    </>
  );
}

export function FlipFlopSymbol() {
  return (
    <>
      <path className="sym" d="M-60 -20H-40M-60 20H-40M40 -20H60M40 20H60M0 -60V-40M0 40V60" />
      <rect className="sym" x="-40" y="-40" width="80" height="80" rx="3" />
      <FlipFlopLabels />
      <text className="chip-pin" x="4" y="-46" textAnchor="start">5V</text>
      <text className="chip-pin" x="4" y="52" textAnchor="start">GND</text>
    </>
  );
}

/** Each segment's shape (a–g, then the dot), in the display's local coordinates. */
export const SEG_SHAPES: { x: number; y: number; w: number; h: number; dot?: boolean }[] = [
  { x: -14, y: -41, w: 28, h: 6 }, // a
  { x: 15, y: -36, w: 6, h: 32 }, // b
  { x: 15, y: 4, w: 6, h: 32 }, // c
  { x: -14, y: 35, w: 28, h: 6 }, // d
  { x: -21, y: 4, w: 6, h: 32 }, // e
  { x: -21, y: -36, w: 6, h: 32 }, // f
  { x: -14, y: -3, w: 28, h: 6 }, // g
  { x: 27, y: 35, w: 7, h: 7, dot: true }, // dp
];

const SEG_LEADS = 'M-40 -80V-60M-20 -80V-60M0 -80V-60M20 -80V-60M40 -80V-60M-40 80V60M-20 80V60M0 80V60M20 80V60M40 80V60';
const TOP = ['g', 'f', '−', 'a', 'b'];
const BOTTOM = ['e', 'd', '−', 'c', 'dp'];

function SegLabels({ real }: { real: boolean }) {
  const c = `chip-pin${real ? ' real' : ''}`;
  return (
    <>
      {TOP.map((t, k) => (
        <text key={`t${k}`} className={c} x={-40 + 20 * k} y="-52" textAnchor="middle">{t}</text>
      ))}
      {BOTTOM.map((t, k) => (
        <text key={`b${k}`} className={c} x={-40 + 20 * k} y="58" textAnchor="middle">{t}</text>
      ))}
    </>
  );
}

export function Segments({ fill, stroke }: { fill: string; stroke?: string }) {
  return (
    <g transform="skewX(-6)">
      {SEG_SHAPES.map((s, k) =>
        s.dot ? (
          <circle key={k} cx={s.x + s.w / 2} cy={s.y + s.h / 2} r={s.w / 2} fill={fill} stroke={stroke} />
        ) : (
          <rect key={k} x={s.x} y={s.y} width={s.w} height={s.h} rx="3" fill={fill} stroke={stroke} />
        ),
      )}
    </g>
  );
}

export function SevenSegSymbol() {
  return (
    <>
      <path className="sym" d={SEG_LEADS} />
      <rect className="sym" x="-50" y="-60" width="100" height="120" rx="3" />
      <g className="sym-segs">
        <Segments fill="none" stroke="currentColor" />
      </g>
      <SegLabels real={false} />
    </>
  );
}

export function SevenSegReal() {
  return (
    <>
      <path className="lead" d={SEG_LEADS} />
      <rect x="-50" y="-60" width="100" height="120" rx="3" fill="#202226" stroke="#0e1013" />
      <Segments fill="#3a2a2a" />
      <SegLabels real />
    </>
  );
}
