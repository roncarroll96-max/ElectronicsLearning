import { useEffect, useRef } from 'react';
import { PROJECTS, type Project, type ProjectKind } from '../playground/projects';

const KINDS: ProjectKind[] = ['Analog', 'Digital', 'Arduino'];

/** The Playground gallery: finished circuits to open in the sandbox and play with. */
export function PlaygroundMenu({ current, onOpen, onClose }: { current: string | null; onOpen: (id: string) => void; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);

  // Close on Escape or a click outside.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element;
      if (box.current && !box.current.contains(t) && !t.closest('.play-btn')) onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [onClose]);

  return (
    <div className="circuits-menu play-menu" ref={box} role="dialog" aria-label="Playground">
      <div className="cm-head">
        <span className="panel-title">Playground</span>
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <p className="cm-hint">Finished circuits that go beyond the lessons. Open one, play with it, change it, break it.</p>
      {KINDS.map((kind) => (
        <section key={kind} className="cm-section">
          <span className="cm-label">{kind}</span>
          <ul className="cm-list">
            {PROJECTS.filter((p) => p.kind === kind).map((p: Project) => (
              <li key={p.id} className={p.id === current ? 'current' : ''}>
                <button className="cm-open" onClick={() => onOpen(p.id)}>
                  <span className="cm-name">{p.title}</span>
                  <span className="play-blurb">{p.blurb}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="cm-hint">Opening one replaces the sandbox. Press Ctrl+Z to get your old circuit back.</p>
    </div>
  );
}

/** The open project's guide, shown in the side panel while nothing is selected. */
export function PlaygroundGuide({ project, onReset, onClose }: { project: Project; onReset: () => void; onClose: () => void }) {
  return (
    <div className="play-guide">
      <div className="play-guide-head">
        <div>
          <span className="cm-label">Playground · {project.kind}</span>
          <h2 className="play-guide-title">{project.title}</h2>
        </div>
        <button className="icon-x" onClick={onClose} aria-label="Hide the guide" title="Hide the guide">
          ×
        </button>
      </div>
      <p className="play-guide-blurb">{project.blurb}</p>
      <section className="play-guide-section">
        <h3>How it works</h3>
        {project.how.map((t, i) => (
          <p key={i}>{t}</p>
        ))}
      </section>
      <section className="play-guide-section">
        <h3>Try this</h3>
        <ul>
          {project.tryThis.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      </section>
      <section className="play-guide-section break">
        <h3>Break it</h3>
        <ul>
          {project.breakIt.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      </section>
      <p className="play-guide-foot">
        Select any part to see its value and why it’s there.{' '}
        <button className="link-btn" onClick={onReset}>
          Start this circuit over
        </button>
      </p>
    </div>
  );
}
