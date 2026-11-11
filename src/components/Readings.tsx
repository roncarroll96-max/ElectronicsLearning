import { useRef, type ReactNode } from 'react';
import { updatePart, type Circuit, type Part, type Wire } from '../model/circuit';
import { AC_DEFAULT_F, AC_MAX_F, AC_MIN_F, P555, PART_DEFS, SEG, UNO, logicPins, WAVES, formatFreq, formatReading, formatValue, type Wave } from '../model/parts';
import { explainBurn, explainHot } from '../sim/explain';
import { ldrResistance } from '../sim/models';
import { stressOf } from '../sim/ratings';
import type { SimResult } from '../sim/simulate';
import type { EditFn } from '../state/useCircuit';

/* ---------- Live readings from the simulator ---------- */

type Row = [label: string, value: string];

function rowsFor(part: Part, sim: SimResult): { rows: Row[]; note?: string } | null {
  const r = sim.parts.get(part.id);
  if (!r) return null;
  const def = PART_DEFS[part.kind];
  const { v, i } = r;

  switch (part.kind) {
    case 'ground':
      return null;
    case 'battery':
      return {
        rows: [
          ['Voltage at terminals', formatReading(v[0] - v[1], 'V')],
          ['Current supplied', formatReading(-i[0], 'A')],
          ['Power supplied', formatReading(-r.power, 'W')],
        ],
      };
    case 'npn': {
      const ib = i[0];
      const ic = i[1];
      const rows: Row[] = [
        ['Base current (Ib)', formatReading(ib, 'A')],
        ['Collector current (Ic)', formatReading(ic, 'A')],
      ];
      if (ib > 1e-9 && ic > 1e-9) rows.push(['Ic ÷ Ib', `${(ic / ib).toPrecision(3)}×`]);
      rows.push(
        ['Base–emitter voltage', formatReading(v[0] - v[2], 'V')],
        ['Collector–emitter voltage', formatReading(v[1] - v[2], 'V')],
        ['Power', formatReading(r.power, 'W')],
      );
      return { rows };
    }
    case 'capacitor': {
      const volts = v[0] - v[1];
      const amps = i[0];
      const c = part.value ?? 0;
      const moving = Math.abs(amps) >= 1e-9;
      // Charging when current flows in at the side that is already higher (it's being pushed further apart).
      const charging = moving && Math.sign(amps) === Math.sign(volts || amps);
      return {
        rows: [
          ['Voltage across', formatReading(volts, 'V')],
          [charging ? 'Charging current' : moving ? 'Discharging current' : 'Current', formatReading(Math.abs(amps), 'A')],
          ['Energy stored', formatReading(0.5 * c * volts * volts, 'W').replace('W', 'J')],
        ],
        note: !moving
          ? Math.abs(volts) > 0.01
            ? 'Charged and settled: no current flows through it now.'
            : 'Empty, and nothing is charging it.'
          : charging
            ? 'Charging: its voltage is rising, and the current shrinks as it fills.'
            : 'Discharging: it is giving its stored charge back to the circuit.',
      };
    }
    case 'acsource':
      return {
        rows: [
          ['Voltage now', formatReading(v[0] - v[1], 'V')],
          ['Current now', formatReading(-i[0], 'A')],
          ['Swing', `±${formatValue(part.value ?? 5, 'V')} at ${formatFreq(part.freq ?? AC_DEFAULT_F)}`],
        ],
        note: 'The voltage keeps changing: probe it with the oscilloscope to see the wave.',
      };
    case 'inductor': {
      const amps = i[0];
      const l = part.value ?? 0;
      return {
        rows: [
          ['Current', formatReading(Math.abs(amps), 'A')],
          ['Voltage across', formatReading(v[0] - v[1], 'V')],
          ['Energy stored', formatReading(0.5 * l * amps * amps, 'W').replace('W', 'J')],
        ],
        note: 'A coil resists any change in its current: it builds up gradually, and fights to keep flowing when cut off.',
      };
    }
    case 'transformer':
      return {
        rows: [
          ['Primary voltage', formatReading(v[0] - v[1], 'V')],
          ['Secondary voltage', formatReading(v[2] - v[3], 'V')],
          ['Primary current', formatReading(Math.abs(i[0]), 'A')],
          ['Secondary current', formatReading(Math.abs(i[2]), 'A')],
        ],
        note: 'These are the values at this instant; with AC they swing back and forth. Steady DC passes no voltage to the secondary.',
      };
    case 'bridge':
      return {
        rows: [
          ['AC in (between ~ pins)', formatReading(v[0] - v[1], 'V')],
          ['DC out (+ to −)', formatReading(v[2] - v[3], 'V')],
          ['DC current out', formatReading(Math.max(0, -i[2]), 'A')],
          ['Power lost in diodes', formatReading(r.power, 'W')],
        ],
      };
    case 'arduino': {
      const g = v[UNO.gnd];
      const busiest = Math.max(...i.slice(0, UNO.io).map(Math.abs));
      return {
        rows: [
          ['5V pin', formatReading(v[UNO.v5] - g, 'V')],
          ['3.3V pin', formatReading(v[UNO.v33] - g, 'V')],
          ['Power from USB', formatReading(Math.max(0, -r.power), 'W')],
          ['Busiest pin’s current', formatReading(busiest, 'A')],
        ],
        note: busiest > 0.02 ? 'A pin is supplying more than the 20 mA it’s rated for: add or raise its resistor.' : undefined,
      };
    }
    case 'and':
    case 'or':
    case 'not':
    case 'nand':
    case 'nor':
    case 'xor':
    case 'dff': {
      const lp = logicPins(part.kind);
      const g = v[lp.gnd];
      const names = PART_DEFS[part.kind].pins;
      const level = (pin: number) => {
        const x = v[pin] - g;
        return `${x > 2.75 ? 'HIGH' : x < 2.25 ? 'LOW' : 'in between'} · ${formatReading(x, 'V')}`;
      };
      const busiest = Math.max(...lp.outputs.map((o) => Math.abs(i[o])));
      return {
        rows: [
          ...lp.inputs.map((p): [string, string] => [names[p].name, level(p)]),
          ...lp.outputs.map((p): [string, string] => [names[p].name, level(p)]),
          ['Output current', formatReading(busiest, 'A')],
        ],
        note: busiest > 0.02 ? 'An output is supplying more than 20 mA (25 mA is its absolute maximum): add or raise its resistor.' : undefined,
      };
    }
    case 'sevenseg': {
      const lit = 'abcdefg'.split('').concat('dp').filter((_, k) => i[k] > 1e-4);
      const most = Math.max(...i.slice(0, SEG.count));
      return {
        rows: [
          ['Segments lit', lit.length ? lit.join(' ') : 'none'],
          ['Brightest segment’s current', formatReading(Math.max(0, most), 'A')],
          ['Total current', formatReading(Math.max(0, -(i[SEG.com] + i[SEG.com2])), 'A')],
        ],
        note: most > 0.02 ? 'A segment is carrying more than its 20 mA: each segment needs its own resistor.' : undefined,
      };
    }
    case 'timer555': {
      const g = v[P555.gnd];
      const vcc = v[P555.vcc] - g;
      const out = v[P555.out] - g;
      const high = out > vcc / 2 && vcc > 1;
      return {
        rows: [
          ['Output', `${high ? 'High' : 'Low'} · ${formatReading(out, 'V')}`],
          ['Supply (VCC)', formatReading(vcc, 'V')],
          ['Trigger', `${formatReading(v[P555.trig] - g, 'V')} (switches high below ${formatReading((v[P555.ctrl] - g) / 2, 'V')})`],
          ['Threshold', `${formatReading(v[P555.thr] - g, 'V')} (switches low above ${formatReading(v[P555.ctrl] - g, 'V')})`],
          ['Output current', formatReading(Math.abs(i[P555.out]), 'A')],
        ],
        note:
          vcc < 4.5
            ? 'A 555 needs at least 4.5 V between VCC (pin 8) and GND (pin 1).'
            : v[P555.reset] - g < 0.7
              ? 'Reset (pin 4) is held low, so the timer is stopped.'
              : undefined,
      };
    }
    case 'potentiometer':
      return {
        rows: [
          ['Voltage across ends', formatReading(v[0] - v[1], 'V')],
          ['Wiper voltage', formatReading(v[2], 'V')],
          ['Current at End A', formatReading(i[0], 'A')],
          ['Power', formatReading(r.power, 'W')],
        ],
      };
    default: {
      const [a, b] = def.pins.map((p) => p.name);
      const flowing = Math.abs(i[0]) >= 1e-9;
      return {
        rows: [
          ['Voltage across', formatReading(v[0] - v[1], 'V')],
          ['Current', formatReading(Math.abs(i[0]), 'A')],
          ['Power', formatReading(r.power, 'W')],
        ],
        note: flowing ? `Current flows from ${i[0] > 0 ? `${a} to ${b}` : `${b} to ${a}`}.` : undefined,
      };
    }
  }
}

