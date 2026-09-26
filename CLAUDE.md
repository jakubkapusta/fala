# Fala — notes for agents

Browser game (phone portrait **and** landscape, laptop too): one-thumb surfing along an endless breaking wave. Vite + TypeScript, raw WebGL2, no engine, no image/audio assets (everything procedural/synthesized). Design doc: `docs/PLAN.md` (Polish, the source of truth for milestones M0–M5). Deployed to GitHub Pages from `dist/` by `.github/workflows/pages.yml`. Pattern project: `~/code/roj` — copy code from there, don't import it.

## Status (read first)

- **M0 done, M1 done** (accepted by the owner 2026-09-26). **Next: M2 — wait for the owner's go** before starting it. Milestones and acceptance criteria are in `docs/PLAN.md`; the supervisor/owner checks the result after each one.
- Workflow: the owner tests on a phone (portrait and landscape) from GitHub Pages, gives feel feedback in Polish; iterate in small commits, push, describe what changed and why. Numbers in `docs/PLAN.md` were explicitly guesses ("zgadywanka") — the values below were tuned with the owner and supersede them.
- Local preview: `.claude/launch.json` lives one level up in `~/code` (entries `fala` → port 5181 dev, `fala-dist` → 4181 preview).

### Feel locked with the owner in M1 (keep unless they ask)

| Setting | Value | Where |
|---|---|---|
| Tempo | 1.2 | `BAL.tempo` |
| Turn rate ("Skręt: średni") | 210°/s | `surf.turn` |
| Headings ("Kąt: stromy") | −46° down / +42° up | `surf.headDown/headUp` |
| Airs ("Wyskoki: wysokie") | pop 320, air g 600, lift 0.85 | `air.pop`, `air.g`, `surf.lift` |
| Perfect dive window ("Idealne: średnie") | 0.18 game s (≈ 0.15 real s) | `land.perfectWindow` |

