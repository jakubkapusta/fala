// DOM overlay: HUD, pops, warnings, and the screens — menu, spots, levels, shop, pause, end.
// Screens read the saved progress (`meta`) directly; actions go back to main.ts through hooks.
// Text is Polish.

import type { Game } from '../game/game';
import { BAL } from '../game/balance';
import { TEST_GROUPS, type TestKey, type TestSel } from '../game/tuning';
import type { Meta } from '../game/save';
import { BONUS_STARS, SPOTS, goalMet, goalProgress, goalText, spotById, type Spot } from '../game/spots';
import { daily, levelUnlocked, spotRec, spotStars, spotUnlocked, starsOf, totalStars } from '../game/progress';
import { BOARDS, SUITS, TRAILS } from '../game/boards';

export type UiHooks = {
  watch: () => void;
  resume: () => void;
  menu: () => void;
  pause: () => void;
  setTest: (key: TestKey, id: string) => void;
  toggleSound: () => void;
  /** a spot was picked in the menu (the backdrop switches to it) */
  pickSpot: (id: string) => void;
  playLevel: (spot: string, li: number) => void;
  playEndless: (spot: string) => void;
  playDaily: () => void;
  /** the same ride again / the next level */
  again: () => void;
  next: () => void;
  buy: (id: string, price: number) => boolean;
  equip: (kind: 'board' | 'suit' | 'trail', id: string) => void;
};

export type RideInfo =
  | { kind: 'level'; spot: Spot; li: number }
  | { kind: 'endless'; spot: Spot }
  | { kind: 'daily'; spot: Spot; counted: boolean };

export type EndInfo = {
  game: Game; ride: RideInfo; realTime: number; finished: boolean;
  best: number; isBest: boolean;
  /** level rides: goals met this time (bit mask), newly earned stars, what opened */
  met?: number; newStars?: number; openedSpot?: Spot | null; openedBonus?: boolean; hasNext?: boolean;
};

const el = (html: string) => {
  const d = document.createElement('div');
  d.innerHTML = html.trim();
  return d.firstElementChild as HTMLElement;
};
const SHELL_SVG = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 14 L2.2 6.6 A6.2 6.2 0 0 1 13.8 6.6 Z" fill="currentColor"/><path d="M8 14 L5 4.2 M8 14 V3 M8 14 L11 4.2" stroke="rgba(0,0,0,.35)" stroke-width="1"/></svg>`;
const STAR_SVG = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.2l2.1 4.3 4.7.7-3.4 3.3.8 4.7L8 12l-4.2 2.2.8-4.7L1.2 6.2l4.7-.7z" fill="currentColor"/></svg>`;
const LOCK_SVG = `<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor"/><path d="M5 7V5a3 3 0 0 1 6 0v2" stroke="currentColor" stroke-width="1.6" fill="none"/></svg>`;
const SPK = `<path d="M2 6h3l4-3v10l-4-3H2z" fill="currentColor"/>`;
const SPK_ON = `<svg viewBox="0 0 16 16">${SPK}<path d="M11 5.5a3.5 3.5 0 0 1 0 5M12.8 3.5a6 6 0 0 1 0 9" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round"/></svg>`;
const SPK_OFF = `<svg viewBox="0 0 16 16">${SPK}<path d="M11 6l4 4M15 6l-4 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`;
const BACK = `<button class="icon-btn back" aria-label="Wstecz"><svg viewBox="0 0 16 16"><path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`;
const fmt = (n: number) => Math.round(n).toLocaleString('pl-PL');
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const stars = (mask: number, fresh = 0) => `<span class="stars">${[0, 1, 2].map((i) => `<i class="${mask & (1 << i) ? 'on' : ''}${fresh & (1 << i) ? ' new' : ''}">${STAR_SVG}</i>`).join('')}</span>`;
const rgb = (c: [number, number, number], k = 1) => `rgb(${c.map((v) => Math.round(Math.min(1, Math.pow(Math.max(0, v * k), 1 / 2.2)) * 255)).join(',')})`;

export class Ui {
  touch = false;
  sound = true;
  meta!: Meta;
  private root: HTMLElement;
  private hud: HTMLElement;
  private meters: HTMLElement;
  private score: HTMLElement;
  private mult: HTMLElement;
  private close: HTMLElement;
  private closeBar: HTMLElement;
  private tubeEl: HTMLElement;
  private shellsEl: HTMLElement;
  private shellN = -1;
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
  private panelEl: HTMLElement;
  private pauseEl: HTMLElement;
  private endEl: HTMLElement;
  private hintT = 0;
  private fpsAcc = 0;
  private fpsN = 0;
  private fps = 60;
  private testsOpen = false;
  showDebug = false;

