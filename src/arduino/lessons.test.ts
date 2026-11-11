/**
 * The Arduino lessons can be completed: like src/learn/lessons/lessons.test.ts,
 * but each sketch is really compiled and run on the emulated chip (so these
 * run with the other Arduino tests, after the simulator's speed checks).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { UNO } from '../model/parts';
import { play } from '../learn/lessons/harness';
import { isComplete } from '../learn/lessons/progress';
import { program, testToolkit } from './testKit';

beforeAll(async () => {
  await testToolkit();
}, 60_000);

const opts = { compile: program };

describe('Arduino lessons', () => {
  it('Meet the Arduino: Blink', async () => {
    const p = play('arduino-blink', opts);
    await p.upload();
    const [uno, r, led] = [p.find('arduino'), p.ref('R1'), p.find('led')];
    p.wire(uno, 13, r, 0);
    p.wire(r, 1, led, 0);
    p.wire(led, 1, uno, UNO.gnd2);
    p.wait(2.5);
    p.expectDone(['wire']);
    p.set(uno, { sketch: uno.sketch!.replaceAll('delay(1000)', 'delay(200)') });
    p.expectDone(['wire']); // not until it's uploaded
    await p.upload();
    p.wait(1);
    p.expectDone(['wire', 'faster']);
    p.set(uno, { sketch: p.find('arduino').sketch!.replaceAll('13', '8') });
    await p.upload();
    p.unwire(uno, 13, r, 0);
    p.wire(uno, 8, r, 0);
    p.wait(1);
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  }, 60_000);

  it('Reading a button', async () => {
    const p = play('arduino-button', opts);
    const [uno, btn] = [p.find('arduino'), p.find('pushbutton')];
    p.wire(btn, 0, uno, 2);
    p.wire(btn, 1, uno, UNO.gnd);
    p.expectDone(['wire']);
    await p.upload();
    p.wait(0.05);
    p.expectDone(['wire']);
    p.set(btn, { on: true });
    p.wait(0.05);
    p.expectDone(['wire', 'press']);
    p.set(btn, { on: false });
    p.wait(0.05);
    p.expectDone(['wire', 'press', 'release']);
    const swapped = p
      .find('arduino')
      .sketch!.replace('digitalWrite(13, HIGH)', '@')
      .replace('digitalWrite(13, LOW)', 'digitalWrite(13, HIGH)')
      .replace('@', 'digitalWrite(13, LOW)');
    p.set(uno, { sketch: swapped });
    await p.upload();
    p.wait(0.05);
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  }, 60_000);

  it('The serial monitor and analogRead', async () => {
    const p = play('arduino-serial', opts);
    const [uno, pot] = [p.find('arduino'), p.find('potentiometer')];
    p.wire(pot, 0, uno, UNO.v5);
    p.wire(pot, 1, uno, UNO.gnd);
    p.wire(pot, 2, uno, 14);
    p.expectDone(['wire']);
    await p.upload();
    p.wait(0.35);
    p.expectDone(['wire', 'monitor']);
    p.set(pot, { pos: 0 });
    p.wait(0.25);
    p.expectDone(['wire', 'monitor', 'top']);
    p.set(pot, { pos: 1 });
    p.wait(0.25);
    p.expectDone(['wire', 'monitor', 'top', 'bottom']);
    p.set(pot, { pos: 0.75 });
    p.wait(0.25);
    expect(p.serial(uno)).toMatch(/\b25\d\r\n$/);
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  }, 60_000);

  it('Project: a dimmer', async () => {
    const p = play('arduino-dimmer', opts);
    const [uno, pot, r, led] = [p.find('arduino'), p.find('potentiometer'), p.ref('R1'), p.find('led')];
    p.wire(pot, 0, uno, UNO.v5);
    p.wire(pot, 1, uno, UNO.gnd);
    p.wire(pot, 2, uno, 14);
    p.wire(uno, 9, r, 0);
    p.wire(r, 1, led, 0);
    p.wire(led, 1, uno, UNO.gnd2);
    await p.upload();
    p.wait(0.1);
    p.expectDone(['wire']); // the starter sketch doesn't write to the LED yet
    const sketch = p.find('arduino').sketch!;
    const at = sketch.lastIndexOf('}');
    p.set(uno, { sketch: sketch.slice(0, at) + '  analogWrite(9, knob / 4);\n' + sketch.slice(at) });
    await p.upload();
    p.wait(0.1);
    p.expectDone(['wire', 'code']);
    p.probe([uno, 9]);
    p.wait(0.3);
    p.expectDone(['wire', 'code', 'scope']);
    p.set(pot, { pos: 1 }); // wiper at 0 V
    p.wait(4.2); // the scope's readings cover the last 4 s
    p.expectDone(['wire', 'code', 'scope', 'off']);
    p.set(pot, { pos: 0 }); // wiper at 5 V
    p.wait(4.2);
    expect(isComplete(p.lesson, p.tick())).toBe(true);
  }, 60_000);
});
