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
import { makeRng } from './core/rng';

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
if (meta.tempo) BAL.tempo = meta.tempo;
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

const ui = new Ui({
  start: () => startRide(),
  resume: () => resume(),
  menu: () => toMenu(),
  pause: () => pause(),
  setTempo: (t) => {
    BAL.tempo = t;
    meta.tempo = t;
    saveMeta(meta);
    ui.showMenu(meta.best, BAL.tempo);
  },
});
ui.touch = matchMedia('(pointer: coarse)').matches;
ui.showDebug = /debug/.test(hash) || !!balMatch;

const input = new Input(canvas, {
  gesture: () => {},
  pause: () => (mode === 'play' ? pause() : mode === 'pause' ? resume() : undefined),
  enabled: () => mode === 'play',
});

function newDemo() {
  game = new Game((Date.now() & 0xffff) + 1);
  demo = new Bot(0.85, makeRng(game.seed));
  camera.update(game, canvas.clientWidth, canvas.clientHeight, 0, true);
}

function startRide() {
  meta.runs++;
  saveMeta(meta);
  const seed = (Date.now() ^ (performance.now() * 1000)) >>> 0;
  game = new Game(seed);
  demo = null;
  if (auto) auto = new Bot(auto.skill, makeRng(seed));
  mode = 'play';
  endShown = false;
  realTime = 0;
  input.reset();
  ui.touch = input.isTouch || matchMedia('(pointer: coarse)').matches;
  ui.play();
  camera.update(game, canvas.clientWidth, canvas.clientHeight, 0, true);
  fade = 0.6;
  fadeTarget = 0;
  if (!hintSeen('controls') || meta.runs <= 2) {
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
  ui.showMenu(meta.best, BAL.tempo);
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
  const isBest = game.score > meta.best;
  if (isBest) meta.best = game.score;
  saveMeta(meta);
  logRide({ date: today(), time: Math.round(realTime), meters: Math.round(game.meters), score: game.score, wipes: game.wipes, tricks: game.tricks, tempo: BAL.tempo });
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
    game.update(gdt, mode === 'play' && (auto ? auto.step(game, gdt) : input.held));
    if (game.mode !== 'gone') realTime += dt * slowmo;
    handleEvents(game.events);
    if (mode === 'play') ui.update(game, dt, { quality: renderer.quality, tempo: BAL.tempo });
    checkEnd();
  }
  camera.update(game, canvas.clientWidth || innerWidth, canvas.clientHeight || innerHeight, dt);
  fade += (fadeTarget - fade) * Math.min(1, dt * 4);
  renderer.render(game, camera, { fade, dt });
  if (mode === 'play') adapt(raw);
  requestAnimationFrame(frame);
}

newDemo();
ui.showMenu(meta.best, BAL.tempo);
requestAnimationFrame(frame);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__fala = {
  get game() { return game; }, camera, renderer, BAL, loadStats,
  auto: (skill: number | null) => { auto = skill === null ? null : new Bot(skill, makeRng(7)); },
  start: () => startRide(),
  freeze: (on: boolean) => { frozen = on; },
};
