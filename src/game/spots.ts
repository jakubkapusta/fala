// Spots and their levels. A spot changes the wave's character (BAL overrides) and its look
// (see `Look`, read by the renderer); each level adds its own overrides, a fixed seed, a length
// and three goals — the stars. Endless rides use the spot's overrides alone.
//
// Unlocking (owner's decision): levels in order; finishing level 5 opens the next spot; level 6
// (a harder bonus) needs `BONUS_STARS` of the 15 stars of levels 1–5.

import type { Game } from './game';
import { BAL } from './balance';

export type SpotId = 'hawaje' | 'bali' | 'islandia' | 'zatoka' | 'nazare';
type Over = Record<string, unknown>;

export type GoalKind = 'shells' | 'score' | 'perfect' | 'tricks' | 'airs' | 'spin' | 'tube' | 'exits' | 'nowipe' | 'dolphin' | 'pelican' | 'mult' | 'time';
export type Goal = { kind: GoalKind; n: number };

export type Level = { seed: number; meters: number; bal: Over; goals: Goal[] };

/** How a spot looks: tints on the day palette, clouds, land on the horizon, extras. */
export type Look = {
  /** multipliers on the water's deep colour and turquoise */
  deep: [number, number, number];
  scat: [number, number, number];
  /** multiplier on the sky, and extra cloud cover 0..1 */
  sky: [number, number, number];
  clouds: number;
  /** land on the horizon: height (share of the screen), roughness, which side (0..1 of the width) */
  land: { h: number; rough: number; from: number; to: number; peak?: number };
  aurora: number;
  reef: number;
};

export type Spot = {
  id: SpotId;
  name: string;
  blurb: string;
  /** time of day: a fixed phase, or the range a ride starts in */
  day: number | [number, number];
  bal: Over;
  look: Look;
  levels: Level[];
};

export const BONUS_STARS = 10;

const G = (spec: string): Goal[] => spec.split(' ').map((p) => {
  const [k, n] = p.split(':');
  return { kind: k as GoalKind, n: Number(n ?? 1) };
});
/** section kinds off (weight 0) for the early lessons */
const off = (...kinds: string[]) => ({ wave: Object.fromEntries(kinds.map((k) => [k, { weight: 0 }])) });
const noObstacles = { things: { obstacles: [0, 0] } };
const merge = (...o: Over[]): Over => {
  const out: Over = {};
  const put = (dst: Over, src: Over) => {
    for (const [k, v] of Object.entries(src)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) put((dst[k] ??= {}) as Over, v as Over);
      else dst[k] = v;
    }
  };
  for (const x of o) put(out, x);
  return out;
};

