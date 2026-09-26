// A player model for the balance simulator. `skill` 0..1 scales reaction time, how tidy the
// pumping rhythm is, how often it tries spins and how precisely it stops them.

import { BAL, DEG } from '../game/balance';
import type { Game } from '../game/game';
import type { Rng } from '../core/rng';
import { lerp } from '../core/math';

const TAU = Math.PI * 2;

export class Bot {
  held = false;
  private t = 0;
  private next = 0;
  private react: number;
  private lo: number;
  private hi: number;
  private spinTarget = 0;
  private wasAir = false;
  private diveAfter = false;
  private goAir = false;
  private wasWipe = false;

  constructor(readonly skill: number, private rng: Rng) {
    this.react = lerp(0.24, 0.05, skill);
    // good players switch at about a third and two thirds of the wall and let the turn carry
    // them into a full pump; poor ones switch late and scrape the bottom / stall at the lip
    this.lo = lerp(0.15, 0.36, skill);
    this.hi = lerp(0.88, 0.64, skill);
  }

  step(g: Game, dt: number): boolean {
    this.t += dt;
    const air = g.mode === 'air';
    if (air && !this.wasAir) {
      this.goAir = false;
      this.planAir(g);
    }
    this.wasAir = air;
    const wipe = g.mode === 'wipe';
    // most players get ready to drop back down while climbing onto the board
    if (wipe && !this.wasWipe) this.diveAfter = this.rng() < 0.5 + this.skill / 2;
    this.wasWipe = wipe;
    if (this.t < this.next) return this.held;
    this.next = this.t + this.react * (0.6 + 0.8 * this.rng());
    const sloppy = (1 - this.skill) * 0.25;

    if (g.mode === 'ride') {
      const h = g.y / g.wave.H(g.x);
      if (this.held && h < this.lo + (this.rng() - 0.5) * sloppy) {
        this.held = false;
        // now and then ride all the way up and launch off the lip for a trick
        // (a player who has noticed a closeout coming keeps pumping instead)
        const closeout = g.closeAhead(3 * BAL.tempo) !== null || g.wave.sectionAt(g.x).kind === 'close';
        const careful = closeout && this.rng() < this.skill;
        this.goAir = !careful && g.v > 280 && this.rng() < 0.12 + 0.3 * this.skill;
      } else if (!this.held && h > (this.goAir ? 0.97 : this.hi + (this.rng() - 0.5) * sloppy)) this.held = true;
    } else if (air) {
      this.held = g.rot < this.spinTarget;
    } else if (g.mode === 'wipe') {
      // most players get ready to drop back down while climbing onto the board
      this.held = this.diveAfter;
    } else {
      this.held = false;
    }
    return this.held;
  }

  /** At take-off: decide how many full turns to try and when to stop spinning. */
  private planAir(g: Game) {
    this.spinTarget = 0;
    const A = BAL.air;
    const tAir = (2 * g.vy) / A.g;
    const flightLand = -Math.atan2(g.vy, g.vx);
    const ref = A.refMix * flightLand;
    let need = g.ang - ref;
    need = ((need % TAU) + TAU) % TAU;
    const spin = A.spin * DEG;
    let n = 0;
    while (n < 2 && (need + (n + 1) * TAU) / spin < tAir - this.react * 1.5) n++;
    if (n === 0 || this.rng() > this.skill * this.skill) return;
    if (n === 2 && this.rng() > this.skill) n = 1;
    const errDeg = lerp(30, 6, this.skill) * this.gauss();
    this.spinTarget = need + n * TAU + errDeg * DEG;
    this.held = true;
    this.next = this.t;
  }

  private gauss() {
    return (this.rng() + this.rng() + this.rng() - 1.5) * 1.41;
  }
}