  constructor(private h: UiHooks) {
    this.root = document.getElementById('ui')!;
    this.hud = el(`<div class="hud hidden">
      <div class="left"><div class="meters">0 m</div><i class="lvlbar"><b></b></i><div class="score"><span class="pts">0</span> <b class="mult"></b></div><div class="shells">${SHELL_SVG}<span>0</span></div></div>
      <button class="icon-btn pause-btn" aria-label="Pauza"><svg viewBox="0 0 16 16"><rect x="3" y="2" width="3.5" height="12" rx="1" fill="currentColor"/><rect x="9.5" y="2" width="3.5" height="12" rx="1" fill="currentColor"/></svg></button>
    </div>`);
    this.meters = this.hud.querySelector('.meters')!;
    this.score = this.hud.querySelector('.pts')!;
    this.mult = this.hud.querySelector('.mult')!;
    this.shellsEl = this.hud.querySelector('.shells')!;
    this.hud.querySelector('.pause-btn')!.addEventListener('click', () => this.h.pause());
    this.close = el(`<div class="closeout"><span>Zamyka się</span><i><b></b></i></div>`);
    this.closeBar = this.close.querySelector('b')!;
    this.tubeEl = el(`<div class="closeout tubewarn"><span>Tuba — trzymaj się nisko</span></div>`);
    this.danger = el(`<div class="danger"></div>`);
    this.popEl = el(`<div class="pop"></div>`);
    this.hintEl = el(`<div class="hint"></div>`);
    this.debug = el(`<div class="debug"></div>`);
    this.preview = el(`<canvas class="preview"></canvas>`) as HTMLCanvasElement;
    this.pctx = this.preview.getContext('2d');
    this.thumb = el(`<div class="thumb"><i></i><span>trzymasz</span></div>`);
    this.botTag = el(`<div class="bot-tag">Jedzie bot · dotknij, żeby przejąć</div>`);
    this.menuEl = el(`<div class="screen menu"></div>`);
    this.panelEl = el(`<div class="screen dim panel"></div>`);
    this.pauseEl = el(`<div class="screen dim pause"></div>`);
    this.endEl = el(`<div class="screen dim end"></div>`);
    for (const e of [this.danger, this.hud, this.preview, this.thumb, this.botTag, this.close, this.tubeEl, this.popEl, this.hintEl, this.debug, this.menuEl, this.panelEl, this.pauseEl, this.endEl]) this.root.appendChild(e);
  }

  hideScreens() {
    for (const s of [this.menuEl, this.panelEl, this.pauseEl, this.endEl]) s.classList.remove('show');
  }

  private on(root: HTMLElement, sel: string, fn: (e: HTMLElement) => void) {
    root.querySelectorAll<HTMLElement>(sel).forEach((b) => b.addEventListener('click', () => fn(b)));
  }

