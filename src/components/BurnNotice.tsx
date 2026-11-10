import { useState } from 'react';
import type { Part } from '../model/circuit';
import { explainBurn } from '../sim/explain';

/** Shown on the canvas the moment a part burns out: what happened, why, and how to fix it. */
export function BurnNotice({
  part,
  supply,
  onReplace,
  onDismiss,
}: {
  part: Part;
  supply: number;
  onReplace: () => void;
  onDismiss: () => void;
}) {
  const [showFix, setShowFix] = useState(false);
  if (!part.burn) return null;
  const ex = explainBurn(part, part.burn, supply);
  return (
    <div className="burn-notice" role="alert">
      <div className="bn-head">
        <svg className="bn-icon" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
          <path d="M10 2c1 3 4 4.5 4 8.5a4 4 0 0 1-8 0c0-1.6.7-2.8 1.6-3.7C8 8.5 8.8 9.4 9.6 9.8 9.4 7 9.3 4.5 10 2z" />
        </svg>
        <strong>{ex.headline}</strong>
        <button className="icon-x" aria-label="Dismiss" title="Dismiss" onClick={onDismiss}>
          ×
        </button>
      </div>
      <p>{ex.why}</p>
      {showFix && (
        <p className="bn-fix">
          <span className="bn-fix-label">How to fix it</span>
          {ex.fix}
        </p>
      )}
      <div className="bn-actions">
        <button className="btn" onClick={() => setShowFix((s) => !s)} aria-expanded={showFix}>
          {showFix ? 'Hide the fix' : 'How to fix it'}
        </button>
        <button className="btn primary" onClick={onReplace}>
          Replace {part.ref}
        </button>
      </div>
    </div>
  );
}
