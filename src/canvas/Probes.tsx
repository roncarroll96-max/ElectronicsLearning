import type { PointerEvent as RPointerEvent } from 'react';
import type { Pt } from '../model/circuit';

export type ProbeColor = 'red' | 'black';

/**
 * A multimeter probe, drawn as a pen whose metal tip sits exactly on `at`.
 * The red probe leans right and the black one left, so both fit on
 * neighboring pins.
 */
export function ProbeMarker({
  color,
  at,
  attached,
  onDown,
}: {
  color: ProbeColor;
  at: Pt;
  attached: boolean;
  onDown: (e: RPointerEvent, color: ProbeColor) => void;
}) {
  const s = color === 'red' ? 1 : -1;
  return (
    <g
      className={`probe probe-${color}${attached ? ' attached' : ''}`}
      transform={`translate(${at.x} ${at.y})`}
      onPointerDown={(e) => onDown(e, color)}
    >
      <title>{color === 'red' ? 'Red probe (+): drag onto a pin' : 'Black probe (COM): drag onto a pin'}</title>
      {attached && <circle className="probe-ring" r="8" />}
      <path className="probe-metal" d={`M0 0L${6 * s} -8`} />
      <path className="probe-handle" d={`M${7 * s} -10L${21 * s} -30`} />
      <path className="probe-collar" d={`M${4 * s} -12L${10 * s} -8`} />
      <text className="probe-label" x={25 * s} y={-34} textAnchor={s > 0 ? 'start' : 'end'}>
        {color === 'red' ? '+' : 'COM'}
      </text>
      <circle className="probe-hit" cx={12 * s} cy={-16} r={16} />
    </g>
  );
}
