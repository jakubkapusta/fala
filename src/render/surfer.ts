// The surfer: a stylized silhouette (dark wetsuit, lit board) with a rim of the light behind
// the wave. A small 2D skeleton posed from the game state — crouch when pumping down, tall on
// the climb, tucked with a rail grab in the air, a tumble on a wipeout — and a bit of balance sway.
// Built in unstretched screen proportions (units of the figure height S) and squashed by the
// view's vertical stretch `ey` when placed in the world.

import { solid, type Col, type Shapes } from './shapes';
import type { Game } from '../game/game';
import type { Camera } from '../game/camera';
import type { Palette } from './daycycle';
import { BAL } from '../game/balance';
import { clamp } from '../core/math';

type V = [number, number];
type Part = { a: V; b: V; wa: number; wb: number; frame: number } | { disk: V; r: number; frame: number };

const polar = (o: V, a: number, l: number): V => [o[0] + Math.cos(a) * l, o[1] + Math.sin(a) * l];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Two-bone IK: the joint between a and b for bones l1, l2; side ±1 picks the bend (+1 = left of a→b). */
function ik(a: V, b: V, l1: number, l2: number, side: number): V {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const d = Math.hypot(dx, dy) || 1e-6;
  const dd = Math.min(d, (l1 + l2) * 0.999);
  const x = (l1 * l1 - l2 * l2 + dd * dd) / (2 * dd);
  const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  const ux = dx / d, uy = dy / d;
  return [a[0] + ux * x - uy * h * side, a[1] + uy * x + ux * h * side];
}

// board outline (u along the board, v up; deck at v = 0) and the fin
// a shortboard a bit longer than the surfer is tall, with nose rocker
const BOARD = [-0.52, -0.075, -0.2, -0.092, 0.25, -0.086, 0.5, -0.052, 0.64, 0.03, 0.5, 0.012, 0.2, 0, -0.2, 0, -0.52, -0.01];
const FIN = [-0.47, -0.078, -0.35, -0.086, -0.45, -0.18];

/** What the figure needs to know: the player's Game, or another surfer on the wave. */
export type Pose = Pick<Game, 'x' | 'y' | 'board' | 'mode' | 'crouch' | 'modeT'>;

