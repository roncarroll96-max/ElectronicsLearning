import { useEffect, useRef } from 'react';
import { updatePart, type Part } from '../model/circuit';
import { EXAMPLES, exampleFor } from '../arduino/examples';
import { UNO_FLASH_BYTES, UNO_RAM_BYTES } from '../arduino/elf';
import { useCompilerState } from '../arduino/compiler';
import type { Arduinos } from '../state/useArduinos';
import type { EditFn } from '../state/useCircuit';

const pct = (n: number, of: number) => `${Math.round((100 * n) / of)}%`;
const mb = (n: number) => `${(n / 1e6).toFixed(1)} MB`;

/**
 * An Arduino's panel in the inspector: which program it runs (an example, or
 * your own sketch in the code editor), whether it compiled, a reset button,
 * and what it prints over Serial.
 */
export function ArduinoPanel({ part, edit, arduinos, onOpenCode }: { part: Part; edit: EditFn; arduinos?: Arduinos; onOpenCode?: (id: string) => void }) {
  const view = arduinos?.views.get(part.id);
  const compiler = useCompilerState();
  const example = exampleFor(part.sketch);
  const out = useRef<HTMLPreElement>(null);

  // Keep the newest printed line in view.
  useEffect(() => {
    const el = out.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [view?.serial]);

  const status = view?.status;
  return (
    <>
      <div className="insp-section">Program</div>
      <div className="uno-panel">
        <label className="uno-row">
          <span>Example</span>
          <select
            value={example?.id ?? ''}
            onChange={(e) => {
              const ex = EXAMPLES.find((x) => x.id === e.target.value);
              if (ex) edit((c) => updatePart(c, part.id, { sketch: ex.code }));
            }}
          >
            {!example && <option value="">Your own sketch</option>}
            {EXAMPLES.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.name}
              </option>
            ))}
          </select>
        </label>
        {example && <p className="cm-hint">{example.wiring}</p>}
        {onOpenCode && (
          <div className="uno-row">
            <button className="btn primary" onClick={() => onOpenCode(part.id)} title="Write and upload your own code, and use the serial monitor">
              Edit code
            </button>
          </div>
        )}

        {part.burn ? null : compiler.phase === 'downloading' ? (
          <>
            <p className="cm-hint">
              Downloading the Arduino compiler (once only): {mb(compiler.loaded)} of {mb(compiler.total)}
            </p>
            <progress className="about-progress" value={compiler.loaded} max={compiler.total} />
          </>
        ) : !status || status.phase === 'compiling' ? (
          <p className="cm-hint">Compiling…</p>
        ) : status.phase === 'error' ? (
          <div className="uno-errors">
            <p className="cm-msg warn">It didn’t compile, so the board isn’t running anything:</p>
            <ul>
              {status.result.diagnostics.map((d, k) => (
                <li key={k}>
                  {d.line !== undefined && <span className="mono">Line {d.line}: </span>}
                  <span className="mono">{d.message}</span>
                  {d.hint && <div className="cm-hint">{d.hint}</div>}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <>
            <p className="cm-msg ok">
              {view?.running === false
                ? 'Not running: its 5 V supply has dropped too low (below 2.7 V the chip holds itself in reset).'
                : `Running${example ? ` ${example.name}` : ''}.`}
            </p>
            <p className="cm-hint">
              Uses {status.result.flashBytes.toLocaleString()} bytes ({pct(status.result.flashBytes, UNO_FLASH_BYTES)}) of program storage and{' '}
              {status.result.ramBytes} bytes ({pct(status.result.ramBytes, UNO_RAM_BYTES)}) of memory.
            </p>
            <div className="uno-row">
              <button className="btn" onClick={() => arduinos?.reset(part.id)} title="Start the program again from the beginning, like the board’s red button">
                Reset
              </button>
            </div>
          </>
        )}
      </div>

      {status?.phase === 'running' && (
        <>
          <div className="insp-section uno-serial-head">
            <span>Serial output</span>
            {view?.serial && (
              <button className="link-btn" onClick={() => arduinos?.clearSerial(part.id)}>
                Clear
              </button>
            )}
          </div>
          <pre className="uno-serial mono" ref={out}>
            {view?.serial || <span className="uno-serial-empty">Nothing printed yet. Serial.println("hello") in a sketch shows up here; Edit code opens the full serial monitor.</span>}
          </pre>
        </>
      )}
    </>
  );
}
