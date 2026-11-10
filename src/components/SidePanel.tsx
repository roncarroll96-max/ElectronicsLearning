import { pinKey, analyzeNets, type Circuit } from '../model/circuit';
import { PART_DEFS, formatReading, formatValue } from '../model/parts';
import type { SimResult } from '../sim/simulate';
import type { EditFn } from '../state/useCircuit';
import { PartIcon } from './PartIcon';
import { PartControls, PartHealth, PartReadings, WireReading } from './Readings';
import type { Mode } from './TopBar';

const TRACKS = [
  { name: 'Foundations', desc: 'Voltage, current, resistance, Ohm’s law', lessons: 10 },
  { name: 'Components in Depth', desc: 'Capacitors, diodes, transistors, sensors', lessons: 10 },
  { name: 'Sound & Timing', desc: 'Oscillators, the 555 timer, sound', lessons: 10, later: true },
  { name: 'Digital & Arduino', desc: 'Logic gates, then real Arduino code', lessons: 10, later: true },
];

interface Props {
  mode: Mode;
  circuit: Circuit;
  selection: string[];
  sim: SimResult;
  edit: EditFn;
  pressed: ReadonlySet<string>;
  onPress: (id: string, down: boolean) => void;
  supply: number;
  onReplace: (id: string) => void;
  onRotate: () => void;
  onDelete: () => void;
}

/** Right-hand panel: lesson tracks in Learn mode, part inspector in Sandbox mode. */
export function SidePanel({ mode, ...inspector }: Props) {
  return (
    <aside className="panel" aria-label={mode === 'learn' ? 'Lessons' : 'Inspector'}>
      {mode === 'learn' ? (
        <>
          <div className="panel-head">
            <span className="panel-title">Tracks</span>
          </div>
          <div className="panel-body">
            <ul className="track-list">
              {TRACKS.map((t, i) => (
                <li key={t.name} className={`track${t.later ? ' later' : ''}`}>
                  <span className="track-num">{i + 1}</span>
                  <div className="track-text">
                    <span className="track-name">{t.name}</span>
                    <span className="track-desc">{t.desc}</span>
                    <div className="progress" aria-label="0% complete">
                      <span style={{ width: '0%' }} />
                    </div>
                  </div>
                  <span className="track-count">{t.later ? 'Soon' : `0/${t.lessons}`}</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : (
        <>
          <div className="panel-head">
            <span className="panel-title">Inspector</span>
          </div>
          <div className="panel-body">
            <Inspector {...inspector} />
            <div className="callout">
              <span className="callout-label">Why this value?</span>
              <p>
                Every part will explain the goal, the reasoning, and the choice. Plain English
                first, with the math one click away.
              </p>
            </div>
          </div>
        </>
      )}
    </aside>
  );
}

function Inspector({ circuit, selection, sim, edit, pressed, onPress, supply, onReplace, onRotate, onDelete }: Omit<Props, 'mode'>) {
  if (selection.length === 0) {
    return (
      <div className="inspector-empty">
        <p>Select a part to see its value, ratings, and why it’s there.</p>
      </div>
    );
  }

  if (selection.length > 1) {
    return (
      <div className="inspector">
        <div className="insp-head">
          <span className="insp-title">{selection.length} items selected</span>
        </div>
        <InspectorActions onRotate={onRotate} onDelete={onDelete} />
      </div>
    );
  }

  const id = selection[0];
  const wire = circuit.wires.find((w) => w.id === id);
  if (wire) {
    const name = (ref: { part: string; pin: number }) => {
      const p = circuit.parts.find((x) => x.id === ref.part);
      return p ? `${p.ref} · ${PART_DEFS[p.kind].pins[ref.pin].name}` : '?';
    };
    return (
      <div className="inspector">
        <div className="insp-head">
          <span className="insp-title">Wire</span>
        </div>
        <dl className="insp-props">
          <dt>From</dt>
          <dd>{name(wire.a)}</dd>
          <dt>To</dt>
          <dd>{name(wire.b)}</dd>
        </dl>
        <WireReading wire={wire} sim={sim} from={name(wire.a)} to={name(wire.b)} />
        <InspectorActions onDelete={onDelete} />
      </div>
    );
  }

  const part = circuit.parts.find((p) => p.id === id);
  if (!part) return null;
  const def = PART_DEFS[part.kind];
  const { wireCount } = analyzeNets(circuit);
  const live = sim.ok && !sim.idle ? sim.parts.get(part.id) : undefined;

  return (
    <div className="inspector">
      <div className="insp-head">
        <span className="insp-icon">
          <PartIcon kind={part.kind} />
        </span>
        <div>
          <span className="insp-title">{def.name}</span>
          <span className="insp-ref">{part.ref}</span>
        </div>
      </div>
      <dl className="insp-props">
        {part.value !== undefined && def.unit && (
          <>
            <dt>Value</dt>
            <dd className="mono">{formatValue(part.value, def.unit)}</dd>
          </>
        )}
        <dt>Rotation</dt>
        <dd className="mono">{part.rot}°</dd>
      </dl>
      <PartHealth part={part} sim={sim} supply={supply} onReplace={() => onReplace(part.id)} />
      <PartControls part={part} edit={edit} pressed={pressed.has(part.id)} onPress={onPress} />
      <PartReadings part={part} sim={sim} circuit={circuit} />
      <div className="insp-section">Pins</div>
      <ul className="insp-pins">
        {def.pins.map((pin, i) => {
          const n = wireCount.get(pinKey({ part: part.id, pin: i })) ?? 0;
          const volts = live && n > 0 ? live.v[i] : null;
          return (
            <li key={i}>
              <span>{pin.name}</span>
              <span className="pin-status">
                <span className={n ? 'pin-ok' : 'pin-open'}>{n === 0 ? 'not connected' : n === 1 ? '1 wire' : `${n} wires`}</span>
                {volts !== null && <span className="pin-v mono">{formatReading(volts, 'V')}</span>}
              </span>
            </li>
          );
        })}
      </ul>
      <InspectorActions onRotate={onRotate} onDelete={onDelete} />
    </div>
  );
}

function InspectorActions({ onRotate, onDelete }: { onRotate?: () => void; onDelete: () => void }) {
  return (
    <div className="insp-actions">
      {onRotate && (
        <button className="btn" onClick={onRotate}>
          Rotate <kbd>R</kbd>
        </button>
      )}
      <button className="btn danger" onClick={onDelete}>
        Delete <kbd>Del</kbd>
      </button>
    </div>
  );
}