  // ------------------------------------------------------------ menu
  showMenu(test: TestSel) {
    const m = this.meta;
    this.hideScreens();
    this.hud.classList.add('hidden');
    const d = daily(m);
    const dayRec = m.daily?.date === new Date().toISOString().slice(0, 10) ? m.daily.score : null;
    this.menuEl.innerHTML = `
      <div class="title">Fala</div>
      <p class="lead">Jedź wzdłuż łamiącej się fali. Nie daj się jej dogonić.</p>
      <div class="howto">${this.touch
        ? '<b>Trzymaj palec</b> — zjazd · <b>Puść</b> — wspinaczka<br>W powietrzu trzymanie <b>obraca deską</b><br>Tuż przed wodą <b>dotknij znowu</b> — nurkowanie'
        : '<b>Trzymaj spację</b> — zjazd · <b>Puść</b> — wspinaczka<br>W powietrzu trzymanie <b>obraca deską</b><br>Tuż przed wodą <b>wciśnij znowu</b> — nurkowanie · Esc — pauza'}</div>
      <div class="wallet"><span class="st">${STAR_SVG}<b>${totalStars(m)}</b></span><span class="sh">${SHELL_SVG}<b>${fmt(m.shells)}</b></span></div>
      <button class="btn primary big go">Płyń</button>
      <button class="btn ghost daily">Fala dnia · ${d.spot.name}<small>${d.counted ? 'jedna próba liczy się do wyniku dnia' : `twój wynik dnia: ${fmt(dayRec ?? 0)} · dalej to trening`}</small></button>
      <button class="btn ghost shop">Deski i wygląd</button>
      <button class="btn ghost watch">Zobacz, jak jeździ bot</button>
      <button class="icon-btn sound-btn" aria-label="Dźwięk">${this.sound ? SPK_ON : SPK_OFF}</button>
      <div class="tests${this.testsOpen ? ' open' : ''}"><button class="tests-h">Ustawienia testowe (M1) ${this.testsOpen ? '▴' : '▾'}</button>${TEST_GROUPS.map((g) => `<div class="trow"><span>${g.label}</span>${g.options
        .map((o) => `<button class="chip${test[g.key] === o.id ? ' on' : ''}" data-k="${g.key}" data-id="${o.id}">${o.label}</button>`).join('')}</div>`).join('')}</div>`;
    const q = this.menuEl;
    this.on(q, '.go', () => this.showSpots());
    this.on(q, '.daily', () => this.h.playDaily());
    this.on(q, '.shop', () => this.showShop());
    this.on(q, '.watch', () => this.h.watch());
    this.on(q, '.sound-btn', () => this.h.toggleSound());
    this.on(q, '.tests-h', () => { this.testsOpen = !this.testsOpen; this.showMenu(test); });
    this.on(q, '.chip', (b) => this.h.setTest(b.dataset.k as TestKey, b.dataset.id!));
    q.classList.add('show');
  }

  private panel(title: string, body: string, back: () => void) {
    this.hideScreens();
    this.hud.classList.add('hidden');
    this.panelEl.innerHTML = `<div class="panel-head">${BACK}<h2 class="h2">${title}</h2><span class="wallet small"><span class="st">${STAR_SVG}<b>${totalStars(this.meta)}</b></span><span class="sh">${SHELL_SVG}<b>${fmt(this.meta.shells)}</b></span></span></div><div class="panel-body">${body}</div>`;
    this.on(this.panelEl, '.back', back);
    this.panelEl.classList.add('show');
    this.panelEl.scrollTop = 0;
    return this.panelEl;
  }

  showSpots() {
    const m = this.meta;
    const body = `<div class="spots">${SPOTS.map((s, i) => {
      const open = spotUnlocked(m, i), r = spotRec(m, s.id);
      const done = r.levels.filter((l) => l.done).length;
      return `<button class="spot${open ? '' : ' locked'}" data-id="${s.id}" ${open ? '' : 'disabled'}>
        <b>${s.name}</b><span class="blurb">${s.blurb}</span>
        ${open ? `<span class="meta-row"><span class="st">${STAR_SVG}${spotStars(m, s.id)}/${s.levels.length * 3}</span><span>${done}/${s.levels.length} poziomów</span>${r.best ? `<span>bez końca: ${fmt(r.best)}</span>` : ''}</span>`
          : `<span class="lock">${LOCK_SVG} Ukończ poziom 5 na ${SPOTS[i - 1].name}</span>`}
      </button>`;
    }).join('')}</div>`;
    const p = this.panel('Spoty', body, () => this.h.menu());
    this.on(p, '.spot:not(.locked)', (b) => { this.h.pickSpot(b.dataset.id!); this.showLevels(b.dataset.id!); });
  }

