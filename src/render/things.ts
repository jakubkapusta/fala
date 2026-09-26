// Things on the wave, drawn as stylized silhouettes with a rim of the light behind the wave
// (like the surfer): rocks at the foot of the wall, a floating log, a buoy, jellyfish, a dolphin
// seen through the water, pelicans over the crest, glowing shells. The other surfer goes into
// the surfer layer with the player (`drawRiders`).

import { glow, solid, type Col, type Shapes } from './shapes';
import type { Game } from '../game/game';
import type { Camera } from '../game/camera';
import type { Palette } from './daycycle';
import type { Thing } from '../game/things';
import { BAL } from '../game/balance';
import { drawSurfer } from './surfer';

export type Spr = (x: number, y: number, size: number, hard: number, r: number, g: number, b: number, a: number) => void;

const rimOf = (P: Palette, k = 1): Col => {
  const m = Math.max(P.back[0], P.back[1], P.back[2], 0.001), s = (Math.max(1.1, m) / m) * k;
  return solid(P.back[0] * s, P.back[1] * s, P.back[2] * s);
};
const litOf = (P: Palette) => Math.min(1, P.amb[0] * 0.3 + P.amb[1] * 0.5 + P.amb[2] * 0.2);

/** Round-ish blob as a polygon with seeded jitter (rocks). */
function blob(sh: Shapes, x: number, y: number, r: number, seed: number, c: Col, n = 9, flat = 0) {
  const e = sh.ey;
  let px = 0, py = 0;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const j = 0.62 + 0.55 * Math.abs(Math.sin(seed * 12.9898 + (i % n) * 78.233));
    let qx = x + Math.cos(a) * r * j, qy = y + (Math.sin(a) * r * j) / e;
    if (flat && qy < y - flat) qy = y - flat;
    if (i > 0) sh.tri(x, y, px, py, qx, qy, c);
    px = qx; py = qy;
  }
}

