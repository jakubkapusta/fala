// Persistence. Every read and write is wrapped: storage can be missing, full or blocked.

import type { TestSel } from './tuning';

/** a level: finished at least once, stars as a bit mask (goal i met → bit i), best score */
export type LevelRec = { done: boolean; stars: number; best: number };
/** a spot: its levels and the endless record */
export type SpotRec = { levels: LevelRec[]; best: number };
/** `test`: the M1 feel presets picked in the menu (older tempo-only picks are ignored on purpose).
 *  `best`: the best endless score anywhere (kept from M1–M3; spots keep their own). */
export type Meta = {
  v: 1; best: number; runs: number; shells: number; sound: boolean; test: Partial<TestSel> | null;
  spots: Record<string, SpotRec>;
  board: string; owned: string[]; suit: string; trail: string;
  /** the daily wave: one counted attempt per date */
  daily: { date: string; score: number } | null;
  lastSpot: string;
};
export type RideStat = { date: string; time: number; meters: number; score: number; wipes: number; tricks: number; tempo: number; test?: string; ride?: string };

const KEY_META = 'fala.meta.v1';
const KEY_STATS = 'fala.stats.v1';
const KEY_HINTS = 'fala.hints.v1';

function read<T>(key: string): T | null {
  try {
    const s = localStorage.getItem(key);
    return s ? (JSON.parse(s) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch { /* storage unavailable */ }
}

export function loadMeta(): Meta {
  const m = read<Partial<Meta>>(KEY_META);
  const spots = m?.spots ?? {};
  // rides before M4 were endless on the one wave there was: that record becomes Hawaje's
  if (!spots.hawaje && m?.best) spots.hawaje = { levels: [], best: m.best };
  return {
    v: 1, best: m?.best ?? 0, runs: m?.runs ?? 0, shells: m?.shells ?? 0, sound: m?.sound ?? true, test: m?.test ?? null,
    spots, board: m?.board ?? 'allround', owned: m?.owned ?? ['allround', 'black', 'foam'], suit: m?.suit ?? 'black', trail: m?.trail ?? 'foam',
    daily: m?.daily ?? null, lastSpot: m?.lastSpot ?? 'hawaje',
  };
}
export const saveMeta = (m: Meta) => write(KEY_META, m);

export function logRide(r: RideStat) {
  const list = read<RideStat[]>(KEY_STATS) ?? [];
  list.push(r);
  write(KEY_STATS, list.slice(-300));
}
export const loadStats = () => read<RideStat[]>(KEY_STATS) ?? [];

export function hintSeen(id: string) {
  return !!read<Record<string, boolean>>(KEY_HINTS)?.[id];
}
export function markHint(id: string) {
  const h = read<Record<string, boolean>>(KEY_HINTS) ?? {};
  h[id] = true;
  write(KEY_HINTS, h);
}

export const today = () => new Date().toISOString().slice(0, 10);