export function drawSurfer(sh: Shapes, g: Pose, cam: Camera, P: Palette, time: number, lightX: number, deckCol: [number, number, number] = [0.86, 0.74, 0.55], boardLen = 1, suit: [number, number, number] = [0.012, 0.014, 0.02]) {
  const px = 1 / cam.scale;
  const S = Math.max(40, BAL.cam.minSurferPx * px); // figure height in x-units
  const e = cam.ey;
  const wipe = g.mode === 'wipe' || g.mode === 'gone';

  // frames: 0 = the board (and a riding body), 1 = a tumbling body during a wipeout
  const bAng = Math.atan2(Math.sin(g.board) * e, Math.cos(g.board));
  const ox = g.x, oy = g.y + (S * 0.05) / e;
  const frames: [number, number, number][] = [[ox, oy, wipe ? bAng * 1.4 + 0.8 : bAng]];
  const parts: Part[] = [];

  if (g.mode !== 'gone') {
    const air = g.mode === 'air';
    let c = air ? 0.8 : g.crouch;
    const lean = air ? 1.05 : 0.28 + 0.5 * c;
    const hipH = air ? 0.24 : lerp(0.41, 0.27, c);
    let fB: V = [-0.21, 0], fF: V = [0.17, 0];
    let hip: V = [0.02 * c, hipH];
    const body = wipe ? 1 : 0;
    let armF: V, armB: V;
    const sw = Math.sin(time * 2.3), sw2 = Math.sin(time * 1.9 + 1);
    if (wipe) {
      // thrown off the board: the body spins away, limbs flailing
      const k = g.modeT / BAL.wipe.time;
      frames.push([ox - S * 0.2 * k, oy + (S * 0.25 * Math.sin(Math.PI * Math.min(1, k))) / e, -g.modeT * 7 + 0.6]);
      c = 0.4;
      hip = [0, 0];
      fF = polar(hip, -Math.PI / 2 + 0.7 + 0.5 * Math.sin(time * 11), 0.45);
      fB = polar(hip, -Math.PI / 2 - 0.7 + 0.5 * Math.sin(time * 9 + 2), 0.45);
    }
    const kneeF = ik(hip, fF, 0.25, 0.25, 1), kneeB = ik(hip, fB, 0.25, 0.25, wipe ? -1 : 1);
    const td: V = [Math.sin(lean), Math.cos(lean)];
    const chest: V = [hip[0] + td[0] * 0.31, hip[1] + td[1] * 0.31];
    const head: V = [chest[0] + Math.sin(lean * 0.7) * 0.14, chest[1] + Math.cos(lean * 0.7) * 0.14];
    const sh0: V = [chest[0] - td[0] * 0.03, chest[1] - td[1] * 0.03];
    if (wipe) {
      armF = polar(sh0, 0.8 + Math.sin(time * 13) * 0.9, 0.3);
      armB = polar(sh0, Math.PI - 0.6 + Math.sin(time * 12 + 1) * 0.9, 0.3);
    } else if (air) {
      // grab the rail by the front foot, the other arm up for style
      armF = [0.13, 0.02];
      armB = polar(sh0, Math.PI * 0.72 + 0.15 * sw, 0.3);
    } else {
      // arms out for balance: the front one low and forward, the back one trailing
      armF = polar(sh0, -0.2 - 0.4 * c + 0.16 * sw, 0.29);
      armB = polar(sh0, Math.PI + 0.35 - 0.25 * c + 0.14 * sw2, 0.27);
    }
    const elF = ik(sh0, armF, 0.16, 0.16, -1), elB = ik(sh0, armB, 0.16, 0.16, 1);
    // back to front
    parts.push({ a: sh0, b: elB, wa: 0.07, wb: 0.058, frame: body }, { a: elB, b: armB, wa: 0.058, wb: 0.048, frame: body });
    parts.push({ a: hip, b: kneeB, wa: 0.11, wb: 0.085, frame: body }, { a: kneeB, b: fB, wa: 0.085, wb: 0.06, frame: body });
    parts.push({ a: hip, b: chest, wa: 0.15, wb: 0.17, frame: body });
    parts.push({ a: hip, b: kneeF, wa: 0.11, wb: 0.085, frame: body }, { a: kneeF, b: fF, wa: 0.085, wb: 0.06, frame: body });
    parts.push({ disk: head, r: 0.088, frame: body });
    parts.push({ a: sh0, b: elF, wa: 0.07, wb: 0.058, frame: body }, { a: elF, b: armF, wa: 0.058, wb: 0.048, frame: body });
  }

  const toW = (f: number, p: V): V => {
    const [fx, fy, a] = frames[f];
    const cs = Math.cos(a), sn = Math.sin(a);
    return [fx + (cs * p[0] - sn * p[1]) * S, fy + ((sn * p[0] + cs * p[1]) * S) / e];
  };
  const polyW = (pts: number[], dx: number, dy: number) => {
    const out: number[] = [];
    for (let i = 0; i < pts.length; i += 2) {
      const w = toW(0, [pts[i] * boardLen, pts[i + 1]]);
      out.push(w[0] + dx, w[1] + dy);
    }
    return out;
  };

  // rim light from whatever is behind the wave, on the side facing it, never too dim to read
  const rl = Math.max(P.back[0], P.back[1], P.back[2], 0.001);
  const rs = Math.max(1.2, rl) / rl;
  const RIM = solid(P.back[0] * rs, P.back[1] * rs, P.back[2] * rs);
  const EDGE = solid(P.back[0] * rs * 0.35, P.back[1] * rs * 0.35, P.back[2] * rs * 0.35);
  const sx = (g.x - cam.x) / cam.w + 0.5;
  let lx = clamp((lightX - sx) * 3, -1, 1), ly = 0.8;
  const ll = Math.hypot(lx, ly);
  lx /= ll; ly /= ll;
  const rim = S * 0.05;
  const lum = P.amb[0] * 0.3 + P.amb[1] * 0.5 + P.amb[2] * 0.2;
  const INK = solid(suit[0] + P.amb[0] * 0.02, suit[1] + P.amb[1] * 0.02, suit[2] + P.amb[2] * 0.025);
  const lit = 0.3 + 0.7 * Math.min(1, lum);
  const DECK = solid(deckCol[0] * lit, deckCol[1] * lit, deckCol[2] * lit);
  const RAIL = solid(0.5 * lit, 0.4 * lit, 0.3 * lit);

  const drawParts = (grow: number, dx: number, dy: number, col: Col) => {
    for (const p of parts) {
      if ('disk' in p) {
        const w = toW(p.frame, p.disk);
        sh.disk(w[0] + dx, w[1] + dy, p.r * S + grow / 2, col, 14);
      } else {
        const a = toW(p.frame, p.a), b = toW(p.frame, p.b);
        sh.taper(a[0] + dx, a[1] + dy, b[0] + dx, b[1] + dy, p.wa * S + grow, p.wb * S + grow, col);
      }
    }
  };
  const ox2 = lx * rim * 0.6, oy2 = (ly * rim * 0.6) / e;
  // a faint outline all round, then the lit edge, then the silhouette
  drawParts(rim * 0.8, 0, 0, EDGE);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) sh.poly(polyW(BOARD, dx * rim * 0.4, (dy * rim * 0.4) / e), EDGE);
  drawParts(rim, ox2, oy2, RIM);
  sh.poly(polyW(BOARD, ox2 * 1.5, oy2 * 1.5), RIM);
  sh.poly(polyW(FIN, 0, 0), INK);
  sh.poly(polyW(BOARD, 0, 0), RAIL);
  // deck: the top two thirds of the board's thickness
  const deck = [-0.51, -0.034, -0.2, -0.04, 0.25, -0.036, 0.5, -0.012, 0.62, 0.026, 0.5, 0.012, 0.2, 0, -0.2, 0, -0.51, -0.01];
  sh.poly(polyW(deck, 0, 0), DECK);
  drawParts(0, 0, 0, INK);
}
