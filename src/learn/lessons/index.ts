import { COMPONENTS } from './components';
import { FOUNDATIONS } from './foundations';
import type { Lesson, TrackId } from './types';

export interface Track {
  id: TrackId;
  name: string;
  desc: string;
  lessons: Lesson[];
  /** Lessons the finished track will have. */
  planned: number;
}

export const TRACKS: Track[] = [
  { id: 'foundations', name: 'Foundations', desc: 'Voltage, current, resistance, Ohm’s law', lessons: FOUNDATIONS, planned: 10 },
  { id: 'components', name: 'Components in Depth', desc: 'Diodes, capacitors, transistors, sensors', lessons: COMPONENTS, planned: 10 },
];

export const LESSONS: Lesson[] = TRACKS.flatMap((t) => t.lessons);
export const lessonById = (id: string) => LESSONS.find((l) => l.id === id);

/** The lesson after this one, across tracks. */
export function nextLesson(id: string): Lesson | undefined {
  const i = LESSONS.findIndex((l) => l.id === id);
  return i >= 0 ? LESSONS[i + 1] : undefined;
}

export type { Lesson, Step, CheckCtx, TrackId } from './types';
export { allSteps } from './types';
