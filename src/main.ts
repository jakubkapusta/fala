import '@fontsource/quicksand/500.css';
import '@fontsource/quicksand/600.css';
import '@fontsource/fraunces/600.css';
import '@fontsource/fraunces/600-italic.css';
import './style.css';

import { Renderer } from './render/renderer';
import { Game, type GameEvent, type WipeCause } from './game/game';
import type { ThingKind } from './game/things';
import { Camera } from './game/camera';
import { Input } from './game/input';
import { BAL, resetBal, tuneBal } from './game/balance';
import { hintSeen, loadMeta, loadStats, logRide, markHint, saveMeta, today } from './game/save';
import { Ui, type RideInfo } from './ui/ui';
import { SPOTS, spotById, type Spot } from './game/spots';
import { buy, daily, levelUnlocked, recordLevel, spotRec } from './game/progress';
import { boardById, suitById, trailById } from './game/boards';
import { Bot } from './sim/bot';
import { applyTest, cleanTest, testLabel } from './game/tuning';
import { makeRng } from './core/rng';
import { PHASES } from './render/daycycle';
import { Sound } from './audio/audio';

type Mode = 'menu' | 'play' | 'pause' | 'end';

// #bal={"surf":{"push":200}} tunes knobs in the browser; #debug shows the numbers
const hash = decodeURIComponent(location.hash.slice(1));
const balMatch = /bal=(\{.*\})/.exec(hash);
let urlBal: Record<string, unknown> | null = null;
if (balMatch) {
  try { urlBal = JSON.parse(balMatch[1]); } catch { console.warn('bad #bal JSON'); }
}

const canvas = document.getElementById('c') as HTMLCanvasElement;
let renderer: Renderer;
try {
  renderer = new Renderer(canvas);
} catch (e) {
  document.getElementById('ui')!.innerHTML = `<div class="screen show"><h2 class="h2">Ups</h2><p class="lead">Ta przeglądarka nie obsługuje WebGL2.</p></div>`;
  throw e;
}

