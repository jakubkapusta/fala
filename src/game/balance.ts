// Every number that drives the ride, in one place. Rules read these, never literals.
// The simulator (`npm run sim`) can override any of them without touching code:
//   BAL='{"surf":{"push":80},"wave":{"close":{"vb":500}}}' npm run sim
// In the browser the same JSON works in the URL: #bal={"surf":{"push":260}}
//
// Units: world units, y up. A mid wall is H ≈ 225. Speeds in units per *game* second;
// `tempo` maps game time to real time (1 = the plan's speeds, 0.8 = everything 20% slower,
// same trajectories). Angles in degrees.

export const BAL = {
  /** game seconds per real second; scales the whole simulation, not its shape */
  tempo: 1.2,
  unitsPerMeter: 25,

  wave: {
    /** section kinds: wall height range, length range, breaking speed, power multiplier, pick weight */
    open: { H: [200, 250], len: [1400, 2600], vb: 300, power: 1, weight: 6 },
    flat: { H: [130, 160], len: [900, 1500], vb: 245, power: 0.55, weight: 2 },
    close: { H: [210, 270], len: [420, 700], vb: 480, power: 1.15, weight: 1.6 },
    /** tall, steep, lots of power: big airs */
    steep: { H: [250, 300], len: [900, 1600], vb: 320, power: 1.3, weight: 1.5 },
    /** the lip throws over the wall ahead of the break: a barrel (see `tube`) */
    tube: { H: [230, 280], len: [800, 1300], vb: 320, power: 1.2, weight: 1.3 },
    /** units over which height / breaking speed blend at a section boundary */
    blend: 160,
    /** open sections at the start before anything else can appear */
    warmup: 3,
    /** difficulty ramps 0 → 1 over this many units of break travel */
    rampLen: 170000,
    /** at full difficulty: breaking speed ×(1 + vbRamp), closeout weight ×(1 + closeRamp) */
    vbRamp: 0.6,
    closeRamp: 1,
    /** a closeout never follows a closeout and needs this much open/flat wall before it */
    closeGap: 1200,
  },

  surf: {
    /** target heading when holding (down the face) / released (up the face) */
    headDown: -46,
    headUp: 42,
    /** heading turn rate (deg/s) */
    turn: 210,
    /** gravity along the face */
    g: 420,
    /** wave push at full power (all a surfer riding straight gets) */
    push: 60,
    /** pumping, part 1: gravity ×(1 + press·pocket) while diving *and holding*, ×(1 − lift·pocket)
     *  while climbing (the wave lifts the surfer, so going back up costs little in the pocket) */
    press: 0.4,
    lift: 0.85,
    /** pumping, part 2 (the main one): drive while turning up near the bottom / down near the top.
     *  Bottom turn: zero at the trough, full between band[1] and band[2], zero again at band[3] (y/H).
     *  Top turn: zero below band[0], full above band[1]. */
    bottomDrive: 1000,
    bottomBand: [0.02, 0.14, 0.3, 0.55] as [number, number, number, number],
    topDrive: 450,
    topBand: [0.5, 0.85] as [number, number],
    /** drag = dragK·v² (+ extra at the bottom / in foam, per second) */
    dragK: 0.0005,
    bottomDrag: 1.6,
    /** the bottom drag fades in below this y/H */
    flatZone: 0.08,
    /** concave face: below y/H = concave the downward motion flattens out (to flatMin at the trough) */
    concave: 0.3,
    flatMin: 0.2,
    /** hitting the trough faster than scrapeVy (vertical units/s): speed ×scrapeKeep, heading bounces
     *  up to headUp·scrapeBounce */
    scrapeVy: 30,
    scrapeKeep: 0.75,
    scrapeBounce: 0.5,
    foamDrag: 2.0,
    minSpeed: 90,
    maxSpeed: 1100,
    /** power vs distance ahead of the break, in wall heights: full up to `near`, zero at `reach` */
    near: 1.2,
    reach: 5,
    /** power vs height on the wall (y/H): peak and width of the bump, floor at the very bottom */
    peak: 0.52,
    width: 0.45,
    floor: 0.12,
  },

  air: {
    /** vertical speed needed to leave the lip; below it the surfer rolls over the top */
    launchVy: 110,
    /** extra vertical kick from the lip, × pocket strength */
    pop: 320,
    g: 600,
    /** board rotation while holding (deg/s, forward = clockwise) */
    spin: 650,
    /** after letting go the board swings to the landing angle (shorter way) at this rate (1/s) */
    settle: 5,
    /** landing reference angle = crest slope + refMix·(flight direction − crest slope) */
    refMix: 0.35,
  },

  land: {
    /** |board − reference| thresholds (deg) */
    perfect: 18,
    clean: 50,
    /** landing speed = take-off speed × perfectMul + perfectAdd (perfect) or × cleanKeep (clean) */
    perfectMul: 1.12,
    perfectAdd: 40,
    cleanKeep: 1,
    /** a fresh press within `armWindow` game s of touchdown doesn't spin the board, it arms the dive:
     *  heading right after landing = flight direction clamped to [minHeading, maxHeading] (deg),
     *  then `dive` game s of riding down the face regardless of input */
    armWindow: 0.3,
    /** an armed dive lands "perfect" (speed-up) only if the press came within this many game s of
     *  touchdown (and the board is lined up); earlier presses still dive, but land just "clean" */
    perfectWindow: 0.18,
    minHeading: -60,
    maxHeading: -20,
    dive: 0.25,
  },

  wipe: { keep: 0.45, time: 1.0, sink: 0.55 },

  /** the barrel on tube sections: the lip covers the wall from the break up to `reach` wall heights
   *  ahead of it; the open band inside is y/H ∈ [lo, hi]. Above hi + hitMargin the lip knocks the
   *  surfer off (wipeout), below lo the foam drags (per second). Points per game second inside ×mult,
   *  a bonus for riding out of it after at least `minTime` game s (and +1 multiplier). */
  tube: { reach: 3.2, lo: 0.1, hi: 0.66, hitMargin: 0.08, foamDrag: 1.2, mouth: 0.6, ptsPerSec: 120, exit: 400, minTime: 0.8 },

  /** things on the wave. Densities per 1000 units of wall, from difficulty 0 to 1. */
  things: {
    obstacles: [0.14, 0.7] as [number, number],
    /** relative picks: rocks at the bottom, logs / buoys high on the wall, another surfer, jellyfish */
    mix: { rock: 3, log: 2, buoy: 1.5, rider: 1, jelly: 2 },
    helpers: [0.16, 0.06] as [number, number],
    helperMix: { dolphin: 2, pelican: 1 },
    /** extra helpers when the player is struggling (lead below `lowLead` H): one per `struggleGap` units */
    lowLead: 1.4,
    struggleGap: 2500,
    /** no obstacles within this many units of a section's ends, none at all in the first `clear` units */
    margin: 250,
    clear: 4000,
    /** hit radii (units): the surfer, then each kind */
    surferR: 12,
    r: { rock: 26, log: 18, buoy: 15, rider: 18, jelly: 12, pelican: 30, shell: 22 },
    /** rider: horizontal speed ×vb of its section, height band (y/H) either low or high */
    riderSpeed: 0.85,
    riderLow: 0.25,
    riderHigh: 0.7,
    /** jellyfish sting: speed ×keep */
    stingKeep: 0.8,
    /** dolphin: swims at the surfer's pace; riding within `range` wall heights of it pushes (units/s²) */
    dolphinSpeed: 360,
    dolphinRange: 0.5,
    dolphinPush: 260,
    dolphinTime: 3,
    /** pelican hit in the air: vertical speed at least `pelicanVy`, and points */
    pelicanVy: 380,
    pelicanPts: 150,
    /** shells per group, groups per section */
    shellCount: [6, 11] as [number, number],
    shellGroups: [1, 2] as [number, number],
    shellGap: 42,
  },

  /** swallowed when x < break − swallow·H */
  swallow: 0.15,

  /** the ride starts with a drop-in: `dropIn` game seconds down the face regardless of input */
  start: { lead: 2.5, y: 0.85, speed: 480, dropIn: 0.45 },

  score: {
    perHalfTurn: 100,
    /** points per unit of apex height above the crest */
    air: 1.2,
    /** apex (in H) that counts as a trick even without rotation */
    bigAir: 1.0,
    perfect: 150,
    multMax: 8,
  },

  /** slow motion after a big trick landed perfectly */
  slowmo: { scale: 0.45, time: 0.45, minTurns: 2 },

  cam: {
    /** real seconds of travel visible ahead of the surfer */
    lookAhead: 0.8,
    /** …and this much while a closeout (later: an obstacle) is coming — the camera breathes out */
    lookAheadHazard: 1.5,
    /** wall heights visible behind the break (foam) */
    behind: 0.45,
    /** but never more than this many wall heights behind the surfer (a far break isn't a threat) */
    maxBehind: 1.0,
    /** water in front of the wave (in H) and headroom above the crest / flight apex */
    below: 0.3,
    above: 0.4,
    /** share of spare vertical space that goes to the sky */
    skyShare: 0.6,
    /** vertical exaggeration on tall screens: y is drawn up to this much taller than x
     *  (1 on landscape, rising with the height/width ratio). Visual only, physics untouched. */
    stretch: 1.4,
    /** on wide screens show at least this many wall heights across (fades out towards portrait) */
    minWide: 3.5,
    /** zoom and framing spring rate (1/s) */
    spring: 3.2,
    /** minimum on-screen surfer height (css px) */
    minSurferPx: 36,
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
