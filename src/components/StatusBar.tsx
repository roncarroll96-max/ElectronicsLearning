export function StatusBar() {
  return (
    <footer className="statusbar">
      <span className="status-item">
        <span className="dot idle" aria-hidden="true" />
        Simulator idle
      </span>
      <span className="status-legend" aria-label="Wire color legend">
        <span><i style={{ background: 'var(--sig-power)' }} />Power</span>
        <span><i style={{ background: 'var(--sig-ground)' }} />Ground</span>
        <span><i style={{ background: 'var(--sig-analog)' }} />Analog</span>
        <span><i style={{ background: 'var(--sig-digital)' }} />Digital</span>
      </span>
      <span className="status-item faint">v0.1 · Step 1</span>
    </footer>
  );
}