export const SPOTS: Spot[] = [
  {
    id: 'hawaje', name: 'Hawaje', blurb: 'Turkusowa woda i łagodne fale. Tu się uczysz.',
    day: [0.02, 0.14],
    bal: { wave: { open: { H: [180, 230] }, steep: { H: [230, 270] } }, things: { helpers: [0.22, 0.1] } },
    look: { deep: [0.9, 1.05, 1.1], scat: [0.9, 1.15, 1.1], sky: [1, 1, 1], clouds: 0, land: { h: 0.3, rough: 0.25, from: 0.55, to: 1, peak: 0.78 }, aurora: 0, reef: 0 },
    levels: [
      { seed: 101, meters: 800, bal: merge(merge(off('close', 'tube', 'steep'), noObstacles), { wave: { script: 'o o f o o o o o' } }), goals: G('shells:12 perfect:1 airs:3') },
      { seed: 102, meters: 950, bal: merge(merge(off('tube'), noObstacles), { wave: { script: 'o o c o o c o o' } }), goals: G('shells:18 spin:360 nowipe') },
      { seed: 103, meters: 1100, bal: merge(merge(off('tube'), { things: { mix: { log: 0, buoy: 0, rider: 0 } } }), { wave: { script: 'o o o c o s o o' } }), goals: G('tricks:3 shells:24 airs:5') },
      { seed: 104, meters: 1200, bal: merge({ wave: { tube: { weight: 2.5 } } }, { wave: { script: 'o o t o o t o c o' } }), goals: G('tube:2 exits:1 score:2500') },
      { seed: 105, meters: 1400, bal: merge({}, { wave: { script: 'o s o c o t o s o c o' } }), goals: G('perfect:4 shells:35 mult:3') },
      { seed: 106, meters: 1500, bal: merge({ wave: { diffStart: 0.35 } }, { wave: { script: 'o s t o c s t o c s o' } }), goals: G('perfect:5 exits:1 spin:540') },
    ],
  },
  {
    id: 'bali', name: 'Bali', blurb: 'Tuba za tubą nad płytką rafą. Zachody słońca.',
    day: [0.36, 0.46],
    bal: { wave: { diffStart: 0.08, tube: { weight: 3.5 }, steep: { weight: 2 } }, things: { mix: { rock: 5, log: 1, buoy: 0.5 } } },
    look: { deep: [1.1, 1.05, 0.95], scat: [1.05, 1.1, 0.9], sky: [1.05, 0.97, 0.9], clouds: 0.1, land: { h: 0.12, rough: 0.35, from: 0, to: 0.45, peak: 0.25 }, aurora: 0, reef: 1 },
    levels: [
      { seed: 201, meters: 900, bal: merge({ things: { obstacles: [0.05, 0.3] } }, { wave: { script: 'o t o o t o s o' } }), goals: G('tube:2 shells:18 perfect:2') },
      { seed: 202, meters: 1050, bal: merge({}, { wave: { script: 'o t o s t o f t o' } }), goals: G('exits:2 perfect:3 shells:24') },
      { seed: 203, meters: 1150, bal: merge({}, { wave: { script: 'o t s t o c t o' } }), goals: G('tube:4 tricks:3 mult:3') },
      { seed: 204, meters: 1250, bal: merge({}, { wave: { script: 'o s t o t s t c o' } }), goals: G('spin:360 exits:2 score:4000') },
      { seed: 205, meters: 1400, bal: merge({}, { wave: { script: 'o t s t c t s t o' } }), goals: G('tube:6 perfect:4 shells:35') },
      { seed: 206, meters: 1500, bal: merge({ wave: { diffStart: 0.35 } }, { wave: { script: 'o t c t s t c t s t o' } }), goals: G('tube:5 exits:3 score:6000') },
    ],
  },
  {
    id: 'islandia', name: 'Islandia', blurb: 'Zimna, ciemna woda i kra. W nocy zorza.',
    day: [0.55, 0.6],
    bal: { wave: { diffStart: 0.15, open: { H: [220, 270] }, close: { weight: 2 } }, things: { mix: { log: 0, buoy: 0, ice: 3.5, jelly: 0.5 } } },
    look: { deep: [0.75, 0.9, 1], scat: [0.6, 0.85, 0.95], sky: [0.85, 0.95, 1.1], clouds: 0.35, land: { h: 0.4, rough: 0.9, from: 0, to: 1, peak: 0.6 }, aurora: 1, reef: 0 },
    levels: [
      { seed: 301, meters: 900, bal: merge({}, { wave: { script: 'o o c o s o o' } }), goals: G('shells:16 perfect:2 airs:4') },
      { seed: 302, meters: 1050, bal: merge({}, { wave: { script: 'o s o c o s o' } }), goals: G('perfect:3 tricks:2 shells:22') },
      { seed: 303, meters: 1150, bal: merge({}, { wave: { script: 'o c o t s c o' } }), goals: G('spin:360 mult:3 score:3500') },
      { seed: 304, meters: 1250, bal: merge({}, { wave: { script: 'o t o c t s o c' } }), goals: G('tube:3 mult:3 shells:28') },
      { seed: 305, meters: 1400, bal: merge({}, { wave: { script: 'o c s c o t c s o' } }), goals: G('perfect:5 spin:540 score:5000') },
      { seed: 306, meters: 1550, bal: merge({ wave: { diffStart: 0.45 } }, { wave: { script: 'o c s t c s o c o' } }), goals: G('spin:540 tricks:5 shells:35') },
    ],
  },
  {
    id: 'zatoka', name: 'Zatoka', blurb: 'Zawsze noc. Woda świeci, meduzy też.',
    day: 0.76,
    bal: { wave: { diffStart: 0.2, open: { H: [185, 235] } }, things: { mix: { jelly: 6, rock: 1.5 }, helpers: [0.25, 0.14] } },
    look: { deep: [0.8, 0.9, 1.1], scat: [0.8, 1, 1.2], sky: [0.9, 0.95, 1.1], clouds: 0.05, land: { h: 0.14, rough: 0.5, from: 0.2, to: 0.8, peak: 0.5 }, aurora: 0, reef: 0.5 },
    levels: [
      { seed: 401, meters: 950, bal: merge({}, { wave: { script: 'o o f o t o o' } }), goals: G('shells:20 dolphin:1 perfect:2') },
      { seed: 402, meters: 1100, bal: merge({}, { wave: { script: 'o t o c o f o' } }), goals: G('nowipe tricks:3 shells:25') },
      { seed: 403, meters: 1200, bal: merge({}, { wave: { script: 'o t o t s o c' } }), goals: G('tube:3 airs:6 mult:3') },
      { seed: 404, meters: 1300, bal: merge({}, { wave: { script: 'o s t o c t o' } }), goals: G('spin:540 exits:2 score:4500') },
      { seed: 405, meters: 1450, bal: merge({}, { wave: { script: 'o t s c o t s o' } }), goals: G('perfect:5 shells:40 tricks:5') },
      { seed: 406, meters: 1600, bal: merge({ wave: { diffStart: 0.45 } }, { wave: { script: 'o t c s t c t s o' } }), goals: G('mult:4 tube:4 score:7000') },
    ],
  },
  {
    id: 'nazare', name: 'Nazaré', blurb: 'Gigantyczne fale pod klifem. Finał.',
    day: [0.3, 0.44],
    bal: { wave: { diffStart: 0.3, open: { H: [290, 360], vb: 360 }, steep: { H: [340, 400], weight: 2.5, vb: 380 }, close: { H: [300, 380], weight: 2.2, vb: 560 }, tube: { H: [320, 380], vb: 440 }, flat: { H: [200, 240], vb: 280 } }, things: { obstacles: [0.3, 1.2] } },
    look: { deep: [0.75, 0.82, 0.85], scat: [0.7, 0.85, 0.85], sky: [0.62, 0.66, 0.72], clouds: 0.85, land: { h: 0.5, rough: 0.35, from: 0.68, to: 1, peak: 0.95 }, aurora: 0, reef: 0 },
    levels: [
      { seed: 501, meters: 1000, bal: merge({}, { wave: { script: 'o s o c o s o' } }), goals: G('shells:20 nowipe perfect:2') },
      { seed: 502, meters: 1150, bal: merge({}, { wave: { script: 'o c s t o c s o' } }), goals: G('spin:360 tricks:3 score:4000') },
      { seed: 503, meters: 1250, bal: merge({}, { wave: { script: 'o s t c t o c' } }), goals: G('tube:2 mult:3 shells:30') },
      { seed: 504, meters: 1350, bal: merge({}, { wave: { script: 'o c s c t s c o' } }), goals: G('spin:540 perfect:4 nowipe') },
      { seed: 505, meters: 1500, bal: merge({}, { wave: { script: 'o s c t s c t c o' } }), goals: G('exits:2 score:7000 shells:40') },
      { seed: 506, meters: 1700, bal: merge({ wave: { diffStart: 0.5 } }, { wave: { script: 's c s t c s c t c s' } }), goals: G('exits:2 spin:720 score:9000') },
    ],
  },
];

