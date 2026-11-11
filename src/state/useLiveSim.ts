/**
 * Runs the simulator live. A circuit without capacitors has nothing that
 * changes over time, so it is solved once, here (the settled state). A circuit
 * with capacitors runs in time in a background worker (src/sim/worker.ts),
 * paced to real time or slowed down, pausing by itself once everything has
 * settled; this hook sends it each change and shows what it sends back.
 *
 * Ratings (burnouts, running hot, the meter's fuse) use the worker's "heat"
 * view: readings averaged over a short thermal time constant, because real
 * parts are destroyed by heat building up, not by a millisecond spike.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Circuit, PinRef } from '../model/circuit';
import { Trace } from '../scope/trace';
import { probesKey, usesTime, type Frame, type Speed } from '../sim/live';
import { simulate, type SimResult } from '../sim/simulate';
import { TransientSim, type CapStates } from '../sim/transient';
import type { ToWorker } from '../sim/worker';

export { BASE_STEP, SPEEDS, type Speed } from '../sim/live';

export interface LiveSim {
  /** Every voltage and current right now. */
  sim: SimResult;
  /** Readings averaged over the thermal time constant: use for ratings (burnouts, hot, the meter's fuse). */
  stress: SimResult;
  /** The circuit has a capacitor, so it changes over time. */
  dynamic: boolean;
  /** Circuit time since power-on, s. */
  time: number;
  /** Nothing is changing any more (stepping has stopped until the next change). */
  settled: boolean;
  paused: boolean;
  setPaused: (p: boolean) => void;
  speed: Speed;
  setSpeed: (s: Speed) => void;
  /** The computer can't keep up with the chosen speed, so time runs slower than it says. */
  lagging: boolean;
  /** Power off and on again: every capacitor empty, the clock back to zero. */
  restart: () => void;
  /** The oscilloscope's record of its two probes, sampled every step (empty for circuits that don't change over time). */
  trace: Trace;
  /** How loudly each speaker is sounding (the changing part of its current, rms, A). */
  levels: ReadonlyMap<string, number>;
  /** Gives the worker a port to the audio thread, for speaker sound. */
  connectAudio: (port: MessagePort) => void;
}

/**
 * `probes`: the pins the oscilloscope's two channels touch (null = not attached).
 * `audio`: sound is switched on, so the worker should produce speaker sound.
 */
export function useLiveSim(c: Circuit, probes: [PinRef | null, PinRef | null] = [null, null], audio = false): LiveSim {
  const timed = usesTime(c);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  const [generation, setGeneration] = useState(0);
  const [frame, setFrame] = useState<Frame | null>(null);
  const trace = useRef(new Trace()).current;

  // The worker, started when first needed and kept for the life of the page.
  const worker = useRef<Worker | null>(null);
  const getWorker = useCallback(() => {
    if (!worker.current) {
      worker.current = new Worker(new URL('../sim/worker.ts', import.meta.url), { type: 'module' });
      worker.current.onmessage = (e: MessageEvent<Frame>) => onFrame.current(e.data);
    }
    return worker.current;
  }, []);
  useEffect(
    () => () => {
      worker.current?.terminate();
      worker.current = null;
    },
    [],
  );
  const send = useCallback((m: ToWorker, transfer: Transferable[] = []) => getWorker().postMessage(m, transfer), [getWorker]);

  // Each change of circuit, probes or power gets a new version number; frames
  // about an older version are ignored, so a reading never belongs to the wrong circuit.
  const key = probesKey(probes);
  const versionRef = useRef(0);
  const lastGen = useRef(generation);
  const lastKey = useRef(key);
  const carry = useRef<{ caps: CapStates; time: number } | null>(null);
  // The first version after the last power-on: older frames mustn't bring back charge from before it.
  const powerOnVersion = useRef(0);

  const version = useMemo(() => {
    versionRef.current += 1;
    return versionRef.current;
    // A new version whenever the circuit, the probes or the power-on count change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c, key, generation, timed]);

  // While the worker's first frame for this version is on its way, show the
  // same starting state computed here: capacitors holding the charge they had.
  const provisional = useMemo<SimResult>(() => {
    if (!timed) return simulate(c);
    const restart = generation !== lastGen.current;
    const from = restart ? null : carry.current;
    return new TransientSim(c, from?.caps, from?.time ?? 0).result();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  useEffect(() => {
    const restart = generation !== lastGen.current;
    const moved = key !== lastKey.current;
    lastGen.current = generation;
    lastKey.current = key;
    if (restart) {
      carry.current = null;
      powerOnVersion.current = version;
      trace.clear();
    }
    if (moved) trace.clear();
    if (!timed) {
      if (worker.current) send({ type: 'circuit', circuit: null, version, probes, restart });
      return;
    }
    send({ type: 'circuit', circuit: c, version, probes, restart });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  useEffect(() => {
    if (timed || worker.current) send({ type: 'controls', paused, speed, audio });
  }, [paused, speed, audio, timed, send]);

  const onFrame = useRef((_f: Frame) => {});
  onFrame.current = (f: Frame) => {
    if (f.version >= powerOnVersion.current) carry.current = { caps: f.caps, time: f.time };
    if (f.version !== versionRef.current) return;
    if (f.trace) for (let k = 0; k < f.trace.t.length; k++) trace.push(f.trace.t[k], f.trace.a[k], f.trace.b[k]);
    setFrame(f);
  };

  const current = timed && frame && frame.version === version ? frame : null;
  const sim = current ? current.result : provisional;
  const stress = useMemo<SimResult>(() => (current ? { ...current.result, parts: current.heat } : sim), [current, sim]);
  const levels = useMemo(() => new Map(current?.levels ?? []), [current]);

  const restart = useCallback(() => setGeneration((g) => g + 1), []);
  const connectAudio = useCallback((port: MessagePort) => send({ type: 'audioPort', port }, [port]), [send]);

  return {
    sim,
    stress,
    dynamic: timed,
    time: current?.time ?? (generation !== lastGen.current ? 0 : (carry.current?.time ?? 0)),
    settled: !!current?.settled,
    paused,
    setPaused,
    speed,
    setSpeed,
    lagging: !!current?.lagging && !paused,
    restart,
    trace,
    levels,
    connectAudio,
  };
}
