// Things on the wave: obstacles (rocks at the foot of the wall, logs and buoys high on it,
// another surfer, jellyfish near the bottom), helpers (dolphins in the wall, pelicans over the
// crest) and shells laid out in lines and arcs that hint at a good line. Placed per section from
// the ride's seed as the wave generates ahead; helpers also turn up when the player struggles.
// Face things keep their height as a share of the wall (h = y/H), so they sit right on any wall.

import { BAL } from './balance';
import type { Section, Wave } from './wave';
import { makeRng, type Rng } from '../core/rng';
import { lerp } from '../core/math';

export type ThingKind = 'rock' | 'log' | 'buoy' | 'rider' | 'jelly' | 'dolphin' | 'pelican' | 'shell';
export const OBSTACLES: ThingKind[] = ['rock', 'log', 'buoy', 'rider', 'jelly'];

export type Thing = {
  kind: ThingKind;
  x: number;
  /** height as a share of the wall (pelicans and arc shells: above 1) */
  h: number;
  /** world y, refreshed every update */
  y: number;
  vx: number;
  /** visual phase / seed */
  phase: number;
  /** already hit / collected / used up */
  done: boolean;
  /** dolphin: game seconds of push given so far */
  used: number;
  age: number;
};

export class Things {
  list: Thing[] = [];
  private rng: Rng;
  private lastX0 = -Infinity;
  private nextHelp = 0;

  constructor(seed: number) {
    this.rng = makeRng(seed ^ 0x7417);
  }

  private pick<K extends string>(mix: Record<K, number>): K {
    const e = Object.entries(mix) as [K, number][];
    let p = this.rng() * e.reduce((a, q) => a + q[1], 0);
    for (const [k, w] of e) if ((p -= w) < 0) return k;
    return e[0][0];
  }

  private add(kind: ThingKind, x: number, h: number, vx = 0) {
    this.list.push({ kind, x, h, y: 0, vx, phase: this.rng() * 100, done: false, used: 0, age: 0 });
  }

  /** Place obstacles, helpers and shells on a freshly generated section. */
  private populate(s: Section, w: Wave) {
    const T = BAL.things, r = this.rng;
    const len = s.x1 - s.x0;
    const d = w.difficulty(s.x0);
    const lo = s.x0 + T.margin, hi = s.x1 - T.margin;
    if (hi <= lo) return;
    const count = (per1000: number) => {
      const m = (per1000 * len) / 1000;
      return Math.floor(m) + (r() < m - Math.floor(m) ? 1 : 0);
    };
    // no obstacles at the very start, in closeouts (they are hard enough) or inside barrels
    if (s.x0 >= T.clear && s.kind !== 'close' && s.kind !== 'tube') {
      const n = count(lerp(T.obstacles[0], T.obstacles[1], d));
      for (let i = 0; i < n; i++) {
        const k = this.pick(T.mix);
        const x = r.range(lo, hi);
        if (k === 'rock') this.add(k, x, r.range(0.03, 0.09));
        else if (k === 'jelly') this.add(k, x, r.range(0.04, 0.12));
        else if (k === 'log' || k === 'buoy') this.add(k, x, r.range(0.58, 0.84));
        else this.add(k, x, r() < 0.5 ? T.riderLow : T.riderHigh);
      }
    }
    if (s.x0 >= T.clear * 0.5) {
      const n = count(lerp(T.helpers[0], T.helpers[1], d));
      for (let i = 0; i < n; i++) this.helper(this.pick(T.helperMix), r.range(lo, hi));
    }
    // shells: a pumping line along the face, an arc over the crest (for airs), or a low line
    // through a barrel
    const groups = Math.round(r.range(T.shellGroups[0], T.shellGroups[1]));
    for (let gI = 0; gI < groups; gI++) {
      const n = Math.round(r.range(T.shellCount[0], T.shellCount[1]));
      const span = n * T.shellGap;
      if (hi - lo < span) break;
      const x0 = r.range(lo, hi - span);
      const kind = s.kind === 'tube' ? 'low' : s.kind !== 'flat' && r() < 0.35 ? 'arc' : 'wave';
      const ph = r() * 6;
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1);
        const h = kind === 'low' ? 0.3 + 0.06 * Math.sin(i * 0.8 + ph)
          : kind === 'arc' ? 1.12 + 0.45 * (1 - (2 * u - 1) * (2 * u - 1))
          : 0.42 + 0.26 * Math.sin(i * 0.5 + ph);
        this.add('shell', x0 + i * T.shellGap, h);
      }
    }
  }

  private helper(k: 'dolphin' | 'pelican', x: number) {
    if (k === 'dolphin') this.add(k, x, this.rng.range(0.3, 0.55), BAL.things.dolphinSpeed);
    else this.add(k, x, this.rng.range(1.15, 1.35), 60);
  }

  update(dt: number, w: Wave, px: number, lead: number) {
    const T = BAL.things;
    for (const s of w.sections) {
      if (s.x0 > this.lastX0) {
        this.populate(s, w);
        this.lastX0 = s.x0;
      }
    }
    // struggling close to the break: a dolphin shows up ahead now and then
    if (lead < T.lowLead && px > this.nextHelp && px > T.clear * 0.5) {
      this.nextHelp = px + T.struggleGap;
      this.helper('dolphin', px + w.H(px) * 2.2);
    }
    for (const t of this.list) {
      t.age += dt;
      if (t.kind === 'rider') t.vx = T.riderSpeed * w.vb;
      t.x += t.vx * dt;
      let h = t.h;
      if (t.kind === 'rider') h += 0.05 * Math.sin(t.phase + t.age * 3);
      else if (t.kind === 'dolphin') h += 0.08 * Math.sin(t.phase + t.age * 2.2);
      else if (t.kind === 'pelican') h += 0.04 * Math.sin(t.phase + t.age * 1.3);
      else if (t.kind === 'log' || t.kind === 'buoy') h += 0.015 * Math.sin(t.phase + t.age * 1.7);
      t.y = h * w.H(t.x);
    }
    // gone into the whitewater, or far behind
    this.list = this.list.filter((t) => t.x > w.xb - w.H(w.xb) * 1.5 && !(t.done && t.kind === 'shell'));
  }

  /** The nearest obstacle ahead of x (not yet hit) within `dist` units. */
  obstacleAhead(x: number, dist: number): Thing | null {
    let best: Thing | null = null;
    for (const t of this.list) {
      if (t.done || !OBSTACLES.includes(t.kind)) continue;
      const dx = t.x - x;
      if (dx < -10 || dx > dist) continue;
      if (!best || t.x < best.x) best = t;
    }
    return best;
  }
}
