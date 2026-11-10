import { describe, expect, it } from 'vitest';
import { formatValue } from './parts';

describe('formatValue', () => {
  it('writes values the way they are printed on real parts', () => {
    expect(formatValue(330, 'Ω')).toBe('330 Ω');
    expect(formatValue(4700, 'Ω')).toBe('4.7 kΩ');
    expect(formatValue(10e-6, 'F')).toBe('10 µF');
    expect(formatValue(100e-9, 'F')).toBe('100 nF');
    // Capacitors are never labelled in millifarads.
    expect(formatValue(1000e-6, 'F')).toBe('1000 µF');
    expect(formatValue(4700e-6, 'F')).toBe('4700 µF');
  });
});
