import { describe, expect, it } from 'vitest';
import { LESSONS } from '../learn/lessons';
import { addPart, addWire, createPart, newId, updatePart, type Circuit } from './circuit';
import { checkCircuit, circuitToFile, fileNameFor, parseCircuitFile } from './circuitFile';

function sample(): Circuit {
  let c: Circuit = { parts: [], wires: [] };
  c = addPart(c, createPart('battery', 0, 80));
  c = addPart(c, { ...createPart('resistor', -100, -40), value: 470, rot: 90 });
  c = addPart(c, createPart('led', 60, -40));
  c = addPart(c, { ...createPart('potentiometer', 0, 0), pos: 0.3 });
  c = addPart(c, { ...createPart('switch', 0, 0), on: true });
  c = addPart(c, { ...createPart('ldr', 0, 0), light: 0.8 });
  const [b, r, l] = c.parts;
  c = addWire(c, newId('w'), { part: b.id, pin: 0 }, { part: r.id, pin: 0 });
  c = addWire(c, newId('w'), { part: r.id, pin: 1 }, { part: l.id, pin: 0 });
  c = addWire(c, newId('w'), { part: l.id, pin: 1 }, { part: b.id, pin: 1 });
  c = updatePart(c, l.id, { burn: { quantity: 'current', value: 0.07, limit: 0.03, v: [9, 0], i: [0.07, -0.07] } });
  return c;
}

const fileWith = (circuit: unknown, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ format: 'circuit-lab', version: 1, name: 'Test', savedAt: '2026-11-10T00:00:00Z', circuit, ...extra });

describe('circuit files', () => {
  it('export then import gives back the identical circuit', () => {
    const c = sample();
    const r = parseCircuitFile(circuitToFile(c, 'My LED'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.name).toBe('My LED');
    expect(r.value.circuit).toEqual(c);
  });

  it('every lesson’s starter circuit passes the checker unchanged', () => {
    for (const l of LESSONS) {
      if (!l.starter) continue;
      const c = l.starter();
      const r = checkCircuit(JSON.parse(JSON.stringify(c)));
      expect(r.ok, l.id).toBe(true);
      if (r.ok) expect(r.value, l.id).toEqual(c);
    }
  });

  it('refuses things that aren’t circuit files, with a plain reason', () => {
    expect(parseCircuitFile('hello')).toEqual({ ok: false, error: expect.stringContaining('isn’t a Circuit Lab file') });
    expect(parseCircuitFile('{"some":"json"}')).toEqual({ ok: false, error: expect.stringContaining('isn’t a Circuit Lab circuit file') });
    expect(parseCircuitFile(fileWith({ parts: [], wires: [] }, { version: 99 }))).toEqual({
      ok: false,
      error: expect.stringContaining('newer version'),
    });
  });

  it('refuses damaged circuits and says what’s wrong', () => {
    const c = sample();
    const damaged = (mutate: (x: any) => void) => {
      const x = JSON.parse(JSON.stringify(c));
      mutate(x);
      const r = parseCircuitFile(fileWith(x));
      expect(r.ok).toBe(false);
      return r.ok ? '' : r.error;
    };
    expect(damaged((x) => (x.wires[0].a.part = 'nope'))).toContain('doesn’t exist');
    expect(damaged((x) => (x.wires[0].b.pin = 7))).toContain('doesn’t exist');
    expect(damaged((x) => (x.parts[0].kind = 'flux-capacitor'))).toContain('unknown kind');
    expect(damaged((x) => (x.parts[1].x = 'left'))).toContain('position');
    expect(damaged((x) => (x.parts[1].rot = 45))).toContain('rotation');
    expect(damaged((x) => (x.parts[1].value = -5))).toContain('invalid value');
    expect(damaged((x) => (x.parts[2].id = x.parts[1].id))).toContain('share the id');
    expect(damaged((x) => (x.parts[1].id = '__meter'))).toContain('valid id');
    expect(damaged((x) => delete x.wires)).toContain('doesn’t contain a circuit');
    expect(damaged((x) => (x.wires[0].b = x.wires[0].a))).toContain('to itself');
  });

  it('tidies harmless oddities instead of refusing', () => {
    const x = JSON.parse(JSON.stringify(sample()));
    x.wires.push({ ...x.wires[0], id: 'dup' }); // the same wire twice
    x.parts[3].pos = 7; // out of range: clamped
    delete x.parts[1].ref; // missing name: given the next free one
    x.parts[2].burn = { quantity: 'melted' }; // unreadable burn: dropped
    const r = checkCircuit(x);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.wires).toHaveLength(3);
    expect(r.value.parts[3].pos).toBe(1);
    expect(r.value.parts[1].ref).toBe('R1'); // the only resistor
    expect(r.value.parts[2].burn).toBeUndefined();
  });

  it('makes safe file names', () => {
    expect(fileNameFor('My LED: v2/final?')).toBe('My LED v2final.circuit.json');
    expect(fileNameFor('   ')).toBe('circuit.circuit.json');
  });
});
