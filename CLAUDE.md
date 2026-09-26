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
- `src/game/tuning.ts` — **M1 feel presets** picked in the menu ("Ustawienia testowe"): tempo, turn rate, heading angle, airs. Each option overrides a few `BAL` knobs; the defaults there must equal the values in `balance.ts` (the sim and ride-length balance use `balance.ts`). The choice is saved in `fala.meta.v1` (`test`) and logged with every ride in `fala.stats.v1`.
- `src/game/save.ts` — `fala.meta.v1`, `fala.stats.v1` (every ride), `fala.hints.v1`; all storage access in try/catch.
- `src/render/renderer.ts` — scene → bloom → composite. **M1: placeholder world** drawn with `shapes.ts` (flat triangles, premultiplied linear colours; `glow()` = additive). Visual-only randomness uses the renderer's own RNG.
- `src/ui/ui.ts` + `src/style.css` — DOM HUD (metres, score, multiplier, closeout warning from wave data, edge darkening when the break is close, the button indicator at the bottom showing the pumping rhythm), pops, menu ("Zobacz, jak jeździ bot" = watch the bot, touch to take over; M1 feel preset chips; the menu scrolls and goes two-column in landscape), pause, end screen with "Jeszcze raz" (< 1 s after the swallow). Bot rides don't set records.
- `src/sim/bot.ts` + `scripts/sim.ts` — the player model and the simulator.

## Pumping model (the heart of M1)

Second owner test: "too fast, can't release before hitting the bottom; the wave is a thin strip; hitting the bottom doesn't matter". So the wall is physically tall (H ≈ 200–270) relative to forward speed, with slow turns (`turn` 160°/s): passing ⅓ of the wall on the way down leaves ~0.4–0.6 s before the trough, a full pump cycle takes ~2 s.
- Gravity along the face is asymmetric in the pocket: diving *while holding* is heavier (`press`), climbing much lighter (`lift`: the wave lifts you).
- The main drive comes from committed pumps: pulling out of a dive a little above the trough (`bottomDrive`, band `bottomBand` — zero at the trough, full at 14–30% of the wall) and out of a climb high on the wall (`topDrive`). Straight riding gets only a small `push`; mashing doesn't pull out of anything.
- **Concave face:** below `concave` (30% of the wall) the downward motion flattens out, so a late release rounds off into the flat instead of stabbing the bottom. The flat (`flatZone`) drags (`bottomDrag`); hitting the trough faster than `scrapeVy` = **scrape** ("Dno!"): speed ×`scrapeKeep`, bounce up.
- `npm run sim -- --pump` prints steady speeds per strategy; keep rhythm ≫ mashing ≫ no input. The sim also reports scrapes/min, the ⅓→trough window and the pump cycle; the bot reacts like a human (0.3 s → 0.14 s by skill).

Airs: the lip adds `pop × pocket` to the vertical speed (flights ~1 s). Holding spins the board (`spin`); letting go swings it on to the landing angle the shorter way (`settle`), so finishing most of a turn and releasing completes it. Windows: perfect ≤ 18°, clean ≤ 50°. Landing keeps the take-off speed (perfect ×1.12 + 40); **holding on touchdown carries the fall into a dive** (landing with momentum), otherwise the board levels out.

## Camera

Largest zoom that fits: the wall + flight apex, `lookAhead` (0.8 real s) ahead — `lookAheadHazard` (1.5 s) while a closeout is coming, so the camera breathes out — and the break behind but never more than `maxBehind` (1 H) behind the surfer. Tall screens get a **vertical exaggeration** `ey` up to `stretch` (1.4): y is drawn taller than x; physics untouched; `Shapes.ey` keeps widths, disks and the surfer figure round on screen. Wide screens show at least `minWide` (3.5 H) across. Wall ≈ 33% of a portrait phone's height, ≈ 60% in landscape. The **mini preview** (HUD canvas, top centre) shows the crest profile ~4 real s ahead from wave data: closeouts blink white, flats are dim, foam behind the break, the surfer as a dot.

## Balance

`npm run sim` plays rides headless for skill 0.2 / 0.5 / 0.9 and prints ride time (real seconds), night rate (> 240 s), metres, lead, wipes, airs/tricks, causes of death (closeout / after a wipeout) and closeouts passed, then an **exploit guard** (no input, always hold, mashing at 8 / 3 Hz) that must die well before skill 0.2.

```bash
npm run sim -- --runs 200
npm run sim -- --trace 1007 --skill 0.5          # one ride, a line every 0.2 game s
BAL='{"wave":{"open":{"vb":210}}}' npm run sim  # try knobs without editing
```

Targets (plan): skill 0.5 mean 90–150 s, skill 0.9 regularly past 240 s, skill 0.2 ≥ 40 s (deliberately easier now), closeouts passable with good play. Current (default presets: tempo 1, turn 210°/s, headings −46°/+42°, high airs): about 58 s / 149 s / 227 s, ~half of skill-0.9 rides reach night. Other presets change ride length (faster = shorter); rebalance once the owner picks. The difficulty ramp (`vbRamp`, `rampLen`) decides when everyone eventually loses; breaking speeds decide the spread. Tuned at tempo 1 — changing `tempo` rescales real ride times.

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
