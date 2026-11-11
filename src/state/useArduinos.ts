/**
 * The Arduinos in a circuit, from the page's side: each one's sketch is
 * compiled (by the in-browser compiler, src/arduino/compiler.ts) whenever it
 * changes, and the program is sent to the simulator's thread, where the
 * board runs it. Like uploading to a real board, a new program starts from
 * the beginning.
 *
 * Also gathers what each board prints over Serial, for its panel.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Circuit } from '../model/circuit';
import { compile, type CompileResult } from '../arduino/compiler';
import type { Frame } from '../sim/live';
import type { ToWorker } from '../sim/worker';

export type ArduinoStatus =
  | { phase: 'compiling' }
  | { phase: 'error'; result: Extract<CompileResult, { ok: false }> }
  | { phase: 'running'; result: Extract<CompileResult, { ok: true }> };

export interface ArduinoView {
  status: ArduinoStatus;
  /** Text printed over Serial (the most recent part, if it's long). */
  serial: string;
  /** It sent something over Serial in the last moment (the TX light). */
  tx: boolean;
  /** Its supply is high enough to run (the brown-out detector isn't holding it in reset). */
  running: boolean;
}

export interface Arduinos {
  views: ReadonlyMap<string, ArduinoView>;
  /** Press a board's reset button. */
  reset: (id: string) => void;
  clearSerial: (id: string) => void;
  /** Type text into a board's serial monitor. */
  sendSerial: (id: string, text: string) => void;
}

/** How much printed text each board keeps. */
const SERIAL_KEEP = 20_000;

/** Compiled sketches, by source text: a sketch compiles once however many boards run it. */
const compiled = new Map<string, Promise<CompileResult>>();
export function compileOnce(source: string): Promise<CompileResult> {
  let p = compiled.get(source);
  if (!p) {
    p = compile(source);
    compiled.set(source, p);
    // Failures aren't kept: the compiler may simply not have been downloadable yet.
    p.then((r) => {
      if (!r.ok && r.diagnostics.every((d) => d.line === undefined)) compiled.delete(source);
    });
    if (compiled.size > 30) compiled.delete(compiled.keys().next().value as string);
  }
  return p;
}

export function useArduinos(c: Circuit, send: (m: ToWorker, transfer?: Transferable[]) => void, frame: Frame | null, active: boolean): Arduinos {
  const [status, setStatus] = useState<Map<string, ArduinoStatus>>(new Map());
  const sent = useRef(new Map<string, string>()); // part id → the sketch whose program it runs
  const serial = useRef(new Map<string, string>());
  const [, bump] = useState(0);

  // Compile and send each board's program when its sketch changes.
  const boards = c.parts.filter((p) => p.kind === 'arduino' && !p.burn);
  const key = boards.map((p) => `${p.id}\u0000${p.sketch ?? ''}`).join('\u0001');
  useEffect(() => {
    if (!active) return;
    const live = new Set(boards.map((p) => p.id));
    for (const id of [...sent.current.keys()]) {
      if (!live.has(id)) {
        sent.current.delete(id);
        send({ type: 'program', id, program: null });
      }
    }
    for (const p of boards) {
      const source = p.sketch ?? '';
      if (sent.current.get(p.id) === source) continue;
      sent.current.set(p.id, source);
      setStatus((s) => new Map(s).set(p.id, { phase: 'compiling' }));
      compileOnce(source).then((r) => {
        if (sent.current.get(p.id) !== source) return; // the sketch changed again meanwhile
        if (r.ok) {
          send({ type: 'program', id: p.id, program: r.program });
          serial.current.delete(p.id);
          setStatus((s) => new Map(s).set(p.id, { phase: 'running', result: r }));
        } else {
          send({ type: 'program', id: p.id, program: null });
          if (r.diagnostics.every((d) => d.line === undefined)) sent.current.delete(p.id); // try again next time
          setStatus((s) => new Map(s).set(p.id, { phase: 'error', result: r }));
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, active]);

  // Collect printed text.
  useEffect(() => {
    if (!frame) return;
    let any = false;
    for (const a of frame.arduinos) {
      if (!a.serial) continue;
      const text = (serial.current.get(a.id) ?? '') + a.serial;
      serial.current.set(a.id, text.length > SERIAL_KEEP ? text.slice(-SERIAL_KEEP) : text);
      any = true;
    }
    if (any) bump((n) => n + 1);
  }, [frame]);

  const views = new Map<string, ArduinoView>();
  for (const p of boards) {
    const st = status.get(p.id);
    if (!st) continue;
    const f = frame?.arduinos.find((a) => a.id === p.id);
    views.set(p.id, { status: st, serial: serial.current.get(p.id) ?? '', tx: !!f?.tx, running: f ? f.running : st.phase === 'running' });
  }

  const reset = useCallback(
    (id: string) => {
      serial.current.delete(id);
      send({ type: 'resetArduino', id });
    },
    [send],
  );
  const clearSerial = useCallback((id: string) => {
    serial.current.delete(id);
    bump((n) => n + 1);
  }, []);

  const sendSerial = useCallback((id: string, text: string) => send({ type: 'serialIn', id, text }), [send]);

  return { views, reset, clearSerial, sendSerial };
}
