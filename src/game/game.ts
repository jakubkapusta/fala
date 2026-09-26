// Rules of one ride: the surfer on the face, in the air, wiping out, and the wave that
// hunts them. One input: `held`. Time here is *game* time (see BAL.tempo).

import { BAL, DEG } from './balance';
import { Wave } from './wave';
import { clamp, smoothstep, wrapAngle } from '../core/math';

export type Mode = 'ride' | 'air' | 'wipe' | 'gone';
export type LandQ = 'perfect' | 'clean';
export type GameEvent =
  | { t: 'launch' }
  | { t: 'land'; q: LandQ; halfTurns: number; pts: number; mult: number; trick: boolean }
  | { t: 'wipe' }
  | { t: 'recover' }
  | { t: 'scrape' }
  | { t: 'gone' };

export class Game {
  wave: Wave;
  mode: Mode = 'ride';
  modeT = 0;
  time = 0;
  /** position: x along the wave, y up the wall (0 = trough, H = crest) */
  x: number;
  y: number;
  /** speed along the heading while riding */
  v: number;
  /** heading on the face (rad, + = up the wall) */
  th: number;
  /** flight velocity */
  vx = 0;
  vy = 0;
  /** board angle in the air / during a wipeout (rad) */
  ang = 0;
  held = false;
  /** 0..1 smoothed crouch for the pose */
  crouch = 0;

  // air bookkeeping
  rot = 0;
  heldInAir = false;
  apex = 0;
  airT = 0;
  launchV = 0;

  // score
  x0: number;
  trickPts = 0;
  mult = 1;
  wipes = 0;
  scrapes = 0;
  perfects = 0;
  airs = 0;
  tricks = 0;
  bestHalfTurns = 0;
  leadSum = 0;
  /** remaining slow motion (game s); main.ts scales time while it runs */
  slowT = 0;
  events: GameEvent[] = [];
  trail: { x: number; y: number }[] = [];

  constructor(readonly seed: number) {
    this.wave = new Wave(seed);
    const H = this.wave.H(0);
    this.x = this.x0 = BAL.start.lead * H;
    this.y = BAL.start.y * H;
    this.v = BAL.start.speed;
    this.th = BAL.surf.headDown * DEG * 0.6;
  }

  get meters() { return Math.max(0, (this.x - this.x0) / BAL.unitsPerMeter); }
  get score() { return Math.floor(this.meters) + this.trickPts; }
  /** distance ahead of the break, in wall heights */
  get lead() { return (this.x - this.wave.xb) / this.wave.H(this.wave.xb); }
  /** speed along x */
  get vxNow() {
    return this.mode === 'air' ? this.vx : this.mode === 'wipe' || this.mode === 'gone' ? this.v : this.v * Math.cos(this.th);
  }
  /** board angle for drawing */
  get board() { return this.mode === 'ride' ? this.th : this.ang; }

  update(dt: number, held: boolean) {
    this.held = held;
    this.modeT += dt;
    this.slowT = Math.max(0, this.slowT - dt);
    this.wave.update(dt);
    if (this.mode === 'gone') {
      this.x += this.v * 0.3 * dt;
      return;
    }
    this.time += dt;
    this.crouch += ((held && this.mode === 'ride' ? 1 : 0) - this.crouch) * Math.min(1, dt * 10);
    if (this.mode === 'ride') this.ride(dt);
    else if (this.mode === 'air') this.fly(dt);
    else if (this.mode === 'wipe') this.tumble(dt);

    const w = this.wave;
    this.leadSum += this.lead * dt;
    if (this.x < w.xb - BAL.swallow * w.H(w.xb)) {
      this.mode = 'gone';
      this.modeT = 0;
      this.events.push({ t: 'gone' });
    }
    const last = this.trail[this.trail.length - 1];
    if (!last || Math.abs(this.x - last.x) > 6) {
      this.trail.push({ x: this.x, y: this.y });
      if (this.trail.length > 160) this.trail.shift();
    }
  }

