// Frame pipeline:
//   scene (sky, then world shapes: far sea, wave face, foam, surfer, spray)
//   -> bloom chain -> composite (shockwave, chromatic aberration, ACES, grain).
// World shapes are placeholder graphics (M1); M2 replaces the wave with the real water shader.

import { Program, Target, type GL } from '../gl/gl';
import * as S from './shaders';
import { Shapes, glow, mixCol, solid, type Col } from './shapes';
import type { Game } from '../game/game';
import type { Camera } from '../game/camera';
import { BAL } from '../game/balance';
import { clamp, smoothstep } from '../core/math';

type Spark = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; foam: boolean };
type Flash = { x: number; y: number; t: number; kind: 'perfect' | 'clean' | 'wipe' };

const DEEP = solid(0.004, 0.028, 0.042);
const BODY = solid(0.012, 0.1, 0.12);
const THIN = solid(0.07, 0.48, 0.44);
const FOAM = solid(0.78, 0.84, 0.86);
const NEAR = solid(0.006, 0.03, 0.045);
const FAR_TOP = solid(0.22, 0.16, 0.18);
const FAR_BOT = solid(0.02, 0.05, 0.08);
const RIM = solid(1.2, 0.8, 0.5);
const INK = solid(0.008, 0.01, 0.016);

