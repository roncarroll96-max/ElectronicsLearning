/**
 * Runs the simulator live. A circuit without capacitors has nothing that
 * changes over time, so it is solved once (the settled state). A circuit with
 * capacitors runs in time: a few hundred small steps every animation frame,
 * paced to real time (or slowed down), pausing by itself once everything has
 * settled so the computer isn't working for nothing.
 *
 * It also keeps a "heat" view of the readings for burnouts and hot warnings:
 * real parts are destroyed by heat building up, not by a spike lasting a few
 * milliseconds (a capacitor's first gulp of current, say), so ratings are
 * judged on readings averaged over a short thermal time constant.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Circuit } from '../model/circuit';
import { simulate, type PartReading, type SimResult } from '../sim/simulate';
import { TransientSim } from '../sim/transient';

/** Normal step size: 0.2 ms of circuit time (slow motion shrinks it in proportion). */
export const BASE_STEP = 2e-4;
/** Playback speeds: real time, then slow motion. */
export const SPEEDS = [1, 0.25, 0.1, 0.01] as const;
export type Speed = (typeof SPEEDS)[number];

/** Most computing time to spend per animation frame, ms (a frame is about 16 ms). */
const FRAME_BUDGET_MS = 8;
/** How long heat takes to build up in a small part, s. */
const THERMAL_TAU = 0.05;
/** A step that changes no capacitor by more than this (V) means the circuit has settled. */
const SETTLED_DV = 1e-6;

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
}

const usesTime = (c: Circuit) => c.parts.some((p) => p.kind === 'capacitor' && !p.burn);

export function useLiveSim(c: Circuit): LiveSim {
  const timed = usesTime(c);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  const [lagging, setLagging] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [tick, setTick] = useState(0);

  // The stepper for the current circuit. Rebuilt on every change, carrying the
  // capacitors' charge and the clock across (unless restarting).
  const prev = useRef<{ engine: TransientSim; generation: number } | null>(null);
  const engine = useMemo(() => {
    if (!timed) {
      prev.current = null;
      return null;
    }
    const p = prev.current;
    const carry = p && p.generation === generation ? p.engine : null;
    const e = new TransientSim(c, carry?.capStates(), carry?.time ?? 0);
    prev.current = { engine: e, generation };
    return e;
  }, [c, timed, generation]);

  const dc = useMemo(() => (timed ? null : simulate(c)), [c, timed]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sim = useMemo(() => (engine ? engine.result() : dc!), [engine, dc, tick]);

  // Heat: an exponential average of each part's readings over circuit time.
  const heat = useRef(new Map<string, PartReading>());
  const [settledFor, setSettledFor] = useState<TransientSim | null>(null);
  const settled = !!engine && settledFor === engine;

  const blend = useCallback((now: SimResult, dt: number) => {
    const a = Number.isFinite(dt) ? 1 - Math.exp(-dt / THERMAL_TAU) : 1;
    const next = new Map<string, PartReading>();
    for (const [id, r] of now.parts) {
      const h = heat.current.get(id);
      if (!h || h.i.length !== r.i.length || a >= 1) {
        next.set(id, { v: [...r.v], i: [...r.i], power: r.power });
      } else {
        next.set(id, {
          v: r.v.map((v, k) => h.v[k] + a * (v - h.v[k])),
          i: r.i.map((i, k) => h.i[k] + a * (i - h.i[k])),
          power: h.power + a * (r.power - h.power),
        });
      }
    }
    heat.current = next;
  }, []);

  // A new circuit (or a restart): the settled flag no longer applies.
  useEffect(() => {
    setLagging(false);
    if (!engine) heat.current = new Map();
  }, [engine]);

  // The animation loop.
  useEffect(() => {
    if (!engine || !engine.dynamic || paused || settled) return;
    let frame = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const elapsed = Math.min(0.1, (now - last) / 1000); // a background tab doesn't build up a backlog
      last = now;
      const h = BASE_STEP * speed;
      const wanted = Math.round((elapsed * speed) / h);
      const start = performance.now();
      let done = 0;
      let biggest = 0;
      while (done < wanted && performance.now() - start < FRAME_BUDGET_MS) {
        if (!engine.step(h)) break;
        biggest = Math.max(biggest, engine.lastChange);
        done++;
      }
      setLagging(done < wanted);
      const result = engine.result();
      if (done > 0 && biggest < SETTLED_DV) {
        blend(result, Infinity); // settled: the heat has caught up too
        setSettledFor(engine);
      } else {
        blend(result, done * h);
      }
      setTick((t) => t + 1);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [engine, paused, settled, speed, blend]);

  // Heat view: the averaged readings, in the same shape as the live result.
  const stress = useMemo<SimResult>(() => {
    if (!engine) return sim;
    // Parts the average hasn't seen yet (just added) use their live reading.
    const parts = new Map<string, PartReading>();
    for (const [id, r] of sim.parts) parts.set(id, heat.current.get(id) ?? r);
    return { ...sim, parts };
  }, [engine, sim]);

  const restart = useCallback(() => {
    heat.current = new Map();
    setSettledFor(null);
    setGeneration((g) => g + 1);
  }, []);

  return {
    sim,
    stress,
    dynamic: !!engine?.dynamic,
    time: engine?.time ?? 0,
    settled,
    paused,
    setPaused,
    speed,
    setSpeed,
    lagging: lagging && !paused && !settled,
    restart,
  };
}