  showLevels(id: string, sel = -1) {
    const m = this.meta, s = spotById(id), r = spotRec(m, id);
    if (sel < 0) {
      // select the first unfinished open level
      sel = 0;
      for (let i = 0; i < s.levels.length; i++) if (levelUnlocked(m, s, i)) { sel = i; if (!r.levels[i].done) break; }
    }
    const have = spotStars(m, id, true);
    const tiles = s.levels.map((l, i) => {
      const open = levelUnlocked(m, s, i), rec = r.levels[i];
      return `<button class="lvl${open ? '' : ' locked'}${i === sel ? ' sel' : ''}${i === 5 ? ' bonus' : ''}" data-i="${i}" ${open ? '' : 'disabled'}>
        <b>${i === 5 ? 'Bonus' : i + 1}</b>${open ? stars(rec.stars) : `<span class="lock">${LOCK_SVG}</span>`}
      </button>`;
    }).join('');
    const L = s.levels[sel], rec = r.levels[sel];
    const lockNote = !levelUnlocked(m, s, 5) ? `<p class="note">${LOCK_SVG} Bonus: zbierz ${BONUS_STARS} ${STAR_SVG} z poziomów 1–5 (masz ${have})</p>` : '';
    const body = `<p class="blurb">${s.blurb}</p>
      <div class="lvls">${tiles}</div>${lockNote}
      <div class="lvl-card">
        <div class="lvl-title">${sel === 5 ? 'Poziom bonusowy' : `Poziom ${sel + 1}`} · ${fmt(L.meters)} m${rec.best ? ` · rekord ${fmt(rec.best)}` : ''}</div>
        <ul class="goals">${L.goals.map((q, i) => `<li class="${rec.stars & (1 << i) ? 'got' : ''}">${STAR_SVG}${goalText(q)}</li>`).join('')}</ul>
        <button class="btn primary big play">Płyń</button>
      </div>
      <button class="btn ghost endless">Bez końca${r.best ? ` · rekord ${fmt(r.best)}` : ''}</button>`;
    const p = this.panel(s.name, body, () => this.showSpots());
    this.on(p, '.lvl:not(.locked)', (b) => this.showLevels(id, Number(b.dataset.i)));
    this.on(p, '.play', () => this.h.playLevel(id, sel));
    this.on(p, '.endless', () => this.h.playEndless(id));
  }

  showShop() {
    const m = this.meta;
    const bar = (v: number) => `<i style="--v:${Math.round(v * 100)}%"></i>`;
    const btn = (kind: 'board' | 'suit' | 'trail', id: string, price: number, current: string) => m.owned.includes(id)
      ? `<button class="chip${current === id ? ' on' : ''}" data-act="equip" data-kind="${kind}" data-id="${id}">${current === id ? 'Wybrana' : 'Wybierz'}</button>`
      : `<button class="chip buy${m.shells < price ? ' poor' : ''}" data-act="buy" data-kind="${kind}" data-id="${id}" data-price="${price}">${SHELL_SVG} ${price}</button>`;
    const body = `
      <div class="boards">${BOARDS.map((b) => `<div class="board-card">
        <svg class="board-pic" viewBox="0 0 120 24"><path d="M${60 - 52 * b.len} 16 Q${60} 22 ${60 + 50 * b.len} 13 Q${60 + 58 * b.len} 8 ${60 + 50 * b.len} 9 Q60 7 ${60 - 52 * b.len} 10 Z" fill="${rgb(b.deck)}"/></svg>
        <b>${b.name}</b><span class="blurb">${b.blurb}</span>
        <div class="bars"><span>Stabilność</span>${bar(b.stats[0])}<span>Obroty</span>${bar(b.stats[1])}<span>Na płaskim</span>${bar(b.stats[2])}</div>
        ${btn('board', b.id, b.price, m.board)}
      </div>`).join('')}</div>
      <h3 class="h3">Pianka</h3><div class="swatches">${SUITS.map((s) => `<div class="sw"><i style="background:${rgb(s.col, 4)}"></i><span>${s.name}</span>${btn('suit', s.id, s.price, m.suit)}</div>`).join('')}</div>
      <h3 class="h3">Ślad</h3><div class="swatches">${TRAILS.map((s) => `<div class="sw"><i style="background:${s.col ? rgb(s.col, 0.8) : '#e8f4f2'}"></i><span>${s.name}</span>${btn('trail', s.id, s.price, m.trail)}</div>`).join('')}</div>`;
    const p = this.panel('Deski i wygląd', body, () => this.h.menu());
    this.on(p, '[data-act]', (b) => {
      const kind = b.dataset.kind as 'board' | 'suit' | 'trail', id = b.dataset.id!;
      if (b.dataset.act === 'buy' && !this.h.buy(id, Number(b.dataset.price))) {
        b.classList.remove('shake');
        void b.offsetWidth;
        b.classList.add('shake');
        return;
      }
      this.h.equip(kind, id);
      const y = this.panelEl.scrollTop;
      this.showShop();
      this.panelEl.scrollTop = y;
    });
  }

  soundLabel() { return this.sound ? 'Dźwięk: włączony' : 'Dźwięk: wyłączony'; }

  /** Refresh the sound buttons after a toggle. */
  setSound(on: boolean) {
    this.sound = on;
    this.root.querySelectorAll<HTMLElement>('.btn.sound').forEach((b) => (b.textContent = this.soundLabel()));
    this.root.querySelectorAll<HTMLElement>('.sound-btn').forEach((b) => (b.innerHTML = on ? SPK_ON : SPK_OFF));
  }

