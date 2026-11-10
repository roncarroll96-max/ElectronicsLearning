import type { Issue } from '../learn/diagnose';

export interface HelpState {
  open: boolean;
  index: number;
  /** How many hints have been revealed for each problem (1–3). */
  levels: Record<string, number>;
}

export const INITIAL_HELP: HelpState = { open: false, index: 0, levels: {} };

const STEPS = ['Where to look', 'What’s wrong', 'The fix'] as const;

/** The "Why isn't it working?" button, and the graduated hints it opens. */
export function HelpPanel({
  help,
  issues,
  empty,
  onChange,
  onApply,
}: {
  help: HelpState;
  issues: Issue[];
  empty: boolean;
  onChange: (h: HelpState) => void;
  onApply: (issue: Issue) => void;
}) {
  if (!help.open) {
    return (
      <button className="help-trigger" onClick={() => onChange({ ...help, open: true })}>
        <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true">
          <circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M7.8 7.8a2.3 2.3 0 1 1 3 2.2c-.6.3-.8.7-.8 1.3v.4M10 14.2v.1" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        Why isn’t it working?
        {issues.length > 0 && <span className="help-dot" aria-label="A problem was found" />}
      </button>
    );
  }

  const close = () => onChange({ ...help, open: false });
  const index = Math.min(help.index, Math.max(0, issues.length - 1));
  const issue = issues[index];

  return (
    <section className="help-panel" aria-label="Why isn’t it working?">
      <header className="help-head">
        <strong>Why isn’t it working?</strong>
        {issues.length > 1 && (
          <span className="help-nav">
            <button aria-label="Previous problem" disabled={index === 0} onClick={() => onChange({ ...help, index: index - 1 })}>
              ‹
            </button>
            <span>
              {index + 1} of {issues.length}
            </span>
            <button aria-label="Next problem" disabled={index === issues.length - 1} onClick={() => onChange({ ...help, index: index + 1 })}>
              ›
            </button>
          </span>
        )}
        <button className="icon-x" aria-label="Close" title="Close" onClick={close}>
          ×
        </button>
      </header>

      {!issue ? (
        <p className="help-ok">
          {empty
            ? 'There’s nothing to check yet. Add a battery and a few parts, then wire them into a loop.'
            : 'I can’t find a problem: every part is connected and within its ratings. If the circuit isn’t doing what you expect, select a part and read “Why this value?”.'}
        </p>
      ) : (
        <Hints issue={issue} level={help.levels[issue.id] ?? 1} onLevel={(l) => onChange({ ...help, index, levels: { ...help.levels, [issue.id]: l } })} onApply={() => onApply(issue)} />
      )}
    </section>
  );
}

function Hints({ issue, level, onLevel, onApply }: { issue: Issue; level: number; onLevel: (l: number) => void; onApply: () => void }) {
  const texts = [issue.where, issue.what, issue.fix];
  return (
    <>
      <ol className="help-steps">
        {texts.slice(0, level).map((text, i) => (
          <li key={i}>
            <span className="help-step">{STEPS[i]}</span>
            <p>{text}</p>
          </li>
        ))}
      </ol>
      <div className="help-actions">
        {level < 3 && (
          <button className="btn" onClick={() => onLevel(level + 1)}>
            {level === 1 ? 'What’s wrong?' : 'Show me the fix'}
          </button>
        )}
        {level === 3 && issue.action && (
          <button className="btn primary" onClick={onApply}>
            {issue.action.label}
          </button>
        )}
      </div>
    </>
  );
}
