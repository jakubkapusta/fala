// Time of day: a phase 0..1 (0 = dawn, 0.25 noon, 0.4 golden hour, 0.5 sunset, 0.66–0.88 night)
// mapped to a palette by interpolating keyframes. Colours are linear; light colours are HDR.
// Sun and moon live in screen space: x as a fraction of the width, y as a fraction of the
// screen height above the horizon (negative = below it, hidden by the sea).

type V3 = [number, number, number];

export type Palette = {
  top: V3; // sky at the zenith
  hor: V3; // sky at the horizon
  sun: V3; // sun light (HDR)
  sunX: number;
  sunY: number;
  moon: number; // 0..1 visibility
  moonX: number;
  moonY: number;
  amb: V3; // light falling on water and foam from the sky
  deep: V3; // water body colour
  scat: V3; // turquoise of thin, lit water
  back: V3; // light shining through the wave from behind (sun or moon)
  cloud: V3; // lit cloud colour
  night: number; // 0..1: stars, bioluminescence
};

type Key = { p: number } & Palette;

const K: Key[] = [
  { p: 0.0, top: [0.05, 0.08, 0.2], hor: [0.95, 0.46, 0.32], sun: [7, 3.4, 1.7], sunX: 0.24, sunY: 0.06, moon: 0, moonX: 0.8, moonY: 0.5,
    amb: [0.46, 0.4, 0.45], deep: [0.006, 0.028, 0.05], scat: [0.05, 0.36, 0.36], back: [1.5, 0.95, 0.6], cloud: [1.05, 0.55, 0.48], night: 0.08 },
  { p: 0.12, top: [0.04, 0.14, 0.42], hor: [0.62, 0.66, 0.72], sun: [8, 6.2, 4.4], sunX: 0.32, sunY: 0.28, moon: 0, moonX: 0.8, moonY: 0.5,
    amb: [0.72, 0.78, 0.88], deep: [0.005, 0.038, 0.066], scat: [0.03, 0.42, 0.4], back: [0.9, 0.85, 0.72], cloud: [1.0, 0.95, 0.93], night: 0 },
  { p: 0.25, top: [0.025, 0.12, 0.46], hor: [0.42, 0.62, 0.84], sun: [9, 8.2, 7.2], sunX: 0.5, sunY: 0.46, moon: 0, moonX: 0.8, moonY: 0.5,
    amb: [0.95, 1.0, 1.08], deep: [0.004, 0.045, 0.078], scat: [0.02, 0.48, 0.44], back: [0.7, 0.72, 0.7], cloud: [1.15, 1.15, 1.15], night: 0 },
  { p: 0.4, top: [0.05, 0.11, 0.33], hor: [1.0, 0.66, 0.36], sun: [8, 4.6, 2.0], sunX: 0.66, sunY: 0.24, moon: 0, moonX: 0.8, moonY: 0.5,
    amb: [0.78, 0.62, 0.48], deep: [0.007, 0.034, 0.058], scat: [0.05, 0.4, 0.34], back: [1.8, 1.15, 0.6], cloud: [1.25, 0.78, 0.48], night: 0 },
  { p: 0.5, top: [0.045, 0.05, 0.16], hor: [1.15, 0.36, 0.13], sun: [7, 2.2, 0.6], sunX: 0.74, sunY: 0.035, moon: 0, moonX: 0.8, moonY: 0.5,
    amb: [0.52, 0.33, 0.28], deep: [0.009, 0.022, 0.045], scat: [0.07, 0.3, 0.28], back: [2.2, 0.9, 0.35], cloud: [1.25, 0.42, 0.28], night: 0.05 },
  { p: 0.58, top: [0.012, 0.016, 0.06], hor: [0.28, 0.1, 0.12], sun: [2, 0.4, 0.1], sunX: 0.8, sunY: -0.06, moon: 0.4, moonX: 0.3, moonY: 0.3,
    amb: [0.14, 0.12, 0.19], deep: [0.003, 0.01, 0.026], scat: [0.02, 0.12, 0.16], back: [0.35, 0.22, 0.3], cloud: [0.32, 0.16, 0.2], night: 0.55 },
  { p: 0.66, top: [0.002, 0.004, 0.013], hor: [0.008, 0.018, 0.042], sun: [0, 0, 0], sunX: 0.8, sunY: -0.2, moon: 1, moonX: 0.34, moonY: 0.42,
    amb: [0.05, 0.07, 0.12], deep: [0.001, 0.005, 0.013], scat: [0.01, 0.05, 0.08], back: [0.22, 0.34, 0.5], cloud: [0.045, 0.055, 0.085], night: 1 },
  { p: 0.88, top: [0.002, 0.004, 0.013], hor: [0.01, 0.02, 0.045], sun: [0, 0, 0], sunX: 0.2, sunY: -0.2, moon: 1, moonX: 0.62, moonY: 0.5,
    amb: [0.05, 0.07, 0.12], deep: [0.001, 0.005, 0.013], scat: [0.01, 0.05, 0.08], back: [0.22, 0.34, 0.5], cloud: [0.045, 0.055, 0.085], night: 1 },
  { p: 0.95, top: [0.018, 0.026, 0.08], hor: [0.34, 0.18, 0.22], sun: [2, 0.8, 0.4], sunX: 0.2, sunY: -0.05, moon: 0.3, moonX: 0.7, moonY: 0.5,
    amb: [0.2, 0.19, 0.27], deep: [0.003, 0.012, 0.03], scat: [0.03, 0.15, 0.2], back: [0.5, 0.35, 0.35], cloud: [0.4, 0.26, 0.3], night: 0.45 },
];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerp3 = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

export function palette(phase: number): Palette {
  const p = ((phase % 1) + 1) % 1;
  let i = K.length - 1;
  while (i > 0 && K[i].p > p) i--;
  const a = K[i], b = i + 1 < K.length ? K[i + 1] : { ...K[0], p: 1 };
  let t = (p - a.p) / (b.p - a.p);
  t = t * t * (3 - 2 * t);
  return {
    top: lerp3(a.top, b.top, t), hor: lerp3(a.hor, b.hor, t), sun: lerp3(a.sun, b.sun, t),
    sunX: lerp(a.sunX, b.sunX, t), sunY: lerp(a.sunY, b.sunY, t),
    moon: lerp(a.moon, b.moon, t), moonX: lerp(a.moonX, b.moonX, t), moonY: lerp(a.moonY, b.moonY, t),
    amb: lerp3(a.amb, b.amb, t), deep: lerp3(a.deep, b.deep, t), scat: lerp3(a.scat, b.scat, t),
    back: lerp3(a.back, b.back, t), cloud: lerp3(a.cloud, b.cloud, t), night: lerp(a.night, b.night, t),
  };
}

/** Named phases for screenshots / the dev hook. */
export const PHASES = { dawn: 0.02, noon: 0.25, golden: 0.4, sunset: 0.5, night: 0.75 } as const;
