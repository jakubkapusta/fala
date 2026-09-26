// Frame pipeline:
//   scene (sky, world shapes) -> bloom chain -> composite (shockwave, chromatic aberration, ACES, grain).

import { Program, Target, type GL } from '../gl/gl';
import * as S from './shaders';

export class Renderer {
  gl: GL;
  hdr: boolean;
  quality = 1;
  W = 0;
  H = 0;
  private scene: Target;
  private bloom: Target[];
  private pSky: Program;
  private pDown: Program;
  private pUp: Program;
  private pComp: Program;
  private emptyVao: WebGLVertexArrayObject;
  private t0 = performance.now();

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 niedostępny');
    this.gl = gl;
    this.hdr = !!gl.getExtension('EXT_color_buffer_float') || !!gl.getExtension('EXT_color_buffer_half_float');
    gl.getExtension('OES_texture_float_linear');
    this.scene = new Target(gl, this.hdr);
    this.bloom = [0, 1, 2, 3, 4].map(() => new Target(gl, this.hdr));
    this.pSky = new Program(gl, S.FULLSCREEN_VS, S.SKY_FS, 'sky');
    this.pDown = new Program(gl, S.FULLSCREEN_VS, S.DOWN_FS, 'down');
    this.pUp = new Program(gl, S.FULLSCREEN_VS, S.UP_FS, 'up');
    this.pComp = new Program(gl, S.FULLSCREEN_VS, S.COMPOSITE_FS, 'comp');
    this.emptyVao = gl.createVertexArray()!;
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

  render(opts: { fade: number }) {
    const gl = this.gl;
    this.resize();
    const t = (performance.now() - this.t0) / 1000;

    this.scene.bind();
    this.pSky.use().v3('u_top', [0.05, 0.12, 0.3]).v3('u_bot', [0.9, 0.45, 0.25]).f2('u_sun', 0.3, 0.35).f2('u_res', this.W, this.H);
    this.fullscreen();

    this.post(t, opts.fade);
  }

  private post(t: number, fade: number) {
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
      .f2('u_res', this.W, this.H).f1('u_time', t).f1('u_bloomAmt', 0.6).f1('u_exposure', 1).f1('u_ca', 0.0008)
      .f4('u_shock', 0, 0, 0, 0).f3('u_lift', 0.01, 0.015, 0.02).f1('u_sat', 1.05).f1('u_fade', fade);
    this.fullscreen();
  }

  private fullscreen() {
    const gl = this.gl;
    gl.bindVertexArray(this.emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
