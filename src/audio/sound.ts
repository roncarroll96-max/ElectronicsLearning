/**
 * Sound: the audio graph and its controls.
 *
 *   audio thread (public/sim-audio-worklet.js: speaker + buzzer, soft-clipped)
 *     → volume (at most MAX_GAIN)
 *     → limiter (a fast, hard compressor)
 *     → the computer's speakers
 *
 * Sound is off on the first visit and the choice is remembered. Browsers only
 * let a page start sound in response to a click or key press, so if sound was
 * left on, it actually starts at the first click.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AUDIO_RATE } from '../sim/live';

const KEY = 'circuitlab.sound';
/** The loudest the volume slider goes: well below full scale. */
const MAX_GAIN = 0.5;

export interface SoundSettings {
  on: boolean;
  /** 0 … 1. */
  volume: number;
}

const DEFAULTS: SoundSettings = { on: false, volume: 0.6 };

function load(): SoundSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (raw && typeof raw === 'object') {
      return { on: raw.on === true, volume: typeof raw.volume === 'number' ? Math.min(1, Math.max(0, raw.volume)) : DEFAULTS.volume };
    }
  } catch {
    /* unreadable: use the defaults */
  }
  return DEFAULTS;
}

function save(s: SoundSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* not saved: still works for this visit */
  }
}

class SoundEngine {
  ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private gain: GainNode | null = null;
  private ready: Promise<MessagePort | null> | null = null;
  /** The buzzer level asked for, kept so it can be sent once the audio thread is ready. */
  private buzz = 0;

  /**
   * Starts sound (call from a click). Resolves to a port for the simulator's
   * thread to send speaker sound on (only the first time), or null.
   */
  start(volume: number): Promise<MessagePort | null> {
    if (this.ctx) {
      void this.ctx.resume();
      this.setVolume(volume);
      return Promise.resolve(null);
    }
    if (this.ready) return this.ready;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return Promise.resolve(null);
    const ctx = new Ctx();
    this.ctx = ctx;
    this.ready = ctx.audioWorklet
      .addModule(new URL('sim-audio-worklet.js', document.baseURI).href)
      .then(() => {
        const node = new AudioWorkletNode(ctx, 'sim-audio', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] });
        const gain = ctx.createGain();
        gain.gain.value = 0;
        const limiter = ctx.createDynamicsCompressor();
        limiter.threshold.value = -12;
        limiter.knee.value = 0;
        limiter.ratio.value = 20;
        limiter.attack.value = 0.002;
        limiter.release.value = 0.1;
        node.connect(gain).connect(limiter).connect(ctx.destination);
        this.node = node;
        this.gain = gain;
        this.setVolume(volume);
        this.setBuzz(this.buzz);
        // A private line from the simulator's thread straight to the audio thread.
        const channel = new MessageChannel();
        node.port.postMessage({ type: 'input', rate: AUDIO_RATE }, [channel.port1]);
        void ctx.resume();
        return channel.port2;
      })
      .catch(() => null);
    return this.ready;
  }

  setVolume(v: number) {
    if (this.ctx && this.gain) this.gain.gain.setTargetAtTime(v * MAX_GAIN, this.ctx.currentTime, 0.03);
  }

  stop() {
    if (this.ctx && this.gain) {
      this.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02);
      const ctx = this.ctx;
      window.setTimeout(() => void ctx.suspend(), 150);
    }
  }

  /** How loud the buzzer tone is, 0 … 1 (0 = silent). */
  setBuzz(level: number) {
    this.buzz = level;
    this.node?.port.postMessage({ type: 'buzz', level });
  }

  /** Playing right now (started, and not suspended by the browser). */
  get running(): boolean {
    return this.ctx?.state === 'running';
  }
}

const engine = new SoundEngine();

export interface Sound extends SoundSettings {
  toggle: () => void;
  setVolume: (v: number) => void;
  setBuzz: (level: number) => void;
  /** Sound is on but the browser is waiting for a click before it may play. */
  waiting: boolean;
}

/** `onPort` receives the port for the simulator's thread, once, when sound first starts. */
export function useSound(onPort: (port: MessagePort) => void): Sound {
  const [settings, setSettings] = useState<SoundSettings>(load);
  const [waiting, setWaiting] = useState(false);
  const portSink = useRef(onPort);
  portSink.current = onPort;

  const begin = useCallback((volume: number) => {
    // The port is handed over only once (engine.start gives it only the first time).
    void engine.start(volume).then((port) => {
      if (port) portSink.current(port);
      setWaiting(!engine.running);
    });
  }, []);

  useEffect(() => save(settings), [settings]);

  // Left on from last time: start at the first click or key press (browsers require one).
  useEffect(() => {
    if (!settings.on || engine.running) return;
    setWaiting(true);
    const go = () => begin(settings.volume);
    window.addEventListener('pointerdown', go, { once: true });
    window.addEventListener('keydown', go, { once: true });
    return () => {
      window.removeEventListener('pointerdown', go);
      window.removeEventListener('keydown', go);
    };
    // Only when switched on or off.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.on]);

  // Toggling must start sound right inside the click (browsers require it), so it acts on the current settings directly.
  const current = useRef(settings);
  current.current = settings;
  const toggle = useCallback(() => {
    const s = current.current;
    if (!s.on) begin(s.volume);
    else {
      engine.stop();
      setWaiting(false);
    }
    setSettings({ ...s, on: !s.on });
  }, [begin]);

  const setVolume = useCallback((volume: number) => {
    setSettings((s) => ({ ...s, volume }));
    engine.setVolume(volume);
  }, []);

  const setBuzz = useCallback((level: number) => engine.setBuzz(level), []);

  return { ...settings, toggle, setVolume, setBuzz, waiting: waiting && settings.on };
}
