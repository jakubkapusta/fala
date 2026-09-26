// All sound is synthesized with Web Audio (no files):
//   beds    — the wave (brown noise, swelling with wall height), the board's hiss (band-passed
//             noise with speed), the break rumbling behind (louder as it closes in); all through a
//             low-pass that muffles everything inside a barrel and opens on the way out;
//   one-offs — splash on a wipeout, scrape, a chord on a perfect landing, a pluck on a clean one,
//             shell pings climbing a pentatonic scale, a whoosh out of the tube, dolphin whistles,
//             gulls (short FM chirps, daytime);
//   music   — slow lo-fi pads that follow the time of day (brighter by day, minor at night).
// The context starts on the first user gesture (browsers require it).

import type { Game, GameEvent } from '../game/game';

const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);
// chords as MIDI notes: by day a warm major loop, at night a minor one
const DAY = [[48, 55, 59, 64, 67], [45, 52, 55, 60, 64], [41, 48, 52, 57, 64], [43, 50, 53, 59, 62]];
const NIGHT = [[45, 52, 55, 60, 64], [41, 48, 53, 57, 60], [43, 50, 55, 59, 62], [40, 47, 52, 55, 59]];

type Bed = { gain: GainNode; filt: BiquadFilterNode };

export class Sound {
  enabled = true;
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private amb!: GainNode;
  private muffle!: BiquadFilterNode;
  private music!: GainNode;
  private white!: AudioBuffer;
  private brown!: AudioBuffer;
  private wave!: Bed;
  private hiss!: Bed;
  private rumble!: Bed;
  private rain!: Bed;
  private chord = 0;
  private nextChord = 0;
  private nextGull = 4;
  private shellStreak = 0;
  private lastShell = 0;
  private t = 0;

