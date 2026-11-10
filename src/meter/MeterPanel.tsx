import type { MeterMode, MeterReading, MeterState } from './meter';

const MODES: { mode: MeterMode; name: string }[] = [
  { mode: 'V', name: 'Volts' },
  { mode: 'A', name: 'Amps' },
  { mode: 'Ω', name: 'Ohms' },
];

/** The multimeter's face: display, mode selector and a one-line explanation. */
export function MeterPanel({
  meter,
  reading,
  onMode,
  onClose,
  onReplaceFuse,
}: {
  meter: MeterState;
  reading: MeterReading;
  onMode: (m: MeterMode) => void;
  onClose: () => void;
  onReplaceFuse: () => void;
}) {
  return (
    <section className="meter" aria-label="Multimeter">
      <header className="meter-head">
        <span className="meter-title">Multimeter</span>
        <button className="icon-x" aria-label="Put the multimeter away" title="Put the multimeter away" onClick={onClose}>
          ×
        </button>
      </header>
      <output className={`meter-display tone-${reading.tone}`} aria-live="polite">
        {reading.display}
      </output>
      <div className="segmented meter-modes" role="group" aria-label="What to measure">
        {MODES.map(({ mode, name }) => (
          <button key={mode} className={meter.mode === mode ? 'on' : ''} aria-pressed={meter.mode === mode} onClick={() => onMode(mode)}>
            <span className="meter-sym">{mode}</span>
            <span className="meter-name">{name}</span>
          </button>
        ))}
      </div>
      <p className="meter-note">{reading.note}</p>
      {meter.mode === 'A' && meter.fuseBlownAt !== null && (
        <button className="btn" onClick={onReplaceFuse}>
          Replace the fuse
        </button>
      )}
    </section>
  );
}