function SimState({ sim }: { sim: SimResult }) {
  if (sim.idle) return <p className="insp-note">Add a battery to bring the circuit to life.</p>;
  return <p className="insp-note warn">The simulator couldn’t settle on an answer for this circuit.</p>;
}

function referenceNote(circuit: Circuit) {
  if (circuit.parts.some((p) => p.kind === 'ground')) return 'Voltages are measured from ground (0 V).';
  if (circuit.parts.some((p) => p.kind === 'battery')) return 'Voltages are measured from the battery’s − terminal (0 V).';
  return 'Voltages are measured from GND (0 V).';
}

export function PartReadings({ part, sim, circuit }: { part: Part; sim: SimResult; circuit: Circuit }) {
  if (part.kind === 'ground') return null;
  if (sim.idle || !sim.ok) return <SimState sim={sim} />;
  const out = rowsFor(part, sim);
  if (!out) return null;
  return (
    <>
      <div className="insp-section">Live readings</div>
      <dl className="insp-props">
        {out.rows.map(([label, value]) => (
          <Pair key={label} label={label}>
            <span className="mono">{value}</span>
          </Pair>
        ))}
      </dl>
      {out.note && <p className="insp-note">{out.note}</p>}
      <p className="insp-note faint">{referenceNote(circuit)}</p>
    </>
  );
}

