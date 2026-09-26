// Headless balance simulator: plays whole rides with the bot and prints how long they last.
//
//   npm run sim                         # 200 rides, skills 0.2 / 0.5 / 0.9 + a mixed band
//   npm run sim -- --runs 400 --skill 0.6
//   npm run sim -- --trace 7 --skill 0.5  # one ride, a line per second
//   npm run sim -- --pump                 # steady speed of pumping rhythms vs mashing / no input
//   BAL='{"surf":{"push":300}}' npm run sim   # try knob values from src/game/balance.ts

import { BAL, resetBal, tuneBal } from '../src/game/balance';
import { SPOTS, goalMet, goalText, spotById } from '../src/game/spots';
import { Game } from '../src/game/game';
import { makeRng } from '../src/core/rng';
import { Bot } from '../src/sim/bot';

const DT = 1 / 60;
const LIMIT = 900; // real seconds before we stop a ride

function arg(name: string, def: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

const envBal = process.env.BAL ? JSON.parse(process.env.BAL) : null;
if (envBal) tuneBal(envBal);
// --spot bali: endless rides with that spot's character
const spotArg = (() => { const i = process.argv.indexOf('--spot'); return i >= 0 ? process.argv[i + 1] : ''; })();
if (spotArg) { resetBal(); tuneBal(spotById(spotArg).bal); if (envBal) tuneBal(envBal); }

type Ride = {
  skill: number; time: number; meters: number; score: number; wipes: number; airs: number; tricks: number; perfects: number;
  lead: number; speed: number; air: number; scrapes: number; window: number; cycle: number; night: boolean; closeDeath: boolean; wipeDeath: boolean; closes: number; closesPassed: number;
  causes: Record<string, number>; tubeT: number; tubes: number; shells: number; dolphins: number; pelicans: number; stings: number;
};

/** Degenerate inputs that must never beat real pumping (exploit guard). */
const POLICIES: Record<string, (t: number) => boolean> = {
  'no input': () => false,
  'always hold': () => true,
  'mash 8 Hz': (t) => Math.floor(t * 16) % 2 === 0,
  'mash 3 Hz': (t) => Math.floor(t * 6) % 2 === 0,
};

function ride(seed: number, skill: number, trace = false, policy?: (t: number) => boolean): Ride {
  const g = new Game(seed);
  const bot = new Bot(skill, makeRng(seed ^ 0xb07));
  const input = () => (policy ? policy(g.time / BAL.tempo) : bot.step(g, DT));
  const tempo = BAL.tempo;
  let lastWipe = -99, airT = 0, launch = -1, t13 = 0, lastDive = 0;
  const causes: Record<string, number> = {};
  const wins: number[] = [], cycles: number[] = [];
  let prevHeld = false;
  let closes = 0, closesPassed = 0, inClose = false, sec = 0;
  for (let t = 0; t < LIMIT * tempo; t += DT) {
    g.update(DT, input());
    for (const e of g.events) {
      if (e.t === 'wipe') { lastWipe = g.time; causes[e.cause] = (causes[e.cause] ?? 0) + 1; }
      if (e.t === 'launch') launch = g.time;
      if ((e.t === 'land' || e.t === 'wipe') && launch >= 0) { airT += g.time - launch; launch = -1; }
    }
    g.events.length = 0;
    if (g.mode === 'ride') {
      // reaction window: from passing a third of the wall on the way down to the trough
      const h = g.y / g.wave.H(g.x);
      if (g.th < 0 && h < 0.34 && h > 0.3 && !t13) t13 = g.time;
      if (t13 && h <= 0.001) { wins.push(g.time - t13); t13 = 0; }
      if (g.th >= 0) t13 = 0;
      if (g.held && !prevHeld) { if (lastDive) cycles.push(g.time - lastDive); lastDive = g.time; }
    } else lastDive = 0;
    prevHeld = g.held;
    const s = g.wave.sectionAt(g.x);
    const nowClose = s.kind === 'close';
    if (nowClose && !inClose) closes++;
    if (!nowClose && inClose && g.mode !== 'gone') closesPassed++;
    inClose = nowClose;
    if (trace && g.time >= sec) {
      sec += 0.2;
      console.log(`${(g.time / tempo).toFixed(1).padStart(5)}s ${g.mode.padEnd(4)} ${bot.held ? "H" : "."} x=${g.x.toFixed(0).padStart(6)} y/H=${(g.y / g.wave.H(g.x)).toFixed(2)} v=${g.v.toFixed(0).padStart(4)} lead=${g.lead.toFixed(2)}H vb=${g.wave.vb.toFixed(0)} ${s.kind}`);
    }
    if (g.mode === 'gone') break;
  }
  const time = g.time / tempo;
  const bs = g.wave.sectionAt(g.wave.xb);
  return {
    skill, time, meters: g.meters, score: g.score, wipes: g.wipes, airs: g.airs, tricks: g.tricks, perfects: g.perfects,
    lead: g.leadSum / Math.max(g.time, 1e-6), speed: (g.x - g.x0) / Math.max(g.time, 1e-6), air: airT / Math.max(1, g.airs) / tempo, scrapes: g.scrapes / Math.max(time, 1) * 60,
    window: med(wins) / tempo, cycle: med(cycles.filter((c) => c < 5)) / tempo,
    night: time > 240, closeDeath: g.mode === 'gone' && (bs.kind === 'close' || inClose), wipeDeath: g.mode === 'gone' && g.time - lastWipe < 3, closes, closesPassed,
    causes, tubeT: g.tubeTotal / tempo, tubes: g.tubes, shells: g.shells, dolphins: g.dolphins, pelicans: g.pelicans, stings: g.stings,
  };
}

const med = (a: number[]) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
const pct = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);

