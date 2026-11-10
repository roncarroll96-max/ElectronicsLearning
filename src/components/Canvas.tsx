import type { Mode, View } from './TopBar';

interface Props {
  mode: Mode;
  view: View;
}

/** The circuit workspace. Step 1: grid and empty state only; parts and wiring come in step 2. */
export function Canvas({ mode, view }: Props) {
  return (
    <main className="canvas" aria-label="Circuit canvas">
      <div className="canvas-grid" />
      <div className="canvas-badge">{view === 'realistic' ? 'Realistic view' : 'Schematic view'}</div>
      <div className="empty-state">
        <div className="empty-glyph" aria-hidden="true">
          <svg viewBox="0 0 64 40" width="96" height="60" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 20h14l3-7 5 14 5-14 5 14 5-14 3 7h16" stroke="var(--accent)" strokeWidth="2" />
            <circle cx="4" cy="20" r="2.5" fill="var(--accent)" />
            <circle cx="60" cy="20" r="2.5" fill="var(--accent)" />
          </svg>
        </div>
        <h2>{mode === 'learn' ? 'Your first circuit starts here' : 'Blank canvas'}</h2>
        <p>
          {mode === 'learn'
            ? 'Lessons will guide you step by step: which part goes where, and why.'
            : 'Drag parts from the tray to build anything you like.'}
        </p>
        <span className="coming-soon">Drag-and-drop arrives in the next step</span>
      </div>
    </main>
  );
}
