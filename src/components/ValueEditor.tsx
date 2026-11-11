import { useEffect, useRef, useState } from 'react';
import { updatePart, type Part } from '../model/circuit';
import { PART_DEFS, formatValue, type Unit } from '../model/parts';
import { E12, E6, isStandard, parseValue, seriesValues, standardDown, standardUp } from '../model/values';
import type { EditFn } from '../state/useCircuit';

const RESISTORS = seriesValues(E12, 10, 1e6);
const CAPACITORS = seriesValues(E6, 1e-9, 1e-3);
const POTS = [1e3, 5e3, 10e3, 50e3, 100e3];
const BATTERIES = [1.5, 3, 4.5, 6, 9, 12];
const INDUCTORS = seriesValues(E6, 100e-6, 1);
const AC_PEAKS = [1, 2, 5, 9, 12, 25];
const RATIOS = [0.1, 0.25, 0.5, 1, 2, 5];

/** Change a part's value: a slider through real standard values, or quick picks. */
export function ValueEditor({ part, edit }: { part: Part; edit: EditFn }) {
  const set = (value: number, record = true) => edit((c) => updatePart(c, part.id, { value }), record);
  const value = part.value ?? PART_DEFS[part.kind].defaultValue ?? 0;

  switch (part.kind) {
    case 'resistor':
      return <SeriesSlider label="Resistance" unit="Ω" values={RESISTORS} series={E12} value={value} onChange={set} />;
    case 'capacitor':
      return <SeriesSlider label="Capacitance" unit="F" values={CAPACITORS} series={E6} value={value} onChange={set} />;
    case 'potentiometer':
      return <Chips label="Total resistance" options={POTS} unit="Ω" value={value} onPick={set} />;
    case 'battery':
      return <Chips label="Voltage" options={BATTERIES} unit="V" value={value} onPick={set} />;
    case 'acsource':
      return <Chips label="Peak voltage" options={AC_PEAKS} unit="V" value={value} onPick={set} />;
    case 'inductor':
      return <SeriesSlider label="Inductance" unit="H" values={INDUCTORS} series={E6} value={value} onChange={set} />;
    case 'transformer':
      return (
        <Chips
          label="Turns ratio (secondary ÷ primary)"
          options={RATIOS}
          value={value}
          format={(o) => (o < 1 ? `${o}× down` : o > 1 ? `${o}× up` : '1:1')}
          onPick={set}
        />
      );
    default:
      return null;
  }
}

function SeriesSlider({
  label,
  unit,
  values,
  series,
  value,
  onChange,
}: {
  label: string;
  unit: Unit;
  values: number[];
  series: number[];
  value: number;
  onChange: (v: number, record: boolean) => void;
}) {
  // Slider position: the nearest standard value (on a log scale).
  let index = 0;
  for (let i = 0; i < values.length; i++) {
    if (Math.abs(Math.log(values[i] / value)) < Math.abs(Math.log(values[index] / value))) index = i;
  }
  const fresh = useRef(true);
  const [text, setText] = useState(formatValue(value, unit));
  const [error, setError] = useState(false);
  useEffect(() => {
    setText(formatValue(value, unit));
    setError(false);
  }, [value, unit]);

  const commit = () => {
    const v = parseValue(text);
    if (v === null) {
      setError(true);
      return;
    }
    setError(false);
    if (v !== value) onChange(v, true);
    else setText(formatValue(value, unit));
  };

  const standard = isStandard(value, series);
  return (
    <div className="value-editor">
      <label className="insp-slider">
        <span className="insp-slider-head">
          <span>{label}</span>
          <input
            className={`value-input mono${error ? ' invalid' : ''}`}
            value={text}
            aria-label={`${label}, type a value`}
            aria-invalid={error}
            spellCheck={false}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') setText(formatValue(value, unit));
            }}
          />
        </span>
        <input
          type="range"
          min={0}
          max={values.length - 1}
          step={1}
          value={index}
          aria-label={`${label} (standard values)`}
          aria-valuetext={formatValue(values[index], unit)}
          onPointerDown={() => {
            fresh.current = true;
          }}
          onKeyDown={() => {
            fresh.current = true;
          }}
          onChange={(e) => {
            onChange(values[Number(e.target.value)], fresh.current);
            fresh.current = false;
          }}
        />
      </label>
      {error && (
        <p className="insp-note warn">
          {unit === 'H' ? 'Try something like 10m, 4.7m or 100µ.' : `Try something like 330, 4.7k or 1M${unit === 'F' ? ' (or 10µ, 100n)' : ''}.`}
        </p>
      )}
      {!error && !standard && (
        <p className="insp-note">
          Not a standard value, so you couldn’t buy this part. The nearest ones are{' '}
          {formatValue(standardDown(value, series), unit)} and {formatValue(standardUp(value, series), unit)}.
        </p>
      )}
    </div>
  );
}

function Chips({
  label,
  options,
  unit,
  format,
  value,
  onPick,
}: {
  label: string;
  options: number[];
  unit?: Unit;
  format?: (v: number) => string;
  value: number;
  onPick: (v: number) => void;
}) {
  return (
    <div className="insp-chips">
      <span className="insp-control-label">{label}</span>
      <div className="chips" role="group" aria-label={label}>
        {options.map((o) => (
          <button key={o} className={`chip${o === value ? ' on' : ''}`} aria-pressed={o === value} onClick={() => onPick(o)}>
            {format ? format(o) : formatValue(o, unit ?? 'V')}
          </button>
        ))}
      </div>
    </div>
  );
}
