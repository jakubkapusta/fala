import '@fontsource/quicksand/500.css';
import '@fontsource/quicksand/600.css';
import '@fontsource/fraunces/600.css';
import '@fontsource/fraunces/600-italic.css';
import './style.css';

import { Renderer } from './render/renderer';
import { Game, type GameEvent } from './game/game';
import { Camera } from './game/camera';
import { Input } from './game/input';
import { BAL, tuneBal } from './game/balance';
import { hintSeen, loadMeta, loadStats, logRide, markHint, saveMeta, today } from './game/save';
import { Ui } from './ui/ui';
import { Bot } from './sim/bot';
import { applyTest, cleanTest, testLabel } from './game/tuning';
import { makeRng } from './core/rng';
import { PHASES } from './render/daycycle';

type Mode = 'menu' | 'play' | 'pause' | 'end';

// #bal={"surf":{"push":200}} tunes knobs in the browser; #debug shows the numbers
const hash = decodeURIComponent(location.hash.slice(1));
const balMatch = /bal=(\{.*\})/.exec(hash);
if (balMatch) {
  try { tuneBal(JSON.parse(balMatch[1])); } catch { console.warn('bad #bal JSON'); }
}

const canvas = document.getElementById('c') as HTMLCanvasElement;
let renderer: Renderer;
try {
  renderer = new Renderer(canvas);
} catch (e) {
  document.getElementById('ui')!.innerHTML = `<div class="screen show"><h2 class="h2">Ups</h2><p class="lead">Ta przeglądarka nie obsługuje WebGL2.</p></div>`;
  throw e;
}

const meta = loadMeta();
let test = cleanTest(meta.test);
applyTest(test);
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
  start: () => startRide(),
  watch: () => startRide(0.92),
  resume: () => resume(),
  menu: () => toMenu(),
  pause: () => pause(),
  setTest: (key, id) => {
    test = cleanTest({ ...test, [key]: id });
    applyTest(test);
    meta.test = test;
    saveMeta(meta);
    ui.showMenu(meta.best, test);
  },
});
ui.touch = matchMedia('(pointer: coarse)').matches;
ui.showDebug = /debug/.test(hash) || !!balMatch;

const input = new Input(canvas, {
  // a touch while the bot rides hands the board over
  gesture: () => { if (mode === 'play' && auto && watching) { auto = null; watching = false; } },
  pause: () => (mode === 'play' ? pause() : mode === 'pause' ? resume() : undefined),
  enabled: () => mode === 'play',
});

function newDemo() {
  game = new Game((Date.now() & 0xffff) + 1);
  demo = new Bot(0.85, makeRng(game.seed));
  dayStart = makeRng(game.seed ^ 0xda7)();
  dayClock = 0;
  camera.update(game, canvas.clientWidth, canvas.clientHeight, 0, true);
}

let watching = false;
/** Start a ride; with `botSkill` the bot rides it (the player can take over by touching). */
function startRide(botSkill?: number) {
  if (botSkill === undefined) {
    meta.runs++;
    saveMeta(meta);
  }
  const seed = (Date.now() ^ (performance.now() * 1000)) >>> 0;
  game = new Game(seed);
  demo = null;
  watching = botSkill !== undefined;
  if (watching) auto = new Bot(botSkill!, makeRng(seed));
  else if (auto) auto = new Bot(auto.skill, makeRng(seed));
  mode = 'play';
  endShown = false;
  realTime = 0;
  dayStart = makeRng(seed ^ 0xda7)() * 0.12;
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
  }
}

function pause() {
  if (mode !== 'play') return;
  mode = 'pause';
  input.reset();
  ui.showPause();
}
function resume() {
  if (mode !== 'pause') return;
  mode = 'play';
  ui.play();
}
function toMenu() {
  mode = 'menu';
  newDemo();
  ui.hideHud();
  ui.showMenu(meta.best, test);
}

document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
window.addEventListener('pagehide', () => pause());
window.addEventListener('keydown', (e) => {
  if (mode === 'end' && (e.code === 'Space' || e.code === 'Enter') && !e.repeat) {
    e.preventDefault();
    startRide();
  }
});

function vibrate(ms: number) {
  try { navigator.vibrate?.(ms); } catch { /* ignore */ }
}

function handleEvents(events: GameEvent[]) {
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
        ui.pop('Wywrotka', 'wipe');
        vibrate(60);
        break;
      case 'gone':
        vibrate(120);
        break;
    }
  }
  events.length = 0;
}

function checkEnd() {
  if (endShown || game.mode !== 'gone' || game.modeT < 0.7 * BAL.tempo) return;
  endShown = true;
  mode = 'end';
  input.reset();
  const isBest = !watching && game.score > meta.best;
  if (isBest) meta.best = game.score;
  saveMeta(meta);
  if (!watching) logRide({ date: today(), time: Math.round(realTime), meters: Math.round(game.meters), score: game.score, wipes: game.wipes, tricks: game.tricks, tempo: BAL.tempo, test: testLabel(test) });
  ui.showEnd({ game, best: meta.best, isBest, realTime });
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
    if (mode === 'play') ui.update(game, dt, { quality: renderer.quality, tempo: BAL.tempo, held, bot: !!auto, test: testLabel(test) });
    checkEnd();
  }
  camera.update(game, canvas.clientWidth || innerWidth, canvas.clientHeight || innerHeight, dt);
  fade += (fadeTarget - fade) * Math.min(1, dt * 4);
  if (mode !== 'pause' && game.mode !== 'gone') dayClock += dt;
  renderer.render(game, camera, { fade, dt, phase: todFixed ?? dayStart + dayClock / DAY_S });
  if (mode === 'play') adapt(raw);
  requestAnimationFrame(frame);
}

newDemo();
ui.showMenu(meta.best, test);
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
  start: () => startRide(),
  freeze: (on: boolean) => { frozen = on; fade = fadeTarget; },
  /** fix the time of day (0 dawn, 0.25 noon, 0.5 sunset, 0.75 night) or `null` for the ride's clock */
  tod: (p: number | keyof typeof PHASES | null) => { todFixed = p === null ? null : typeof p === 'number' ? p : PHASES[p]; },
  /** hide the DOM overlay (HUD, screens) for clean screenshots */
  hud: (on: boolean) => { document.getElementById('ui')!.style.display = on ? '' : 'none'; },
  resume: () => resume(),
  /** put the surfer `lead` wall heights ahead of the break (to look at the lip and whitewater) */
  peek: (lead: number) => {
    const H = game.wave.H(game.wave.xb);
    game.x = game.wave.xb + lead * H;
    game.y = 0.5 * H;
    camera.update(game, canvas.clientWidth, canvas.clientHeight, 0, true);
  },
};