// few cores / little memory: start at a lower render quality (adapt() still raises it if frames are quick)
{
  const nav = navigator as Navigator & { deviceMemory?: number };
  if ((nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 3) renderer.quality = 0.75;
}

const meta = loadMeta();
const sound = new Sound();
sound.enabled = meta.sound;
// browsers only let audio start from a user gesture
for (const ev of ['pointerdown', 'keydown', 'touchend'] as const) window.addEventListener(ev, () => sound.start(), { passive: true });
let test = cleanTest(meta.test);

/** the ride being played (or shown behind the menu) */
let ride: RideInfo = { kind: 'endless', spot: spotById(meta.lastSpot) };
/** BAL = defaults → M1 test presets → #bal → spot → level → board */
function layers(r: RideInfo) {
  resetBal();
  applyTest(test);
  if (urlBal) tuneBal(urlBal);
  tuneBal(r.spot.bal);
  if (r.kind === 'level') tuneBal(r.spot.levels[r.li].bal);
  tuneBal(boardById(meta.board).bal);
  renderer.look = r.spot.look;
  renderer.gear = { board: boardById(meta.board), suit: suitById(meta.suit), trail: trailById(meta.trail) };
}
layers(ride);
renderer.onThunder = (k) => { vibrate(Math.round(20 * k)); sound.thunder(k); };
const camera = new Camera();
let mode: Mode = 'menu';
let game: Game;
let demo: Bot | null = null;
/** dev: a bot plays the ride (`__fala.auto(0.8)`) — for screenshots and checks */
let auto: Bot | null = null;
/** dev: stop the clock but keep rendering (`__fala.freeze(true)`) */
let frozen = false;
let fade = 1;
let fadeTarget = 0;
let endShown = false;
let realTime = 0;

// time of day: a ride starts between dawn and late morning and the day moves on with the ride
// (a full cycle in DAY_S real seconds), so night is the reward of a long ride; the menu shows any time
const DAY_S = 360;
let dayStart = 0;
let dayClock = 0;
/** dev: fixed time of day (`__fala.tod(0.5)`, `#tod=0.5` or `#tod=sunset`) */
let todFixed: number | null = null;
const todMatch = /tod=([a-z.0-9]+)/.exec(hash);
if (todMatch) todFixed = todMatch[1] in PHASES ? PHASES[todMatch[1] as keyof typeof PHASES] : parseFloat(todMatch[1]) || 0;

const ui = new Ui({
  watch: () => { ride = { kind: 'endless', spot: ride.spot }; startRide(0.92); },
  resume: () => resume(),
  menu: () => toMenu(),
  pause: () => pause(),
  setTest: (key, id) => {
    test = cleanTest({ ...test, [key]: id });
    meta.test = test;
    saveMeta(meta);
    layers(ride);
    ui.showMenu(test);
  },
  toggleSound: () => {
    meta.sound = !meta.sound;
    saveMeta(meta);
    sound.setEnabled(meta.sound);
    ui.setSound(meta.sound);
  },
  pickSpot: (id) => {
    if (meta.lastSpot === id) return;
    meta.lastSpot = id;
    saveMeta(meta);
    ride = { kind: 'endless', spot: spotById(id) };
    newDemo();
  },
  playLevel: (id, li) => { ride = { kind: 'level', spot: spotById(id), li }; startRide(); },
  playEndless: (id) => { ride = { kind: 'endless', spot: spotById(id) }; startRide(); },
  playDaily: () => {
    const d = daily(meta);
    ride = { kind: 'daily', spot: d.spot, counted: d.counted };
    startRide(undefined, d.seed);
  },
  again: () => again(),
  next: () => {
    if (ride.kind !== 'level') return again();
    const li = ride.li + 1;
    if (li < ride.spot.levels.length && levelUnlocked(meta, ride.spot, li)) { ride = { kind: 'level', spot: ride.spot, li }; startRide(); }
    else ui.showLevels(ride.spot.id);
  },
  buy: (id, price) => {
    const ok = buy(meta, id, price);
    if (ok) saveMeta(meta);
    return ok;
  },
  equip: (kind, id) => {
    if (!meta.owned.includes(id)) return;
    if (kind === 'board') meta.board = id;
    else if (kind === 'suit') meta.suit = id;
    else meta.trail = id;
    saveMeta(meta);
    layers(ride);
  },
});
ui.meta = meta;
ui.sound = meta.sound;
ui.touch = matchMedia('(pointer: coarse)').matches;
ui.showDebug = /debug/.test(hash) || !!balMatch;

const input = new Input(canvas, {
  // a touch while the bot rides hands the board over
  gesture: () => { if (mode === 'play' && auto && watching) { auto = null; watching = false; } },
  pause: () => (mode === 'play' ? pause() : mode === 'pause' ? resume() : undefined),
  enabled: () => mode === 'play',
});

function newDemo() {
  layers(ride);
  game = new Game((Date.now() & 0xffff) + 1);
  demo = new Bot(0.85, makeRng(game.seed));
  const day = ride.spot.day;
  dayStart = typeof day === 'number' ? day : makeRng(game.seed ^ 0xda7)();
  dayClock = 0;
  camera.update(game, canvas.clientWidth, canvas.clientHeight, 0, true);
}

/** The same kind of ride again (a level keeps its seed, the daily wave too). */
function again() {
  if (ride.kind === 'daily') {
    const d = daily(meta);
    ride = { kind: 'daily', spot: d.spot, counted: d.counted };
    startRide(undefined, d.seed);
  } else startRide();
}

let watching = false;
/** Start a ride; with `botSkill` the bot rides it (the player can take over by touching). */
function startRide(botSkill?: number, fixedSeed?: number) {
  if (botSkill === undefined) {
    meta.runs++;
    saveMeta(meta);
  }
  layers(ride);
  const level = ride.kind === 'level' ? ride.spot.levels[ride.li] : null;
  const seed = level?.seed ?? fixedSeed ?? (Date.now() ^ (performance.now() * 1000)) >>> 0;
  game = new Game(seed, level?.meters ?? 0);
  demo = null;
  watching = botSkill !== undefined;
  if (watching) auto = new Bot(botSkill!, makeRng(seed));
  else if (auto) auto = new Bot(auto.skill, makeRng(seed));
  mode = 'play';
  endShown = false;
  realTime = 0;
  const day = ride.spot.day;
  dayStart = typeof day === 'number' ? day : day[0] + makeRng(seed ^ 0xda7)() * (day[1] - day[0]);
  dayClock = 0;
  input.reset();
  ui.touch = input.isTouch || matchMedia('(pointer: coarse)').matches;
  ui.play();
  camera.update(game, canvas.clientWidth, canvas.clientHeight, 0, true);
  fade = 0.6;
  fadeTarget = 0;
  if (!watching && (!hintSeen('controls') || meta.runs <= 2)) {
    ui.hint(ui.touch ? '<b>Trzymaj</b> — w dół · <b>Puść</b> — w górę<br>Pompuj w rytmie fali, żeby przyspieszyć' : '<b>Trzymaj spację</b> — w dół · <b>Puść</b> — w górę<br>Pompuj w rytmie fali, żeby przyspieszyć', 6);
    markHint('controls');
  } else if (!watching) ui.levelIntro(ride);
}

function pause() {
  if (mode !== 'play') return;
  mode = 'pause';
  input.reset();
  ui.showPause(game, ride);
}
function resume() {
  if (mode !== 'pause') return;
  mode = 'play';
  ui.play();
}
function toMenu() {
  mode = 'menu';
  ride = { kind: 'endless', spot: spotById(meta.lastSpot) };
  newDemo();
  ui.hideHud();
  ui.showMenu(test);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
  sound.hidden(document.hidden);
});
window.addEventListener('pagehide', () => pause());
window.addEventListener('keydown', (e) => {
  if (mode === 'end' && (e.code === 'Space' || e.code === 'Enter') && !e.repeat) {
    e.preventDefault();
    again();
  }
});

