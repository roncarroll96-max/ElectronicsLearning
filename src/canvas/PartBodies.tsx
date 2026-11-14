/**
 * How each part looks, in local coordinates (horizontal, pins at x = ±40).
 * Schematic: standard circuit symbols. Realistic: what the physical part looks like.
 */
import type { Part } from '../model/circuit';
import { ledLook, resistorBands, type Wave } from '../model/parts';
import { FlipFlopSymbol, GateSymbol, LogicChip, SevenSegReal, SevenSegSymbol } from './LogicBodies';

const ZIGZAG = 'M-40 0H-18l3-8 6 16 6-16 6 16 6-16 6 16 3-8H40';
/** Four turns of wire, pins at ±40. */
const COIL = 'M-40 0H-24a6 6 0 0 1 12 0a6 6 0 0 1 12 0a6 6 0 0 1 12 0a6 6 0 0 1 12 0H40';
/** One cycle of each AC wave shape, drawn inside an 18-unit-wide window. */
const WAVE_PATH: Record<Wave, string> = {
  sine: 'M-9 0c1.5-5 3-7 4.5-7s3 2 4.5 7s3 7 4.5 7s3-2 4.5-7',
  square: 'M-9 0V-6H0V6H9V0',
  triangle: 'M-9 0L-4.5 -7L4.5 7L9 0',
};
/** The bridge's four diodes: where each sits on the diamond, and which way it points (toward +, away from −). */
const BRIDGE_DIODES: [number, number, number][] = [
  [-11, -11, -45],
  [11, -11, -135],
  [-11, 11, -135],
  [11, 11, -45],
];

/** The 555's pin names, just inside its box. */
function ChipPins({ real = false }: { real?: boolean }) {
  const c = `chip-pin${real ? ' real' : ''}`;
  const e = real ? 32 : 36;
  return (
    <>
      <text className={c} x={-e} y="-17" textAnchor="start">DIS</text>
      <text className={c} x={-e} y="3" textAnchor="start">THR</text>
      <text className={c} x={-e} y="23" textAnchor="start">TRIG</text>
      <text className={c} x={e} y="3" textAnchor="end">OUT</text>
      <text className={c} x="-20" y={-e + 9} textAnchor="middle">VCC</text>
      <text className={c} x="20" y={-e + 9} textAnchor="middle">RST</text>
      <text className={c} x="-20" y={e - 3} textAnchor="middle">GND</text>
      <text className={c} x="20" y={e - 3} textAnchor="middle">CV</text>
    </>
  );
}

/** The Uno's pin labels, printed on the board beside each header pin (x = the pin's x). */
const UNO_TOP: [number, string][] = [
  [-160, 'GND'], [-140, '13'], [-120, '12'], [-100, '~11'], [-80, '~10'], [-60, '~9'], [-40, '8'],
  [0, '7'], [20, '~6'], [40, '~5'], [60, '4'], [80, '~3'], [100, '2'], [120, 'TX1'], [140, 'RX0'],
];
const UNO_BOTTOM: [number, string][] = [
  [-140, '3.3V'], [-120, '5V'], [-100, 'GND'], [20, 'A0'], [40, 'A1'], [60, 'A2'], [80, 'A3'], [100, 'A4'], [120, 'A5'],
];

function UnoLabels({ real }: { real: boolean }) {
  const c = `uno-pin${real ? ' real' : ''}`;
  return (
    <>
      {UNO_TOP.map(([x, t]) => (
        <text key={`t${x}`} className={c} transform={`translate(${x} -70) rotate(-90)`} textAnchor="end" dy="2.5">
          {t}
        </text>
      ))}
      {UNO_BOTTOM.map(([x, t]) => (
        <text key={`b${x}`} className={c} transform={`translate(${x} 70) rotate(-90)`} textAnchor="start" dy="2.5">
          {t}
        </text>
      ))}
    </>
  );
}

