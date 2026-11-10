import { useState } from 'react';
import type { Circuit } from '../model/circuit';
import { whyThisValue } from '../learn/why';
import type { SimResult } from '../sim/simulate';

/** The "Why this value?" card for the selected part. */
export function WhyPanel({ circuit, sim, selection }: { circuit: Circuit; sim: SimResult; selection: string[] }) {
  const [showMath, setShowMath] = useState(false);
  const part = selection.length === 1 ? circuit.parts.find((p) => p.id === selection[0]) : undefined;

  if (!part) {
    return (
      <div className="callout">
        <span className="callout-label">Why this value?</span>
        <p>Select a part to see the job it does in your circuit, and how an engineer would choose its value.</p>
      </div>
    );
  }

  const why = whyThisValue(part, circuit, sim);
  return (
    <section className="callout why" aria-label="Why this value?">
      <span className="callout-label">Why this value?</span>
      <span className="why-role">{why.role}</span>
      <Section label="Goal" text={why.goal} />
      <Section label="Reasoning" text={why.reasoning} />
      {why.choice && <Section label="Choosing the value" text={why.choice} />}
      {why.yours && <Section label="In your circuit" text={why.yours} />}
      {why.math.length > 0 && (
        <>
          <button className="why-math-toggle" aria-expanded={showMath} onClick={() => setShowMath((s) => !s)}>
            {showMath ? 'Hide the math' : 'Show the math'}
          </button>
          {showMath && (
            <ol className="why-math">
              {why.math.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}

function Section({ label, text }: { label: string; text: string }) {
  return (
    <div className="why-section">
      <span className="why-label">{label}</span>
      <p>{text}</p>
    </div>
  );
}
