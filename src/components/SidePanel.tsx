import type { Mode } from './TopBar';

const TRACKS = [
  { name: 'Foundations', desc: 'Voltage, current, resistance, Ohm’s law', lessons: 10 },
  { name: 'Components in Depth', desc: 'Capacitors, diodes, transistors, sensors', lessons: 10 },
  { name: 'Sound & Timing', desc: 'Oscillators, the 555 timer, sound', lessons: 10, later: true },
  { name: 'Digital & Arduino', desc: 'Logic gates, then real Arduino code', lessons: 10, later: true },
];

/** Right-hand panel: lesson guide in Learn mode, part inspector in Sandbox mode. */
export function SidePanel({ mode }: { mode: Mode }) {
  return (
    <aside className="panel" aria-label={mode === 'learn' ? 'Lessons' : 'Inspector'}>
      {mode === 'learn' ? (
        <>
          <div className="panel-head">
            <span className="panel-title">Tracks</span>
          </div>
          <div className="panel-body">
            <ul className="track-list">
              {TRACKS.map((t, i) => (
                <li key={t.name} className={`track${t.later ? ' later' : ''}`}>
                  <span className="track-num">{i + 1}</span>
                  <div className="track-text">
                    <span className="track-name">{t.name}</span>
                    <span className="track-desc">{t.desc}</span>
                    <div className="progress" aria-label="0% complete">
                      <span style={{ width: '0%' }} />
                    </div>
                  </div>
                  <span className="track-count">{t.later ? 'Soon' : `0/${t.lessons}`}</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : (
        <>
          <div className="panel-head">
            <span className="panel-title">Inspector</span>
          </div>
          <div className="panel-body">
            <div className="inspector-empty">
              <p>Select a part to see its value, ratings, and why it’s there.</p>
            </div>
            <div className="callout">
              <span className="callout-label">Why this value?</span>
              <p>
                Every part will explain the goal, the reasoning, and the choice. Plain English
                first, with the math one click away.
              </p>
            </div>
          </div>
        </>
      )}
    </aside>
  );
}