export function WireReading({ wire, sim, from, to }: { wire: Wire; sim: SimResult; from: string; to: string }) {
  if (sim.idle || !sim.ok) return <SimState sim={sim} />;
  const cur = sim.wires.get(wire.id) ?? 0;
  const flowing = Math.abs(cur) >= 1e-9;
  return (
    <>
      <div className="insp-section">Live readings</div>
      <dl className="insp-props">
        <Pair label="Current">
          <span className="mono">{formatReading(Math.abs(cur), 'A')}</span>
        </Pair>
      </dl>
      {flowing && <p className="insp-note">Current flows from {cur > 0 ? `${from} to ${to}` : `${to} to ${from}`}.</p>}
    </>
  );
}

function Pair({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </>
  );
}

/* ---------- Burned out, or running hot ---------- */

export function PartHealth({ part, sim, supply, onReplace }: { part: Part; sim: SimResult; supply: number; onReplace: () => void }) {
  if (part.burn) {
    const ex = explainBurn(part, part.burn, supply);
    return (
      <div className="insp-alert danger" role="alert">
        <strong>Burned out</strong>
        <p>{ex.why}</p>
        <p>
          <span className="insp-alert-label">How to fix it</span> {ex.fix}
        </p>
        <button className="btn primary" onClick={onReplace}>
          Replace {part.ref}
        </button>
      </div>
    );
  }
  if (!sim.ok || sim.idle) return null;
  const r = sim.parts.get(part.id);
  const s = stressOf(part, r);
  if (!s || s.level === 'ok' || !r) return null;
  return (
    <div className="insp-alert warn" role="status">
      <p>{explainHot(part, s, r)}</p>
    </div>
  );
}

/* ---------- Controls: switches, wiper, light level ---------- */

interface ControlProps {
  part: Part;
  edit: EditFn;
  pressed: boolean;
  onPress: (id: string, down: boolean) => void;
}