function vibrate(ms: number) {
  try { navigator.vibrate?.(ms); } catch { /* ignore */ }
}

const WIPE_TEXT: Partial<Record<WipeCause, string>> = { lip: 'Lip cię zgarnął', rock: 'Skała!', log: 'Kłoda!', buoy: 'Boja!', rider: 'Zderzenie!', ice: 'Kra!' };

// first-time hints, one at a time, from the wave data (never shown while the bot rides)
function hintOnce(id: string, html: string) {
  if (watching || auto || ui.hintBusy || hintSeen(id)) return;
  ui.hint(html, 4.5);
  markHint(id);
}
const THING_HINT: Partial<Record<ThingKind, [string, string]>> = {
  rock: ['rock', 'Skały przy dnie — przejedź <b>nad nimi</b>'],
  log: ['high', 'Kłoda wysoko na ścianie — przejedź <b>dołem</b> albo przeskocz'],
  buoy: ['high', 'Boja wysoko na ścianie — przejedź <b>dołem</b> albo przeskocz'],
  rider: ['rider', 'Inny surfer — omiń go <b>górą albo dołem</b>'],
  jelly: ['jelly', 'Meduzy przy dnie <b>parzą</b> i spowalniają'],
  ice: ['ice', 'Kra wysoko na ścianie — przejedź <b>dołem</b> albo przeskocz'],
};
function hints() {
  const g = game, tempo = BAL.tempo;
  if (g.mode === 'air' && g.modeT < 0.3) hintOnce('air', 'W powietrzu <b>trzymaj</b>, żeby się obrócić. Puść, a deska sama się ustawi');
  if (g.closeAhead(3 * tempo) !== null) hintOnce('close', 'Biała grzywa — <b>sekcja zamykająca</b>. Przejedź ją na pełnej prędkości');
  if (g.wave.kindAt(g.x + 2.5 * tempo * Math.max(g.vxNow, 200), 'tube') > 0.5) hintOnce('tube', '<b>Tuba!</b> Jedź nisko pod lipem — punkty za każdą sekundę, premia za wyjście');
  const ob = g.obstacleAhead(2.2 * tempo);
  const h = ob && THING_HINT[ob.kind];
  if (h) hintOnce(h[0], h[1]);
  for (const t of g.things.list) {
    if (t.done || t.x < g.x || t.x > g.x + 2 * tempo * Math.max(g.vxNow, 200)) continue;
    if (t.kind === 'dolphin') hintOnce('dolphin', 'Delfin! Jedź <b>obok niego</b> — popchnie cię');
    else if (t.kind === 'pelican') hintOnce('pelican', 'Wpadnij na pelikana <b>w locie</b> — podbije cię wyżej');
    else if (t.kind === 'shell') hintOnce('shell', 'Zbieraj <b>muszle</b> — linie podpowiadają dobrą trasę');
  }
}