  // ------------------------------------------------------------ pause / end
  showPause(g: Game, ride: RideInfo) {
    const goals = ride.kind === 'level' ? ride.spot.levels[ride.li].goals : null;
    this.pauseEl.innerHTML = `
      <h2 class="h2">Pauza</h2>
      ${ride.kind === 'level' ? `<p class="sub">${ride.spot.name} · ${ride.li === 5 ? 'bonus' : `poziom ${ride.li + 1}`}</p>
        <ul class="goals">${goals!.map((q) => `<li class="${goalMet(q, g) ? 'got' : ''}">${STAR_SVG}${goalText(q)} <em>${goalProgress(q, g)}</em></li>`).join('')}</ul>` : ''}
      <button class="btn primary resume">Dalej</button>
      <button class="btn ghost sound">${this.soundLabel()}</button>
      <button class="btn ghost to-menu">Menu</button>`;
    this.on(this.pauseEl, '.resume', () => this.h.resume());
    this.on(this.pauseEl, '.sound', () => this.h.toggleSound());
    this.on(this.pauseEl, '.to-menu', () => this.h.menu());
    this.pauseEl.classList.add('show');
  }

  /** Goals card at the start of a level. */
  levelIntro(ride: RideInfo) {
    if (ride.kind !== 'level') return;
    const L = ride.spot.levels[ride.li];
    this.hint(`<div class="intro"><b>${ride.spot.name} · ${ride.li === 5 ? 'bonus' : `poziom ${ride.li + 1}`}</b> · ${fmt(L.meters)} m<br>${L.goals.map((q) => `${STAR_SVG} ${goalText(q)}`).join('<br>')}</div>`, 4.5);
  }

