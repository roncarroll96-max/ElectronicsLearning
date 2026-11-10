import { useEffect, useRef } from 'react';

const KEY = 'circuitlab.welcomed';

export function hasBeenWelcomed(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function markWelcomed(): void {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    /* storage unavailable: the welcome will simply show again next time */
  }
}

export type WelcomeChoice = 'first-led' | 'lessons' | 'sandbox';

/** The 30-second welcome shown on first launch. */
export function Welcome({ onChoose }: { onChoose: (c: WelcomeChoice) => void }) {
  const primary = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    primary.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onChoose('lessons');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onChoose]);

  return (
    <div className="welcome-backdrop">
      <div className="welcome" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
        <div className="welcome-glyph" aria-hidden="true">
          <svg viewBox="0 0 64 40" width="84" height="52" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 20h14l3-7 5 14 5-14 5 14 5-14 3 7h16" stroke="var(--accent)" strokeWidth="2" />
            <circle cx="4" cy="20" r="2.5" fill="var(--accent)" />
            <circle cx="60" cy="20" r="2.5" fill="var(--accent)" />
          </svg>
        </div>
        <h1 id="welcome-title">Welcome to Circuit Lab</h1>
        <ul className="welcome-points">
          <li>
            <strong>Build real circuits.</strong> A simulator calculates every voltage and current, so what you see is what
            would really happen.
          </li>
          <li>
            <strong>Learn why.</strong> Every part explains what it’s for and how its value was chosen.
          </li>
          <li>
            <strong>Break things safely.</strong> Overload a part and it burns out, then tells you how to get it right.
          </li>
        </ul>
        <div className="welcome-actions">
          <button ref={primary} className="btn primary" onClick={() => onChoose('first-led')}>
            Light your first LED
          </button>
          <button className="btn" onClick={() => onChoose('lessons')}>
            Browse the lessons
          </button>
          <button className="btn" onClick={() => onChoose('sandbox')}>
            Open the sandbox
          </button>
        </div>
      </div>
    </div>
  );
}
