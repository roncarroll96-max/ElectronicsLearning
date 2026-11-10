import { useState } from 'react';
import { TRACKS, type Lesson, type Step } from '../learn/lessons';
import { currentStep, isComplete } from '../learn/lessons/progress';

/** The list of tracks and their lessons (Learn mode, no lesson open). */
export function TrackList({ completed, onOpen }: { completed: ReadonlySet<string>; onOpen: (id: string) => void }) {
  return (
    <div className="track-list">
      {TRACKS.map((t, ti) => {
        const done = t.lessons.filter((l) => completed.has(l.id)).length;
        return (
          <section key={t.id} className="track-block">
            <header className="track-head">
              <span className="track-num">{ti + 1}</span>
              <div className="track-text">
                <span className="track-name">{t.name}</span>
                <span className="track-desc">{t.desc}</span>
                <div className="progress" aria-label={`${done} of ${t.planned} lessons complete`}>
                  <span style={{ width: `${(done / t.planned) * 100}%` }} />
                </div>
              </div>
              <span className="track-count">
                {done}/{t.planned}
              </span>
            </header>
            <ol className="lesson-list">
              {t.lessons.map((l, i) => (
                <li key={l.id}>
                  <button className={`lesson-row${completed.has(l.id) ? ' done' : ''}`} onClick={() => onOpen(l.id)}>
                    <span className="lesson-num" aria-hidden="true">
                      {completed.has(l.id) ? '✓' : i + 1}
                    </span>
                    <span className="lesson-text">
                      <span className="lesson-title">{l.title}</span>
                      <span className="lesson-summary">{l.summary}</span>
                    </span>
                    <span className="lesson-min">{l.minutes} min</span>
                  </button>
                </li>
              ))}
            </ol>
            {t.lessons.length < t.planned && (
              <p className="lesson-more">{t.planned - t.lessons.length} more lessons are on the way.</p>
            )}
          </section>
        );
      })}
      <div className="track-later">
        <span className="track-name">Sound &amp; Timing</span> and <span className="track-name">Digital &amp; Arduino</span> arrive
        in later milestones.
      </div>
    </div>
  );
}

/** One lesson: the idea, the guided build, experiments and the challenge, ticking off live. */
export function LessonPanel({
  lesson,
  done,
  onBack,
  onRestart,
  next,
  onNext,
}: {
  lesson: Lesson;
  done: readonly string[];
  onBack: () => void;
  onRestart: () => void;
  next?: Lesson;
  onNext: () => void;
}) {
  const [showIdea, setShowIdea] = useState(true);
  const track = TRACKS.find((t) => t.id === lesson.track)!;
  const number = track.lessons.indexOf(lesson) + 1;
  const current = currentStep(lesson, done);
  const complete = isComplete(lesson, done);

  return (
    <div className="lesson">
      <button className="lesson-back" onClick={onBack}>
        ‹ All lessons
      </button>
      <div className="lesson-kicker">
        {track.name} · Lesson {number} · {lesson.minutes} min
      </div>
      <h2 className="lesson-heading">{lesson.title}</h2>

      <section className="lesson-section">
        <button className="lesson-section-toggle" aria-expanded={showIdea} onClick={() => setShowIdea((s) => !s)}>
          The idea <span aria-hidden="true">{showIdea ? '▾' : '▸'}</span>
        </button>
        {showIdea && lesson.concept.map((para) => <p key={para}>{para}</p>)}
      </section>

      <StepList title="Build it" steps={lesson.build} done={done} current={current} />
      {lesson.experiment.length > 0 && <StepList title="Try changing this" steps={lesson.experiment} done={done} current={current} />}
      {lesson.challenge && <StepList title="Design challenge" steps={lesson.challenge} done={done} current={current} />}

      {complete && (
        <div className="lesson-done" role="status">
          <strong>Lesson complete!</strong>
          {next ? (
            <button className="btn primary" onClick={onNext}>
              Next: {next.title}
            </button>
          ) : (
            <span>That’s every lesson so far. More are on the way.</span>
          )}
        </div>
      )}

      <button className="lesson-restart" onClick={onRestart}>
        Start this lesson over
      </button>
    </div>
  );
}

function StepList({ title, steps, done, current }: { title: string; steps: Step[]; done: readonly string[]; current?: Step }) {
  return (
    <section className="lesson-section">
      <h3 className="lesson-section-title">{title}</h3>
      <ol className="steps">
        {steps.map((s) => (
          <StepItem key={s.id} step={s} state={done.includes(s.id) ? 'done' : s === current ? 'current' : 'todo'} />
        ))}
      </ol>
    </section>
  );
}

function StepItem({ step, state }: { step: Step; state: 'done' | 'current' | 'todo' }) {
  const [hint, setHint] = useState(false);
  return (
    <li className={`step ${state}`} aria-current={state === 'current' ? 'step' : undefined}>
      <span className="step-mark" aria-label={state === 'done' ? 'Done' : undefined}>
        {state === 'done' ? '✓' : ''}
      </span>
      <div className="step-body">
        <p>{step.text}</p>
        {state === 'current' && step.hint && (
          <>
            {hint ? (
              <p className="step-hint">{step.hint}</p>
            ) : (
              <button className="step-hint-btn" onClick={() => setHint(true)}>
                Need a hint?
              </button>
            )}
          </>
        )}
      </div>
    </li>
  );
}