  showEnd(e: EndInfo) {
    this.hideScreens();
    const g = e.game, r = e.ride;
    let head: string, actions: string;
    const stats = `<div class="stats">
      <div><b>${fmt(g.meters)} m</b><span>dystans</span></div>
      <div><b>${clock(e.realTime)}</b><span>czas jazdy</span></div>
      <div><b>${g.tricks}</b><span>triki</span></div>
      <div><b>${g.shells}</b><span>muszle</span></div>
      <div><b>${(g.tubeTotal / BAL.tempo).toFixed(1).replace('.', ',')} s</b><span>w tubie</span></div>
      <div><b>${g.wipes}</b><span>wywrotki</span></div>
    </div>`;
    if (r.kind === 'level') {
      const L = r.spot.levels[r.li];
      const rec = spotRec(this.meta, r.spot.id).levels[r.li];
      const pct = Math.max(0, Math.min(99, Math.floor(((g.x - g.x0) / (g.finishX - g.x0)) * 100)));
      head = `<h2 class="h2">${e.finished ? 'Meta!' : 'Fala cię dogoniła'}</h2>
        <p class="sub">${r.spot.name} · ${r.li === 5 ? 'bonus' : `poziom ${r.li + 1}`}${e.finished ? '' : ` · przejechane ${pct}%`}</p>
        ${stars(rec.stars, e.newStars ?? 0)}
        <div class="big-score">${fmt(g.score)}</div>
        ${e.isBest ? '<div class="badge">Nowy rekord poziomu!</div>' : ''}
        <ul class="goals">${L.goals.map((q, i) => `<li class="${(e.met ?? 0) & (1 << i) ? 'got' : rec.stars & (1 << i) ? 'had' : ''}">${STAR_SVG}${goalText(q)}${e.finished ? '' : ` <em>${goalProgress(q, g)}</em>`}</li>`).join('')}</ul>
        ${e.finished ? '' : '<p class="note">Gwiazdki liczą się po dojechaniu do mety.</p>'}
        ${e.openedSpot ? `<div class="badge">Nowy spot: ${e.openedSpot.name}!</div>` : ''}
        ${e.openedBonus ? '<div class="badge">Odblokowany poziom bonusowy!</div>' : ''}`;
      actions = `${e.finished && e.hasNext ? '<button class="btn primary big next">Dalej</button><button class="btn ghost again">Jeszcze raz</button>' : '<button class="btn primary big again">Jeszcze raz</button>'}
        <button class="btn ghost levels">Poziomy</button>`;
    } else {
      const title = r.kind === 'daily' ? `Fala dnia · ${r.spot.name}` : `${r.spot.name} · bez końca`;
      head = `<h2 class="h2">Fala cię dogoniła</h2><p class="sub">${title}${r.kind === 'daily' && !r.counted ? ' · trening' : ''}</p>
        <div class="big-score">${fmt(g.score)}</div>
        ${e.isBest ? `<div class="badge">${r.kind === 'daily' ? 'Wynik dnia zapisany' : 'Nowy rekord!'}</div>` : `<div class="best">${r.kind === 'daily' ? 'Wynik dnia' : 'Rekord'}: <b>${fmt(e.best)}</b></div>`}
        ${stats}`;
      actions = `<button class="btn primary big again">Jeszcze raz</button>
        <button class="btn ghost ${r.kind === 'daily' ? 'to-menu' : 'levels'}">${r.kind === 'daily' ? 'Menu' : 'Poziomy'}</button>`;
    }
    this.endEl.innerHTML = `<div class="end-top">${head}</div><div class="end-actions">${actions}</div>`;
    this.on(this.endEl, '.again', () => this.h.again());
    this.on(this.endEl, '.next', () => this.h.next());
    this.on(this.endEl, '.levels', () => this.showLevels(r.spot.id));
    this.on(this.endEl, '.to-menu', () => this.h.menu());
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

  get hintBusy() { return this.hintT > 0; }

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
    this.hud.classList.toggle('level', !!g.finishX);
    if (g.finishX) (this.hud.querySelector('.lvlbar b') as HTMLElement).style.width = `${Math.min(100, ((g.x - g.x0) / (g.finishX - g.x0)) * 100).toFixed(1)}%`;
    this.score.textContent = fmt(g.score);
    this.mult.textContent = g.mult > 1 ? `×${g.mult}` : '';
    if (g.shells !== this.shellN) {
      this.shellN = g.shells;
      const sp = this.shellsEl.querySelector('span')!;
      sp.textContent = String(g.shells);
      this.shellsEl.classList.remove('bump');
      void this.shellsEl.offsetWidth;
      if (g.shells) this.shellsEl.classList.add('bump');
    }

    // barrel: announced from the wave data, then the time inside
    const tubeSoon = g.wave.kindAt(g.x + 3 * BAL.tempo * Math.max(g.vxNow, 200), 'tube') > 0.5 || g.wave.kindAt(g.x, 'tube') > 0.5;
    this.tubeEl.classList.toggle('show', tubeSoon && !g.inTube && g.mode !== 'gone');
    this.tubeEl.classList.toggle('inside', g.inTube);
    if (g.inTube) {
      this.tubeEl.classList.add('show');
      this.tubeEl.querySelector('span')!.textContent = `W tubie ${(g.tubeT / BAL.tempo).toFixed(1).replace('.', ',')} s`;
    } else this.tubeEl.querySelector('span')!.textContent = 'Tuba — trzymaj się nisko';

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
        : kind === 'flat' ? 'rgba(80,190,180,0.45)' : kind === 'tube' ? 'rgba(40,150,200,0.9)' : 'rgba(95,227,210,0.8)';
      const top = sy(w.H(x));
      ctx.fillRect((i / n) * cw, top, cw / n + 0.5, base - top);
      // the lip over a barrel
      if (kind === 'tube' && x > w.xb) {
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.fillRect((i / n) * cw, top, cw / n + 0.5, 2);
      }
    }
    // obstacles (warm) and helpers (cool) ahead, at their height
    for (const t of g.things.list) {
      if (t.done || t.kind === 'shell' || t.x < x0 || t.x > x1) continue;
      const helper = t.kind === 'dolphin' || t.kind === 'pelican';
      ctx.fillStyle = helper ? '#9fe6ff' : t.kind === 'jelly' ? '#ff9fe0' : '#ff7a4d';
      ctx.beginPath();
      ctx.arc(sx(t.x), Math.max(3, Math.min(base - 1, sy(Math.min(t.y, Hmax)))), helper ? 2 : 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    // the finish line
    if (g.finishX && g.finishX < x1) {
      ctx.fillStyle = '#ffd08a';
      ctx.fillRect(sx(g.finishX) - 1, 0, 2, ch);
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
    this.tubeEl.classList.remove('show');
    this.hintEl.classList.remove('show');
    this.hintT = 0;
    this.danger.style.opacity = '0';
  }
}