  // ------------------------------------------------------------ on the face
  private ride(dt: number) {
    const S = BAL.surf, w = this.wave;
    // the drop-in: the first moments ride down the face whatever the input
    const dropIn = this.time < BAL.start.dropIn;
    const target = (this.held || dropIn ? S.headDown : S.headUp) * DEG;
    const step = S.turn * DEG * dt;
    const th0 = this.th;
    this.th += clamp(target - this.th, -step, step);
    const turned = (this.th - th0) / (S.turn * DEG * dt); // -1..1: fraction of a full-rate turn

    const foam = w.foam(this.x);
    const pw = foam ? 0 : w.power(this.x, this.y);
    const pk = foam ? 0 : w.pocket(this.x);
    // the face is concave: towards the trough it flattens out, so a dive rounds off into the
    // flat instead of stabbing the bottom (sn = vertical share of the motion along the face)
    const h0 = this.y / w.H(this.x);
    const sth = Math.sin(this.th);
    const sn = sth < 0 ? sth * Math.max(S.flatMin, smoothstep(0, S.concave, h0)) : sth;
    // pumping: heavy on the way down, light on the way up (the face lifts the surfer)
    // (pressing only counts while the player is actually holding)
    const gMul = sn < 0 ? 1 + (this.held ? S.press * pk : 0) : 1 - S.lift * pk;
    let a = -S.g * sn * gMul + S.push * pw - S.dragK * this.v * this.v;
    // swing-like drive: pulling out of a dive low on the wall (bottom turn) or out of a climb
    // high on it (top turn). Only the part of the turn that still points down (up) counts, so a
    // full, committed pump pays and jittering the button in place doesn't.
    const h = this.y / w.H(this.x);
    const steep = Math.max(0, turned > 0 ? -sn : sn) / Math.sin(S.headUp * DEG);
    // the bottom turn pays best a little above the trough, not on it
    const bb = S.bottomBand;
    if (turned > 0) a += S.bottomDrive * pk * turned * steep * smoothstep(bb[0], bb[1], h) * smoothstep(bb[3], bb[2], h);
    else if (turned < 0) a -= S.topDrive * pk * turned * steep * smoothstep(S.topBand[0], S.topBand[1], h);
    // flat, slow water at the foot of the wave
    a -= S.bottomDrag * this.v * smoothstep(S.flatZone, 0, h0);
    if (foam) a -= S.foamDrag * this.v;
    this.v = clamp(this.v + a * dt, S.minSpeed, S.maxSpeed);

    this.x += this.v * Math.sqrt(1 - sn * sn) * dt;
    this.y += this.v * sn * dt;
    if (this.y <= 0) {
      this.y = 0;
      if (this.th < 0) {
        // dug into the flat water at the foot of the wave: lose speed, bounce back up
        if (-this.v * sn > S.scrapeVy) {
          this.v = Math.max(S.minSpeed, this.v * S.scrapeKeep);
          this.scrapes++;
          this.events.push({ t: 'scrape' });
        }
        this.th = S.headUp * DEG * S.scrapeBounce;
      }
    }
    const H = w.H(this.x);
    if (this.y >= H) {
      const vy = this.v * Math.sin(this.th);
      if (vy >= BAL.air.launchVy && !foam) this.launch(H);
      else {
        // not enough pop: roll over the top and stay on the lip
        this.y = H;
        this.th = Math.min(this.th, 0);
      }
    }
  }

  private launch(H: number) {
    const w = this.wave;
    // the lip throws harder in the pocket
    const pocket = w.pocket(this.x);
    this.launchV = this.v;
    this.vx = this.v * Math.cos(this.th);
    this.vy = this.v * Math.sin(this.th) + BAL.air.pop * pocket;
    this.ang = this.th;
    this.rot = 0;
    this.heldInAir = false;
    this.apex = 0;
    this.airT = 0;
    this.mode = 'air';
    this.modeT = 0;
    this.airs++;
    this.events.push({ t: 'launch' });
  }

  /** The board angle that lands perfectly right now. */
  refAngle() {
    const crest = Math.atan(this.wave.slope(this.x));
    const flight = Math.atan2(this.vy, this.vx);
    return crest + BAL.air.refMix * (flight - crest);
  }

