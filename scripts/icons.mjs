// Generates the PWA icons (PNG) procedurally: a curling turquoise wave against a sunset.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x / size, y / size);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
const mix = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
const sstep = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

function pixel(u, v, maskable) {
  // sunset sky, the sun low behind the lip
  let c = mix([255, 205, 150], [96, 64, 118], sstep(0, 0.85, v));
  const sd = Math.hypot(u - 0.24, v - 0.3);
  c = mix(c, [255, 246, 214], Math.exp(-sd * sd / 0.012));
  const sea = 0.8, aa = 0.004;
  const cx = 0.34, cy = 0.54, R = 0.3, r = 0.15;
  const dx = u - cx, dy = v - cy, d = Math.hypot(dx, dy);
  const ang = Math.atan2(-dy, dx); // 0 = right, PI/2 = up
  // the face falls away to the right from the top of the barrel
  const crest = cy - R + Math.max(0, dx) * 0.55 + Math.max(0, dx) ** 2 * 0.25;
  const faceIn = u >= cx ? sstep(-aa, aa, v - crest) : 0;
  // the lip: part of the ring between the top and the left, thinning towards its tip
  const tipAng = Math.PI * 1.06;
  const ringIn = sstep(-aa, aa, R - d) * sstep(-aa, aa, d - r) * (ang > Math.PI * 0.5 || ang < -Math.PI * 0.9 ? 1 : 0) * sstep(tipAng + 0.02, tipAng - 0.06, ang < 0 ? ang + Math.PI * 2 : ang);
  const hollow = sstep(aa, -aa, d - r);
  const back = u < cx ? sstep(cy - aa, cy + aa, v) : 0;
  const white = sstep(cy + r * 0.3 + Math.sin(u * 60) * 0.012, cy + r * 1.2, v) * sstep(cx + 0.12, cx - 0.08, u);
  let water = Math.max(faceIn, ringIn, hollow, back);
  if (v > sea) water = 0;
  if (water > 0) {
    // thin water near the crest and in the lip glows turquoise with the sun behind it
    const k = sstep(cx + 0.05, cx + 0.25, u);
    const thin = (1 - sstep(0, 0.32, v - crest)) * k + sstep(r, R, d) * (d < R ? 1 : 0.3) * (1 - k);
    let w = mix([5, 52, 74], [52, 222, 205], thin);
    w = mix(w, [200, 255, 238], thin ** 5 * 0.7);
    w = mix(w, mix([3, 32, 48], [14, 92, 104], sstep(0, r, d)), hollow);
    w = mix(w, [236, 248, 246], white * 0.85);
    c = mix(c, w, water);
  }
  if (v > sea) c = mix([18, 72, 96], [6, 28, 48], sstep(sea, 1, v));
  // foam: the tip of the lip and a line along the crest
  const tx = cx + Math.cos(tipAng) * (R + r) / 2, ty = cy - Math.sin(tipAng) * (R + r) / 2;
  const tip = Math.hypot(u - tx, v - ty);
  c = mix(c, [248, 253, 252], Math.exp(-tip * tip / 0.0035) * 0.95);
  if (u >= cx) c = mix(c, [240, 252, 248], Math.exp(-((v - crest) ** 2) / 0.00008) * 0.7 * faceIn);
  // the surfer: a dark figure on a pale board, carving down the face
  const px = 0.66, py = 0.5;
  const sx = (u - px) / 0.03, sy = (v - py) / 0.062;
  const bx = (u - px) * Math.cos(0.32) + (v - py - 0.068) * Math.sin(0.32), by = -(u - px) * Math.sin(0.32) + (v - py - 0.068) * Math.cos(0.32);
  c = mix(c, [255, 234, 196], sstep(0.012, 0.009, Math.hypot(Math.max(Math.abs(bx) - 0.07, 0), by)));
  c = mix(c, [14, 20, 30], sstep(1.1, 0.9, Math.hypot(sx, sy)));

  let a = 255;
  if (!maskable) {
    const Rr = 0.2, qx = Math.max(Math.abs(u - 0.5) - (0.5 - Rr), 0), qy = Math.max(Math.abs(v - 0.5) - (0.5 - Rr), 0);
    const dd = Math.hypot(qx, qy) - Rr;
    a = clamp(255 * Math.min(1, Math.max(0, -dd * 300)));
  }
  return [clamp(c[0]), clamp(c[1]), clamp(c[2]), a];
}

writeFileSync('public/icon-192.png', png(192, (u, v) => pixel(u, v, false)));
writeFileSync('public/icon-512.png', png(512, (u, v) => pixel(u, v, false)));
writeFileSync('public/icon-maskable-512.png', png(512, (u, v) => pixel(0.5 + (u - 0.5) * 1.25, 0.5 + (v - 0.5) * 1.25, true)));
writeFileSync('public/apple-touch-icon.png', png(180, (u, v) => pixel(u, v, true)));
console.log('icons written');
