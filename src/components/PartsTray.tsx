import { useMemo, useState } from 'react';
import { PartIcon, type PartKind } from './PartIcon';

interface PartEntry {
  kind: PartKind;
  name: string;
  hint: string;
}

interface PartGroup {
  title: string;
  parts: PartEntry[];
}

// The milestone 1 parts list. Dragging onto the canvas arrives in step 2.
const GROUPS: PartGroup[] = [
  {
    title: 'Power',
    parts: [
      { kind: 'battery', name: 'Battery', hint: '9 V' },
      { kind: 'ground', name: 'Ground', hint: '0 V reference' },
    ],
  },
  {
    title: 'Passive',
    parts: [
      { kind: 'resistor', name: 'Resistor', hint: 'Limits current' },
      { kind: 'potentiometer', name: 'Potentiometer', hint: 'Adjustable' },
      { kind: 'capacitor', name: 'Capacitor', hint: 'Stores charge' },
      { kind: 'ldr', name: 'Light sensor', hint: 'Photoresistor' },
    ],
  },
  {
    title: 'Output',
    parts: [
      { kind: 'led', name: 'LED', hint: 'Lights up' },
      { kind: 'lamp', name: 'Lamp', hint: 'Incandescent' },
      { kind: 'buzzer', name: 'Buzzer', hint: 'Makes sound' },
    ],
  },
  {
    title: 'Control',
    parts: [
      { kind: 'switch', name: 'Switch', hint: 'On / off' },
      { kind: 'pushbutton', name: 'Push button', hint: 'Momentary' },
    ],
  },
  {
    title: 'Semiconductors',
    parts: [
      { kind: 'diode', name: 'Diode', hint: 'One-way valve' },
      { kind: 'npn', name: 'NPN transistor', hint: 'Switch, amplifier' },
    ],
  },
];

export function PartsTray() {
  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return GROUPS;
    return GROUPS.map((g) => ({
      ...g,
      parts: g.parts.filter((p) => `${p.name} ${p.hint}`.toLowerCase().includes(q)),
    })).filter((g) => g.parts.length > 0);
  }, [query]);

  return (
    <aside className="tray" aria-label="Parts">
      <div className="tray-head">
        <span className="panel-title">Parts</span>
        <input
          className="search"
          type="search"
          placeholder="Search parts"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="tray-body">
        {groups.map((g) => (
          <section key={g.title} className="tray-group">
            <h3 className="tray-group-title">{g.title}</h3>
            <ul className="tray-grid">
              {g.parts.map((p) => (
                <li key={p.kind}>
                  <button className="part-tile" title={`${p.name}: ${p.hint}`}>
                    <span className="part-icon">
                      <PartIcon kind={p.kind} />
                    </span>
                    <span className="part-name">{p.name}</span>
                    <span className="part-hint">{p.hint}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {groups.length === 0 && <p className="empty-note">No parts match “{query}”.</p>}
      </div>
    </aside>
  );
}
