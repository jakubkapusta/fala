// Frame pipeline:
//   world pass (one fullscreen shader: sky, sea, the wave, whitewater, water in front)
//   -> shapes (trail, landing rings, surfer) -> soft sprites (spray, mist, drops)
//   -> bloom chain -> composite (shockwave, chromatic aberration, ACES, grain).
// The wave's shape reaches the shader as a per-column texture filled from wave data each frame.

import { Program, Target, DynBuffer, type GL } from '../gl/gl';
import * as S from './shaders';
import { Shapes, glow, solid, type Col } from './shapes';
import type { Game } from '../game/game';
import type { Camera } from '../game/camera';
import { BAL } from '../game/balance';
import { clamp } from '../core/math';
import { palette, type Palette } from './daycycle';

type Kind = 'spray' | 'drop' | 'mist' | 'lip';
type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; kind: Kind; g: number };
type Flash = { x: number; y: number; t: number; kind: 'perfect' | 'clean' | 'wipe' | 'scrape' };

/** eye height above the water (= horizon, world y) and distance to the wave */
const HZ = 55;
const D0 = 2600;
/** columns of wave data sent to the shader */
const COLS = 256;
const MAX_PARTICLES = 900;
const INK = solid(0.008, 0.01, 0.016);

export class Renderer {
  gl: GL;
  hdr: boolean;
  /** 0.5..1: render scale, surface detail, particle count (lowered on slow frames) */
  quality = 1;
  W = 0;
  H = 0;
  private scene: Target;
  private bloom: Target[];
  private pWorld: Program;
  private pFlat: Program;
  private pSprite: Program;
  private pDown: Program;
  private pUp: Program;
  private pComp: Program;
  private emptyVao: WebGLVertexArrayObject;
  private shapes: Shapes;
  private sprites: DynBuffer;
  private colTex: WebGLTexture;
  private colData = new Float32Array(COLS * 4);
  private noiseTex: WebGLTexture;
  private parts: Particle[] = [];
  private flashes: Flash[] = [];
  private t = 0;
  private rnd = 1;
  private pal: Palette = palette(0.25);
  private prevTh = 0;

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 niedostępny');
    this.gl = gl;
    this.hdr = !!gl.getExtension('EXT_color_buffer_float') || !!gl.getExtension('EXT_color_buffer_half_float');
    gl.getExtension('OES_texture_float_linear');
    this.scene = new Target(gl, this.hdr);
    this.bloom = [0, 1, 2, 3, 4].map(() => new Target(gl, this.hdr));
    this.pWorld = new Program(gl, S.FULLSCREEN_VS, S.WORLD_FS, 'world');
    this.pFlat = new Program(gl, S.FLAT_VS, S.FLAT_FS, 'flat');
    this.pSprite = new Program(gl, S.SPRITE_VS, S.SPRITE_FS, 'sprite');
    this.pDown = new Program(gl, S.FULLSCREEN_VS, S.DOWN_FS, 'down');
    this.pUp = new Program(gl, S.FULLSCREEN_VS, S.UP_FS, 'up');
    this.pComp = new Program(gl, S.FULLSCREEN_VS, S.COMPOSITE_FS, 'comp');
    this.emptyVao = gl.createVertexArray()!;
    this.shapes = new Shapes(gl);

    const quad = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.sprites = new DynBuffer(gl, 8, [
      { loc: 1, size: 4, offset: 0, divisor: 1 },
      { loc: 2, size: 4, offset: 4, divisor: 1 },
    ], 8 * MAX_PARTICLES, (g) => {
      g.bindBuffer(g.ARRAY_BUFFER, quad);
      g.enableVertexAttribArray(0);
      g.vertexAttribPointer(0, 2, g.FLOAT, false, 8, 0);
    });

    // random bytes, smoothed by bilinear filtering into value noise in the shaders
    this.noiseTex = gl.createTexture()!;
    const nz = new Uint8Array(256 * 256);
    for (let i = 0; i < nz.length; i++) nz[i] = Math.floor(this.r() * 256);
    gl.bindTexture(gl.TEXTURE_2D, this.noiseTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 256, 256, 0, gl.RED, gl.UNSIGNED_BYTE, nz);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

    this.colTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.colTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, COLS, 1, 0, gl.RGBA, gl.FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  /** Visual-only randomness (never used by the rules). */
  private r() {
    this.rnd = (this.rnd * 16807) % 2147483647;
    return this.rnd / 2147483647;
  }

