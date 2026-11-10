import { useRef, type ReactNode } from 'react';
import { updatePart, type Circuit, type Part, type Wire } from '../model/circuit';
import { PART_DEFS, formatReading, formatValue } from '../model/parts';
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
  return circuit.parts.some((p) => p.kind === 'ground')
    ? 'Voltages are measured from ground (0 V).'
    : 'Voltages are measured from the battery’s − terminal (0 V).';
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
