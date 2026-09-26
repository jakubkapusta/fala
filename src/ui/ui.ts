// DOM overlay: HUD, pops, closeout warning, menu / pause / end screens. Text is Polish.

import type { Game } from '../game/game';
import { BAL } from '../game/balance';
import { TEST_GROUPS, type TestKey, type TestSel } from '../game/tuning';

export type UiHooks = {
  start: () => void;
  watch: () => void;
  resume: () => void;
  menu: () => void;
  pause: () => void;
  setTest: (key: TestKey, id: string) => void;
};

export type EndInfo = { game: Game; best: number; isBest: boolean; realTime: number };


const el = (html: string) => {
  const d = document.createElement('div');
  d.innerHTML = html.trim();
  return d.firstElementChild as HTMLElement;
};
const fmt = (n: number) => Math.round(n).toLocaleString('pl-PL');
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export class Ui {
  touch = false;
  private root: HTMLElement;
  private hud: HTMLElement;
  private meters: HTMLElement;
  private score: HTMLElement;
  private mult: HTMLElement;
  private close: HTMLElement;
  private closeBar: HTMLElement;
  private danger: HTMLElement;
  private popEl: HTMLElement;
  private hintEl: HTMLElement;
  private debug: HTMLElement;
  private thumb: HTMLElement;
  private preview: HTMLCanvasElement;
  private pctx: CanvasRenderingContext2D | null;
  private t = 0;
  private botTag: HTMLElement;
  private menuEl: HTMLElement;
  private pauseEl: HTMLElement;
  private endEl: HTMLElement;
  private hintT = 0;
  private fpsAcc = 0;
  private fpsN = 0;
  private fps = 60;
  showDebug = false;

  constructor(private h: UiHooks) {
    this.root = document.getElementById('ui')!;
    this.hud = el(`<div class="hud hidden">
      <div class="left"><div class="meters">0 m</div><div class="score"><span class="pts">0</span> <b class="mult"></b></div></div>
      <button class="icon-btn pause-btn" aria-label="Pauza"><svg viewBox="0 0 16 16"><rect x="3" y="2" width="3.5" height="12" rx="1" fill="currentColor"/><rect x="9.5" y="2" width="3.5" height="12" rx="1" fill="currentColor"/></svg></button>
    </div>`);
    this.meters = this.hud.querySelector('.meters')!;
    this.score = this.hud.querySelector('.pts')!;
    this.mult = this.hud.querySelector('.mult')!;
    this.hud.querySelector('.pause-btn')!.addEventListener('click', () => this.h.pause());
    this.close = el(`<div class="closeout"><span>Zamyka się</span><i><b></b></i></div>`);
    this.closeBar = this.close.querySelector('b')!;
    this.danger = el(`<div class="danger"></div>`);
    this.popEl = el(`<div class="pop"></div>`);
    this.hintEl = el(`<div class="hint"></div>`);
    this.debug = el(`<div class="debug"></div>`);
    this.preview = el(`<canvas class="preview"></canvas>`) as HTMLCanvasElement;
    this.pctx = this.preview.getContext('2d');
    this.thumb = el(`<div class="thumb"><i></i><span>trzymasz</span></div>`);
    this.botTag = el(`<div class="bot-tag">Jedzie bot · dotknij, żeby przejąć</div>`);
    this.menuEl = el(`<div class="screen menu"></div>`);
    this.pauseEl = el(`<div class="screen dim pause">
      <h2 class="h2">Pauza</h2>
      <button class="btn primary resume">Dalej</button>
      <button class="btn ghost to-menu">Menu</button>
    </div>`);
    this.pauseEl.querySelector('.resume')!.addEventListener('click', () => this.h.resume());
    this.pauseEl.querySelector('.to-menu')!.addEventListener('click', () => this.h.menu());
    this.endEl = el(`<div class="screen dim end"></div>`);
    for (const e of [this.danger, this.hud, this.preview, this.thumb, this.botTag, this.close, this.popEl, this.hintEl, this.debug, this.menuEl, this.pauseEl, this.endEl]) this.root.appendChild(e);
  }

  hideScreens() {
    for (const s of [this.menuEl, this.pauseEl, this.endEl]) s.classList.remove('show');
  }

  showMenu(best: number, test: TestSel) {
    this.hideScreens();
    this.hud.classList.add('hidden');
    this.menuEl.innerHTML = `
      <div class="title">Fala</div>
      <p class="lead">Jedź wzdłuż łamiącej się fali. Nie daj się jej dogonić.</p>
      <div class="howto">${this.touch
        ? '<b>Trzymaj palec</b> — zjazd w dół ściany<br><b>Puść</b> — wspinaczka w górę<br>W powietrzu trzymanie <b>obraca deską</b>'
        : '<b>Trzymaj spację</b> albo przycisk myszy — zjazd w dół<br><b>Puść</b> — wspinaczka w górę<br>W powietrzu trzymanie <b>obraca deską</b> · Esc — pauza'}</div>
      ${best > 0 ? `<div class="best">Rekord: <b>${fmt(best)}</b></div>` : ''}
      <button class="btn primary big go">Płyń</button>
      <button class="btn ghost watch">Zobacz, jak jeździ bot</button>
      <div class="tests"><div class="tests-h">Ustawienia testowe (M1)</div>${TEST_GROUPS.map((g) => `<div class="trow"><span>${g.label}</span>${g.options
        .map((o) => `<button class="chip${test[g.key] === o.id ? ' on' : ''}" data-k="${g.key}" data-id="${o.id}">${o.label}</button>`).join('')}</div>`).join('')}</div>`;
    this.menuEl.querySelector('.go')!.addEventListener('click', () => this.h.start());
    this.menuEl.querySelector('.watch')!.addEventListener('click', () => this.h.watch());
    this.menuEl.querySelectorAll<HTMLElement>('.chip').forEach((b) => b.addEventListener('click', () => this.h.setTest(b.dataset.k as TestKey, b.dataset.id!)));
    this.menuEl.classList.add('show');
  }

  showPause() {
    this.pauseEl.classList.add('show');
  }

  showEnd(e: EndInfo) {
    this.hideScreens();
    const g = e.game;
    this.endEl.innerHTML = `
      <div class="end-top">
        <h2 class="h2">Fala cię dogoniła</h2>
        <div class="big-score">${fmt(g.score)}</div>
        ${e.isBest ? '<div class="badge">Nowy rekord!</div>' : `<div class="best">Rekord: <b>${fmt(e.best)}</b></div>`}
        <div class="stats">
          <div><b>${fmt(g.meters)} m</b><span>dystans</span></div>
          <div><b>${clock(e.realTime)}</b><span>czas jazdy</span></div>
          <div><b>${g.tricks}</b><span>triki</span></div>
          <div><b>${g.perfects}</b><span>idealne lądowania</span></div>
          <div><b>${g.wipes}</b><span>wywrotki</span></div>
        </div>
      </div>
      <div class="end-actions">
        <button class="btn primary big again">Jeszcze raz</button>
        <button class="btn ghost to-menu">Menu</button>
      </div>`;
    this.endEl.querySelector('.again')!.addEventListener('click', () => this.h.start());
    this.endEl.querySelector('.to-menu')!.addEventListener('click', () => this.h.menu());
    this.endEl.classList.add('show');
    this.hideHud();
  }

  play() {
    this.hideScreens();
    this.hud.classList.remove('hidden');
  }

  pop(text: string, kind = '') {
    const p = this.popEl;
    p.className = `pop ${kind}`;
    p.innerHTML = text;
    void p.offsetWidth;
    p.classList.add('go');
  }

  hint(html: string, time = 5) {
    this.hintEl.innerHTML = html;
    this.hintEl.classList.add('show');
    this.hintT = time;
  }

  update(g: Game, dt: number, extra: { quality: number; tempo: number; held: boolean; bot: boolean; test: string }) {
    this.t += dt;
    this.drawPreview(g);
    // the button, visible: shows the pumping rhythm (yours or the bot's)
    this.thumb.classList.add('show');
    this.thumb.classList.toggle('on', extra.held);
    this.thumb.querySelector('span')!.textContent = extra.bot ? 'bot trzyma' : 'trzymasz';
    this.botTag.classList.toggle('show', extra.bot);
    this.meters.textContent = `${fmt(g.meters)} m`;
    this.score.textContent = fmt(g.score);
    this.mult.textContent = g.mult > 1 ? `×${g.mult}` : '';

    // closeout warning: from the wave data, not from what the camera shows
    const t = g.closeAhead(3.2 * BAL.tempo);
    const inClose = g.wave.sectionAt(g.x).kind === 'close';
    this.close.classList.toggle('show', t !== null || inClose);
    if (t !== null) this.closeBar.style.width = `${Math.round((1 - t / (3.2 * BAL.tempo)) * 100)}%`;
    else if (inClose) this.closeBar.style.width = '100%';

    // the break closing in: darken the left edge
    const lead = g.mode === 'gone' ? 0 : g.lead;
    this.danger.style.opacity = String(Math.max(0, Math.min(1, (1.3 - lead) / 1.1)));

    if (this.hintT > 0) {
      this.hintT -= dt;
      if (this.hintT <= 0) this.hintEl.classList.remove('show');
    }

    this.fpsAcc += dt;
    this.fpsN++;
    if (this.fpsAcc > 0.5) {
      this.fps = this.fpsN / this.fpsAcc;
      this.fpsAcc = 0;
      this.fpsN = 0;
    }
    if (this.showDebug) {
      this.debug.style.display = 'block';
      this.debug.textContent = `v ${g.v.toFixed(0)} · vx ${g.vxNow.toFixed(0)} · fala ${g.wave.vb.toFixed(0)} · przewaga ${g.lead.toFixed(2)}H · ${g.wave.sectionAt(g.x).kind} · ${this.fps.toFixed(0)} fps · q ${extra.quality.toFixed(2)} · tempo ${extra.tempo} · ${extra.test}`;
    }
  }

  /** Mini preview of the wave ahead (about 4 real seconds), independent of the camera. */
  private drawPreview(g: Game) {
    const c = this.preview, ctx = this.pctx;
    if (!ctx) return;
    this.preview.classList.add('show');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = c.clientWidth, ch = c.clientHeight;
    if (c.width !== Math.round(cw * dpr) || c.height !== Math.round(ch * dpr)) {
      c.width = Math.round(cw * dpr);
      c.height = Math.round(ch * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    const w = g.wave;
    const span = 4 * BAL.tempo * Math.max(g.vxNow, w.vb, 150);
    const x0 = g.x - span * 0.22, x1 = g.x + span;
    const Hmax = 300, pad = 3, base = ch - pad;
    const sx = (x: number) => ((x - x0) / (x1 - x0)) * cw;
    const sy = (y: number) => base - (y / Hmax) * (ch - pad * 2);
    const n = Math.max(20, Math.round(cw / 2));
    const blink = 0.55 + 0.45 * Math.sin(this.t * 9);
    for (let i = 0; i < n; i++) {
      const x = x0 + ((i + 0.5) / n) * (x1 - x0);
      const kind = w.sectionAt(x).kind;
      ctx.fillStyle = x < w.xb ? 'rgba(235,245,245,0.85)'
        : kind === 'close' ? `rgba(255,255,255,${0.5 + 0.5 * blink})`
        : kind === 'flat' ? 'rgba(80,190,180,0.45)' : 'rgba(95,227,210,0.8)';
      const top = sy(w.H(x));
      ctx.fillRect((i / n) * cw, top, cw / n + 0.5, base - top);
    }
    // the surfer
    const px = sx(g.x), py = sy(Math.max(0, g.y));
    ctx.fillStyle = '#ffd08a';
    ctx.beginPath();
    ctx.arc(px, Math.max(3, py), 3, 0, Math.PI * 2);
    ctx.fill();
  }

  hideHud() {
    this.preview.classList.remove('show');
    this.hud.classList.add('hidden');
    this.thumb.classList.remove('show');
    this.botTag.classList.remove('show');
    this.close.classList.remove('show');
    this.danger.style.opacity = '0';
  }
}
