/*
 * Electronics Tutorial: the audio thread.
 *
 * Plays two things, mixed:
 *  - A speaker's simulated waveform, which arrives in small chunks straight
 *    from the simulator's background thread (16,000 samples a second) and is
 *    stretched smoothly to the sound card's rate. A little is buffered first
 *    so it never stutters; if the simulator falls behind, it fades out rather
 *    than crackling, and fades back in once there's enough to play.
 *  - An active buzzer's tone: a real buzzer has its own oscillator (about
 *    2.4 kHz), so its sound is made here, louder with more current.
 *
 * Safety: the speaker signal has its steady (DC) part removed, as a real
 * speaker can't play it, and everything passes through a soft clipper, so the
 * output can never exceed a fixed level. The page adds a volume control and a
 * limiter after this.
 */

const BUFFER_S = 0.05; // start playing once 50 ms is waiting
const MAX_QUEUE_S = 0.25; // never fall more than 250 ms behind: drop the oldest instead
const BUZZ_HZ = 2400;

class SimAudio extends AudioWorkletProcessor {
  constructor() {
    super();
    this.inRate = 16000;
    this.ratio = this.inRate / sampleRate;
    this.chunks = [];
    this.queued = 0;
    this.index = 0; // position within the first chunk
    this.cur = 0;
    this.next = 0;
    this.frac = 0;
    this.playing = false;
    this.fade = 0; // speaker level, 0…1, eased to avoid clicks
    this.dcIn = 0;
    this.dcOut = 0;
    this.buzzTarget = 0;
    this.buzz = 0;
    this.phase = 0;
    this.port.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'input') {
        // The port the simulator's thread sends speaker chunks on.
        const input = e.ports[0];
        input.onmessage = (ev) => this.push(ev.data);
        if (m.rate) {
          this.inRate = m.rate;
          this.ratio = this.inRate / sampleRate;
        }
      } else if (m.type === 'buzz') {
        this.buzzTarget = Math.max(0, Math.min(1, m.level));
      }
    };
  }

  push(chunk) {
    if (!(chunk instanceof Float32Array) || chunk.length === 0) return;
    this.chunks.push(chunk);
    this.queued += chunk.length;
    // Too far behind (the page was busy, say): skip ahead to stay in time.
    const max = this.inRate * MAX_QUEUE_S;
    while (this.queued - this.index > max && this.chunks.length > 1) {
      const dropped = this.chunks.shift();
      this.queued -= dropped.length;
      this.index = 0;
    }
  }

  /** The next input sample, or null if none is waiting. */
  take() {
    while (this.chunks.length && this.index >= this.chunks[0].length) {
      this.queued -= this.chunks.shift().length;
      this.index = 0;
    }
    if (!this.chunks.length) return null;
    return this.chunks[0][this.index++];
  }

  process(_inputs, outputs) {
    const out = outputs[0][0];
    if (!out) return true;
    const waiting = this.queued - this.index;
    if (!this.playing && waiting >= this.inRate * BUFFER_S) this.playing = true;

    for (let i = 0; i < out.length; i++) {
      // Speaker: stretch 16 kHz samples to the sound card's rate (straight-line between samples).
      let x = 0;
      if (this.playing) {
        this.frac += this.ratio;
        while (this.frac >= 1) {
          this.frac -= 1;
          const s = this.take();
          if (s === null) {
            this.playing = false; // ran dry: fade out and wait for more
            break;
          }
          this.cur = this.next;
          this.next = s;
        }
        x = this.cur + (this.next - this.cur) * this.frac;
      } else {
        x = this.next;
      }
      this.fade += ((this.playing ? 1 : 0) - this.fade) * 0.004;
      // Remove the steady part (a speaker can't play DC): a gentle high-pass filter.
      const y = x - this.dcIn + 0.995 * this.dcOut;
      this.dcIn = x;
      this.dcOut = y;

      // Buzzer: a bright 2.4 kHz tone, eased in and out.
      this.buzz += (this.buzzTarget - this.buzz) * 0.003;
      let b = 0;
      if (this.buzz > 1e-4) {
        this.phase += BUZZ_HZ / sampleRate;
        if (this.phase >= 1) this.phase -= 1;
        const p = 2 * Math.PI * this.phase;
        b = (Math.sin(p) + Math.sin(3 * p) / 3 + Math.sin(5 * p) / 5) * 0.7;
      }

      // Mix, then soft-clip so nothing can exceed ±0.8.
      const mix = 0.9 * y * this.fade + 0.35 * this.buzz * b;
      out[i] = 0.8 * Math.tanh(mix / 0.8);
    }
    return true;
  }
}

registerProcessor('sim-audio', SimAudio);
