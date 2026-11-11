import type { Circuit } from '../../model/circuit';
import type { ScopeView } from '../../scope/scope';
import type { PartKind } from '../../model/parts';
import type { MeterReading, MeterState } from '../../meter/meter';
import type { SimResult } from '../../sim/simulate';
import type { Topology } from '../topology';
import type { Recent } from './recorder';

export type TrackId = 'foundations' | 'components' | 'timing';

/** Everything a step's check can look at. */
export interface CheckCtx {
  /** The circuit right now (held buttons pressed). */
  c: Circuit;
  sim: SimResult;
  t: Topology;
  meter: MeterState;
  reading: MeterReading | null;
  /** Circuit time, s (0 for circuits that don't change over time). */
  time: number;
  scope: ScopeView;
  /** How each part's readings moved over the last few seconds. */
  recent: Recent;
  /** Sound is switched on. */
  sound: boolean;
  /** How loudly each speaker is being driven: the changing part of its current, rms, A (by part id). */
  levels: ReadonlyMap<string, number>;
}

export interface Step {
  id: string;
  /** What to do, in plain words. */
  text: string;
  /** Extra help, revealed on request. */
  hint?: string;
  /** Done when this returns true. Steps complete in order. */
  check: (ctx: CheckCtx) => boolean;
  /** Parts tray tiles to point at while this is the current step. */
  tray?: PartKind[];
}

export interface Lesson {
  id: string;
  track: TrackId;
  title: string;
  /** One line for the track list. */
  summary: string;
  minutes: number;
  /** The concept, a few short paragraphs. */
  concept: string[];
  /** The circuit the lesson starts with (built fresh each time). */
  starter?: () => Circuit;
  /** The guided build. */
  build: Step[];
  /** "Try changing this": experiments after the build. */
  experiment: Step[];
  /** Optional design challenge: the learner calculates and picks the parts. */
  challenge?: Step[];
  /** Lesson-specific "Why this value?" notes, shown above the general explanation. */
  why?: Partial<Record<PartKind, string>>;
}

export function allSteps(l: Lesson): Step[] {
  return [...l.build, ...l.experiment, ...(l.challenge ?? [])];
}
