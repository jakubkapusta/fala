// Immediate-mode batch of flat-coloured triangles in world space (placeholder graphics).
// Colours are premultiplied linear RGBA: `solid()` covers, `glow()` (alpha 0) adds light.

import { DynBuffer, type GL } from '../gl/gl';

export type Col = [number, number, number, number];

export const solid = (r: number, g: number, b: number, a = 1): Col => [r * a, g * a, b * a, a];
export const glow = (r: number, g: number, b: number, i = 1): Col => [r * i, g * i, b * i, 0];
export const mixCol = (a: Col, b: Col, t: number): Col => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t];

export class Shapes {
  buf: DynBuffer;
  /** vertical exaggeration of the view: widths and round shapes are kept round on screen */
  ey = 1;
  constructor(gl: GL) {
    this.buf = new DynBuffer(gl, 6, [
      { loc: 0, size: 2, offset: 0 },
      { loc: 1, size: 4, offset: 2 },
    ], 6 * 30000);
  }

  reset() { this.buf.reset(); }

  private v(x: number, y: number, c: Col) {
    const b = this.buf, d = b.data;
    let n = b.n;
    d[n++] = x; d[n++] = y; d[n++] = c[0]; d[n++] = c[1]; d[n++] = c[2]; d[n++] = c[3];
    b.n = n;
  }

  tri(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, ca: Col, cb = ca, cc = ca) {
    this.buf.ensure(18);
    this.v(ax, ay, ca); this.v(bx, by, cb); this.v(cx, cy, cc);
  }

  /** Quad a-b-c-d (in order around the edge), per-corner colours. */
  quad(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number, ca: Col, cb = ca, cc = ca, cd = ca) {
    this.tri(ax, ay, bx, by, cx, cy, ca, cb, cc);
    this.tri(ax, ay, cx, cy, dx, dy, ca, cc, cd);
  }

  rect(x0: number, y0: number, x1: number, y1: number, bottom: Col, top = bottom) {
    this.quad(x0, y0, x1, y0, x1, y1, x0, y1, bottom, bottom, top, top);
  }

  line(ax: number, ay: number, bx: number, by: number, w: number, c: Col, c2 = c) {
    const e = this.ey;
    const dx = bx - ax, dy = (by - ay) * e, l = Math.hypot(dx, dy) || 1;
    const nx = (-dy / l) * w * 0.5, ny = ((dx / l) * w * 0.5) / e;
    this.quad(ax + nx, ay + ny, bx + nx, by + ny, bx - nx, by - ny, ax - nx, ay - ny, c, c2, c2, c);
  }

  /** Line with round-ish caps (a disk at each end). */
  stroke(ax: number, ay: number, bx: number, by: number, w: number, c: Col) {
    this.line(ax, ay, bx, by, w, c);
    this.disk(ax, ay, w / 2, c, 8);
    this.disk(bx, by, w / 2, c, 8);
  }

  disk(x: number, y: number, r: number, c: Col, n = 16, edge?: Col) {
    const e = edge ?? c;
    let px = x + r, py = y;
    for (let i = 1; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const qx = x + Math.cos(a) * r, qy = y + (Math.sin(a) * r) / this.ey;
      this.tri(x, y, px, py, qx, qy, c, e, e);
      px = qx; py = qy;
    }
  }

  ring(x: number, y: number, r: number, w: number, c: Col, n = 24) {
    let pa = 0;
    for (let i = 1; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r0 = r - w / 2, r1 = r + w / 2, e = this.ey;
      this.quad(x + Math.cos(pa) * r0, y + (Math.sin(pa) * r0) / e, x + Math.cos(pa) * r1, y + (Math.sin(pa) * r1) / e,
        x + Math.cos(a) * r1, y + (Math.sin(a) * r1) / e, x + Math.cos(a) * r0, y + (Math.sin(a) * r0) / e, c);
      pa = a;
    }
  }
}