export class Renderer {
  gl: GL;
  hdr: boolean;
  quality = 1;
  W = 0;
  H = 0;
  private scene: Target;
  private bloom: Target[];
  private pSky: Program;
  private pFlat: Program;
  private pDown: Program;
  private pUp: Program;
  private pComp: Program;
  private emptyVao: WebGLVertexArrayObject;
  private shapes: Shapes;
  private sparks: Spark[] = [];
  private flashes: Flash[] = [];
  private t = 0;
  private rnd = 1;

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 niedostępny');
    this.gl = gl;
    this.hdr = !!gl.getExtension('EXT_color_buffer_float') || !!gl.getExtension('EXT_color_buffer_half_float');
    gl.getExtension('OES_texture_float_linear');
    this.scene = new Target(gl, this.hdr);
    this.bloom = [0, 1, 2, 3, 4].map(() => new Target(gl, this.hdr));
    this.pSky = new Program(gl, S.FULLSCREEN_VS, S.SKY_FS, 'sky');
    this.pFlat = new Program(gl, S.FLAT_VS, S.FLAT_FS, 'flat');
    this.pDown = new Program(gl, S.FULLSCREEN_VS, S.DOWN_FS, 'down');
    this.pUp = new Program(gl, S.FULLSCREEN_VS, S.UP_FS, 'up');
    this.pComp = new Program(gl, S.FULLSCREEN_VS, S.COMPOSITE_FS, 'comp');
    this.emptyVao = gl.createVertexArray()!;
    this.shapes = new Shapes(gl);
  }

  /** Visual-only randomness (never used by the rules). */
  private r() {
    this.rnd = (this.rnd * 16807) % 2147483647;
    return this.rnd / 2147483647;
  }

  resize() {
    const cssW = this.canvas.clientWidth || window.innerWidth;
    const cssH = this.canvas.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * this.quality;
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
    const n = kind === 'wipe' ? 40 : kind === 'perfect' ? 30 : 14;
    for (let i = 0; i < n * this.quality; i++) {
      const a = Math.PI * (0.1 + 0.8 * this.r()), sp = 60 + this.r() * (kind === 'wipe' ? 260 : 200);
      this.sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: 0.5 + this.r() * 0.5, size: 2 + this.r() * 3, foam: true });
    }
  }

  render(g: Game, cam: Camera, opts: { fade: number; dt: number }) {
    const gl = this.gl;
    this.resize();
    this.t += opts.dt;
    this.stepFx(g, cam, opts.dt);

    this.scene.bind();
    // sun low on the left, behind the wave
    this.pSky.use().v3('u_top', [0.05, 0.1, 0.24]).v3('u_bot', [1.0, 0.52, 0.3]).f2('u_sun', 0.22, 0.62).f2('u_res', this.W, this.H);
    this.fullscreen();

    const sh = this.shapes;
    sh.reset();
    this.drawWorld(g, cam);
    sh.buf.upload();
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    this.pFlat.use().f4('u_view', cam.x, cam.y, 2 / cam.w, 2 / cam.h);
    gl.bindVertexArray(sh.buf.vao);
    gl.drawArrays(gl.TRIANGLES, 0, sh.buf.count);
    gl.disable(gl.BLEND);

    // shockwave from the latest perfect landing
    let shock: [number, number, number, number] = [0, 0, 0, 0];
    let ca = 0.0008;
    const f = this.flashes.find((q) => q.kind === 'perfect');
    if (f) {
      const k = clamp(f.t / 0.6, 0, 1);
      shock = [(f.x - cam.x) / cam.w + 0.5, (f.y - cam.y) / cam.h + 0.5, k * 0.5, (1 - k) * (1 - k)];
      ca += (1 - k) * 0.004;
    }
    this.post(opts.fade, shock, ca);
  }

  // ------------------------------------------------------------ world (placeholder shapes)
  private drawWorld(g: Game, cam: Camera) {
    const sh = this.shapes, w = g.wave;
    const x0 = cam.x - cam.w / 2 - 20, x1 = cam.x + cam.w / 2 + 20;
    const y0 = cam.y - cam.h / 2 - 20, y1 = cam.y + cam.h / 2 + 20;
    const px = 1 / cam.scale; // world units per css px
    const Href = w.H(g.x);

    // far sea behind the wave, up to a horizon at ~half the wall
    const hz = Href * 0.5;
    sh.rect(x0, Math.min(0, y0), x1, hz, FAR_BOT, FAR_TOP);
    sh.rect(x0, hz - 0.6 * px, x1, hz + 0.6 * px, glow(1, 0.7, 0.45, 0.6));

    // the unbroken face: three rows (trough, power line, crest), coloured by pocket power
    const step = Math.max(4, (x1 - x0) / 140);
    const xs = Math.max(x0, w.xb);
    for (let x = xs; x < x1; x += step) {
      const xb = Math.min(x + step, x1);
      const ha = w.H(x), hb = w.H(xb);
      const pa = w.pocket(x), pb = w.pocket(xb);
      const ma = BAL.surf.peak * ha, mb = BAL.surf.peak * hb;
      const midA = mixCol(BODY, solid(0.05, 0.3, 0.3), Math.min(1, pa)), midB = mixCol(BODY, solid(0.05, 0.3, 0.3), Math.min(1, pb));
      const topA = mixCol(THIN, solid(0.14, 0.7, 0.62), pa * 0.5), topB = mixCol(THIN, solid(0.14, 0.7, 0.62), pb * 0.5);
      sh.quad(x, 0, xb, 0, xb, mb, x, ma, DEEP, DEEP, midB, midA);
      sh.quad(x, ma, xb, mb, xb, hb, x, ha, midA, midB, topB, topA);
    }
    // streaks down the face, fixed to the water so they show the speed
    const gap = 55;
    for (let x = Math.ceil(Math.max(x0, w.xb) / gap) * gap; x < x1; x += gap) {
      const h = w.H(x), j = Math.sin(x * 12.9898) * 0.5 + 0.5;
      sh.line(x, h * (0.1 + j * 0.2), x - h * 0.08, h * (0.55 + j * 0.3), 1.2 * px, glow(0.05, 0.25, 0.24, 0.5));
    }
    // crest line and the white mane of a closeout (announced well ahead)
    for (let x = xs; x < x1; x += step) {
      const xb = Math.min(x + step, x1);
      const s = w.sectionAt(x);
      const close = s.kind === 'close' ? smoothstep(s.x0 - 60, s.x0 + 60, x) * (1 - smoothstep(s.x1 - 60, s.x1 + 60, x)) : 0;
      const ha = w.H(x), hb = w.H(xb);
      sh.line(x, ha, xb, hb, (1.5 + close * 5) * px + close * 4, close > 0.05 ? FOAM : glow(0.4, 1, 0.9, 0.9));
      if (close > 0.05) {
        const fl = 0.5 + 0.5 * Math.sin(this.t * 9 + x * 0.05);
        sh.line(x, ha + 2, xb, hb + 2, (3 + fl * 3) * px, glow(1, 1, 1, 0.5 * close));
      }
    }

    // the break: the lip curling over and the foam pile behind it
    const xb = w.xb, Hb = w.H(xb);
    if (xb > x0 - Hb && xb < x1 + Hb) {
      const cx = xb - 0.28 * Hb, cy = 0.6 * Hb, R = 0.4 * Hb;
      let pax = xb, pay = Hb;
      for (let i = 1; i <= 14; i++) {
        const a = Math.PI * (0.35 + (i / 14) * 0.85);
        const qx = cx + Math.cos(a) * R * (1.05 - i * 0.012), qy = cy + Math.sin(a) * R;
        sh.line(pax, pay, qx, qy, Hb * (0.16 - i * 0.007), mixCol(THIN, FOAM, i / 18));
        pax = qx; pay = qy;
      }
      sh.disk(pax, pay, Hb * 0.12, FOAM, 12);
    }
    const fstep = Math.max(6, step);
    for (let x = Math.max(x0, xb - 6000); x < Math.min(x1, xb); x += fstep) {
      const xe = Math.min(x + fstep, xb);
      const fa = this.foamTop(w.H(x), xb - x), fb = this.foamTop(w.H(xe), xb - xe);
      sh.quad(x, 0, xe, 0, xe, fb, x, fa, solid(0.35, 0.42, 0.45), solid(0.35, 0.42, 0.45), FOAM, FOAM);
    }
    for (let i = 0; i < 18; i++) {
      const d = ((i * 37.3 + this.t * 60) % 300) / 300;
      const bx = xb - d * Hb * 2.2 + Math.sin(i * 7.1 + this.t * 3) * 8;
      if (bx < x0 || bx > x1) continue;
      const top = this.foamTop(w.H(bx), xb - bx);
      sh.disk(bx, top - Hb * 0.02, Hb * (0.09 + 0.05 * Math.sin(i * 3.3 + this.t * 5)), FOAM, 10);
    }

    // water in front of the wave, with dashes that slide past
    sh.rect(x0, y0, x1, 0, solid(0.002, 0.012, 0.02), NEAR);
    for (let row = 1; row <= 4; row++) {
      const yy = -row * row * 7;
      if (yy < y0) break;
      const g2 = 70 + row * 25;
      for (let x = Math.floor(x0 / g2) * g2 + (row * 31) % g2; x < x1; x += g2) {
        sh.line(x, yy, x + g2 * 0.35, yy, 1.1 * px, glow(0.25, 0.5, 0.55, 0.12 / row));
      }
    }
    sh.rect(x0, -0.5 * px, x1, 0.8 * px, glow(0.3, 0.7, 0.7, 0.35));

    // trail on the face
    const tr = g.trail;
    for (let i = 1; i < tr.length; i++) {
      const a = tr[i - 1], b = tr[i];
      if (b.x < x0 || a.x > x1) continue;
      const k = i / tr.length;
      sh.line(a.x, a.y, b.x, b.y, (1 + k * 2.5) * px, glow(0.8, 1, 1, 0.35 * k));
    }

    // spray
    for (const s of this.sparks) {
      const k = 1 - s.life / s.max;
      sh.disk(s.x, s.y, s.size * px * (0.6 + k * 0.6), s.foam ? solid(0.9, 0.95, 0.95, k * 0.8) : glow(0.8, 1, 1, k), 6);
    }

    // landing rings
    for (const f of this.flashes) {
      const k = f.t / 0.6;
      const c = f.kind === 'perfect' ? glow(1, 0.9, 0.55, 2.5 * (1 - k)) : f.kind === 'clean' ? glow(0.6, 1, 0.95, 1.2 * (1 - k)) : glow(0.8, 0.9, 1, 0.8 * (1 - k));
      sh.ring(f.x, f.y, 6 + k * (f.kind === 'perfect' ? 70 : 40), (3 - k * 2) * px * 2, c, 28);
    }

    this.drawSurfer(g, cam);
  }

  private foamTop(H: number, behind: number) {
    const k = clamp(behind / (H * 3), 0, 1);
    return H * (0.62 - 0.3 * k) + Math.sin(behind * 0.05 + this.t * 2) * H * 0.03;
  }

  private drawSurfer(g: Game, cam: Camera) {
    const sh = this.shapes, px = 1 / cam.scale;
    const S = Math.max(26, BAL.cam.minSurferPx * px); // figure height in world units
    const wipe = g.mode === 'wipe' || g.mode === 'gone';
    const b = g.board;
    const ux = Math.cos(b), uy = Math.sin(b);
    const nx = -uy, ny = ux;
    const x = g.x, y = g.y + S * 0.04;
    const crouch = g.mode === 'air' ? 0.55 : g.crouch;
    const rim = S * 0.07;

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
    const bx = Math.cos(bang) * bl, by = Math.sin(bang) * bl;
    const board = () => {
      sh.stroke(x - bx, y - by - S * 0.02, x + bx, y + by - S * 0.02, bt + rim, RIM);
    };
    board();
    for (const s of segs) sh.stroke(s[0], s[1], s[2], s[3], s[4] + rim, RIM);
    if (segs.length) sh.disk(head[0], head[1], S * 0.1 + rim / 2, RIM, 12);
    sh.stroke(x - bx, y - by - S * 0.02, x + bx, y + by - S * 0.02, bt, solid(0.9, 0.75, 0.5));
    for (const s of segs) sh.stroke(s[0], s[1], s[2], s[3], s[4], INK);
    if (segs.length) sh.disk(head[0], head[1], S * 0.1, INK, 12);
  }

  // ------------------------------------------------------------ effects
  private stepFx(g: Game, cam: Camera, dt: number) {
    for (const f of this.flashes) f.t += dt;
    this.flashes = this.flashes.filter((f) => f.t < 0.6);
    const q = this.quality;
    if (g.mode === 'ride' && g.v > 150) {
      // spray fans out behind the board, stronger when carving
      const rate = (g.v / 600) * (0.6 + g.crouch) * 60 * q;
      let n = rate * dt;
      while (n > 0) {
        if (n < 1 && this.r() > n) break;
        n -= 1;
        const a = g.th + Math.PI * (0.75 + this.r() * 0.2);
        const sp = g.v * (0.25 + this.r() * 0.35);
        this.sparks.push({ x: g.x - Math.cos(g.th) * 8, y: g.y, vx: Math.cos(a) * sp + g.v * Math.cos(g.th) * 0.3, vy: Math.abs(Math.sin(a)) * sp * 0.8 + 40, life: 0, max: 0.35 + this.r() * 0.3, size: 1.5 + this.r() * 2.5, foam: this.r() < 0.5 });
      }
    }
    // foam mist over the break
    const w = g.wave, Hb = w.H(w.xb);
    if (Math.abs(w.xb - cam.x) < cam.w) {
      for (let i = 0; i < 40 * dt * q; i++) {
        this.sparks.push({ x: w.xb - this.r() * Hb * 0.5, y: Hb * (0.6 + this.r() * 0.5), vx: w.vb * 0.6 + this.r() * 80, vy: 60 + this.r() * 120, life: 0, max: 0.6 + this.r() * 0.5, size: 2 + this.r() * 4, foam: true });
      }
    }
    for (const s of this.sparks) {
      s.life += dt;
      s.vy -= 700 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }
    this.sparks = this.sparks.filter((s) => s.life < s.max && s.y > -40);
    if (this.sparks.length > 700) this.sparks.splice(0, this.sparks.length - 700);
  }

  // ------------------------------------------------------------ post
  private post(fade: number, shock: [number, number, number, number], ca: number) {
    const gl = this.gl;
    let src = this.scene;
    for (let i = 0; i < this.bloom.length; i++) {
      const dst = this.bloom[i];
      dst.bind();
      this.pDown.use().tex('u_src', 0, src.tex).f2('u_texel', 1 / src.w, 1 / src.h).f1('u_pre', i === 0 ? 1 : 0).f1('u_thresh', 0.8);
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
      .f2('u_res', this.W, this.H).f1('u_time', this.t).f1('u_bloomAmt', 0.6).f1('u_exposure', 1).f1('u_ca', ca)
      .f4('u_shock', shock[0], shock[1], shock[2], shock[3]).f3('u_lift', 0.01, 0.015, 0.02).f1('u_sat', 1.05).f1('u_fade', fade);
    this.fullscreen();
  }

  private fullscreen() {
    const gl = this.gl;
    gl.bindVertexArray(this.emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}

export type { Col };
