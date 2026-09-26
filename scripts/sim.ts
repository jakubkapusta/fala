// Headless balance simulator: plays whole rides with the bot and prints how long they last.
//
//   npm run sim                         # 200 rides, skills 0.2 / 0.5 / 0.9 + a mixed band
//   npm run sim -- --runs 400 --skill 0.6
//   npm run sim -- --trace 7 --skill 0.5  # one ride, a line per second
//   npm run sim -- --pump                 # steady speed of pumping rhythms vs mashing / no input
//   BAL='{"surf":{"push":300}}' npm run sim   # try knob values from src/game/balance.ts

import { BAL, tuneBal } from '../src/game/balance';
import { Game } from '../src/game/game';
import { makeRng } from '../src/core/rng';
import { Bot } from '../src/sim/bot';

const DT = 1 / 60;
const LIMIT = 900; // real seconds before we stop a ride

function arg(name: string, def: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

if (process.env.BAL) tuneBal(JSON.parse(process.env.BAL));

type Ride = {
  skill: number; time: number; meters: number; score: number; wipes: number; airs: number; tricks: number; perfects: number;
  lead: number; speed: number; night: boolean; closeDeath: boolean; wipeDeath: boolean; closes: number; closesPassed: number;
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
  let lastWipe = -99;
  let closes = 0, closesPassed = 0, inClose = false, sec = 0;
  for (let t = 0; t < LIMIT * tempo; t += DT) {
    g.update(DT, input());
    for (const e of g.events) if (e.t === 'wipe') lastWipe = g.time;
    g.events.length = 0;
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
    lead: g.leadSum / Math.max(g.time, 1e-6), speed: (g.x - g.x0) / Math.max(g.time, 1e-6),
    night: time > 240, closeDeath: g.mode === 'gone' && (bs.kind === 'close' || inClose), wipeDeath: g.mode === 'gone' && g.time - lastWipe < 3, closes, closesPassed,
  };
}

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
      `  | v ${f(mean(rs.map((r) => r.speed))).padStart(3)}  lead ${f(mean(rs.map((r) => r.lead)), 2)}H` +
      `  | wipes ${f(mean(rs.map((r) => r.wipes)), 1)} airs ${f(mean(rs.map((r) => r.airs)), 0)} tricks ${f(mean(rs.map((r) => r.tricks)), 1)} perf ${f(mean(rs.map((r) => r.perfects)), 1)}` +
      `  | deaths: close ${f((100 * cD) / rs.length)}% after-wipe ${f((100 * wD) / rs.length)}%` +
      `  | closeouts ${f(mean(rs.map((r) => r.closesPassed)), 1)}/${f(mean(rs.map((r) => r.closes)), 1)}`,
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

const runs = Number(arg('runs', '120'));
const trace = arg('trace', '');
const skillArg = arg('skill', '');
if (process.argv.includes('--pump')) {
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
