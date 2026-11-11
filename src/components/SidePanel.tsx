import { flipPart, pinKey, analyzeNets, type Circuit } from '../model/circuit';
import type { Lesson } from '../learn/lessons';
import { LessonPanel, TrackList } from './LessonPanel';
import { PART_DEFS, formatReading } from '../model/parts';
import type { SimResult } from '../sim/simulate';
import type { EditFn } from '../state/useCircuit';
import { PartIcon } from './PartIcon';
import { PartControls, PartHealth, PartReadings, WireReading } from './Readings';
import { ValueEditor } from './ValueEditor';
import { ArduinoPanel } from './ArduinoPanel';
import type { Arduinos } from '../state/useArduinos';
import { WhyPanel } from './WhyPanel';
import type { Mode } from './TopBar';

export interface LessonProps {
  lesson?: Lesson;
  done: readonly string[];
  completed: ReadonlySet<string>;
  next?: Lesson;
  /** The lesson worked on most recently, offered as "Continue" on the track list. */
  continueLesson?: Lesson;
  progress: Record<string, string[]>;
  onOpen: (id: string) => void;
  onBack: () => void;
  onRestart: () => void;
  onNext: () => void;
}

interface Props extends InspectorProps {
  mode: Mode;
  learn: LessonProps;
}

interface InspectorProps {
  circuit: Circuit;
  selection: string[];
  sim: SimResult;
  /** Heat-averaged readings, for ratings. */
  stress: SimResult;
  edit: EditFn;
  pressed: ReadonlySet<string>;
  onPress: (id: string, down: boolean) => void;
  supply: number;
  onReplace: (id: string) => void;
  onRotate: () => void;
  onDelete: () => void;
  /** The circuit's Arduinos (programs, serial output). */
  arduinos?: Arduinos;
}

/** Right-hand panel: tracks and lessons in Learn mode, the part inspector in Sandbox mode. */
export function SidePanel({ mode, learn, ...inspector }: Props) {
  if (mode === 'learn' && !learn.lesson) {
    return (
      <aside className="panel" aria-label="Lessons">
        <div className="panel-head">
          <span className="panel-title">Lessons</span>
        </div>
        <div className="panel-body">
          <TrackList completed={learn.completed} onOpen={learn.onOpen} continueLesson={learn.continueLesson} progress={learn.progress} />
        </div>
      </aside>
    );
  }
  if (mode === 'learn' && learn.lesson) {
    const hasSelection = inspector.selection.length > 0;
    return (
      <aside className="panel" aria-label="Lesson">
        <div className="panel-body">
          <LessonPanel
            lesson={learn.lesson}
            done={learn.done}
            onBack={learn.onBack}
            onRestart={learn.onRestart}
            next={learn.next}
            onNext={learn.onNext}
          />
          {hasSelection && (
            <div className="lesson-selected">
              <div className="panel-title">Selected part</div>
              <Inspector {...inspector} />
              <WhyPanel circuit={inspector.circuit} sim={inspector.sim} selection={inspector.selection} lesson={learn.lesson} />
            </div>
          )}
        </div>
      </aside>
    );
  }
  return (
    <aside className="panel" aria-label="Inspector">
      <div className="panel-head">
        <span className="panel-title">Inspector</span>
      </div>
      <div className="panel-body">
        <Inspector {...inspector} />
        <WhyPanel circuit={inspector.circuit} sim={inspector.sim} selection={inspector.selection} />
      </div>
    </aside>
  );
}

function Inspector({ circuit, selection, sim, stress, edit, pressed, onPress, supply, onReplace, onRotate, onDelete, arduinos }: InspectorProps) {
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
        <dt>Rotation</dt>
        <dd className="mono">{part.rot}°</dd>
      </dl>
      <ValueEditor part={part} edit={edit} />
      <PartHealth part={part} sim={stress} supply={supply} onReplace={() => onReplace(part.id)} />
      <PartControls part={part} edit={edit} pressed={pressed.has(part.id)} onPress={onPress} />
      {part.kind === 'arduino' && <ArduinoPanel part={part} edit={edit} arduinos={arduinos} />}
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
      <InspectorActions
        onRotate={onRotate}
        onDelete={onDelete}
        onFlip={POLARIZED.includes(part.kind) ? () => edit((c) => flipPart(c, part.id)) : undefined}
      />
    </div>
  );
}

/** Two-pin parts with a + and − that can be turned around. */
const POLARIZED = ['led', 'diode', 'buzzer', 'capacitor', 'battery', 'acsource'];

function InspectorActions({ onRotate, onDelete, onFlip }: { onRotate?: () => void; onDelete: () => void; onFlip?: () => void }) {
  return (
    <div className="insp-actions">
      {onRotate && (
        <button className="btn" onClick={onRotate}>
          Rotate <kbd>R</kbd>
        </button>
      )}
      {onFlip && (
        <button className="btn" onClick={onFlip} title="Swap its + and − ends">
          Turn around
        </button>
      )}
      <button className="btn danger" onClick={onDelete}>
        Delete <kbd>Del</kbd>
      </button>
    </div>
  );
}