function report(label: string, rs: Ride[]) {
  const T = rs.map((r) => r.time);
  const f = (v: number, d = 0) => v.toFixed(d);
  const cD = rs.filter((r) => r.closeDeath).length, wD = rs.filter((r) => r.wipeDeath).length, capped = rs.filter((r) => r.time >= LIMIT - 1).length;
  console.log(
    `${label.padEnd(10)} n=${String(rs.length).padStart(4)}  time mean ${f(mean(T)).padStart(4)}s  p10 ${f(pct(T, 0.1)).padStart(4)}  p50 ${f(pct(T, 0.5)).padStart(4)}  p90 ${f(pct(T, 0.9)).padStart(4)}` +
      `  | night ${f((100 * rs.filter((r) => r.night).length) / rs.length).padStart(3)}%  capped ${capped}` +
      `  | ${f(mean(rs.map((r) => r.meters))).padStart(5)} m  score ${f(mean(rs.map((r) => r.score))).padStart(6)}` +
      `  | v ${f(mean(rs.map((r) => r.speed * BAL.tempo))).padStart(3)}/s  lead ${f(mean(rs.map((r) => r.lead)), 2)}H` +
      `  | scrapes/min ${f(mean(rs.map((r) => r.scrapes)), 1)} ⅓→trough ${f(mean(rs.map((r) => r.window).filter((x) => x === x)), 2)}s cycle ${f(mean(rs.map((r) => r.cycle).filter((x) => x === x)), 2)}s` +
      `  | wipes ${f(mean(rs.map((r) => r.wipes)), 1)} airs ${f(mean(rs.map((r) => r.airs)), 0)} (${f(mean(rs.filter((r) => r.airs).map((r) => r.air)), 2)}s) tricks ${f(mean(rs.map((r) => r.tricks)), 1)} perf ${f(mean(rs.map((r) => r.perfects)), 1)}` +
      `  | deaths: close ${f((100 * cD) / rs.length)}% after-wipe ${f((100 * wD) / rs.length)}%` +
      `  | closeouts ${f(mean(rs.map((r) => r.closesPassed)), 1)}/${f(mean(rs.map((r) => r.closes)), 1)}`,
  );
  const causes: Record<string, number> = {};
  for (const r of rs) for (const [k, v] of Object.entries(r.causes)) causes[k] = (causes[k] ?? 0) + v / rs.length;
  console.log(
    `${''.padEnd(10)} wipe causes: ${Object.entries(causes).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${f(v, 1)}`).join(', ') || '—'}` +
      `  | tube ${f(mean(rs.map((r) => r.tubeT)), 1)}s exits ${f(mean(rs.map((r) => r.tubes)), 1)}  | shells ${f(mean(rs.map((r) => r.shells)), 0)}` +
      `  dolphins ${f(mean(rs.map((r) => r.dolphins)), 1)} pelicans ${f(mean(rs.map((r) => r.pelicans)), 1)} stings ${f(mean(rs.map((r) => r.stings)), 1)}`,
  );
}

/** Steady speed of input strategies with the break frozen far behind and full pocket power. */
function pumpReport() {
  type Strat = (g: Game, t: number, held: boolean) => boolean;
  const band = (lo: number, hi: number): Strat => (g, _t, held) => {
    if (g.mode !== 'ride') return false;
    const h = g.y / g.wave.H(g.x);
    return held ? h >= lo : h > hi;
  };
  const strats: [string, Strat][] = [
    ['band .05-.95', band(0.05, 0.95)], ['band .15-.85', band(0.15, 0.85)], ['band .25-.75', band(0.25, 0.75)],
    ['band .35-.65', band(0.35, 0.65)], ['band .45-.55', band(0.45, 0.55)],
    ...Object.entries(POLICIES).map(([n, f]): [string, Strat] => [n, (_g, t) => f(t)]),
  ];
  console.log('steady state, full pocket power (real px/s = units × tempo):');
  for (const [name, f] of strats) {
    const g = new Game(1);
    (g.wave as unknown as { pocket: () => number }).pocket = () => 1;
    (g.wave as unknown as { update: () => void }).update = () => {};
    g.wave.xb = -1e9;
    let held = false, x0 = 0, t0 = 0, airs = 0, hmin = 9, hmax = -9, presses = 0;
    for (let i = 0; i < 60 * 40; i++) {
      const nh = f(g, i * DT, held);
      if (nh && !held) presses++;
      held = nh;
      g.update(DT, held);
      for (const e of g.events) if (e.t === 'launch') airs++;
      g.events.length = 0;
      if (i === 60 * 10) { x0 = g.x; t0 = g.time; airs = 0; hmin = 9; hmax = -9; presses = 0; }
      if (i > 600 && g.mode === 'ride') { const h = g.y / g.wave.H(g.x); hmin = Math.min(hmin, h); hmax = Math.max(hmax, h); }
    }
    const T = g.time - t0;
    console.log(`${name.padEnd(13)} vx ${((g.x - x0) / T).toFixed(0).padStart(4)}  h ${hmin.toFixed(2)}–${hmax.toFixed(2)}  airs/30s ${String(airs).padStart(2)}  presses/s ${(presses / T).toFixed(1)}`);
  }
}

/** Levels: finish rate, time, and how often each goal (star) is met, per skill. */
function levelReport(runs: number, only: string) {
  const skills = [0.3, 0.6, 0.9];
  console.log(`levels, ${runs} rides per skill (${skills.join(' / ')}): finish %, mean time of finished rides, then each goal: % of all rides that earn it\n`);
  for (const spot of SPOTS) {
    if (only && spot.id !== only) continue;
    spot.levels.forEach((L, li) => {
      resetBal();
      tuneBal(spot.bal);
      tuneBal(L.bal);
      if (envBal) tuneBal(envBal);
      const cols: string[] = [];
      const goalHits = L.goals.map(() => skills.map(() => 0));
      for (const [si, skill] of skills.entries()) {
        let fin = 0, tsum = 0;
        for (let i = 0; i < runs; i++) {
          const g = new Game(L.seed, L.meters);
          const bot = new Bot(skill, makeRng(L.seed ^ (i * 7919 + 13)));
          for (let t = 0; t < 400 * BAL.tempo && g.mode !== 'gone' && g.mode !== 'done'; t += DT) {
            g.update(DT, bot.step(g, DT));
            g.events.length = 0;
          }
          if (g.mode === 'done') {
            fin++;
            tsum += g.time / BAL.tempo;
            L.goals.forEach((q, gi) => { if (goalMet(q, g)) goalHits[gi][si]++; });
          }
        }
        cols.push(`${String(Math.round((100 * fin) / runs)).padStart(3)}% ${fin ? (tsum / fin).toFixed(0).padStart(3) : '  –'}s`);
      }
      const goals = L.goals.map((q, gi) => `${goalText(q)} ${goalHits[gi].map((h) => Math.round((100 * h) / runs)).join('/')}`).join(' · ');
      console.log(`${spot.id.padEnd(8)} ${li === 5 ? 'B' : li + 1}  ${L.meters}m  ${cols.join('  ')}  | ${goals}`);
    });
  }
}

const runs = Number(arg('runs', '120'));
const trace = arg('trace', '');
const skillArg = arg('skill', '');
if (process.argv.includes('--levels')) {
  levelReport(Number(arg('runs', '30')), spotArg);
} else if (process.argv.includes('--pump')) {
  pumpReport();
} else if (trace) {
  const r = ride(Number(trace), Number(skillArg || 0.5), true);
  report('trace', [r]);
} else {
  const skills = skillArg ? [Number(skillArg)] : [0.2, 0.5, 0.9];
  console.log(`tempo ${BAL.tempo}, ${runs} rides per skill\n`);
  for (const s of skills) {
    const rs: Ride[] = [];
    for (let i = 0; i < runs; i++) rs.push(ride(1000 + i * 7919, s));
    report(`skill ${s}`, rs);
  }
  console.log('\ntargets: skill 0.5 mean 90–150 s · skill 0.9 regularly past 240 s (night) · skill 0.2 ≥ 40 s');
  if (!skillArg) {
    console.log('\nexploit guard (must die well before skill 0.2):');
    for (const [name, f] of Object.entries(POLICIES)) {
      const rs: Ride[] = [];
      for (let i = 0; i < 20; i++) rs.push(ride(1000 + i * 7919, 0, false, f));
      report(name, rs);
    }
  }
}