  /** Call from a user gesture. Safe to call again. */
  start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 0.9 : 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 18000;
    this.muffle.connect(this.master);
    this.amb = ctx.createGain();
    this.amb.connect(this.muffle);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.muffle);
    this.music = ctx.createGain();
    this.music.gain.value = 0.5;
    this.music.connect(this.master);

    // noise buffers
    const len = ctx.sampleRate * 2;
    this.white = ctx.createBuffer(1, len, ctx.sampleRate);
    this.brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const w = this.white.getChannelData(0), b = this.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      w[i] = Math.random() * 2 - 1; // audio noise, not game logic
      last = (last + 0.02 * w[i]) / 1.02;
      b[i] = last * 3.5;
    }
    this.wave = this.bed(this.brown, 'lowpass', 520, 0.7);
    this.hiss = this.bed(this.white, 'bandpass', 3200, 0.9);
    this.rumble = this.bed(this.brown, 'lowpass', 150, 0.8);
    this.rain = this.bed(this.white, 'highpass', 1400, 0.5);
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  private bed(buf: AudioBuffer, type: BiquadFilterType, f: number, q: number): Bed {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const filt = ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.value = f;
    filt.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filt).connect(gain).connect(this.amb);
    src.start();
    return { gain, filt };
  }

  /** The page went to the background: stop making noise. */
  hidden(on: boolean) {
    if (!this.ctx) return;
    if (on) this.ctx.suspend().catch(() => {});
    else this.ctx.resume().catch(() => {});
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (this.ctx) this.master.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.05);
  }

  /** Pause / menu: quieter beds, no rider sounds. */
  update(g: Game | null, dt: number, phase: number, active: boolean, storm = 0, slow = 0) {
    const ctx = this.ctx;
    if (!ctx) return;
    this.t += dt;
    const now = ctx.currentTime, k = 0.12;
    const night = phaseNight(phase);
    if (g && g.mode !== 'gone') {
      const H = g.wave.H(g.x);
      const swell = 0.75 + 0.25 * Math.sin(this.t * 0.7);
      this.wave.gain.gain.setTargetAtTime((0.1 + 0.18 * (H / 260)) * swell * (active ? 1 : 0.5), now, 0.3);
      const riding = active && g.mode === 'ride';
      const v = Math.min(1, g.v / 800);
      this.hiss.gain.gain.setTargetAtTime(riding ? 0.03 + 0.16 * v * v * (0.7 + 0.5 * g.crouch) : 0, now, k);
      this.hiss.filt.frequency.setTargetAtTime(2400 + 2600 * v + 900 * g.crouch, now, k);
      const lead = g.lead;
      const close = Math.max(0, Math.min(1, (2.4 - lead) / 1.8));
      this.rumble.gain.gain.setTargetAtTime(active ? 0.06 + 0.5 * close * close : 0.03, now, 0.2);
      // inside a barrel everything is muffled; it opens up on the way out (slow motion: half way)
      this.muffle.frequency.setTargetAtTime(g.inTube ? 650 : slow > 0 ? 1600 : 18000, now, g.inTube || slow > 0 ? 0.15 : 0.08);
    } else {
      this.hiss.gain.gain.setTargetAtTime(0, now, k);
      this.rumble.gain.gain.setTargetAtTime(0.03, now, 0.3);
      this.wave.gain.gain.setTargetAtTime(0.12, now, 0.4);
      this.muffle.frequency.setTargetAtTime(18000, now, 0.1);
    }
    this.rain.gain.gain.setTargetAtTime(0.1 * storm, now, 0.8);
    // music: a chord every few seconds
    if (this.t >= this.nextChord) {
      this.nextChord = this.t + 7.5;
      const set = night > 0.5 ? NIGHT : DAY;
      this.pad(set[this.chord++ % set.length], night);
    }
    // gulls by day
    if (this.t >= this.nextGull) {
      this.nextGull = this.t + 7 + Math.random() * 12;
      if (night < 0.3) this.gull();
    }
  }

  events(evs: GameEvent[]) {
    if (!this.ctx) return;
    for (const e of evs) {
      switch (e.t) {
        case 'land':
          if (e.q === 'perfect') this.chordHit(e.halfTurns >= 2);
          else this.pluck(hz(72), 0.12);
          this.splash(0.18, 1800);
          break;
        case 'launch':
          this.whoosh(0.25, 900, 2400, 0.12);
          break;
        case 'wipe':
          this.splash(0.55, 3200);
          break;
        case 'scrape':
        case 'sting':
          this.splash(0.22, 900);
          break;
        case 'shell': {
          this.shellStreak = this.t - this.lastShell < 0.8 ? this.shellStreak + 1 : 0;
          this.lastShell = this.t;
          this.bell(hz(79 + PENTA[this.shellStreak % PENTA.length]), 0.08);
          break;
        }
        case 'tubeOut':
          this.whoosh(0.6, 400, 5000, 0.35);
          this.chordHit(true);
          break;
        case 'dolphin':
          this.whistle();
          break;
        case 'pelican':
          this.pluck(hz(55), 0.2);
          this.whoosh(0.3, 700, 2000, 0.15);
          break;
        case 'gone':
          this.whoosh(1.2, 2000, 200, 0.4);
          break;
      }
    }
  }

  /** Thunder: a crack, then a long low roll. */
  thunder(k: number) {
    if (!this.ctx) return;
    this.noise(0.25, 'bandpass', 2500, 600, 0.12 * k, 0.7);
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.brown;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    const now = ctx.currentTime;
    f.frequency.setValueAtTime(400, now);
    f.frequency.exponentialRampToValueAtTime(70, now + 3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.9 * k, now + 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 3.2);
    src.connect(f).connect(g).connect(this.amb);
    src.start(now, Math.random());
    src.stop(now + 3.3);
  }

  // ------------------------------------------------------------ voices
  private env(g: GainNode, peak: number, a: number, d: number) {
    const now = this.ctx!.currentTime;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(peak, now + a);
    g.gain.exponentialRampToValueAtTime(0.0001, now + a + d);
  }

  private osc(type: OscillatorType, f: number, peak: number, a: number, d: number, dest: AudioNode = this.sfx) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.value = f;
    o.connect(g).connect(dest);
    this.env(g, peak, a, d);
    o.start();
    o.stop(ctx.currentTime + a + d + 0.05);
    return o;
  }

  private noise(dur: number, type: BiquadFilterType, f0: number, f1: number, peak: number, q = 1) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.white;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    const now = ctx.currentTime;
    f.frequency.setValueAtTime(f0, now);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), now + dur);
    const g = ctx.createGain();
    src.connect(f).connect(g).connect(this.sfx);
    this.env(g, peak, Math.min(0.03, dur * 0.2), dur);
    src.start(now, Math.random());
    src.stop(now + dur + 0.1);
  }

  private splash(amt: number, f0: number) { this.noise(0.25 + amt, 'lowpass', f0, 250, amt); }
  private whoosh(dur: number, f0: number, f1: number, peak: number) { this.noise(dur, 'bandpass', f0, f1, peak, 1.4); }
  private pluck(f: number, peak: number) { this.osc('triangle', f, peak, 0.005, 0.35); }
  private bell(f: number, peak: number) {
    this.osc('sine', f, peak, 0.004, 0.5);
    this.osc('sine', f * 2.76, peak * 0.3, 0.004, 0.25);
  }

  private chordHit(big: boolean) {
    const root = 72;
    for (const [i, n] of [0, 4, 7, 12].entries()) {
      if (!big && i === 3) break;
      this.osc('triangle', hz(root + n), 0.07, 0.01 + i * 0.03, big ? 1.2 : 0.7);
    }
    this.bell(hz(root + 24), 0.05);
  }

  private whistle() {
    const ctx = this.ctx!;
    for (let i = 0; i < 2; i++) {
      const o = this.osc('sine', 1400, 0.05, 0.02, 0.28);
      const t = ctx.currentTime + i * 0.05;
      o.frequency.setValueAtTime(1300 + i * 200, t);
      o.frequency.linearRampToValueAtTime(2600 + i * 300, t + 0.15);
      o.frequency.linearRampToValueAtTime(1900, t + 0.28);
    }
  }

  /** A gull: a short FM chirp gliding down, two or three times. */
  private gull() {
    const ctx = this.ctx!;
    const n = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      const t = ctx.currentTime + i * 0.22;
      const car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
      car.type = 'sine';
      mod.frequency.value = 38;
      mg.gain.value = 260;
      mod.connect(mg).connect(car.frequency);
      car.frequency.setValueAtTime(1900, t);
      car.frequency.exponentialRampToValueAtTime(1150, t + 0.18);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.025, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      car.connect(g).connect(this.amb);
      car.start(t);
      mod.start(t);
      car.stop(t + 0.25);
      mod.stop(t + 0.25);
    }
  }

  /** A soft pad chord: detuned triangles through a low-pass, slow attack and release. */
  private pad(notes: number[], night: number) {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = night > 0.5 ? 700 : 1100;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.05, now + 2.2);
    g.gain.setValueAtTime(0.05, now + 6);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 10);
    f.connect(g).connect(this.music);
    for (const n of notes) {
      for (const det of [-6, 5]) {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = hz(n);
        o.detune.value = det;
        o.connect(f);
        o.start(now);
        o.stop(now + 10.2);
      }
    }
  }
}

function phaseNight(p: number) {
  const q = ((p % 1) + 1) % 1;
  return q > 0.6 && q < 0.93 ? 1 : 0;
}
