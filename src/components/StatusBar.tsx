export function StatusBar({ parts, wires }: { parts: number; wires: number }) {
  return (
    <footer className="statusbar">
      <span className="status-item">
        <span className="dot idle" aria-hidden="true" />
        Simulator idle
        <span className="status-count">
          {parts} {parts === 1 ? 'part' : 'parts'} · {wires} {wires === 1 ? 'wire' : 'wires'}
        </span>
      </span>
      <span className="status-legend" aria-label="Wire color legend">
        <span><i style={{ background: 'var(--sig-power)' }} />Power</span>
        <span><i style={{ background: 'var(--sig-ground)' }} />Ground</span>
        <span><i style={{ background: 'var(--sig-analog)' }} />Analog</span>
        <span><i style={{ background: 'var(--sig-digital)' }} />Digital</span>
      </span>
      <span className="status-item faint">v0.2 · Step 2</span>
    </footer>
  );
}