export function PartControls({ part, edit, pressed, onPress }: ControlProps) {
  switch (part.kind) {
    case 'switch': {
      const set = (on: boolean) => edit((c) => updatePart(c, part.id, { on }));
      return (
        <div className="insp-control">
          <span className="insp-control-label">Switch · or click it on the canvas</span>
          <div className="segmented insp-seg" role="group" aria-label="Switch position">
            <button className={part.on ? '' : 'on'} aria-pressed={!part.on} onClick={() => set(false)}>
              Open
            </button>
            <button className={part.on ? 'on' : ''} aria-pressed={!!part.on} onClick={() => set(true)}>
              Closed
            </button>
          </div>
        </div>
      );
    }
    case 'pushbutton': {
      const down = () => onPress(part.id, true);
      const up = () => onPress(part.id, false);
      return (
        <div className="insp-control">
        <span className="insp-control-label">Push button · or press and hold it on the canvas</span>
        <button
          className={`btn hold${pressed ? ' pressed' : ''}`}
          aria-pressed={pressed}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            down();
          }}
          onPointerUp={up}
          onLostPointerCapture={up}
          onKeyDown={(e) => {
            if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
              e.preventDefault();
              down();
            }
          }}
          onKeyUp={(e) => {
            if (e.key === ' ' || e.key === 'Enter') up();
          }}
          onBlur={up}
        >
          {pressed ? 'Pressed' : 'Hold to press'}
        </button>
        </div>
      );
    }
    case 'potentiometer':
      return (
        <Slider
          label="Wiper position"
          value={part.pos ?? 0.5}
          format={(v) => `${Math.round(v * 100)}% from End A`}
          onChange={(pos, record) => edit((c) => updatePart(c, part.id, { pos }), record)}
        />
      );
    case 'acsource':
      return <AcControls part={part} edit={edit} />;
    case 'ldr':
      return (
        <Slider
          label="Light level"
          value={part.light ?? 0.5}
          format={(v) => `${Math.round(v * 100)}% · ${formatValue(ldrResistance(v), 'Ω')}`}
          onChange={(light, record) => edit((c) => updatePart(c, part.id, { light }), record)}
        />
      );
    default:
      return null;
  }
}

/** Frequencies are picked on a log scale: the slider's 0–1 covers 1 Hz to 20 kHz evenly by decades. */
const LOG_SPAN = Math.log(AC_MAX_F / AC_MIN_F);
const freqAt = (pos: number) => parseFloat((AC_MIN_F * Math.exp(pos * LOG_SPAN)).toPrecision(2));
const posOf = (f: number) => Math.log(f / AC_MIN_F) / LOG_SPAN;
const WAVE_NAMES: Record<Wave, string> = { sine: 'Sine', square: 'Square', triangle: 'Triangle' };
const FREQ_PICKS = [1, 50, 440, 1000];

function AcControls({ part, edit }: { part: Part; edit: EditFn }) {
  const f = part.freq ?? AC_DEFAULT_F;
  const wave = part.wave ?? 'sine';
  const setFreq = (freq: number, record = true) => edit((c) => updatePart(c, part.id, { freq }), record);
  return (
    <>
      <Slider label="Frequency" value={posOf(f)} format={() => formatFreq(f)} onChange={(p, record) => setFreq(freqAt(p), record)} />
      <div className="chips" role="group" aria-label="Frequency presets">
        {FREQ_PICKS.map((o) => (
          <button key={o} className={`chip${o === f ? ' on' : ''}`} aria-pressed={o === f} onClick={() => setFreq(o)}>
            {formatFreq(o)}
          </button>
        ))}
      </div>
      <div className="insp-control">
        <span className="insp-control-label">Wave shape</span>
        <div className="segmented insp-seg" role="group" aria-label="Wave shape">
          {WAVES.map((w) => (
            <button key={w} className={w === wave ? 'on' : ''} aria-pressed={w === wave} onClick={() => edit((c) => updatePart(c, part.id, { wave: w }))}>
              {WAVE_NAMES[w]}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

/** A 0–1 slider where one drag is one undo step. */
function Slider({
  label,
  value,
  format,
  onChange,
}: {
  label: string;
  value: number;
  format: (v: number) => string;
  onChange: (v: number, record: boolean) => void;
}) {
  const fresh = useRef(true);
  return (
    <label className="insp-slider">
      <span className="insp-slider-head">
        <span>{label}</span>
        <span className="mono">{format(value)}</span>
      </span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onPointerDown={() => {
          fresh.current = true;
        }}
        onKeyDown={() => {
          fresh.current = true;
        }}
        onChange={(e) => {
          onChange(Number(e.target.value), fresh.current);
          fresh.current = false;
        }}
      />
    </label>
  );
}
