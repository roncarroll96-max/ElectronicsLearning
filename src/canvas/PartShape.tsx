import type { PointerEvent as RPointerEvent } from 'react';
import { pinKey, type Part, type PinRef } from '../model/circuit';
import { PART_DEFS, formatValue, rotatePoint, rotatedBounds } from '../model/parts';
import type { View } from '../components/TopBar';
import { RealisticBody, SchematicBody } from './PartBodies';

interface Props {
  part: Part;
  view: View;
  selected: boolean;
  wireCount: Map<string, number>;
  targetKey: string | null;
  onPartDown: (e: RPointerEvent, part: Part) => void;
  onPinDown: (e: RPointerEvent, ref: PinRef) => void;
}

/** One part on the canvas: body, selection outline and connectable pins. */
export function PartShape({ part, view, selected, wireCount, targetKey, onPartDown, onPinDown }: Props) {
  const def = PART_DEFS[part.kind];
  const b = def.bounds;
  return (
    <g
      className={`part kind-${part.kind}${selected ? ' selected' : ''}`}
      transform={`translate(${part.x} ${part.y}) rotate(${part.rot})`}
      onPointerDown={(e) => onPartDown(e, part)}
    >
      <rect className="part-hit" x={b.x - 6} y={b.y - 6} width={b.w + 12} height={b.h + 12} rx="8" />
      {selected && <rect className="part-sel" x={b.x - 6} y={b.y - 6} width={b.w + 12} height={b.h + 12} rx="8" />}
      {view === 'schematic' ? <SchematicBody part={part} /> : <RealisticBody part={part} />}
      {def.pins.map((pin, i) => {
        const key = pinKey({ part: part.id, pin: i });
        const connected = (wireCount.get(key) ?? 0) > 0;
        return (
          <g key={i} className="pin" onPointerDown={(e) => onPinDown(e, { part: part.id, pin: i })}>
            <title>{`${part.ref || def.name}: ${pin.name}`}</title>
            <circle className="pin-hit" cx={pin.x} cy={pin.y} r="10" />
            <circle
              className={`pin-dot${connected ? ' connected' : ''}${targetKey === key ? ' target' : ''}`}
              cx={pin.x}
              cy={pin.y}
              r={targetKey === key ? 6 : connected ? 3 : 4}
            />
          </g>
        );
      })}
    </g>
  );
}

/** Polarity signs for the schematic symbols, positioned with the part but never rotated. */
const MARKS: Partial<Record<Part['kind'], { text: string; x: number; y: number }[]>> = {
  battery: [
    { text: '+', x: -16, y: -14 },
    { text: '−', x: 16, y: -14 },
  ],
  capacitor: [{ text: '+', x: -13, y: -14 }],
};

export function PartMarks({ part }: { part: Part }) {
  const marks = MARKS[part.kind];
  if (!marks) return null;
  return (
    <>
      {marks.map((m) => {
        const p = rotatePoint(m.x, m.y, part.rot);
        return (
          <text key={m.text} className="part-mark" x={part.x + p.x} y={part.y + p.y + 4.5} textAnchor="middle">
            {m.text}
          </text>
        );
      })}
    </>
  );
}

/** Reference and value text, kept upright whatever the part's rotation. */
export function PartLabel({ part }: { part: Part }) {
  if (part.kind === 'ground') return null;
  const def = PART_DEFS[part.kind];
  const rb = rotatedBounds(def.bounds, part.rot);
  const value = part.value !== undefined && def.unit ? formatValue(part.value, def.unit) : null;
  const horizontal = part.rot % 180 === 0;

  if (horizontal) {
    return (
      <text className="part-label" x={part.x + rb.x + rb.w / 2} y={part.y + rb.y - 8} textAnchor="middle">
        <tspan className="ref">{part.ref}</tspan>
        {value && <tspan dx="5">{value}</tspan>}
      </text>
    );
  }
  const x = part.x + rb.x + rb.w + 10;
  const cy = part.y + rb.y + rb.h / 2;
  return (
    <text className="part-label" x={x} y={value ? cy - 2 : cy + 4}>
      <tspan className="ref">{part.ref}</tspan>
      {value && (
        <tspan x={x} dy="14">
          {value}
        </tspan>
      )}
    </text>
  );
}
