export type SimStatus = 'idle' | 'running' | 'failed';

const STATUS_TEXT: Record<SimStatus, string> = {
  idle: 'Simulator idle',
  running: 'Simulating',
  failed: 'Can’t solve this circuit',
};

export function StatusBar({ parts, wires, status, storageOk }: { parts: number; wires: number; status: SimStatus; storageOk: boolean }) {
  return (
    <footer className="statusbar">
      <span className="status-item" role="status">
        <span className={`dot ${status}`} aria-hidden="true" />
        {STATUS_TEXT[status]}
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
      {storageOk ? (
        <span className="status-item faint" title="Your work and progress are saved in this browser as you go">
          Saved in this browser · v0.7
        </span>
      ) : (
        <span className="status-item warn" role="alert" title="Export your circuit from My circuits to keep it">
          Not saving: browser storage unavailable
        </span>
      )}
    </footer>
  );
}
