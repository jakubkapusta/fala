# Fala — notes for agents

Browser game (phone portrait **and** landscape, laptop too): one-thumb surfing along an endless breaking wave. Vite + TypeScript, raw WebGL2, no engine, no image/audio assets (everything procedural/synthesized). Design doc: `docs/PLAN.md` (Polish, the source of truth for milestones M0–M5). Deployed to GitHub Pages from `dist/` by `.github/workflows/pages.yml`. Pattern project: `~/code/roj` — copy code from there, don't import it.

## Commands

```bash
npm run dev          # vite --host
npx tsc --noEmit     # typecheck after every change
npm run build        # typecheck + static build
npm run sim          # headless balance report (see "Balance")
npm run icons        # regenerate PWA icons (scripts/icons.mjs)
```

URL hash: `#debug` shows live numbers (speed, break speed, lead, section, fps); `#bal={"surf":{"push":80}}` overrides balance knobs in the browser (also turns on `#debug`).
Dev helper: `window.__fala` — `game`, `camera`, `renderer`, `BAL`, `auto(0.8)` (a bot plays the ride; `auto(null)` stops), `start()`, `freeze(true)` (stop the clock, keep rendering — for screenshots).

## World and code map

- World units, **y up**. x runs along the wave (the surfer goes right), y is height on the wall: 0 = trough, `H(x)` = crest (~100 for a mid section). Game time ≠ real time: `BAL.tempo` (game s per real s) scales the whole simulation without changing trajectories; the camera and the sim convert to real seconds.
- `src/game/balance.ts` — `BAL`, every number of the ride. New rule number → add a knob here.
- `src/game/wave.ts` — sections (open / flat / close) generated from the seed, blended height and breaking speed, the break point `xb` advancing at `vb`, `pocket(x)` (power by distance ahead of the break) and `power(x, y)` (pocket × height bump), difficulty ramp by break travel.
- `src/game/game.ts` — one ride: modes `ride` / `air` / `wipe` / `gone`, one input `held`. Riding: heading turns towards `headDown` (held) / `headUp` (released); speed from gravity along the face, a small straight-line `push`, and the **pump drive** (see below); launch off the lip, spin in the air, landing graded against `refAngle()`, wipeout, swallowed when `x < xb − swallow·H`. Score = metres + trick points × multiplier.
- `src/game/camera.ts` — adaptive framing: fits wall + flight apex, `lookAhead` real seconds ahead, the break behind; largest zoom that fits all three; springs on zoom and offsets only.
- `src/game/input.ts` — one button: any pointer down / space / ArrowDown = held; Esc = pause.
- `src/game/save.ts` — `fala.meta.v1`, `fala.stats.v1` (every ride), `fala.hints.v1`; all storage access in try/catch.
- `src/render/renderer.ts` — scene → bloom → composite. **M1: placeholder world** drawn with `shapes.ts` (flat triangles, premultiplied linear colours; `glow()` = additive). Visual-only randomness uses the renderer's own RNG.
- `src/ui/ui.ts` + `src/style.css` — DOM HUD (metres, score, multiplier, closeout warning from wave data, edge darkening when the break is close, the button indicator at the bottom showing the pumping rhythm), pops, menu ("Zobacz, jak jeździ bot" = watch the bot, touch to take over; M1 tempo test chips), pause, end screen with "Jeszcze raz" (< 1 s after the swallow). Bot rides don't set records.
- `src/sim/bot.ts` + `scripts/sim.ts` — the player model and the simulator.

## Pumping model (the heart of M1)

Tuned to feel fast and forgiving after the owner's first test ("sluggish, climbing kills speed, can't land a spin").
- Gravity along the face is asymmetric in the pocket: diving *while holding* is heavier (`press`), climbing is much lighter (`lift`: the wave lifts you), so going back up costs little.
- The main drive comes from committed pumps: pulling out of a dive low on the wall (`bottomDrive`, only while the heading still points down) and out of a climb high on it (`topDrive`). Straight riding gets only a small `push`; mashing doesn't pull out of anything.
- `npm run sim -- --pump` prints steady speeds per strategy; keep rhythm ≫ mashing ≫ no input.

Airs: the lip adds `pop × pocket` to the vertical speed. Holding spins the board (`spin`); letting go swings it on to the landing angle the shorter way (`settle`), so finishing most of a turn and releasing completes it. Windows: perfect ≤ 18°, clean ≤ 50°. Landing keeps the take-off speed (perfect ×1.12 + 40); **holding on touchdown carries the fall into a dive** (that's how you land with momentum), otherwise the board levels out. Rotation `rot` counts all forward rotation, held or settled.

## Camera

Largest zoom that fits: the wall + flight apex, `lookAhead` (0.65 real s) ahead, the break behind but never more than `maxBehind` (1.2 H) behind the surfer. Tall screens get a **vertical exaggeration** `ey` up to `stretch` (1.8): y is drawn taller than x. Physics is untouched; `Shapes.ey` keeps line widths, disks and the surfer figure round on screen (the figure is built in screen proportions, board angle mapped with `atan2(sin·ey, cos)`). Wide screens show at least `minWide` (5 H) across. Result: wall ≈ 20–25% of a portrait phone's height, ≈ 43% in landscape.

## Balance

`npm run sim` plays rides headless for skill 0.2 / 0.5 / 0.9 and prints ride time (real seconds), night rate (> 240 s), metres, lead, wipes, airs/tricks, causes of death (closeout / after a wipeout) and closeouts passed, then an **exploit guard** (no input, always hold, mashing at 8 / 3 Hz) that must die well before skill 0.2.

```bash
npm run sim -- --runs 200
npm run sim -- --trace 1007 --skill 0.5          # one ride, a line every 0.2 game s
BAL='{"wave":{"open":{"vb":210}}}' npm run sim  # try knobs without editing
```

Targets (plan): skill 0.5 mean 90–150 s, skill 0.9 regularly past 240 s, skill 0.2 ≥ 40 s (deliberately easier now), closeouts passable with good play. Current (tempo 1): 67 s / 131 s / 273 s (67% reach night); skill 0.9 passes ~97% of closeouts; flights ~0.6 s. The difficulty ramp (`vbRamp`, `rampLen`) decides when everyone eventually loses; breaking speeds decide the spread. Tuned at tempo 1 — changing `tempo` rescales real ride times.

## Offline / PWA

`public/manifest.webmanifest` (orientation `any`) + icons from `npm run icons`. `dist/sw.js` is generated at build time by the plugin in `vite.config.ts` from `src/sw.template.js` (precaches every built file except unused font subsets; cache name = content hash). Registered only in production builds.

## Rules that bite

- Colors in shaders are **linear**; the composite tone-maps and applies gamma.
- GLSL `pow(x, y)` is undefined for `x < 0` and returns NaN on Mali/Adreno: square with `q * q`. `safe()` in `shaders.ts` scrubs HDR inputs before bloom.
- Use the seeded RNG, never `Math.random()`, in game logic.
- Hidden screens must not catch taps: `.screen` uses `visibility: hidden` when not `.show`.
- Hazard warnings come from wave data (`closeAhead`), never from what the camera happens to show.
- The camera follows the surfer's x rigidly; only offsets and zoom are sprung (otherwise the surfer drifts off screen at speed).
- After `git push` don't wait for / poll GitHub Actions.
- Player-facing text Polish; code, comments and names English; commit messages Polish.

## Verifying

Typecheck, `npm run sim`, build, then look at it in the browser at 375×812 and 812×375 (rotate mid-ride) with `__fala.auto(0.8)` and `#debug`.
