// Progress rules on top of the saved meta: what is unlocked, stars, records, the shop, the daily
// wave. Pure functions of `Meta` (and the ride that just ended); saving is the caller's job.

import type { Game } from './game';
import { today, type LevelRec, type Meta, type SpotRec } from './save';
import { BONUS_STARS, SPOTS, goalMet, spotById, type Spot } from './spots';

export function spotRec(m: Meta, id: string): SpotRec {
  const r = (m.spots[id] ??= { levels: [], best: 0 });
  const n = spotById(id).levels.length;
  while (r.levels.length < n) r.levels.push({ done: false, stars: 0, best: 0 });
  return r;
}

export const starsOf = (l: LevelRec) => (l.stars & 1) + ((l.stars >> 1) & 1) + ((l.stars >> 2) & 1);

/** Stars of levels 1–5 (the ones that open the bonus level) or of all levels. */
export function spotStars(m: Meta, id: string, main = false) {
  const r = spotRec(m, id);
  return r.levels.slice(0, main ? 5 : undefined).reduce((a, l) => a + starsOf(l), 0);
}
export const totalStars = (m: Meta) => SPOTS.reduce((a, s) => a + spotStars(m, s.id), 0);

export function spotUnlocked(m: Meta, i: number) {
  return i === 0 || spotRec(m, SPOTS[i - 1].id).levels[4].done;
}

export function levelUnlocked(m: Meta, s: Spot, li: number) {
  const r = spotRec(m, s.id);
  if (li === 0) return true;
  if (li < 5) return r.levels[li - 1].done;
  return spotStars(m, s.id, true) >= BONUS_STARS;
}

/** A level ride ended: returns which goals were met (bit mask) and what changed. */
export function recordLevel(m: Meta, s: Spot, li: number, g: Game, finished: boolean) {
  const r = spotRec(m, s.id).levels[li];
  const wasDone = r.done, before = r.stars;
  let met = 0;
  if (finished) s.levels[li].goals.forEach((q, i) => { if (goalMet(q, g)) met |= 1 << i; });
  if (finished) {
    r.done = true;
    r.stars |= met;
    r.best = Math.max(r.best, g.score);
  }
  const si = SPOTS.indexOf(s);
  return {
    met,
    newStars: r.stars & ~before,
    firstFinish: finished && !wasDone,
    /** this finish opened the next spot */
    openedSpot: finished && !wasDone && li === 4 && si + 1 < SPOTS.length ? SPOTS[si + 1] : null,
    /** these stars opened the bonus level */
    openedBonus: spotStars(m, s.id, true) >= BONUS_STARS && spotStarsBefore(m, s, li, before) < BONUS_STARS,
  };
}
function spotStarsBefore(m: Meta, s: Spot, li: number, before: number) {
  const r = spotRec(m, s.id);
  return r.levels.slice(0, 5).reduce((a, l, i) => a + (i === li ? starsOf({ ...l, stars: before }) : starsOf(l)), 0);
}

export function buy(m: Meta, id: string, price: number) {
  if (m.owned.includes(id)) return true;
  if (m.shells < price) return false;
  m.shells -= price;
  m.owned.push(id);
  return true;
}

// ------------------------------------------------------------ the daily wave
/** Seed and spot of today's wave (the spot rotates through the unlocked ones). */
export function daily(m: Meta, date = today()) {
  let h = 2166136261;
  for (const c of date) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const seed = h >>> 0;
  const open = SPOTS.filter((_, i) => spotUnlocked(m, i));
  const day = Math.floor(Date.parse(date) / 86400000);
  return { seed, spot: open[day % open.length], counted: m.daily?.date !== date };
}
