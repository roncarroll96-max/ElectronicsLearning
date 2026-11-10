/**
 * Schematic-style icons for the parts tray. Drawn on a 40x24 box with
 * currentColor so they follow the theme.
 */
export type PartKind =
  | 'battery'
  | 'resistor'
  | 'potentiometer'
  | 'led'
  | 'lamp'
  | 'switch'
  | 'pushbutton'
  | 'capacitor'
  | 'diode'
  | 'npn'
  | 'ldr'
  | 'buzzer'
  | 'wire'
  | 'ground';

const common = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function PartIcon({ kind }: { kind: PartKind }) {
  return (
    <svg viewBox="0 0 40 24" width="40" height="24" aria-hidden="true" {...common}>
      {paths(kind)}
    </svg>
  );
}

function paths(kind: PartKind) {
  switch (kind) {
    case 'battery':
      return (
        <>
          <path d="M2 12h14M24 12h14" />
          <path d="M16 5v14" />
          <path d="M20 8v8" strokeWidth={2.6} />
          <path d="M24 5v14" />
        </>
      );
    case 'resistor':
      return <path d="M2 12h8l2-5 3 10 3-10 3 10 3-10 3 10 2-5h9" />;
    case 'potentiometer':
      return (
        <>
          <path d="M2 14h8l2-5 3 10 3-10 3 10 3-10 3 10 2-5h9" />
          <path d="M20 2v6M17 5l3 3 3-3" />
        </>
      );
    case 'led':
      return (
        <>
          <path d="M2 12h12M26 12h12" />
          <path d="M14 5v14l12-7z" />
          <path d="M26 5v14" />
          <path d="M24 3l4-3M28 5l4-3" />
        </>
      );
    case 'lamp':
      return (
        <>
          <path d="M2 12h10M28 12h10" />
          <circle cx="20" cy="12" r="8" />
          <path d="M14.5 6.5l11 11M25.5 6.5l-11 11" />
        </>
      );
    case 'switch':
      return (
        <>
          <path d="M2 12h10M28 12h10" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="28" cy="12" r="1.6" />
          <path d="M13.5 11l13-6" />
        </>
      );
    case 'pushbutton':
      return (
        <>
          <path d="M2 16h10M28 16h10" />
          <circle cx="12" cy="16" r="1.6" />
          <circle cx="28" cy="16" r="1.6" />
          <path d="M11 10h18M20 10V3" />
        </>
      );
    case 'capacitor':
      return <path d="M2 12h15M23 12h15M17 4v16M23 4v16" />;
    case 'diode':
      return <path d="M2 12h12M26 12h12M14 5v14l12-7zM26 5v14" />;
    case 'npn':
      return (
        <>
          <circle cx="22" cy="12" r="10" />
          <path d="M2 12h16M18 6v12M18 9l9-6M18 15l9 6" />
          <path d="M23 18.5l4 2.5-1-4.5" />
        </>
      );
    case 'ldr':
      return (
        <>
          <path d="M2 14h8l2-5 3 10 3-10 3 10 3-10 3 10 2-5h9" />
          <path d="M9 2l5 5M15 1l5 5" />
        </>
      );
    case 'buzzer':
      return (
        <>
          <path d="M2 12h8M30 12h8" />
          <path d="M10 6h8v12h-8zM18 6l10-4v20l-10-4" />
        </>
      );
    case 'wire':
      return (
        <>
          <path d="M4 18c8 0 8-12 16-12s8 12 16 12" />
          <circle cx="4" cy="18" r="2" fill="currentColor" />
          <circle cx="36" cy="18" r="2" fill="currentColor" />
        </>
      );
    case 'ground':
      return <path d="M20 2v10M10 12h20M14 16h12M18 20h4" />;
  }
}
