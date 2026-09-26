// Every number that drives the ride, in one place. Rules read these, never literals.
// The simulator (`npm run sim`) can override any of them without touching code:
//   BAL='{"surf":{"push":260},"wave":{"close":{"vb":650}}}' npm run sim
// In the browser the same JSON works in the URL: #bal={"surf":{"push":260}}
//
// Units: world units, y up. A mid wall is H ≈ 100. Speeds in units per *game* second;
// `tempo` maps game time to real time (1 = the plan's speeds, 0.8 = everything 20% slower,
// same trajectories). Angles in degrees.

export const BAL = {
  /** game seconds per real second; scales the whole simulation, not its shape */
  tempo: 0.8,
  unitsPerMeter: 25,

  wave: {
    /** section kinds: wall height range, length range, breaking speed, power multiplier, pick weight */
    open: { H: [90, 115], len: [1400, 2600], vb: 195, power: 1, weight: 6 },
    flat: { H: [58, 72], len: [900, 1500], vb: 155, power: 0.55, weight: 2 },
    close: { H: [96, 125], len: [420, 700], vb: 290, power: 1.15, weight: 1.6 },
    /** units over which height / breaking speed blend at a section boundary */
    blend: 160,
    /** open sections at the start before anything else can appear */
    warmup: 3,
    /** difficulty ramps 0 → 1 over this many units of break travel */
    rampLen: 80000,
    /** at full difficulty: breaking speed ×(1 + vbRamp), closeout weight ×(1 + closeRamp) */
    vbRamp: 0.95,
    closeRamp: 1,
    /** a closeout never follows a closeout and needs this much open/flat wall before it */
    closeGap: 1200,
  },

  surf: {
    /** target heading when holding (down the face) / released (up the face) */
    headDown: -38,
    headUp: 34,
    /** heading turn rate (deg/s) */
    turn: 260,
    /** gravity along the face */
    g: 450,
    /** wave push at full power (all a surfer riding straight gets) */
    push: 60,
    /** pumping, part 1: gravity ×(1 + press·pocket) while diving, ×(1 − lift·pocket) while climbing */
    press: 0.1,
    lift: 0.1,
    /** pumping, part 2 (the main one): drive while turning up near the bottom / down near the top.
     *  Full between band[0] and the wall edge, fading to zero at band[1] (in y/H). */
    bottomDrive: 1800,
    bottomBand: [0.15, 0.55] as [number, number],
    topDrive: 900,
    topBand: [0.5, 0.85] as [number, number],
    /** drag = dragK·v² (+ extra at the bottom / in foam, per second) */
    dragK: 0.001,
    bottomDrag: 0.5,
    foamDrag: 2.0,
    minSpeed: 90,
    maxSpeed: 1100,
    /** power vs distance ahead of the break, in wall heights: full up to `near`, zero at `reach` */
    near: 0.8,
    reach: 4,
    /** power vs height on the wall (y/H): peak and width of the bump, floor at the very bottom */
    peak: 0.52,
    width: 0.45,
    floor: 0.12,
  },

  air: {
    /** vertical speed needed to leave the lip; below it the surfer rolls over the top */
    launchVy: 110,
    /** extra vertical kick from the lip, × power at the crest */
    pop: 200,
    g: 800,
    /** board rotation while holding (deg/s, forward = clockwise) */
    spin: 540,
    /** how fast the board settles towards the landing angle when not holding (1/s) */
    settle: 5,
    /** landing reference angle = crest slope + refMix·(flight direction − crest slope) */
    refMix: 0.35,
  },

  land: {
    /** |board − reference| thresholds (deg) */
    perfect: 12,
    clean: 35,
    /** landing speed = take-off speed × perfectMul + perfectAdd (perfect) or × cleanKeep (clean) */
    perfectMul: 1.1,
    perfectAdd: 30,
    cleanKeep: 0.95,
    /** heading right after landing is clamped to this (deg) */
    minHeading: -60,
  },

  wipe: { keep: 0.45, time: 1.0, sink: 0.55 },

  /** swallowed when x < break − swallow·H */
  swallow: 0.15,

  /** the ride starts with a drop-in: `dropIn` game seconds down the face regardless of input */
  start: { lead: 1.8, y: 0.8, speed: 300, dropIn: 0.55 },

  score: {
    perHalfTurn: 100,
    /** points per unit of apex height above the crest */
    air: 1.2,
    /** apex (in H) that counts as a trick even without rotation */
    bigAir: 0.6,
    perfect: 150,
    multMax: 8,
  },

  /** slow motion after a big trick landed perfectly */
  slowmo: { scale: 0.45, time: 0.45, minTurns: 2 },

  cam: {
    /** real seconds of travel visible ahead of the surfer */
    lookAhead: 1.4,
    /** wall heights visible behind the break (foam) */
    behind: 0.45,
    /** water in front of the wave (in H) and headroom above the crest / flight apex */
    below: 0.3,
    above: 0.35,
    /** share of spare vertical space that goes to the sky */
    skyShare: 0.62,
    /** zoom and framing spring rate (1/s) */
    spring: 3.2,
    /** minimum on-screen surfer height (css px) */
    minSurferPx: 28,
  },
};

export type Bal = typeof BAL;

/** Deep-merge overrides (from the sim or the URL) into BAL. */
export function tuneBal(over: Record<string, unknown>, into: Record<string, unknown> = BAL as unknown as Record<string, unknown>) {
  for (const [k, v] of Object.entries(over)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof into[k] === 'object') tuneBal(v as Record<string, unknown>, into[k] as Record<string, unknown>);
    else into[k] = v;
  }
}

export const DEG = Math.PI / 180;
