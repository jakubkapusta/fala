// Persistence. Every read and write is wrapped: storage can be missing, full or blocked.

import type { TestSel } from './tuning';

/** `test`: the M1 feel presets picked in the menu (older tempo-only picks are ignored on purpose) */
export type Meta = { v: 1; best: number; runs: number; test: Partial<TestSel> | null };
export type RideStat = { date: string; time: number; meters: number; score: number; wipes: number; tricks: number; tempo: number; test?: string };

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
  return { v: 1, best: m?.best ?? 0, runs: m?.runs ?? 0, test: m?.test ?? null };
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