  resize() {
    const cssW = this.canvas.clientWidth || window.innerWidth;
    const cssH = this.canvas.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5) * this.quality;
    const W = Math.max(2, Math.round(cssW * dpr)), H = Math.max(2, Math.round(cssH * dpr));
    if (W === this.W && H === this.H) return;
    this.W = W;
    this.H = H;
    this.canvas.width = W;
    this.canvas.height = H;
    this.scene.resize(W, H);
    let bw = W / 2, bh = H / 2;
    for (const b of this.bloom) {
      b.resize(bw, bh);
      bw /= 2;
      bh /= 2;
    }
  }

  /** A landing / wipeout burst at a world position. */
  impact(kind: Flash['kind'], x: number, y: number) {
    this.flashes.push({ x, y, t: 0, kind });
    const n = kind === 'wipe' ? 46 : kind === 'perfect' ? 36 : kind === 'scrape' ? 26 : 18;
    for (let i = 0; i < n * this.quality; i++) {
      const a = Math.PI * (0.08 + 0.84 * this.r()), sp = 80 + this.r() * (kind === 'wipe' ? 300 : 240);
      this.add(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 0.5 + this.r() * 0.6, 2 + this.r() * 4, 'drop', 700);
    }
    for (let i = 0; i < 6 * this.quality; i++) {
      this.add(x + (this.r() - 0.5) * 30, y + this.r() * 10, (this.r() - 0.5) * 60, 30 + this.r() * 40, 0.9 + this.r() * 0.6, 14 + this.r() * 16, 'mist', 0);
    }
  }

  private add(x: number, y: number, vx: number, vy: number, max: number, size: number, kind: Kind, g: number) {
    if (this.parts.length >= MAX_PARTICLES * this.quality) return;
    this.parts.push({ x, y, vx, vy, life: 0, max, size, kind, g });
  }

  render(g: Game, cam: Camera, opts: { fade: number; dt: number; phase: number }) {
    const gl = this.gl;
    this.resize();
    this.t += opts.dt;
    const P = (this.pal = palette(opts.phase));
    this.stepFx(g, cam, opts.dt);

    this.scene.bind();
    this.drawWorld(g, cam, P);

    const sh = this.shapes;
    sh.reset();
    sh.ey = cam.ey;
    this.drawTrail(g, cam, P);
    this.drawRings(cam);
    this.drawSurfer(g, cam, P);
    sh.buf.upload();
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    this.pFlat.use().f4('u_view', cam.x, cam.y, 2 / cam.w, 2 / cam.h);
    gl.bindVertexArray(sh.buf.vao);
    gl.drawArrays(gl.TRIANGLES, 0, sh.buf.count);
    this.drawParticles(cam, P);
    gl.disable(gl.BLEND);

    // shockwave from the latest perfect landing
    let shock: [number, number, number, number] = [0, 0, 0, 0];
    let ca = 0.0004;
    const f = this.flashes.find((q) => q.kind === 'perfect');
    if (f) {
      const k = clamp(f.t / 0.6, 0, 1);
      shock = [(f.x - cam.x) / cam.w + 0.5, (f.y - cam.y) / cam.h + 0.5, k * 0.5, (1 - k) * (1 - k)];
      ca += (1 - k) * 0.004;
    }
    this.post(opts.fade, shock, ca);
  }

  // ------------------------------------------------------------ world
  private drawWorld(g: Game, cam: Camera, P: Palette) {
    const gl = this.gl, w = g.wave, d = this.colData;
    const span = cam.w * 1.3 + 400, x0 = cam.x - span / 2;
    for (let i = 0; i < COLS; i++) {
      const x = x0 + (span * i) / (COLS - 1);
      d[i * 4] = w.H(x);
      // the pocket is zero behind the break; the lip and tube there are as steep as the pocket
      d[i * 4 + 1] = w.pocket(Math.max(x, w.xb + 1));
      d[i * 4 + 2] = w.kindAt(x, 'close');
      d[i * 4 + 3] = w.kindAt(x, 'flat');
    }
    gl.bindTexture(gl.TEXTURE_2D, this.colTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, COLS, 1, gl.RGBA, gl.FLOAT, d);

    const sunVis = clamp((P.sunY + 0.03) / 0.06, 0, 1) * clamp(P.sun[0] / 2, 0, 1);
    // texel centres: column i sits at u = (i + 0.5) / COLS
    const du = (COLS - 1) / COLS / span;
    this.pWorld.use()
      .f4('u_view', cam.x, cam.y, cam.w, cam.h).f2('u_res', this.W, this.H)
      .tex('u_col', 0, this.colTex).tex('u_noise', 1, this.noiseTex).f2('u_colX', x0 - (0.5 / COLS) / du, du)
      .f1('u_xb', w.xb).f1('u_time', this.t).f1('u_hz', HZ).f1('u_d0', D0).f1('u_detail', this.quality)
      .v3('u_top', P.top).v3('u_hor', P.hor).v3('u_sunCol', P.sun).v3('u_amb', P.amb).v3('u_deep', P.deep)
      .v3('u_scat', P.scat).v3('u_back', P.back).v3('u_cloud', P.cloud)
      .f3('u_sun', P.sunX, P.sunY, sunVis).f3('u_moon', P.moonX, P.moonY, P.moon)
      .f1('u_backX', sunVis > 0.2 ? P.sunX : P.moonX).f1('u_night', P.night);
    this.fullscreen();
  }

  /** Foam colour lit by the time of day (premultiplied, alpha a), plus the night glow. */
  private foam(a: number, bright = 1): Col {
    const P = this.pal;
    const r = (P.amb[0] * 0.8 + P.back[0] * 0.1) * bright, gg = (P.amb[1] * 0.8 + P.back[1] * 0.1) * bright, b = (P.amb[2] * 0.8 + P.back[2] * 0.1) * bright;
    const n = P.night;
    return [(r + 0.03 * n) * a, (gg + 0.5 * n) * a, (b + 1.1 * n) * a, a * (1 - 0.6 * n)];
  }

  private drawTrail(g: Game, cam: Camera, P: Palette) {
    const sh = this.shapes, px = 1 / cam.scale, tr = g.trail;
    const x0 = cam.x - cam.w / 2 - 40, x1 = cam.x + cam.w / 2 + 40;
    const H = g.wave.H(g.x);
    // foam left on the face slides down and thins out
    for (let i = 1; i < tr.length; i++) {
      const a = tr[i - 1], b = tr[i];
      if (b.x < x0 || a.x > x1 || a.x < g.wave.xb) continue;
      const k = i / tr.length, age = 1 - k;
      const sink = age * age * H * 0.06;
      sh.line(a.x, a.y - sink, b.x, b.y - sink, (1 + k * 2.2) * px, this.foam(0.32 * k * k));
      if (P.night > 0.05) sh.line(a.x, a.y - sink, b.x, b.y - sink, (3 + k * 5) * px, glow(0.1, 0.55, 1.2, 0.5 * k * P.night));
    }
  }

  private drawRings(cam: Camera) {
    const sh = this.shapes, px = 1 / cam.scale;
    for (const f of this.flashes) {
      const k = f.t / 0.6;
      const c = f.kind === 'perfect' ? glow(1, 0.9, 0.55, 2.5 * (1 - k)) : f.kind === 'clean' ? glow(0.6, 1, 0.95, 1.2 * (1 - k)) : glow(0.8, 0.9, 1, 0.8 * (1 - k));
      sh.ring(f.x, f.y, 6 + k * (f.kind === 'perfect' ? 70 : 40), (3 - k * 2) * px * 2, c, 28);
    }
  }

  private drawSurfer(g: Game, cam: Camera, P: Palette) {
    const sh = this.shapes, px = 1 / cam.scale;
    const S = Math.max(40, BAL.cam.minSurferPx * px); // figure height in x-units
    const wipe = g.mode === 'wipe' || g.mode === 'gone';
    // the figure is built in unstretched screen proportions: angles as they look on screen,
    // local y offsets squashed back by ey when placed in the world
    const e = cam.ey;
    const b = Math.atan2(Math.sin(g.board) * e, Math.cos(g.board));
    const ux = Math.cos(b), uy = Math.sin(b) / e;
    const nx = -Math.sin(b), ny = Math.cos(b) / e;
    const x = g.x, y = g.y + (S * 0.04) / e;
    const crouch = g.mode === 'air' ? 0.55 : g.crouch;
    const rim = S * 0.07;
    // rim light from whatever is behind the wave (sun, moon), never too dim to read
    const rl = Math.max(P.back[0], P.back[1], P.back[2], 0.001);
    const rs = Math.max(1.1, rl) / rl;
    const RIM = solid(P.back[0] * rs, P.back[1] * rs, P.back[2] * rs);

    const segs: [number, number, number, number, number][] = [];
    let head: [number, number] = [0, 0];
    if (g.mode !== 'gone') {
      const legL = S * (0.42 - 0.13 * crouch), torso = S * (0.34 - 0.05 * crouch);
      const lean = 0.2 + 0.45 * crouch;
      const fx0 = x - ux * S * 0.17, fy0 = y - uy * S * 0.17, fx1 = x + ux * S * 0.15, fy1 = y + uy * S * 0.15;
      const hx = x - ux * S * 0.02 + nx * legL, hy = y - uy * S * 0.02 + ny * legL;
      const tx = nx * Math.cos(lean) + ux * Math.sin(lean), ty = ny * Math.cos(lean) + uy * Math.sin(lean);
      const sx = hx + tx * torso, sy = hy + ty * torso;
      head = [sx + tx * S * 0.13, sy + ty * S * 0.13];
      const armA = 0.9 - crouch * 0.4;
      segs.push([fx0, fy0, hx, hy, S * 0.11], [fx1, fy1, hx, hy, S * 0.11], [hx, hy, sx, sy, S * 0.14],
        [sx, sy, sx + (ux * Math.cos(armA) - nx * Math.sin(armA) * 0.3) * S * 0.3, sy + (uy * Math.cos(armA) - ny * Math.sin(armA) * 0.3) * S * 0.3, S * 0.07],
        [sx, sy, sx - ux * S * 0.26 + nx * S * 0.08, sy - uy * S * 0.26 + ny * S * 0.08, S * 0.07]);
    }
    // board
    const bl = S * 0.5, bt = S * 0.07;
    const bang = wipe ? b * 1.4 + 0.8 : b;
    const bx = Math.cos(bang) * bl, by = (Math.sin(bang) * bl) / e, bo = (S * 0.02) / e;
    sh.stroke(x - bx, y - by - bo, x + bx, y + by - bo, bt + rim, RIM);
    for (const s of segs) sh.stroke(s[0], s[1], s[2], s[3], s[4] + rim, RIM);
    if (segs.length) sh.disk(head[0], head[1], S * 0.1 + rim / 2, RIM, 12);
    sh.stroke(x - bx, y - by - bo, x + bx, y + by - bo, bt, solid(0.9, 0.75, 0.5));
    for (const s of segs) sh.stroke(s[0], s[1], s[2], s[3], s[4], INK);
    if (segs.length) sh.disk(head[0], head[1], S * 0.1, INK, 12);
  }

  // ------------------------------------------------------------ particles
  private stepFx(g: Game, cam: Camera, dt: number) {
    for (const f of this.flashes) f.t += dt;
    this.flashes = this.flashes.filter((f) => f.t < 0.6);
    const q = this.quality, w = g.wave;
    const gdt = dt * BAL.tempo;

    if (g.mode === 'ride' && g.v > 120 && dt > 0) {
      // spray fans off the rail, heavier when carving hard and fast
      const turn = Math.abs(g.th - this.prevTh) / gdt;
      const rate = (g.v / 600) * (0.5 + g.crouch * 0.5 + Math.min(1.5, turn / 3)) * 90 * q;
      let n = rate * dt;
      while (n > 0) {
        if (n < 1 && this.r() > n) break;
        n -= 1;
        const a = g.th + Math.PI * (0.72 + this.r() * 0.22);
        const sp = g.v * (0.25 + this.r() * 0.4);
        const big = this.r() < 0.25;
        this.add(g.x - Math.cos(g.th) * 8, g.y + 2, Math.cos(a) * sp + g.v * Math.cos(g.th) * 0.3, Math.abs(Math.sin(a)) * sp * 0.8 + 50,
          0.3 + this.r() * 0.35, big ? 6 + this.r() * 6 : 1.8 + this.r() * 2.5, big ? 'mist' : 'spray', big ? 250 : 650);
      }
    }
    this.prevTh = g.th;

    const vx0 = cam.x - cam.w * 0.6, vx1 = cam.x + cam.w * 0.6;
    // the lip throwing spray, and mist rolling off the whitewater
    const Hb = w.H(w.xb);
    if (w.xb > vx0 - Hb && w.xb < vx1 + Hb) {
      for (let i = 0; i < 100 * dt * q; i++) {
        const k = this.r();
        this.add(w.xb - k * Hb * 0.5, Hb * (1.02 - k * 0.3), w.vb * 0.3 - 60 - this.r() * 120, 80 + this.r() * 160, 0.4 + this.r() * 0.5, 2 + this.r() * 3, 'lip', 500);
      }
      for (let i = 0; i < 10 * dt * q; i++) {
        const k = this.r() * 2.5;
        this.add(w.xb - Hb * (0.5 + k), Hb * (0.5 + this.r() * 0.5) * Math.exp(-k * 0.4), w.vb * 0.2 + (this.r() - 0.5) * 60, 20 + this.r() * 50, 1.4 + this.r(), Hb * (0.12 + this.r() * 0.12), 'mist', 0);
      }
    }
    // closeout crests feather spray all along
    for (let i = 0; i < 20 * dt * q; i++) {
      const x = vx0 + this.r() * (vx1 - vx0);
      if (x < w.xb) continue;
      const c = w.kindAt(x, 'close');
      if (c < 0.3 || this.r() > c) continue;
      this.add(x, w.H(x), -40 - this.r() * 80, 60 + this.r() * 120, 0.5 + this.r() * 0.4, 2 + this.r() * 3, 'lip', 450);
    }

    for (const p of this.parts) {
      p.life += dt;
      p.vy -= p.g * dt;
      if (p.kind === 'mist') { p.vx *= 1 - dt * 0.8; p.vy *= 1 - dt * 0.8; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.parts = this.parts.filter((p) => p.life < p.max && p.y > -60);
  }

  private drawParticles(cam: Camera, P: Palette) {
    const b = this.sprites;
    b.reset();
    const x0 = cam.x - cam.w / 2 - 60, x1 = cam.x + cam.w / 2 + 60;
    const n = P.night;
    const px = 1 / cam.scale;
    for (const p of this.parts) {
      if (p.x < x0 || p.x > x1) continue;
      const k = 1 - p.life / p.max;
      let size = p.size, hard = 0.5, a = k;
      if (p.kind === 'mist') { size *= 1 + (1 - k) * 1.5; hard = 0; a = k * (1 - k) * 4 * 0.22; }
      else if (p.kind === 'drop') { hard = 0.7; a = Math.min(1, k * 1.5) * 0.9; }
      else if (p.kind === 'lip') a = k * 0.7;
      else a = k * 0.85;
      size = Math.max(size, 1.4 * px);
      const c = this.foam(a, p.kind === 'mist' ? 0.9 : 1.1);
      this.sprite(p.x, p.y, size, hard, c[0], c[1], c[2], c[3]);
      // at night every splash sparkles blue
      if (n > 0.05 && p.kind !== 'mist') this.sprite(p.x, p.y, size * 2.2, 0, 0.08 * n * a, 0.6 * n * a, 1.4 * n * a, 0);
    }
    if (!b.n) return;
    b.upload();
    this.pSprite.use().f4('u_view', cam.x, cam.y, 2 / cam.w, 2 / cam.h).f1('u_ey', cam.ey);
    this.gl.bindVertexArray(b.vao);
    this.gl.drawArraysInstanced(this.gl.TRIANGLE_STRIP, 0, 4, b.count);
  }

  private sprite(x: number, y: number, size: number, hard: number, r: number, g: number, bl: number, a: number) {
    // a NaN here would reach the HDR targets and show up as black blocks on mobile
    if (!Number.isFinite(x + y + size + r + g + bl + a)) return;
    const b = this.sprites;
    b.ensure(8);
    const d = b.data;
    let i = b.n;
    d[i++] = x; d[i++] = y; d[i++] = size; d[i++] = hard;
    d[i++] = r; d[i++] = g; d[i++] = bl; d[i++] = a;
    b.n = i;
  }

  // ------------------------------------------------------------ post
  private post(fade: number, shock: [number, number, number, number], ca: number) {
    const gl = this.gl;
    let src = this.scene;
    for (let i = 0; i < this.bloom.length; i++) {
      const dst = this.bloom[i];
      dst.bind();
      this.pDown.use().tex('u_src', 0, src.tex).f2('u_texel', 1 / src.w, 1 / src.h).f1('u_pre', i === 0 ? 1 : 0).f1('u_thresh', 0.9);
      this.fullscreen();
      src = dst;
    }
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    for (let i = this.bloom.length - 1; i > 0; i--) {
      const from = this.bloom[i], to = this.bloom[i - 1];
      to.bind();
      this.pUp.use().tex('u_src', 0, from.tex).f2('u_texel', 1 / from.w, 1 / from.h).f1('u_amt', 1);
      this.fullscreen();
    }
    gl.disable(gl.BLEND);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.W, this.H);
    this.pComp.use().tex('u_scene', 0, this.scene.tex).tex('u_bloom', 1, this.bloom[0].tex)
      .f2('u_res', this.W, this.H).f1('u_time', this.t).f1('u_bloomAmt', 0.5).f1('u_exposure', 1).f1('u_ca', ca)
      .f4('u_shock', shock[0], shock[1], shock[2], shock[3]).f3('u_lift', 0.008, 0.012, 0.018).f1('u_sat', 1.08).f1('u_fade', fade);
    this.fullscreen();
  }

  private fullscreen() {
    const gl = this.gl;
    gl.bindVertexArray(this.emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}

export type { Col };
