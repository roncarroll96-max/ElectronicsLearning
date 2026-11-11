/**
 * The background thread the live simulator runs in. The page sends it the
 * circuit and the controls; it steps the circuit in time, paced to the clock,
 * and posts back what the page needs about 60 times a second. A speaker's
 * sound goes straight to the audio thread through a port, never via the page.
 */
import type { Circuit, PinRef } from '../model/circuit';
import { LiveEngine, type Speed } from './live';

export type ToWorker =
  | { type: 'circuit'; circuit: Circuit | null; version: number; probes: [PinRef | null, PinRef | null]; restart: boolean }
  | { type: 'controls'; paused: boolean; speed: Speed; audio: boolean }
  | { type: 'audioPort'; port: MessagePort };

// The worker's own postMessage (typed by hand: the project's types describe a page, not a worker).
const post = (self as unknown as { postMessage(m: unknown, transfer: Transferable[]): void }).postMessage.bind(self);

const engine = new LiveEngine();
let audioPort: MessagePort | null = null;
/** A tick is already scheduled (by timer or by message): never run two loops at once. */
let pending = false;
let last = 0;
let lastFrame = 0;

/** How often to step when keeping up: every few ms keeps sound flowing in small chunks. */
const TICK_MS = 5;
/** Most computing per tick, ms. This thread has a processor core to itself, so it may work hard. */
const BUDGET_MS = 12;
// When behind, carry straight on: a message to ourselves runs at once (timers are held back to 4 ms or more).
const nudge = new MessageChannel();
nudge.port1.onmessage = () => tick();
/** How often to send the page a frame, ms. */
const FRAME_MS = 16;

function postFrame() {
  const f = engine.frame();
  if (!f) return;
  const transfer: Transferable[] = f.trace ? [f.trace.t.buffer, f.trace.a.buffer, f.trace.b.buffer] : [];
  post(f, transfer);
  lastFrame = performance.now();
}

function tick() {
  pending = false;
  const now = performance.now();
  const sound = engine.run((now - last) / 1000, BUDGET_MS);
  last = now;
  if (sound && sound.length && audioPort) audioPort.postMessage(sound, [sound.buffer]);
  if (now - lastFrame >= FRAME_MS || !engine.active) postFrame();
  if (!engine.active) return;
  pending = true;
  if (engine.behind) nudge.port2.postMessage(0);
  else setTimeout(tick, TICK_MS);
}

/** Starts the clock again after a change (or keeps it running). */
function kick() {
  postFrame();
  if (!pending && engine.active) {
    last = performance.now();
    pending = true;
    setTimeout(tick, TICK_MS);
  }
}

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  switch (m.type) {
    case 'circuit':
      engine.setCircuit(m.circuit, m.version, m.probes, m.restart);
      kick();
      break;
    case 'controls':
      engine.setControls(m.paused, m.speed, m.audio);
      kick();
      break;
    case 'audioPort':
      audioPort = m.port;
      break;
  }
};