The **"Ustawienia testowe (M1)" chips stay in the menu for now** (owner's request) — `src/game/tuning.ts`; its defaults must equal `balance.ts`. Remove or hide them only when the owner says so (probably with M4 meta / a settings screen).

### Owner feedback history (why the physics looks the way it does)

1. Plan numbers (H≈100, headings −55/+50, g 900, vb 420): surfer's horizontal speed was below the break → swallowed in 2 s; riding straight beat pumping. → pump drive model, lower headings.
2. "Sluggish, climbing kills speed, can't land a spin, the wave is a thin strip." → cheap climbs in the pocket (`lift`), stronger held dives (`press`), forgiving spins (auto-settle after release, wide windows), camera look-ahead cut from 1.4 s, portrait vertical stretch.
3. "Now too fast — can't release before hitting the bottom; hitting the bottom doesn't matter; still want a taller wave." → wall physically ×2.2 taller, slower turn, concave face near the trough + flat-water drag + scrape, bot with human reaction times, mini preview + camera that breathes out before hazards.
4. "Too slow again, climbs sluggish, few big airs; give me menu options." → feel presets; owner picked tempo 1 / mid / steep / high, later tempo 1.2.
5. "After a high air I can't go straight into a dive — it bounces or slides along." → the armed dive (fresh press just before touchdown). Then: "should give perfect", then "too easy — only a limited timing window should" → `perfectWindow` option, "średnie" chosen.

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

- World units, **y up**. x runs along the wave (the surfer goes right), y is height on the wall: 0 = trough, `H(x)` = crest (130–160 flat, 200–250 open, 210–270 closeout). Game time ≠ real time: `BAL.tempo` (game s per real s) scales the whole simulation without changing trajectories; the camera and the sim convert to real seconds.
- `src/game/balance.ts` — `BAL`, every number of the ride. New rule number → add a knob here.
- `src/game/wave.ts` — sections (open / flat / close) generated from the seed, blended height and breaking speed, the break point `xb` advancing at `vb`, `pocket(x)` (power by distance ahead of the break) and `power(x, y)` (pocket × height bump), difficulty ramp by break travel.
- `src/game/game.ts` — one ride: modes `ride` / `air` / `wipe` / `gone`, one input `held`. Riding: heading turns towards `headDown` (held) / `headUp` (released); speed from gravity along the face, a small straight-line `push`, and the **pump drive** (see below); launch off the lip, spin in the air, landing graded against `refAngle()`, wipeout, swallowed when `x < xb − swallow·H`. Score = metres + trick points × multiplier.
- `src/game/camera.ts` — adaptive framing: fits wall + flight apex, `lookAhead` real seconds ahead, the break behind; largest zoom that fits all three; springs on zoom and offsets only.
- `src/game/input.ts` — one button: any pointer down / space / ArrowDown = held; Esc = pause.
- `src/game/tuning.ts` — **M1 feel presets** picked in the menu ("Ustawienia testowe"): tempo, turn rate, heading angle, airs, perfect-landing window. Each option overrides a few `BAL` knobs; the defaults there must equal the values in `balance.ts` (the sim and ride-length balance use `balance.ts`). The choice is saved in `fala.meta.v1` (`test`) and logged with every ride in `fala.stats.v1`.
- `src/game/save.ts` — `fala.meta.v1`, `fala.stats.v1` (every ride), `fala.hints.v1`; all storage access in try/catch.
- `src/render/renderer.ts` — scene → bloom → composite. **M1: placeholder world** drawn with `shapes.ts` (flat triangles, premultiplied linear colours; `glow()` = additive). Visual-only randomness uses the renderer's own RNG.
- `src/ui/ui.ts` + `src/style.css` — DOM HUD (metres, score, multiplier, closeout warning from wave data, edge darkening when the break is close, the button indicator at the bottom showing the pumping rhythm), pops, menu ("Zobacz, jak jeździ bot" = watch the bot, touch to take over; M1 feel preset chips; the menu scrolls and goes two-column in landscape), pause, end screen with "Jeszcze raz" (< 1 s after the swallow). Bot rides don't set records.
- `src/sim/bot.ts` + `scripts/sim.ts` — the player model and the simulator.

## Pumping model (the heart of M1)

Second owner test: "too fast, can't release before hitting the bottom; the wave is a thin strip; hitting the bottom doesn't matter". So the wall is physically tall (H ≈ 200–270) relative to forward speed and turns are moderate (`turn` 210°/s): passing ⅓ of the wall on the way down leaves ~0.25–0.4 real s before the trough (0.1 s before the fix), a full pump cycle takes ~1.3–1.9 s.
- Gravity along the face is asymmetric in the pocket: diving *while holding* is heavier (`press`), climbing much lighter (`lift`: the wave lifts you).
- The main drive comes from committed pumps: pulling out of a dive a little above the trough (`bottomDrive`, band `bottomBand` — zero at the trough, full at 14–30% of the wall) and out of a climb high on the wall (`topDrive`). Straight riding gets only a small `push`; mashing doesn't pull out of anything.
- **Concave face:** below `concave` (30% of the wall) the downward motion flattens out, so a late release rounds off into the flat instead of stabbing the bottom. The flat (`flatZone`) drags (`bottomDrag`); hitting the trough faster than `scrapeVy` = **scrape** ("Dno!"): speed ×`scrapeKeep`, bounce up.
- `npm run sim -- --pump` prints steady speeds per strategy; keep rhythm ≫ mashing ≫ no input. The sim also reports scrapes/min, the ⅓→trough window and the pump cycle; the bot reacts like a human (0.3 s → 0.14 s by skill).

Airs: the lip adds `pop × pocket` to the vertical speed (flights ~1 s). Holding spins the board (`spin`); letting go swings it on to the landing angle the shorter way (`settle`), so finishing most of a turn and releasing completes it. Windows: perfect ≤ 18°, clean ≤ 50°. "Perfect" needs either a spin (held in the air) or an armed dive pressed within `perfectWindow` of touchdown (menu option "Idealne": łatwe 0.3 / średnie 0.18 / trudne 0.1 game s); an earlier arm still dives but lands clean; a plain hop is always just clean. Landing keeps the take-off speed (perfect ×1.12 + 40). **Armed dive:** hold and spin share one button, so a *fresh* press within `armWindow` (0.3 game s) of touchdown doesn't spin — it arms the dive while the board keeps settling; on landing the heading follows the fall (clamped to −60°…−20°) and stays down for `dive` s regardless of input, then control returns. Holding a spin non-stop into the water keeps spinning (the way to wipe out). No press = the board levels out and usually hops again off the crest. The bot arms dives too (`armDive`).

## Camera

Largest zoom that fits: the wall + flight apex, `lookAhead` (0.8 real s) ahead — `lookAheadHazard` (1.5 s) while a closeout is coming, so the camera breathes out — and the break behind but never more than `maxBehind` (1 H) behind the surfer. Tall screens get a **vertical exaggeration** `ey` up to `stretch` (1.4): y is drawn taller than x; physics untouched; `Shapes.ey` keeps widths, disks and the surfer figure round on screen. Wide screens show at least `minWide` (3.5 H) across. Wall ≈ 33% of a portrait phone's height, ≈ 60% in landscape. The **mini preview** (HUD canvas, top centre) shows the crest profile ~4 real s ahead from wave data: closeouts blink white, flats are dim, foam behind the break, the surfer as a dot.

## Balance

`npm run sim` plays rides headless for skill 0.2 / 0.5 / 0.9 and prints ride time (real seconds), night rate (> 240 s), metres, lead, wipes, airs/tricks, causes of death (closeout / after a wipeout) and closeouts passed, then an **exploit guard** (no input, always hold, mashing at 8 / 3 Hz) that must die well before skill 0.2.

```bash
npm run sim -- --runs 200
npm run sim -- --trace 1007 --skill 0.5          # one ride, a line every 0.2 game s
BAL='{"wave":{"open":{"vb":210}}}' npm run sim  # try knobs without editing
```

Targets (plan): skill 0.5 mean 90–150 s, skill 0.9 regularly past 240 s, skill 0.2 ≥ 40 s (deliberately easier now), closeouts passable with good play. Current (default presets = the owner's pick: tempo 1.2, turn 210°/s, headings −46°/+42°, high airs): about 56 s / 140 s / 266 s (perfect window "średnie"), ~half of skill-0.9 rides reach night. Other presets change ride length (faster = shorter); rebalance once the owner picks. The difficulty ramp (`vbRamp`, `rampLen`) decides when everyone eventually loses; breaking speeds decide the spread. Tuned at tempo 1.2 — changing `tempo` rescales real ride times.

## Notes for M2 (the water) — what exists and what to replace

- Everything in `drawWorld()` in `renderer.ts` is **placeholder**: sky gradient + sun blob (`SKY_FS`), far sea band with a horizon at 0.5 H, the face as flat-coloured quads (3 rows: trough / power line / crest, brighter with `pocket`), streak lines, crest line + blinking white mane on closeouts, the break as a curled stroke + foam pile + bubbles, water in front, trail, spray sparks (renderer-side, visual RNG), landing rings, stick-figure surfer with a rim. M2 replaces the face/lip/foam/sky/background with the real water shader, keeps the gameplay reads: pocket brightness, closeout mane, break/foam, trail.
- **The view is anisotropic in portrait:** `camera.ey` (up to 1.4) scales y. Any new geometry/shader must use `u_view` = (cam x, cam y, 2/cam.w, 2/cam.h) where `cam.h` already includes `ey`; anything that must look round/uniform (surfer, particles, line widths, sun disc) must compensate like `Shapes` does. The surfer figure is built in screen proportions (`drawSurfer`), board angle mapped `atan2(sin·ey, cos)`.
- Wave data the shader can use: `wave.H(x)`, `wave.slope(x)`, `wave.pocket(x)` (0 at/behind the break, full within 1.2 H ahead, 0 at 5 H), `wave.sectionAt(x).kind`, `wave.xb` (break), `wave.vb`. Typical lead ahead of the break is 2.3–3.2 H, so the break is often off-screen (camera shows at most `maxBehind` = 1 H behind the surfer); the mini preview and the left-edge darkening carry the chase. Consider how the lip/curl reads when it *is* on screen.
- Post chain already there (from Rój): bloom (5 levels, threshold 0.8), composite with ACES, grain, vignette, chromatic aberration, shockwave (used on perfect landings). `safe()` on HDR inputs. Adaptive quality: `adapt()` in `main.ts` lowers `renderer.quality` (render scale 0.5–1) on slow frames — extend it to mesh density / particle count in M2.
- Day cycle, night bioluminescence, storm, time-of-day palettes: not started (M2/M5). Plan: full cycle ≈ 6 min of riding, ride starts at a random time of day; skill-0.9 rides reach night (> 240 s) about half the time.
- Not started (M3+): audio (none at all yet), tubes, obstacles/helpers, shells, proper hints, `#stats` view, spots, missions, boards, daily wave.

## Known issues / loose ends

- Score inflation: tricks and perfect bonuses dominate the score (a skill-0.9 ride scores ~160k); revisit scoring in M3.
- Wipeouts come almost only from holding a spin into the water; the bot wipes ~3×/ride at skill 0.9, humans probably less. Wipe survival (`wipe.keep` 0.45, 1.0 s) was eased from the plan's 25% / 1.2 s.
- Slow motion after a ≥ 360° perfect landing exists (`BAL.slowmo`), untested with the owner.
- `#bal=` in the URL is applied first, then `applyTest()` (the menu presets) overrides tempo, turn, headings, airs and the perfect window — so `#bal` can't change those five; edit `tuning.ts` instead. `#bal` also turns on the debug line.
- Service worker: production only; phones may need one extra reload to pick up a new deploy.

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
