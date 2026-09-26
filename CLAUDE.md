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
- `src/ui/ui.ts` + `src/style.css` — DOM HUD (metres, score, multiplier, closeout warning from wave data, edge darkening when the break is close), pops, menu (with the M1 tempo test chips), pause, end screen with "Jeszcze raz" (< 1 s after the swallow).
- `src/sim/bot.ts` + `scripts/sim.ts` — the player model and the simulator.

## Pumping model (the heart of M1)

A surfer riding straight gets only `push` and loses to the wave. Speed comes from committed pumps: a drive while **pulling out of a dive low on the wall** (`bottomDrive`, only while the heading still points down, fading above `bottomBand`) and **out of a climb high on it** (`topDrive`). Mashing the button doesn't pull out of anything, so it earns little; switching at about ⅓ and ⅔ of the wall and letting the turn carry you is optimal. `npm run sim -- --pump` prints steady speeds per strategy; keep rhythm ≫ mashing ≫ no input.

Airs: the lip adds `pop × pocket` to the vertical speed; flight is free height, not free speed — a clean landing keeps `cleanKeep` of the take-off speed, a perfect one multiplies it. A plain hop (no input in the air) always lands clean; holding spins the board and can wipe you out.

## Balance

`npm run sim` plays rides headless for skill 0.2 / 0.5 / 0.9 and prints ride time (real seconds), night rate (> 240 s), metres, lead, wipes, airs/tricks, causes of death (closeout / after a wipeout) and closeouts passed, then an **exploit guard** (no input, always hold, mashing at 8 / 3 Hz) that must die well before skill 0.2.

```bash
npm run sim -- --runs 200
npm run sim -- --trace 1007 --skill 0.5          # one ride, a line every 0.2 game s
BAL='{"wave":{"open":{"vb":210}}}' npm run sim  # try knobs without editing
```

Targets (plan): skill 0.5 mean 90–150 s, skill 0.9 regularly past 240 s, skill 0.2 ≥ 40 s, closeouts passable with good play. Current (tempo 0.8): 47 s / 110 s / 261 s (71% reach night); skill 0.9 passes ~93% of closeouts. The difficulty ramp (`vbRamp`, `rampLen`) decides when everyone eventually loses; breaking speeds decide the spread. Tuned at tempo 0.8 — changing `tempo` rescales real ride times.

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