export function drawThings(sh: Shapes, spr: Spr, g: Game, cam: Camera, P: Palette, time: number) {
  const x0 = cam.x - cam.w / 2 - 80, x1 = cam.x + cam.w / 2 + 80;
  const px = 1 / cam.scale, e = cam.ey;
  const T = BAL.things;
  const lit = litOf(P), n = P.night;
  const RIM = rimOf(P), RIM2 = rimOf(P, 0.5);
  const INK = solid(0.012 + P.amb[0] * 0.03, 0.014 + P.amb[1] * 0.03, 0.02 + P.amb[2] * 0.035);
  for (const t of g.things.list) {
    if (t.x < x0 || t.x > x1) continue;
    const r = t.kind in T.r ? T.r[t.kind as keyof typeof T.r] : 20;
    const x = t.x, y = t.y;
    switch (t.kind) {
      case 'rock': {
        // dark basalt breaking the surface at the foot of the wall, foam washing round it
        blob(sh, x + 1.5 * px, y + 2 * px, r * 1.05 + 2 * px, t.phase, RIM2, 7, 0);
        blob(sh, x, y, r * 1.05, t.phase, solid(0.03 + 0.07 * lit, 0.03 + 0.065 * lit, 0.035 + 0.06 * lit), 7, 0);
        blob(sh, x + r * 0.45, y - (r * 0.1) / e, r * 0.6, t.phase + 5, solid(0.025 + 0.055 * lit, 0.025 + 0.05 * lit, 0.03 + 0.05 * lit), 6, 0);
        blob(sh, x - r * 0.25, y + (r * 0.25) / e, r * 0.5, t.phase + 3, solid(0.06 + 0.12 * lit, 0.06 + 0.11 * lit, 0.06 + 0.1 * lit), 6, 0);
        for (let i = 0; i < 5; i++) {
          const a = t.phase + i * 1.3 + time * 0.8;
          const fx = x + Math.cos(a) * r * 1.05, fy = Math.max(0, y - r * 0.55) + Math.sin(time * 3 + i) * 2;
          const f = 0.5 + 0.5 * Math.sin(time * 2 + i * 2.1);
          spr(fx, fy, 7 + 5 * f, 0, P.amb[0] * 0.5 * f + 0.05 * n, P.amb[1] * 0.5 * f + 0.35 * n * f, P.amb[2] * 0.5 * f + 0.8 * n * f, 0.5 * f * (1 - 0.6 * n));
        }
        break;
      }
      case 'log': {
        const a = 0.12 * Math.sin(t.phase + t.age * 1.1);
        const hx = Math.cos(a) * r * 1.9, hy = (Math.sin(a) * r * 1.9) / e;
        sh.taper(x - hx, y - hy, x + hx, y + hy, r * 1.2 + 3 * px, r * 1.1 + 3 * px, RIM2);
        sh.taper(x - hx, y - hy, x + hx, y + hy, r * 1.2, r * 1.1, solid(0.12 * lit + 0.02, 0.07 * lit + 0.015, 0.035 * lit + 0.01));
        sh.line(x - hx * 0.8, y - hy * 0.8 + (r * 0.15) / e, x + hx * 0.6, y + hy * 0.6 + (r * 0.15) / e, 1.2 * px, solid(0.2 * lit + 0.03, 0.13 * lit + 0.02, 0.07 * lit + 0.01, 0.8));
        sh.disk(x + hx, y + hy, r * 0.5, solid(0.3 * lit + 0.05, 0.22 * lit + 0.04, 0.12 * lit + 0.02), 10);
        break;
      }
      case 'buoy': {
        const bob = Math.sin(t.phase + t.age * 2.4) * 0.15;
        sh.disk(x, y, r + 2.5 * px, RIM2, 16);
        sh.disk(x, y, r, solid(0.75 * lit + 0.08, 0.16 * lit + 0.02, 0.05 * lit + 0.01), 16);
        sh.line(x - r * 0.95, y + (r * 0.1) / e, x + r * 0.95, y + (r * 0.1) / e, r * 0.35, solid(0.85 * lit + 0.1, 0.85 * lit + 0.1, 0.8 * lit + 0.1));
        const tx = x + Math.sin(bob) * r * 1.6, ty = y + (Math.cos(bob) * r * 1.6) / e;
        sh.line(x, y, tx, ty, 2 * px, INK);
        // a light on top, blinking (brighter at night)
        const on = Math.sin(time * 4 + t.phase) > 0.3 ? 1 : 0.15;
        spr(tx, ty, 6 + 8 * n, 0.4, 1.4 * on, 0.35 * on, 0.1 * on, 0);
        break;
      }
      case 'jelly': {
        const pulse = 0.85 + 0.15 * Math.sin(time * 3 + t.phase);
        const dome = r * pulse;
        const glowK = 0.35 + 0.9 * n;
        for (let i = 0; i < 4; i++) {
          const tx = x + (i - 1.5) * dome * 0.45;
          sh.line(tx, y, tx + Math.sin(time * 2 + i + t.phase) * dome * 0.3, y - (dome * 1.6) / e, 1.2 * px, glow(0.8, 0.35, 0.9, 0.35 * glowK));
        }
        spr(x, y, dome * 1.6, 0, 0.5 * glowK, 0.15 * glowK, 0.6 * glowK, 0);
        blob(sh, x, y, dome, 0, solid(0.9, 0.5, 0.95, 0.45), 10, dome * 0.1);
        spr(x, y + (dome * 0.2) / e, dome * 0.6, 0.3, 1.2 * glowK, 0.6 * glowK, 1.3 * glowK, 0);
        break;
      }
      case 'dolphin': {
        if (t.done) break;
        // seen through the water: a dark shape, tail beating
        const beat = Math.sin(time * 7 + t.phase);
        const L = 58;
        const a = 0.25 * Math.cos(t.phase + t.age * 2.2);
        const ca = Math.cos(a), sa = Math.sin(a);
        const pt = (u: number, v: number): [number, number] => [x + (ca * u - sa * v), y + (sa * u + ca * v) / e];
        const body: [number, number][] = [pt(L * 0.55, 0), pt(L * 0.35, 6), pt(0, 9), pt(-L * 0.3, 6), pt(-L * 0.5, 2), pt(-L * 0.5, -2), pt(-L * 0.3, -5), pt(0, -8), pt(L * 0.35, -5)];
        const DOL = solid(0.02 + 0.06 * lit, 0.05 + 0.1 * lit, 0.08 + 0.12 * lit, 0.75);
        for (let i = 1; i + 1 < body.length; i++) sh.tri(body[0][0], body[0][1], body[i][0], body[i][1], body[i + 1][0], body[i + 1][1], DOL);
        const f0 = pt(0, 8), f1 = pt(-L * 0.12, 20), f2 = pt(-L * 0.2, 7);
        sh.tri(f0[0], f0[1], f1[0], f1[1], f2[0], f2[1], DOL);
        const k0 = pt(-L * 0.48, 0), k1 = pt(-L * 0.68, 10 + beat * 6), k2 = pt(-L * 0.68, -10 + beat * 6);
        sh.tri(k0[0], k0[1], k1[0], k1[1], k2[0], k2[1], DOL);
        const hi = pt(L * 0.2, 5);
        sh.line(pt(L * 0.45, 3)[0], pt(L * 0.45, 3)[1], hi[0], hi[1], 1.5 * px, glow(P.back[0] * 0.4, P.back[1] * 0.4, P.back[2] * 0.4, 0.7));
        if (n > 0.05) spr(x, y, L * 0.8, 0, 0.03 * n, 0.25 * n, 0.6 * n, 0);
        break;
      }
      case 'pelican': {
        if (t.done) break;
        const flap = Math.sin(time * 5 + t.phase);
        const s = 20;
        const wx = s * 2.2, wy = (s * (0.2 + 0.9 * flap)) / e;
        const B = solid(0.03 + 0.12 * lit, 0.03 + 0.11 * lit, 0.035 + 0.1 * lit);
        for (const [c, g2] of [[RIM, 2.5 * px], [B, 0]] as [Col, number][]) {
          sh.taper(x, y, x - wx, y + wy, s * 0.5 + g2, s * 0.12 + g2, c);
          sh.taper(x, y, x + wx * 0.8, y + wy * 0.9, s * 0.5 + g2, s * 0.12 + g2, c);
          sh.taper(x - s * 0.9, y - (s * 0.1) / e, x + s * 0.8, y, s * 0.55 + g2, s * 0.4 + g2, c);
          sh.disk(x + s * 0.95, y + (s * 0.25) / e, s * 0.28 + g2 / 2, c, 10);
          sh.taper(x + s * 1.1, y + (s * 0.2) / e, x + s * 2, y - (s * 0.15) / e, s * 0.22 + g2, s * 0.06 + g2, c);
        }
        break;
      }
      case 'shell': {
        if (t.done) break;
        // a small golden scallop with a glow; it bobs and twinkles
        const tw = 0.75 + 0.25 * Math.sin(time * 5 + t.phase);
        const sy = y + Math.sin(time * 2.5 + t.phase) * 2;
        spr(x, sy, 14, 0, 0.7 * tw, 0.48 * tw, 0.18 * tw, 0);
        const c = solid(1.25, 0.95, 0.6);
        const R = 9;
        for (let i = 0; i < 5; i++) {
          const a0 = Math.PI * (0.1 + (i / 5) * 0.8), a1 = Math.PI * (0.1 + ((i + 1) / 5) * 0.8);
          sh.tri(x, sy - R * 0.45 / e, x + Math.cos(a0) * R, sy + (Math.sin(a0) * R - R * 0.45) / e, x + Math.cos(a1) * R, sy + (Math.sin(a1) * R - R * 0.45) / e, i % 2 ? c : solid(1, 0.72, 0.42));
        }
        break;
      }
      default:
        break;
    }
  }
}

/** Other surfers on the wave, in the surfer layer. */
export function drawRiders(fig: Shapes, g: Game, cam: Camera, P: Palette, time: number, lightX: number) {
  const x0 = cam.x - cam.w / 2 - 80, x1 = cam.x + cam.w / 2 + 80;
  for (const t of g.things.list) {
    if (t.kind !== 'rider' || t.x < x0 || t.x > x1) continue;
    const H = g.wave.H(t.x);
    const vy = 0.05 * 3 * Math.cos(t.phase + t.age * 3) * H;
    const knocked = t.done;
    drawSurfer(fig, {
      x: t.x, y: t.y, board: Math.atan2(vy, Math.max(t.vx, 1)), mode: knocked ? 'wipe' : 'ride',
      crouch: 0.5 - 0.5 * Math.sin(t.phase + t.age * 3), modeT: knocked ? Math.min(t.age % 1, 0.99) : 0,
    }, cam, P, time + t.phase, lightX, [0.85, 0.3, 0.22]);
  }
}
