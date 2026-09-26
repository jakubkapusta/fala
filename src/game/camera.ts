// Adaptive framing. Every frame we work out the world rectangle that must be visible
//   1. the whole wall plus room for the flight (apex predicted from the vertical speed),
//   2. `lookAhead` real seconds of travel in front of the surfer (more when a hazard is coming),
//   3. the break and a bit of foam behind the surfer (the chase),
// and pick the largest zoom that fits it. Spare width goes ahead of the surfer, spare height
// is split between sky and the water in front of the wave. Zoom and framing ease on a spring,
// but the camera follows the surfer's x rigidly (offsets are what springs), so nothing drifts.
// On tall (portrait) screens y is drawn stretched (`ey` > 1) so the wall isn't a thin strip.

import { BAL } from './balance';
import type { Game } from './game';
import { damp } from '../core/math';

export class Camera {
  /** world position of the screen centre */
  x = 0;
  y = 0;
  /** css px per world unit along x; along y it's scale·ey */
  scale = 1;
  /** vertical exaggeration (1 = none) */
  ey = 1;
  /** visible size in world units */
  w = 0;
  h = 0;
  private offX = 0;
  private offY = 0;
  private apex = 0;
  private speed = 0;
  private look = 0;
  private init = false;

  update(g: Game, cssW: number, cssH: number, dt: number, snap = false) {
    const C = BAL.cam, w = g.wave;
    const H0 = w.H(g.x);
    const vx = Math.max(g.vxNow, w.vb, 120);
    const k = snap || !this.init ? 1 : damp(C.spring, dt);
    this.speed += (vx - this.speed) * (snap || !this.init ? 1 : damp(1.5, dt));

    // predicted flight apex above the crest (wall heights), eased so the zoom breathes
    let apex = 0;
    if (g.mode === 'air') apex = Math.max(0, g.y + (g.vy > 0 ? (g.vy * g.vy) / (2 * BAL.air.g) : 0) - H0);
    this.apex += (apex - this.apex) * (apex > this.apex ? damp(6, dt) : damp(1.8, dt));

    const left = Math.max(Math.min(w.xb, g.x) - C.behind * H0, g.x - C.maxBehind * H0);
    // breathe out ahead of a hazard so there's time to see it coming
    const hazard = g.closeAhead(2.5 * BAL.tempo) !== null || w.sectionAt(g.x).kind === 'close' || g.obstacleAhead(1.6 * BAL.tempo) !== null;
    const look = hazard ? C.lookAheadHazard : C.lookAhead;
    this.look = this.init && !snap ? this.look + (look - this.look) * damp(1.2, dt) : look;
    const right = g.x + this.look * BAL.tempo * this.speed;
    let top = 0;
    for (let i = 0; i <= 8; i++) top = Math.max(top, w.H(left + ((right - left) * i) / 8));
    top = Math.max(top, g.y) + this.apex + C.above * H0;
    const bottom = -C.below * H0;

    const tall = Math.min(1, Math.max(0, (cssH / cssW - 1) / 1.1));
    const ey = 1 + (C.stretch - 1) * tall;
    this.ey += (ey - this.ey) * k;
    const needW = Math.max(right - left, C.minWide * H0 * (1 - tall)), needH = top - bottom;
    const scale = Math.min(cssW / needW, cssH / (needH * this.ey));
    const viewW = cssW / scale, viewH = cssH / (scale * this.ey);
    const cx = left + viewW / 2;
    const cy = bottom - (viewH - needH) * (1 - C.skyShare) + viewH / 2;

    const logS = Math.log(scale);
    this.scale = this.init && !snap ? Math.exp(Math.log(this.scale) + (logS - Math.log(this.scale)) * k) : scale;
    this.offX += (cx - g.x - this.offX) * k;
    this.offY += (cy - this.offY) * k;
    this.init = true;
    this.x = g.x + this.offX;
    this.y = this.offY;
    this.w = cssW / this.scale;
    this.h = cssH / (this.scale * this.ey);
  }
}