export const spotById = (id: string) => SPOTS.find((s) => s.id === id) ?? SPOTS[0];

/** Is the goal met by this ride? (checked on the finish line) */
export function goalMet(q: Goal, g: Game): boolean {
  switch (q.kind) {
    case 'shells': return g.shells >= q.n;
    case 'score': return g.score >= q.n;
    case 'perfect': return g.perfects >= q.n;
    case 'tricks': return g.tricks >= q.n;
    case 'airs': return g.airs >= q.n;
    case 'spin': return g.bestHalfTurns * 180 >= q.n;
    case 'tube': return g.tubeTotal / BAL.tempo >= q.n;
    case 'exits': return g.tubes >= q.n;
    case 'nowipe': return g.wipes === 0;
    case 'dolphin': return g.dolphins >= q.n;
    case 'pelican': return g.pelicans >= q.n;
    case 'mult': return g.bestMult >= q.n;
    case 'time': return g.time / BAL.tempo <= q.n;
  }
}

/** Progress towards a goal right now, as text (for the HUD / pause), e.g. "12/20". */
export function goalProgress(q: Goal, g: Game): string {
  switch (q.kind) {
    case 'shells': return `${g.shells}/${q.n}`;
    case 'score': return `${g.score.toLocaleString('pl-PL')}/${q.n.toLocaleString('pl-PL')}`;
    case 'perfect': return `${g.perfects}/${q.n}`;
    case 'tricks': return `${g.tricks}/${q.n}`;
    case 'airs': return `${g.airs}/${q.n}`;
    case 'spin': return `${g.bestHalfTurns * 180}°/${q.n}°`;
    case 'tube': return `${(g.tubeTotal / BAL.tempo).toFixed(1).replace('.', ',')}/${q.n} s`;
    case 'exits': return `${g.tubes}/${q.n}`;
    case 'nowipe': return g.wipes === 0 ? 'na razie tak' : 'nie tym razem';
    case 'dolphin': return `${g.dolphins}/${q.n}`;
    case 'pelican': return `${g.pelicans}/${q.n}`;
    case 'mult': return `×${g.bestMult}/×${q.n}`;
    case 'time': return `${Math.floor(g.time / BAL.tempo)}/${q.n} s`;
  }
}

const plural = (n: number, one: string, few: string, many: string) =>
  n === 1 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many;

export function goalText(q: Goal): string {
  const n = q.n;
  switch (q.kind) {
    case 'shells': return `Zbierz ${n} ${plural(n, 'muszlę', 'muszle', 'muszli')}`;
    case 'score': return `Zdobądź ${n.toLocaleString('pl-PL')} punktów`;
    case 'perfect': return `${n} ${plural(n, 'idealne lądowanie', 'idealne lądowania', 'idealnych lądowań')}`;
    case 'tricks': return `${n} ${plural(n, 'trik', 'triki', 'trików')}`;
    case 'airs': return `${n} ${plural(n, 'wyskok', 'wyskoki', 'wyskoków')}`;
    case 'spin': return `Obrót o ${n}°`;
    case 'tube': return `${n} s w tubie`;
    case 'exits': return n === 1 ? 'Wyjedź z tuby' : `Wyjedź z tuby ${n} razy`;
    case 'nowipe': return 'Bez wywrotki';
    case 'dolphin': return 'Popłyń z delfinem';
    case 'pelican': return 'Odbij się od pelikana';
    case 'mult': return `Mnożnik ×${n}`;
    case 'time': return `Meta w ${n} s`;
  }
}