const UNO_LEADS =
  'M-160 -100V-80M-140 -100V-80M-120 -100V-80M-100 -100V-80M-80 -100V-80M-60 -100V-80M-40 -100V-80' +
  'M0 -100V-80M20 -100V-80M40 -100V-80M60 -100V-80M80 -100V-80M100 -100V-80M120 -100V-80M140 -100V-80' +
  'M-140 80V100M-120 80V100M-100 80V100M20 80V100M40 80V100M60 80V100M80 80V100M100 80V100M120 80V100';

export function SchematicBody({ part }: { part: Part }) {
  switch (part.kind) {
    case 'resistor':
      return <path className="sym" d={ZIGZAG} />;
    case 'potentiometer':
      return (
        <>
          <path className="sym" d={ZIGZAG} />
          <path className="sym" d="M0 -40V-12M-4 -18l4 6 4-6" />
        </>
      );
    case 'ldr':
      return (
        <>
          <path className="sym" d={ZIGZAG} />
          <path className="sym thin" d="M-16 -26l8 8M-8 -18h-5M-8 -18v-5M-4 -26l8 8M4 -18h-5M4 -18v-5" />
        </>
      );
    case 'capacitor':
      return (
        <>
          <path className="sym" d="M-40 0H-5M5 0H40M-5 -14V14M5 -14V14" />
        </>
      );
    case 'diode':
      return (
        <>
          <path className="sym" d="M-40 0H-10M10 0H40M10 -10V10" />
          <path className="sym fill" d="M-10 -10L10 0L-10 10Z" />
        </>
      );
    case 'led':
      return (
        <>
          <path className="sym" d="M-40 0H-10M10 0H40M10 -10V10" />
          <path className="sym fill" d="M-10 -10L10 0L-10 10Z" />
          <path className="sym thin" d="M0 -12l7-8M7 -20h-5M7 -20v5M8 -8l7-8M15 -16h-5M15 -16v5" style={part.color && part.color !== 'red' ? { stroke: ledLook(part.color).edge } : undefined} />
        </>
      );
    case 'lamp':
      return (
        <>
          <path className="sym" d="M-40 0H-14M14 0H40" />
          <circle className="sym" r="14" />
          <path className="sym" d="M-10 -10L10 10M10 -10L-10 10" />
        </>
      );
    case 'buzzer':
      return (
        <>
          <path className="sym" d="M-40 0H-12M12 0H40" />
          <rect className="sym" x="-12" y="-12" width="24" height="24" rx="2" />
          <path className="sym thin" d="M-5 -5v10l6 4V-9z" />
        </>
      );
    case 'speaker':
      return (
        <>
          <path className="sym" d="M-40 0H-12M8 0H40" />
          <rect className="sym" x="-12" y="-7" width="8" height="14" />
          <path className="sym" d="M-4 -7L8 -17V17L-4 7" />
        </>
      );
    case 'switch':
      return (
        <>
          <path className="sym" d={part.on ? 'M-40 0H-16M16 0H40M-14 -1L15 -3' : 'M-40 0H-16M16 0H40M-14 -1L13 -14'} />
          <circle className="sym-dot" cx="-16" r="2.5" />
          <circle className="sym-dot" cx="16" r="2.5" />
        </>
      );
    case 'pushbutton':
      return (
        <>
          <path className="sym" d="M-40 0H-16M16 0H40M-18 -10H18M0 -10V-20M-6 -20H6" />
          <circle className="sym-dot" cx="-16" r="2.5" />
          <circle className="sym-dot" cx="16" r="2.5" />
        </>
      );
    case 'battery':
      return (
        <>
          <path className="sym" d="M-40 0H-6M6 0H40M-6 -16V16" />
          <path className="sym" d="M6 -8V8" strokeWidth={4} />
        </>
      );
    case 'npn':
      return (
        <>
          <circle className="sym" cx="4" cy="0" r="24" />
          <path className="sym" d="M-40 0H-8M-8 -14V14M-8 -6L20 -20V-40M-8 6L20 20V40" />
          <path className="sym fill" d="M20 20l-10-1 5-7z" />
        </>
      );
    case 'acsource':
      return (
        <>
          <path className="sym" d="M-40 0H-16M16 0H40" />
          <circle className="sym" r="16" />
          <path className="sym" d={WAVE_PATH[part.wave ?? 'sine']} />
          <path className="sym thin" d="M-12 -20h5M-9.5 -22.5v5" />
        </>
      );
    case 'inductor':
      return <path className="sym" d={COIL} />;
    case 'transformer':
      return (
        <>
          <path className="sym" d="M-40 -20H-14M-40 20H-14M40 -20H14M40 20H14" />
          <path className="sym" d="M-14 -20a5 5 0 0 1 0 10a5 5 0 0 1 0 10a5 5 0 0 1 0 10a5 5 0 0 1 0 10" />
          <path className="sym" d="M14 -20a5 5 0 0 0 0 10a5 5 0 0 0 0 10a5 5 0 0 0 0 10a5 5 0 0 0 0 10" />
          <path className="sym" d="M-3 -24V24M3 -24V24" />
        </>
      );
    case 'bridge':
      return (
        <>
          <path className="sym" d="M-40 0H-22M22 0H40M0 -40V-22M0 22V40M-22 0L0 -22L22 0L0 22Z" />
          {BRIDGE_DIODES.map(([x, y, a]) => (
            <g key={`${x},${y}`} transform={`translate(${x} ${y}) rotate(${a})`}>
              <path className="sym fill" d="M-4 -4.5L4 0L-4 4.5Z" />
              <path className="sym" d="M4 -4.5V4.5" />
            </g>
          ))}
        </>
      );
    case 'timer555':
      return (
        <>
          <path className="sym" d="M-60 -20H-40M-60 0H-40M-60 20H-40M40 0H60M-20 -60V-40M20 -60V-40M-20 40V60M20 40V60" />
          <rect className="sym" x="-40" y="-40" width="80" height="80" rx="3" />
          <text className="chip-name" y="5">555</text>
          <ChipPins />
        </>
      );
    case 'arduino':
      return (
        <>
          <path className="sym" d={UNO_LEADS} />
          <rect className="sym" x="-180" y="-80" width="360" height="160" rx="4" />
          <text className="chip-name" y="2">Arduino Uno</text>
          <text className="uno-sub" y="16">ATmega328P · 16 MHz</text>
          <UnoLabels real={false} />
        </>
      );
    case 'and':
    case 'or':
    case 'not':
    case 'nand':
    case 'nor':
    case 'xor':
      return <GateSymbol kind={part.kind} />;
    case 'dff':
      return <FlipFlopSymbol />;
    case 'sevenseg':
      return <SevenSegSymbol />;
    case 'ground':
      return <path className="sym ground" d="M0 -20V0M-12 0H12M-7 6H7M-2 12H2" />;
  }
}

