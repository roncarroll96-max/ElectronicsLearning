import { SPEEDS, type LiveSim, type Speed } from '../state/useLiveSim';

const SPEED_LABEL: Record<Speed, string> = { 1: 'Real time', 0.25: '¼ speed', 0.1: '1/10 speed', 0.01: '1/100 speed' };

/** "12.3 ms", "4.56 s", "2 min 05 s". */
export function formatTime(t: number): string {
  if (t < 1) return `${(t * 1000).toFixed(t < 0.01 ? 2 : 1)} ms`;
  if (t < 60) return `${t.toFixed(2)} s`;
  const m = Math.floor(t / 60);
  return `${m} min ${String(Math.floor(t % 60)).padStart(2, '0')} s`;
}

/**
 * The clock for circuits that change over time (anything with a capacitor):
 * time since power-on, pause/play, slow motion, and "power off and on".
 */
export function TimeControls({ live }: { live: LiveSim }) {
  const status = live.paused ? 'Paused' : live.settled ? 'Settled: nothing is changing' : live.lagging ? 'Running slower than shown' : 'Running';
  return (
    <div className="time-controls" role="group" aria-label="Circuit time">
      <button
        className="icon-btn tc-play"
        onClick={() => live.setPaused(!live.paused)}
        aria-label={live.paused ? 'Play' : 'Pause'}
        title={live.paused ? 'Play' : 'Pause'}
      >
        {live.paused ? (
          <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
            <path d="M6 4l10 6-10 6z" fill="currentColor" />
          </svg>
        ) : (
          <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
            <path d="M5 4h3.5v12H5zM11.5 4H15v12h-3.5z" fill="currentColor" />
          </svg>
        )}
      </button>
      <div className="tc-clock">
        <span className="tc-time mono" aria-live="off">
          t = {formatTime(live.time)}
        </span>
        <span className={`tc-status${live.lagging ? ' warn' : ''}`}>{status}</span>
      </div>
      <select
        className="tc-speed"
        value={live.speed}
        onChange={(e) => live.setSpeed(Number(e.target.value) as Speed)}
        aria-label="Speed"
        title="Slow motion: watch fast changes happen"
      >
        {SPEEDS.map((s) => (
          <option key={s} value={s}>
            {SPEED_LABEL[s]}
          </option>
        ))}
      </select>
      <button className="icon-btn" onClick={live.restart} aria-label="Power off and on" title="Power off and on: empty every capacitor and start the clock again">
        <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
          <path d="M10 3v6" />
          <path d="M6 5.5a6 6 0 1 0 8 0" />
        </svg>
      </button>
    </div>
  );
}
