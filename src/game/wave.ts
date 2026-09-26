// The endless wave: a chain of sections laid out along x, and the break point that runs
// through them. Everything left of the break is foam; the wall ahead of it has power that
// peaks in the pocket (just ahead of the break) and at mid height.

import { BAL } from './balance';
import { makeRng, type Rng } from '../core/rng';
import { clamp, smoothstep } from '../core/math';

export type SectionKind = 'open' | 'flat' | 'close';
export type Section = { kind: SectionKind; x0: number; x1: number; H: number; vb: number; power: number };

const AHEAD = 9000; // generate this far ahead of the break
const KEEP = 4000; // keep this much behind it

export class Wave {
  sections: Section[] = [];
  /** break position */
  xb = 0;
  /** current breaking speed */
  vb = 0;
  private rng: Rng;
  private genX = -2000;
  private made = 0;
  private hint = 0;

  constructor(seed: number) {
    this.rng = makeRng(seed ^ 0x5eed);
    this.ensure(AHEAD);
    this.vb = this.vbAt(this.xb);
  }

  /** 0..1 difficulty for a position (by how far the break has travelled). */
  difficulty(x: number) {
    return clamp(x / BAL.wave.rampLen, 0, 1);
  }

  private ensure(x: number) {
    while (this.genX < x) this.push();
  }

  private push() {
    const W = BAL.wave, r = this.rng;
    const d = this.difficulty(this.genX);
    let kind: SectionKind = 'open';
    if (this.made >= W.warmup) {
      const prev = this.sections[this.sections.length - 1];
      let sinceClose = Infinity;
      for (let i = this.sections.length - 1; i >= 0; i--) {
        if (this.sections[i].kind === 'close') { sinceClose = this.genX - this.sections[i].x1; break; }
      }
      const wOpen = W.open.weight, wFlat = prev?.kind === 'flat' ? 0 : W.flat.weight;
      const wClose = sinceClose < W.closeGap ? 0 : W.close.weight * (1 + d * W.closeRamp);
      const p = r() * (wOpen + wFlat + wClose);
      kind = p < wOpen ? 'open' : p < wOpen + wFlat ? 'flat' : 'close';
    }
    const k = W[kind];
    const len = r.range(k.len[0], k.len[1]);
    const s: Section = { kind, x0: this.genX, x1: this.genX + len, H: r.range(k.H[0], k.H[1]), vb: k.vb, power: k.power };
    this.sections.push(s);
    this.genX = s.x1;
    this.made++;
  }

  sectionAt(x: number): Section {
    const S = this.sections;
    let i = clamp(this.hint, 0, S.length - 1);
    while (i > 0 && x < S[i].x0) i--;
    while (i < S.length - 1 && x >= S[i].x1) i++;
    this.hint = i;
    return S[i];
  }

  private indexAt(x: number) {
    this.sectionAt(x);
    return this.hint;
  }

  /** Blend a per-section value across section boundaries. */
  private blended(x: number, f: (s: Section) => number) {
    const S = this.sections, i = this.indexAt(x), s = S[i], b = BAL.wave.blend;
    if (i > 0 && x < s.x0 + b / 2) {
      const t = smoothstep(s.x0 - b / 2, s.x0 + b / 2, x);
      return f(S[i - 1]) + (f(s) - f(S[i - 1])) * t;
    }
    if (i < S.length - 1 && x > s.x1 - b / 2) {
      const t = smoothstep(s.x1 - b / 2, s.x1 + b / 2, x);
      return f(s) + (f(S[i + 1]) - f(s)) * t;
    }
    return f(s);
  }

  /** Wall height (y of the crest) at x. */
  H(x: number) {
    return this.blended(x, (s) => s.H);
  }

  /** Crest slope dH/dx. */
  slope(x: number) {
    return (this.H(x + 8) - this.H(x - 8)) / 16;
  }

  vbAt(x: number) {
    return this.blended(x, (s) => s.vb) * (1 + this.difficulty(x) * BAL.wave.vbRamp);
  }

  /** 0..1+ pocket strength at x: proximity to the break × section power. Drives pumping. */
  pocket(x: number) {
    const S = BAL.surf;
    const d = (x - this.xb) / this.H(x);
    if (d < 0) return 0;
    return (1 - smoothstep(S.near, S.reach, d)) * this.blended(x, (s) => s.power);
  }

  /** Wave push at (x, y): pocket strength × a bump over the wall's height (weak at the very bottom). */
  power(x: number, y: number) {
    const S = BAL.surf;
    const h = clamp(y / this.H(x), 0, 1);
    const q = (h - S.peak) / S.width;
    return this.pocket(x) * (S.floor + (1 - S.floor) * Math.exp(-q * q));
  }

  /** 0..1, how much x belongs to a section of this kind (blended at the joins; for visuals). */
  kindAt(x: number, kind: SectionKind) {
    return this.blended(x, (s) => (s.kind === kind ? 1 : 0));
  }

  /** Is x inside foam (behind the break)? */
  foam(x: number) {
    return x < this.xb;
  }

  update(dt: number) {
    this.vb = this.vbAt(this.xb);
    this.xb += this.vb * dt;
    this.ensure(this.xb + AHEAD);
    let n = 0;
    while (n < this.sections.length - 2 && this.sections[n].x1 < this.xb - KEEP) n++;
    if (n > 0) {
      this.sections.splice(0, n);
      this.hint = Math.max(0, this.hint - n);
    }
  }

  /** The next closeout that starts after x (or null). */
  nextClose(x: number): Section | null {
    for (const s of this.sections) if (s.kind === 'close' && s.x1 > x) return s;
    return null;
  }
}