export function RealisticBody({ part }: { part: Part }) {
  switch (part.kind) {
    case 'resistor': {
      const bands = resistorBands(part.value ?? 0);
      return (
        <>
          <path className="lead" d="M-40 0H-20M20 0H40" />
          <rect x="-21" y="-8" width="42" height="16" rx="7" fill="#d8c398" stroke="#a8915f" />
          <rect x="-13" y="-8" width="4" height="16" fill={bands[0]} />
          <rect x="-6" y="-8" width="4" height="16" fill={bands[1]} />
          <rect x="1" y="-8" width="4" height="16" fill={bands[2]} />
          <rect x="11" y="-8" width="4" height="16" fill={bands[3]} />
          <rect x="-19" y="-6" width="38" height="3" rx="1.5" fill="#fff" opacity="0.25" />
        </>
      );
    }
    case 'potentiometer':
      return (
        <>
          <path className="lead" d="M-40 0H-18M18 0H40M0 -40V-16" />
          <rect x="-18" y="-16" width="36" height="30" rx="4" fill="#2459c9" stroke="#163b8c" />
          <circle cy="-1" r="9" fill="#e7e9ee" stroke="#9aa2b1" />
          <path d="M-5 -6l10 10" stroke="#59606e" strokeWidth="2.4" strokeLinecap="round" />
        </>
      );
    case 'ldr':
      return (
        <>
          <path className="lead" d="M-40 0H-12M12 0H40" />
          <circle r="13" fill="#f1cf8a" stroke="#b48c45" />
          <path
            d="M-7 -6h11a2 2 0 0 1 0 4h-8a2 2 0 0 0 0 4h8a2 2 0 0 1 0 4h-11"
            fill="none"
            stroke="#a4492e"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </>
      );
    case 'capacitor':
      return (
        <>
          <path className="lead" d="M-40 0H-12M12 0H40" />
          <rect x="-13" y="-16" width="26" height="32" rx="5" fill="#1f3c8f" stroke="#132764" />
          <rect x="6" y="-16" width="6" height="32" fill="#9cc2f5" opacity="0.85" />
          <path d="M8 -10v4M8 -2v4M8 6v4" stroke="#1f3c8f" strokeWidth="1.6" />
          <rect x="-11" y="-14" width="4" height="28" rx="2" fill="#fff" opacity="0.15" />
        </>
      );
    case 'diode':
      return (
        <>
          <path className="lead" d="M-40 0H-13M13 0H40" />
          <rect x="-13" y="-6.5" width="26" height="13" rx="2.5" fill="#22252b" stroke="#0e1013" />
          <rect x="6" y="-6.5" width="3.5" height="13" fill="#c8ccd3" />
        </>
      );
    case 'led':
      return (
        <>
          <path className="lead" d="M-40 0H-10M10 0H40" />
          <path d="M-12 8H12" stroke={ledLook(part.color).edge} strokeWidth="3" strokeLinecap="round" />
          <path d="M-11 8V-4a11 11 0 0 1 22 0V8z" fill={ledLook(part.color).body} fillOpacity="0.9" stroke={ledLook(part.color).edge} />
          <ellipse cx="-4" cy="-6" rx="3" ry="5" fill="#fff" opacity="0.35" />
        </>
      );
    case 'lamp':
      return (
        <>
          <path className="lead" d="M-40 0H-14M14 0H40" />
          <circle r="15" className="bulb-glass" />
          <path
            d="M-9 3q2.25-8 4.5 0t4.5 0t4.5 0t4.5 0"
            fill="none"
            stroke="#8a6d3b"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </>
      );
    case 'buzzer':
      return (
        <>
          <path className="lead" d="M-40 0H-16M16 0H40" />
          <circle r="17" fill="#15181d" stroke="#363b45" />
          <circle r="11" fill="none" stroke="#2a2f38" />
          <circle r="3.5" fill="#363b45" />
          <path d="M-12 -12h4M-10 -14v4" stroke="#cfd4dc" strokeWidth="1.4" />
        </>
      );
    case 'speaker':
      return (
        <>
          <path className="lead" d="M-40 0H-19M19 0H40" />
          <circle r="19" fill="#20242b" stroke="#0e1013" />
          <circle r="15.5" fill="#3a404b" />
          <circle r="15.5" fill="none" stroke="#525a67" strokeDasharray="1.5 2.5" />
          <circle r="9" fill="#2c3139" />
          <circle r="5" fill="#59606e" />
          <circle cx="-1.5" cy="-1.5" r="1.8" fill="#fff" opacity="0.2" />
        </>
      );
    case 'switch':
      return (
        <>
          <path className="lead" d="M-40 0H-20M20 0H40" />
          <rect x="-20" y="-10" width="40" height="20" rx="4" fill="#2f343d" stroke="#1b1e24" />
          <rect x="-16" y="-6" width="32" height="12" rx="2" fill="#1b1e24" />
          <rect x={part.on ? 2 : -15} y="-5" width="13" height="10" rx="2" fill="#e3e6eb" />
          {part.on && <rect x="-14" y="-4" width="14" height="8" rx="1.5" fill="#34d399" opacity="0.85" />}
        </>
      );
    case 'pushbutton':
      return (
        <>
          <path className="lead" d="M-40 0H-18M18 0H40" />
          <rect x="-18" y="-16" width="36" height="28" rx="4" fill="#2a2e36" stroke="#16191e" />
          <circle cy="-2" r="10" fill="#e5484d" stroke="#a32a2e" />
          <ellipse cx="-3" cy="-6" rx="4" ry="2.5" fill="#fff" opacity="0.3" />
        </>
      );
    case 'battery':
      return (
        <>
          <path className="lead" d="M-40 0H-30M30 0H40" />
          <rect x="-30" y="-19" width="60" height="38" rx="5" fill="#1d2129" stroke="#0f1115" />
          <rect x="-30" y="-19" width="22" height="38" rx="5" fill="#e0a526" />
          <rect x="-12" y="-19" width="4" height="38" fill="#e0a526" />
          <text x="10" y="5" className="batt-text">
            {`${part.value ?? 9}V`}
          </text>
          <text x="-19" y="5" className="batt-sign">
            +
          </text>
        </>
      );
    case 'npn':
      return (
        <>
          <path className="lead" d="M-40 0H-12M6 -10L20 -22V-40M6 10L20 22V40" />
          <path d="M-12 -16H4A16 16 0 0 1 4 16H-12Z" fill="#23262c" stroke="#0e1013" />
          <text x="-3" y="3" className="npn-text">
            NPN
          </text>
        </>
      );
    case 'acsource':
      return (
        <>
          <path className="lead" d="M-40 0H-20M20 0H40" />
          <rect x="-20" y="-19" width="40" height="38" rx="5" fill="#2b3340" stroke="#151a21" />
          <rect x="-15" y="-14" width="30" height="17" rx="2" fill="#123d2e" />
          <path d={WAVE_PATH[part.wave ?? 'sine']} transform="translate(0 -5.5) scale(1.2 0.8)" fill="none" stroke="#5ff0b0" strokeWidth="1.5" />
          <circle cx="-8" cy="10.5" r="3" fill="#e5484d" />
          <circle cx="8" cy="10.5" r="3" fill="#15181d" stroke="#59606e" />
        </>
      );
    case 'inductor':
      return (
        <>
          <path className="lead" d="M-40 0H-24M24 0H40" />
          <rect x="-24" y="-9" width="48" height="18" rx="9" fill="#3a3f48" />
          {[-18, -12, -6, 0, 6, 12, 18].map((x) => (
            <rect key={x} x={x - 2.6} y="-10" width="5.2" height="20" rx="2.6" fill="#c8813a" stroke="#8a5420" strokeWidth="0.8" />
          ))}
        </>
      );
    case 'transformer':
      return (
        <>
          <path className="lead" d="M-40 -20H-20M-40 20H-20M40 -20H20M40 20H20" />
          <rect x="-24" y="-28" width="48" height="56" rx="3" fill="#5b616b" stroke="#3a3f47" />
          <path d="M-24 -18H24M-24 -8H24M-24 2H24M-24 12H24M-24 22H24" stroke="#4a4f58" strokeWidth="1" />
          <rect x="-18" y="-22" width="14" height="44" rx="3" fill="#c8813a" stroke="#8a5420" />
          <rect x="4" y="-22" width="14" height="44" rx="3" fill="#d39a4a" stroke="#8a5420" />
        </>
      );
    case 'bridge':
      return (
        <>
          <path className="lead" d="M-40 0H-20M20 0H40M0 -40V-20M0 20V40" />
          <rect x="-20" y="-20" width="40" height="40" rx="3" fill="#23262c" stroke="#0e1013" />
          <text className="chip-mark" x="-12" y="3.5">~</text>
          <text className="chip-mark" x="12" y="3.5">~</text>
          <text className="chip-mark" y="-9">+</text>
          <text className="chip-mark" y="15">−</text>
        </>
      );
    case 'timer555':
      return (
        <>
          <path className="lead" d="M-60 -20H-36M-60 0H-36M-60 20H-36M36 0H60M-20 -60V-36M20 -60V-36M-20 36V60M20 36V60" />
          <rect x="-36" y="-36" width="72" height="72" rx="4" fill="#1f2228" stroke="#0e1013" />
          <circle cx="-26" cy="-26" r="3" fill="#2f333b" />
          <text className="chip-name real" y="-2">NE555</text>
          <ChipPins real />
        </>
      );
    case 'and':
    case 'or':
    case 'not':
    case 'nand':
    case 'nor':
    case 'xor':
    case 'dff':
      return <LogicChip kind={part.kind} />;
    case 'sevenseg':
      return <SevenSegReal />;
    case 'arduino':
      return (
        <>
          <path className="lead" d={UNO_LEADS} />
          {/* The board */}
          <rect x="-180" y="-80" width="360" height="160" rx="8" fill="#00818a" stroke="#005b62" strokeWidth="1.5" />
          {[-170, 170].flatMap((x) => [-70, 70].map((y) => <circle key={`${x},${y}`} cx={x} cy={y} r="3.2" fill="#e8ecef" stroke="#005b62" />))}
          {/* USB socket and power jack on the left edge */}
          <rect x="-192" y="-58" width="40" height="34" rx="2" fill="#c9ced6" stroke="#8a919c" />
          <rect x="-186" y="-52" width="28" height="22" rx="1" fill="#aeb4bd" />
          <rect x="-190" y="26" width="34" height="30" rx="3" fill="#1d1f24" stroke="#000" />
          {/* Headers */}
          <rect x="-170" y="-90" width="140" height="12" rx="1.5" fill="#15171b" />
          <rect x="-10" y="-90" width="160" height="12" rx="1.5" fill="#15171b" />
          <rect x="-150" y="78" width="60" height="12" rx="1.5" fill="#15171b" />
          <rect x="10" y="78" width="120" height="12" rx="1.5" fill="#15171b" />
          {/* The chip: an ATmega328P in its 28-pin package */}
          <rect x="10" y="22" width="150" height="34" rx="3" fill="#1f2228" stroke="#0e1013" />
          <circle cx="20" cy="39" r="3" fill="#2f333b" />
          <text className="chip-name real" x="88" y="43">ATMEGA328P</text>
          {/* Reset button, and the L, TX, RX and ON lights */}
          <rect x="-150" y="-62" width="18" height="18" rx="2" fill="#d5d9df" stroke="#8a919c" />
          <circle cx="-141" cy="-53" r="5" fill="#b9332f" />
          <rect x="-108" y="-64" width="8" height="5" rx="1" fill="#e9d79b" />
          <text className="uno-mark" x="-94" y="-59.5" textAnchor="start">L</text>
          <rect x="-108" y="-54" width="8" height="5" rx="1" fill="#e9d79b" />
          <text className="uno-mark" x="-94" y="-49.5" textAnchor="start">TX</text>
          <rect x="-108" y="-44" width="8" height="5" rx="1" fill="#e9d79b" />
          <text className="uno-mark" x="-94" y="-39.5" textAnchor="start">RX</text>
          <rect x="128" y="-64" width="8" height="5" rx="1" fill="#e9d79b" />
          <text className="uno-mark" x="124" y="-59.5" textAnchor="end">ON</text>
          <text className="uno-logo" x="-40" y="2">UNO</text>
          <UnoLabels real />
        </>
      );
    case 'ground':
      return <path className="sym ground" d="M0 -20V0M-12 0H12M-7 6H7M-2 12H2" />;
  }
}