function handleEvents(events: GameEvent[]) {
  if (mode === 'play') sound.events(events);
  for (const e of events) {
    if (mode !== 'play') continue;
    switch (e.t) {
      case 'land':
        if (e.q === 'perfect') {
          renderer.impact('perfect', game.x, game.y);
          ui.pop(`${e.halfTurns >= 2 ? `${e.halfTurns * 180}°` : 'Idealnie!'}${e.pts ? `<small>+${e.pts.toLocaleString('pl-PL')}${e.mult > 1 ? ` ×${e.mult}` : ''}</small>` : ''}`, 'perfect');
          vibrate(18);
        } else {
          renderer.impact('clean', game.x, game.y);
          if (e.trick) ui.pop(`${e.halfTurns >= 2 ? `${e.halfTurns * 180}°` : 'Wysoko!'}<small>+${e.pts.toLocaleString('pl-PL')}</small>`);
        }
        break;
      case 'scrape':
        renderer.impact('scrape', game.x, game.y);
        ui.pop('Dno!', 'wipe');
        vibrate(25);
        break;
      case 'wipe':
        renderer.impact('wipe', game.x, game.y);
        ui.pop(WIPE_TEXT[e.cause] ?? 'Wywrotka', 'wipe');
        vibrate(60);
        break;
      case 'sting':
        renderer.impact('scrape', game.x, game.y);
        ui.pop('Meduza!', 'wipe');
        vibrate(25);
        break;
      case 'shell':
        renderer.sparkle(game.x, game.y);
        break;
      case 'dolphin':
        ui.pop('Delfin!<small>popycha</small>');
        break;
      case 'pelican':
        renderer.impact('clean', game.x, game.y);
        ui.pop(`Pelikan!<small>+${e.pts.toLocaleString('pl-PL')}</small>`);
        vibrate(15);
        break;
      case 'tubeOut':
        renderer.impact('perfect', game.x, game.y);
        renderer.tubeBurst(game.x, game.y);
        ui.pop(`Z tuby!<small>${(e.secs / BAL.tempo).toFixed(1).replace('.', ',')} s · +${e.pts.toLocaleString('pl-PL')}</small>`, 'perfect');
        vibrate(20);
        break;
      case 'gone':
        vibrate(120);
        break;
      case 'storm':
        ui.pop('Sztorm!', 'wipe');
        hintOnce('storm', '<b>Sztorm</b> — wyższe fale i szybsze łamanie. Trzymaj prędkość');
        break;
      case 'finish':
        renderer.impact('perfect', game.x, game.y);
        ui.pop('Meta!', 'perfect');
        vibrate(30);
        break;
    }
  }
  events.length = 0;
}

function checkEnd() {
  if (endShown) return;
  const finished = game.mode === 'done' && game.modeT >= 1.2 * BAL.tempo;
  if (!finished && !(game.mode === 'gone' && game.modeT >= 0.7 * BAL.tempo)) return;
  endShown = true;
  mode = 'end';
  input.reset();
  const g = game, r = ride;
  let best = 0, isBest = false;
  let extra = {};
  if (!watching) {
    meta.shells += g.shells;
    if (r.kind === 'level') {
      const rec = spotRec(meta, r.spot.id).levels[r.li];
      isBest = finished && g.score > rec.best;
      const res = recordLevel(meta, r.spot, r.li, g, finished);
      const li = r.li + 1;
      extra = { ...res, hasNext: li < r.spot.levels.length && levelUnlocked(meta, r.spot, li) };
      best = rec.best;
    } else if (r.kind === 'endless') {
      const rec = spotRec(meta, r.spot.id);
      isBest = g.score > rec.best;
      if (isBest) rec.best = g.score;
      best = rec.best;
      meta.best = Math.max(meta.best, g.score);
    } else {
      if (r.counted) { meta.daily = { date: today(), score: g.score }; isBest = true; }
      best = meta.daily?.score ?? 0;
    }
    saveMeta(meta);
    logRide({ date: today(), time: Math.round(realTime), meters: Math.round(g.meters), score: g.score, wipes: g.wipes, tricks: g.tricks, tempo: BAL.tempo, test: testLabel(test), ride: r.kind === 'level' ? `${r.spot.id}-${r.li + 1}${finished ? '' : '-fail'}` : `${r.spot.id}-${r.kind}` });
  }
  ui.showEnd({ game: g, ride: r, realTime, finished, best, isBest, ...extra });
}

