/**
 * The Arduino Uno's chip, an ATmega328P at 16 MHz, emulated instruction by
 * instruction by avr8js: the CPU, its three I/O ports, three timers (delay,
 * millis, analogWrite and tone use them), the ADC (analogRead), the serial
 * port and the EEPROM.
 *
 * The circuit simulator (transient.ts) drives it in lockstep: it runs the
 * program until the moment one of its pins changes what it does (goes high,
 * goes low, becomes an input), so the circuit can switch that pin at exactly
 * the right instant, to the clock cycle. Between those moments the circuit
 * tells it the voltage on each pin, which is what digitalRead and analogRead see.
 */
import {
  AVRADC,
  AVREEPROM,
  AVRIOPort,
  AVRTimer,
  AVRUSART,
  CPU,
  EEPROMMemoryBackend,
  PinState,
  adcConfig,
  avrInstruction,
  portBConfig,
  portCConfig,
  portDConfig,
  timer0Config,
  timer1Config,
  timer2Config,
  usart0Config,
} from 'avr8js';
import { ARDUINO } from '../sim/models';

/** What a pin is doing, set by the program. */
export type PinDrive = 'input' | 'pullup' | 'low' | 'high';

/** Arduino pin number → [port, bit]: D0–D7 are port D, D8–D13 port B, A0–A5 (14–19) port C. */
const PIN_MAP: [0 | 1 | 2, number][] = [
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((b) => [2, b] as [2, number]),
  ...[0, 1, 2, 3, 4, 5].map((b) => [0, b] as [0, number]),
  ...[0, 1, 2, 3, 4, 5].map((b) => [1, b] as [1, number]),
];

const DRIVE: Record<PinState, PinDrive> = {
  [PinState.Low]: 'low',
  [PinState.High]: 'high',
  [PinState.Input]: 'input',
  [PinState.InputPullUp]: 'pullup',
};

export const UNO_PINS = PIN_MAP.length;

export class UnoCore {
  /** The circuit time at which this chip's clock started (cycle 0). */
  private start: number;
  private cpu!: CPU;
  private ports!: AVRIOPort[];
  private adc!: AVRADC;
  private eeprom = new EEPROMMemoryBackend(1024);
  private changed = false;
  /** Input levels last given to each pin (as digitalRead sees them). */
  private inputs = new Array<boolean>(UNO_PINS).fill(false);
  /** What each pin is doing, as of the last change. */
  drives: PinDrive[] = new Array<PinDrive>(UNO_PINS).fill('input');
  /** Text the program has printed (Serial) and not yet collected. */
  private serial: number[] = [];
  /** Bytes sent over the serial port since the last look, for the TX light. */
  txCount = 0;
  /** Held in reset because its supply is too low. */
  private browned = false;

  constructor(
    readonly program: Uint8Array,
    time: number,
  ) {
    this.start = time;
    this.boot();
  }

  /** Power-on: a fresh chip running the program from the start (EEPROM keeps its contents, as on a real chip). */
  private boot() {
    const words = new Uint16Array(0x4000);
    words.set(new Uint16Array(this.program.buffer, this.program.byteOffset, Math.min(this.program.byteLength, 0x8000) >> 1));
    const cpu = new CPU(words);
    new AVRTimer(cpu, timer0Config);
    new AVRTimer(cpu, timer1Config);
    new AVRTimer(cpu, timer2Config);
    this.ports = [new AVRIOPort(cpu, portBConfig), new AVRIOPort(cpu, portCConfig), new AVRIOPort(cpu, portDConfig)];
    for (const p of this.ports) p.addListener(() => (this.changed = true));
    this.adc = new AVRADC(cpu, adcConfig);
    this.adc.avcc = ARDUINO.vcc;
    const usart = new AVRUSART(cpu, usart0Config, ARDUINO.clock);
    usart.onByteTransmit = (b) => {
      this.serial.push(b);
      this.txCount++;
    };
    new AVREEPROM(cpu, this.eeprom);
    this.cpu = cpu;
    this.drives = new Array<PinDrive>(UNO_PINS).fill('input');
    this.inputs.forEach((level, pin) => {
      const [port, bit] = PIN_MAP[pin];
      this.ports[port].setPin(bit, level);
    });
    this.changed = false;
  }

  /** Circuit time this chip has reached. */
  get time(): number {
    return this.start + this.cpu.cycles / ARDUINO.clock;
  }

  /** Press the reset button: the program starts again (time carries on). */
  reset(at: number) {
    this.start = at;
    this.boot();
  }

  /** What the pins are doing, read from the port registers. */
  private readDrives(): PinDrive[] {
    return PIN_MAP.map(([port, bit]) => DRIVE[this.ports[port].pinState(bit)]);
  }

  /**
   * The voltages on the pins (relative to its GND) and its supply voltage.
   * digitalRead sees HIGH or LOW with a little hysteresis; analogRead
   * measures A0–A5 against the supply, as the Uno's default reference does.
   */
  setVoltages(pinVolts: (pin: number) => number, vcc: number) {
    if (vcc < ARDUINO.brownOut) {
      if (!this.browned) {
        this.browned = true;
        this.drives = new Array<PinDrive>(UNO_PINS).fill('input');
      }
      return;
    }
    if (this.browned) {
      // Power is back: the brown-out detector releases reset and the program starts again.
      this.browned = false;
      this.reset(this.time);
      this.changed = true;
    }
    for (let pin = 0; pin < UNO_PINS; pin++) {
      const v = pinVolts(pin);
      const was = this.inputs[pin];
      const level = was ? v > ARDUINO.fall * vcc : v > ARDUINO.rise * vcc;
      if (level !== was) {
        this.inputs[pin] = level;
        const [port, bit] = PIN_MAP[pin];
        this.ports[port].setPin(bit, level);
      }
      if (pin >= 14) this.adc.channelValues[pin - 14] = v;
    }
    this.adc.avcc = vcc;
  }

  /** Held in reset by a low supply. */
  get poweredDown(): boolean {
    return this.browned;
  }

  /**
   * Runs until circuit time `until`, or until a pin changes what it's doing.
   * Returns true if it stopped for a change (its new drives are in `drives`);
   * `time` then says exactly when.
   */
  runUntil(until: number): boolean {
    const cpu = this.cpu;
    if (this.browned) {
      // No clock while held in reset: time passes without the program.
      this.start = Math.max(this.start, until - cpu.cycles / ARDUINO.clock);
      return false;
    }
    const target = Math.ceil((until - this.start) * ARDUINO.clock);
    if (this.changed) {
      // A change made before this run (power returning, reset): report it at once.
      this.changed = false;
      const d = this.readDrives();
      if (d.some((x, i) => x !== this.drives[i])) {
        this.drives = d;
        return true;
      }
    }
    while (cpu.cycles < target) {
      avrInstruction(cpu);
      cpu.tick();
      if (this.changed) {
        this.changed = false;
        const d = this.readDrives();
        if (d.some((x, i) => x !== this.drives[i])) {
          this.drives = d;
          return true;
        }
      }
    }
    return false;
  }

  /** Takes the text printed since the last call. */
  takeSerial(): string {
    if (!this.serial.length) return '';
    const s = String.fromCharCode(...this.serial);
    this.serial = [];
    return s;
  }
}