  // ------------------------------------------------------------ in the air
  private fly(dt: number) {
    const A = BAL.air, w = this.wave;
    this.airT += dt;
    this.vy -= A.g * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    const H = w.H(this.x);
    this.apex = Math.max(this.apex, this.y - H);
    const a0 = this.ang;
    if (this.held) {
      this.ang -= A.spin * DEG * dt;
      this.heldInAir = true;
    } else {
      // let go and the board swings on to the landing angle by the shorter way: finish most of
      // a turn, release, and it completes itself
      this.ang += wrapAngle(this.refAngle() - this.ang) * (1 - Math.exp(-A.settle * dt));
    }
    this.rot += a0 - this.ang;
    if (this.y <= H && this.vy < 0) this.land(H);
  }

  private land(H: number) {
    const L = BAL.land, C = BAL.score;
    const diff = Math.abs(wrapAngle(this.ang - this.refAngle())) / DEG;
    const halfTurns = Math.floor((this.rot / DEG + 25) / 180);
    let q: LandQ | null = diff <= L.perfect ? 'perfect' : diff <= L.clean ? 'clean' : null;
    // a plain hop (no input in the air) always lands, but is never "perfect"
    if (!this.heldInAir) q = 'clean';
    if (!q) return this.wipeout();

    // the flight itself is free height, not free speed: a clean landing keeps (most of) the
    // take-off speed, only a perfect one adds to it
    this.v = q === 'perfect' ? this.launchV * L.perfectMul + L.perfectAdd : this.launchV * L.cleanKeep;
    // holding on touchdown carries the fall straight into a dive; otherwise the board levels out
    this.th = clamp(Math.atan2(this.vy, this.vx) * (this.held ? 1 : 0.3), L.minHeading * DEG, 0);
    this.y = H - 0.5;
    this.mode = 'ride';
    this.modeT = 0;

    const apexH = this.apex / H;
    const trick = halfTurns >= 2 || apexH >= C.bigAir;
    let pts = 0;
    if (trick || q === 'perfect') {
      pts = halfTurns * C.perHalfTurn + Math.round(this.apex * C.air) + (q === 'perfect' ? C.perfect : 0);
      pts *= this.mult;
      this.trickPts += pts;
    }
    const mult = this.mult;
    if (trick) {
      this.mult = Math.min(C.multMax, this.mult + 1);
      this.tricks++;
    }
    if (q === 'perfect') {
      this.perfects++;
      if (halfTurns >= BAL.slowmo.minTurns) this.slowT = BAL.slowmo.time;
    }
    this.bestHalfTurns = Math.max(this.bestHalfTurns, halfTurns);
    this.events.push({ t: 'land', q, halfTurns, pts, mult, trick });
  }

  // ------------------------------------------------------------ wipeout
  private wipeout() {
    const W = BAL.wipe;
    this.mode = 'wipe';
    this.modeT = 0;
    this.v = this.launchV * W.keep;
    this.th = 0;
    this.mult = 1;
    this.wipes++;
    this.events.push({ t: 'wipe' });
  }

  private tumble(dt: number) {
    const W = BAL.wipe, S = BAL.surf, w = this.wave;
    if (w.foam(this.x)) this.v = Math.max(0, this.v - S.foamDrag * this.v * dt);
    this.x += this.v * dt;
    const H = w.H(this.x);
    this.y += (W.sink * H - this.y) * (1 - Math.exp(-3 * dt));
    this.ang -= 9 * dt * Math.max(0, 1 - this.modeT / W.time);
    if (this.modeT >= W.time) {
      this.mode = 'ride';
      this.modeT = 0;
      this.th = 0;
      this.v = Math.max(this.v, S.minSpeed);
      this.events.push({ t: 'recover' });
    }
  }

  /** Game seconds until the surfer reaches the next closeout (null if none soon or already inside). */
  closeAhead(within: number) {
    const s = this.wave.nextClose(this.x);
    if (!s || s.x0 <= this.x) return null;
    const t = (s.x0 - this.x) / Math.max(this.vxNow, 200);
    return t <= within ? t : null;
  }
}