// ------------------------------------------------------------ adaptive quality
let slow = 0, fast = 0;
function adapt(frameMs: number) {
  if (frameMs > 22) { slow += frameMs / 1000; fast = 0; }
  else if (frameMs < 13) { fast += frameMs / 1000; slow = Math.max(0, slow - frameMs / 2000); }
  if (slow > 2 && renderer.quality > 0.5) {
    renderer.quality = Math.max(0.5, renderer.quality - 0.15);
    slow = 0;
  } else if (fast > 8 && renderer.quality < 1) {
    renderer.quality = Math.min(1, renderer.quality + 0.1);
    fast = 0;
  }
}

// ------------------------------------------------------------ loop
let last = performance.now();
function frame(now: number) {
  const raw = now - last;
  last = now;
  const dt = frozen ? 0 : Math.min(raw / 1000, 1 / 30);
  if (mode === 'menu') {
    const gdt = dt * BAL.tempo;
    game.update(gdt, demo!.step(game, gdt));
    game.events.length = 0;
    if (game.mode === 'gone' && game.modeT > 1) newDemo();
  } else if (mode === 'play' || mode === 'end') {
    const slowmo = game.slowT > 0 ? BAL.slowmo.scale : 1;
    const gdt = dt * BAL.tempo * slowmo;
    const held = mode === 'play' && (auto ? auto.step(game, gdt) : input.held);
    game.update(gdt, held);
    if (game.mode !== 'gone') realTime += dt * slowmo;
    handleEvents(game.events);
    if (mode === 'play') hints();
    if (mode === 'play') ui.update(game, dt, { quality: renderer.quality, tempo: BAL.tempo, held, bot: !!auto, test: testLabel(test) });
    checkEnd();
  }
  camera.update(game, canvas.clientWidth || innerWidth, canvas.clientHeight || innerHeight, dt);
  fade += (fadeTarget - fade) * Math.min(1, dt * 4);
  if (mode !== 'pause' && game.mode !== 'gone') dayClock += dt;
  const phase = todFixed ?? dayStart + dayClock / DAY_S;
  const slow = game.slowT > 0 ? 1 : 0;
  renderer.render(game, camera, { fade, dt, phase, slow });
  sound.update(game, dt, phase, mode === 'play', game.wave.stormAt(game.x), slow);
  if (mode === 'play') adapt(raw);
  requestAnimationFrame(frame);
}

newDemo();
ui.showMenu(test);
requestAnimationFrame(frame);
// #shot: no overlay, the bot rides straight away — for screenshots (with #tod=…)
if (/shot/.test(hash)) {
  document.getElementById('ui')!.style.display = 'none';
  startRide(0.9);
}

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__fala = {
  get game() { return game; }, camera, renderer, BAL, loadStats,
  auto: (skill: number | null) => { auto = skill === null ? null : new Bot(skill, makeRng(7)); },
  start: (seed?: number) => { ride = { kind: 'endless', spot: ride.spot }; startRide(undefined, seed); },
  level: (spot: string, li: number) => { ride = { kind: 'level', spot: spotById(spot), li }; startRide(); },
  meta, SPOTS,
  freeze: (on: boolean) => { frozen = on; fade = fadeTarget; },
  /** fix the time of day (0 dawn, 0.25 noon, 0.5 sunset, 0.75 night) or `null` for the ride's clock */
  tod: (p: number | keyof typeof PHASES | null) => { todFixed = p === null ? null : typeof p === 'number' ? p : PHASES[p]; },
  /** hide the DOM overlay (HUD, screens) for clean screenshots */
  hud: (on: boolean) => { document.getElementById('ui')!.style.display = on ? '' : 'none'; },
  resume: () => resume(),
  /** dev: put a thing `dx` units ahead of the surfer at height `h` (share of the wall) */
  spawn: (kind: ThingKind, dx: number, h: number) => {
    game.things.list.push({ kind, x: game.x + dx, h, y: h * game.wave.H(game.x + dx), vx: kind === 'dolphin' ? BAL.things.dolphinSpeed : kind === 'pelican' ? 60 : 0, phase: Math.random() * 9, done: false, used: 0, age: 0 });
  },
  /** put the surfer `lead` wall heights ahead of the break (to look at the lip and whitewater) */
  peek: (lead: number) => {
    const H = game.wave.H(game.wave.xb);
    game.x = game.wave.xb + lead * H;
    game.y = 0.5 * H;
    camera.update(game, canvas.clientWidth, canvas.clientHeight, 0, true);
  },
};
