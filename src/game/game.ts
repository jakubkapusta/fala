// Rules of one ride: the surfer on the face, in the air, wiping out, and the wave that
// hunts them. One input: `held`. Time here is *game* time (see BAL.tempo).

import { BAL, DEG } from './balance';
import { Wave } from './wave';
import { Things, type ThingKind } from './things';
import { clamp, smoothstep, wrapAngle } from '../core/math';

/** `done`: crossed a level's finish line (gliding on, out of reach of the wave) */
export type Mode = 'ride' | 'air' | 'wipe' | 'gone' | 'done';
export type LandQ = 'perfect' | 'clean';
export type WipeCause = 'land' | 'lip' | ThingKind;
export type GameEvent =
  | { t: 'launch' }
  | { t: 'land'; q: LandQ; halfTurns: number; pts: number; mult: number; trick: boolean }
  | { t: 'wipe'; cause: WipeCause }
  | { t: 'sting' }
  | { t: 'shell'; n: number }
  | { t: 'dolphin' }
  | { t: 'pelican'; pts: number }
  | { t: 'tubeIn' }
  | { t: 'tubeOut'; secs: number; pts: number }
  | { t: 'recover' }
  | { t: 'scrape' }
  | { t: 'gone' }
  | { t: 'finish' }
  | { t: 'storm' };

export class Game {
  wave: Wave;
  things: Things;
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
  /** remaining landing dive (game s) */
  diveT = 0;
  /** held in the last moments of a flight: the landing turns into a dive */
  armed = false;
  private heldPrev = false;
  /** time to touchdown when the dive was armed (game s) */
  armT = 0;

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
  shells = 0;
  stings = 0;
  dolphins = 0;
  pelicans = 0;
  /** in the barrel right now, game s spent in it this time, total, exits that counted */
  inTube = false;
  tubeT = 0;
  tubeTotal = 0;
  tubes = 0;
  private tubeAcc = 0;
  lastWipe: WipeCause | null = null;
  bestMult = 1;
  inStorm = false;
  /** a level's finish line (0 = endless) */
  readonly finishX: number;
  /** remaining slow motion (game s); main.ts scales time while it runs */
  slowT = 0;
  events: GameEvent[] = [];
  trail: { x: number; y: number }[] = [];

