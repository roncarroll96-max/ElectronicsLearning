import { allSteps, type CheckCtx, type Lesson, type Step } from './types';

/**
 * Ticks off steps in order: each step is checked only once every step before
 * it is done, and stays done afterwards (moving a probe away after measuring
 * doesn't undo the measurement). Returns the new list of done step ids.
 */
export function advance(lesson: Lesson, done: readonly string[], ctx: CheckCtx): string[] {
  const out = [...done];
  for (const step of allSteps(lesson)) {
    if (out.includes(step.id)) continue;
    let ok = false;
    try {
      ok = step.check(ctx);
    } catch {
      ok = false;
    }
    if (!ok) break;
    out.push(step.id);
  }
  return out;
}

/** The first step not yet done. */
export function currentStep(lesson: Lesson, done: readonly string[]): Step | undefined {
  return allSteps(lesson).find((s) => !done.includes(s.id));
}

export const isComplete = (lesson: Lesson, done: readonly string[]) => allSteps(lesson).every((s) => done.includes(s.id));