  constructor(readonly seed: number, finishMeters = 0) {
    this.wave = new Wave(seed);
    this.things = new Things(seed);
    const H = this.wave.H(0);
    this.x = this.x0 = BAL.start.lead * H;
    this.finishX = finishMeters > 0 ? this.x0 + finishMeters * BAL.unitsPerMeter : 0;
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
    if (this.mode === 'done') {
      // over the line: glide on across the face, the wave can't catch up any more
      this.v += (Math.max(this.v, this.wave.vb * 1.3) - this.v) * Math.min(1, dt);
      this.x += this.v * dt;
      const H = this.wave.H(this.x);
      this.y += (0.45 * H - this.y) * Math.min(1, dt * 2);
      this.th += (0 - this.th) * Math.min(1, dt * 3);
      this.ang = this.th;
      this.crouch += (0 - this.crouch) * Math.min(1, dt * 4);
      this.things.update(dt, this.wave, this.x, 9);
      return;
    }
    this.time += dt;
    this.crouch += ((held && this.mode === 'ride' ? 1 : 0) - this.crouch) * Math.min(1, dt * 10);
    if (this.mode === 'ride') this.ride(dt);
    else if (this.mode === 'air') this.fly(dt);
    else if (this.mode === 'wipe') this.tumble(dt);

    const w = this.wave;
    if (this.finishX && this.x >= this.finishX && (this.mode === 'ride' || this.mode === 'air')) {
      if (this.mode === 'air') { this.th = 0; this.y = Math.min(this.y, w.H(this.x)); }
      this.mode = 'done';
      this.modeT = 0;
      this.inTube = false;
      this.events.push({ t: 'finish' });
      return;
    }
    this.bestMult = Math.max(this.bestMult, this.mult);
    const storm = w.stormAt(this.x) > 0.5;
    if (storm && !this.inStorm) this.events.push({ t: 'storm' });
    this.inStorm = storm;
    this.things.update(dt, w, this.x, this.lead);
    this.touch(dt);
    this.tube(dt);
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
    const dropIn = this.time < BAL.start.dropIn || this.diveT > 0;
    this.diveT = Math.max(0, this.diveT - dt);
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
    this.armed = false;
    this.heldPrev = this.held;
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
    // time to touchdown (falling towards the crest line)
    const disc = this.vy * this.vy + 2 * A.g * Math.max(0, this.y - H);
    const tLand = this.vy < 0 ? (this.vy + Math.sqrt(disc)) / A.g : Infinity;
    // a fresh press just before touchdown arms the dive; the board keeps swinging to the landing
    // angle meanwhile. Holding a spin non-stop into the water keeps spinning (and may wipe you out).
    if (this.held && !this.heldPrev && tLand < BAL.land.armWindow) {
      this.armed = true;
      this.armT = tLand;
    }
    this.heldPrev = this.held;
    if (this.held && !this.armed) {
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
    // a plain hop (no input in the air) always lands, but is never "perfect"; a hop carried
    // straight into a dive (armed, board lined up) is
    // (only when the press came within `perfectWindow` of the touchdown)
    if (!this.heldInAir && !(this.armed && this.armT <= L.perfectWindow)) q = 'clean';
    if (this.armed && this.armT > L.perfectWindow && q === 'perfect' && !this.heldInAir) q = 'clean';
    if (!q) return this.wipeout();

    // the flight itself is free height, not free speed: a clean landing keeps (most of) the
    // take-off speed, only a perfect one adds to it
    this.v = q === 'perfect' ? this.launchV * L.perfectMul + L.perfectAdd : this.launchV * L.cleanKeep;
    // holding into the touchdown (the armed dive) carries the fall straight on down the face for
    // `dive` seconds, then control returns (release = bottom turn). Without it the board levels out.
    const flight = Math.atan2(this.vy, this.vx);
    if (this.armed || this.held) {
      this.th = clamp(flight, L.minHeading * DEG, L.maxHeading * DEG);
      this.diveT = L.dive;
    } else this.th = clamp(flight * 0.3, L.minHeading * DEG, 0);
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
  private wipeout(cause: WipeCause = 'land') {
    const W = BAL.wipe;
    if (this.mode === 'air') this.launchV = Math.max(this.launchV, this.v);
    else this.launchV = this.v;
    this.lastWipe = cause;
    this.mode = 'wipe';
    this.modeT = 0;
    this.v = this.launchV * W.keep;
    this.th = 0;
    this.mult = 1;
    this.wipes++;
    this.events.push({ t: 'wipe', cause });
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

  // ------------------------------------------------------------ things and the barrel
  /** Collisions with obstacles, helpers and shells. */
  private touch(dt: number) {
    if (this.mode === 'gone') return;
    const T = BAL.things, w = this.wave;
    for (const t of this.things.list) {
      if (t.done) continue;
      const dx = t.x - this.x;
      if (t.kind === 'dolphin') {
        // riding alongside a dolphin: it pushes the surfer on
        const R = T.dolphinRange * w.H(this.x);
        if (this.mode === 'ride' && Math.abs(dx) < R && Math.abs(t.y - this.y) < R) {
          if (t.used === 0) { this.dolphins++; this.events.push({ t: 'dolphin' }); }
          t.used += dt;
          this.v = Math.min(BAL.surf.maxSpeed, this.v + T.dolphinPush * dt);
          if (t.used >= T.dolphinTime) t.done = true;
        }
        continue;
      }
      const r = T.surferR + T.r[t.kind as keyof typeof T.r];
      if (Math.abs(dx) > r) continue;
      if (dx * dx + (t.y - this.y) * (t.y - this.y) > r * r) continue;
      switch (t.kind) {
        case 'shell':
          if (this.mode === 'wipe') break;
          t.done = true;
          this.shells++;
          this.events.push({ t: 'shell', n: this.shells });
          break;
        case 'pelican':
          if (this.mode !== 'air') break;
          // bounce off the bird: a second launch
          t.done = true;
          this.vy = Math.max(this.vy, T.pelicanVy);
          this.pelicans++;
          this.trickPts += T.pelicanPts * this.mult;
          this.events.push({ t: 'pelican', pts: T.pelicanPts * this.mult });
          break;
        case 'jelly':
          if (this.mode !== 'ride') break;
          t.done = true;
          this.v = Math.max(BAL.surf.minSpeed, this.v * T.stingKeep);
          this.stings++;
          this.events.push({ t: 'sting' });
          break;
        default:
          if (this.mode !== 'ride' && this.mode !== 'air') break;
          t.done = true;
          this.wipeout(t.kind);
      }
      if ((this.mode as Mode) === 'wipe') break;
    }
  }

  /** The barrel: a band to hold, points while inside, a bonus for riding out of it. */
  private tube(dt: number) {
    const T = BAL.tube, w = this.wave;
    const b = this.mode === 'ride' ? w.barrel(this.x) : 0;
    // the lip comes down gradually from the barrel's mouth: a surfer caught high has time to drop
    if (b > 0 && this.y / w.H(this.x) > this.ceiling(this.x) + T.hitMargin) {
      this.inTube = false;
      this.tubeT = 0;
      this.wipeout('lip');
      return;
    }
    const inside = b > 0.5;
    if (inside) {
      if (!this.inTube) this.events.push({ t: 'tubeIn' });
      this.inTube = true;
      this.tubeT += dt;
      this.tubeTotal += dt;
      this.tubeAcc += T.ptsPerSec * this.mult * dt;
      const whole = Math.floor(this.tubeAcc);
      this.trickPts += whole;
      this.tubeAcc -= whole;
      if (this.y / w.H(this.x) < T.lo) this.v = Math.max(BAL.surf.minSpeed, this.v - T.foamDrag * this.v * dt);
      return;
    }
    if (this.inTube) {
      this.inTube = false;
      if (this.mode === 'ride' && this.tubeT >= T.minTime && this.x > w.xb) {
        const pts = T.exit * this.mult;
        this.trickPts += pts;
        this.tubes++;
        this.mult = Math.min(BAL.score.multMax, this.mult + 1);
        this.events.push({ t: 'tubeOut', secs: this.tubeT, pts });
      }
      this.tubeT = 0;
    }
  }

  /** Lower edge of the lip at x as a share of the wall (1.1 = no lip). */
  ceiling(x: number) {
    return 1.1 + (BAL.tube.hi - 1.1) * this.wave.barrel(x);
  }

  /** The nearest obstacle within `within` game seconds ahead (by current speed). */
  obstacleAhead(within: number) {
    return this.things.obstacleAhead(this.x, within * Math.max(this.vxNow, 200));
  }

  /** Game seconds until the surfer reaches the next closeout (null if none soon or already inside). */
  closeAhead(within: number) {
    const s = this.wave.nextClose(this.x);
    if (!s || s.x0 <= this.x) return null;
    const t = (s.x0 - this.x) / Math.max(this.vxNow, 200);
    return t <= within ? t : null;
  }
}
