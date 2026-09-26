# Fala — notes for agents

Browser game (phone portrait **and** landscape, laptop too): one-thumb surfing along an endless breaking wave. Vite + TypeScript, raw WebGL2, no engine, no image/audio assets (everything procedural/synthesized). Design doc: `docs/PLAN.md` (Polish, the source of truth for milestones M0–M5). Deployed to GitHub Pages from `dist/` by `.github/workflows/pages.yml`. Pattern project: `~/code/roj` — copy code from there, don't import it.

## Status (read first)

- **M0, M1, M2 done** (M1 accepted 2026-09-26; M2 accepted 2026-09-26 after two rounds of feedback: surfer washed out by the sun → own layer over the bloom; stick figure → posed silhouette; flat lower face → foam lines; board too small → shortboard ~1.15× the surfer's height). **M3 accepted** 2026-09-26 (owner: obstacle count fine, may grow more with time → steeper ramp). **M4 (meta) in progress:** first complete version pushed 2026-09-26 — spots, levels with stars, boards and looks, daily wave, records. Waiting for the owner's test.
- Workflow: the owner tests on a phone (portrait and landscape) from GitHub Pages, gives feel feedback in Polish; iterate in small commits, push, describe what changed and why. Numbers in `docs/PLAN.md` were explicitly guesses ("zgadywanka") — the values below were tuned with the owner and supersede them.
- Local preview: `.claude/launch.json` lives one level up in `~/code` (entries `fala` → port 5181 dev, `fala-dist` → 4181 preview).

### M4 decisions (owner, 2026-09-26)

- Spots have **levels**: 6 per spot to start, 60–90 s each, a finish line, fixed seed per level, 3 stars per level. **Stars are the missions** (they replace the plan's 15 missions per spot and the surfer level). Stars count only when the level is finished and are kept per goal across attempts.
- Levels unlock in order. **Finishing level 5 unlocks the next spot.** **Level 6 (bonus, harder) needs 10 of the 15 stars of levels 1–5** in that spot.
- **Endless** (the M3 ride, ends only when swallowed) stays, per spot, with its own record; the daily wave is an endless ride on a date seed (one counted attempt).
- Shells stay the currency for boards and looks.

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
- `src/game/wave.ts` — sections (open / flat / close / steep / tube) generated from the seed (never the same special kind twice in a row, no tube right after a closeout); `barrel(x)` 0..1 on tube sections, blended height and breaking speed, the break point `xb` advancing at `vb`, `pocket(x)` (power by distance ahead of the break) and `power(x, y)` (pocket × height bump), difficulty ramp by break travel.
- `src/game/game.ts` — one ride: modes `ride` / `air` / `wipe` / `gone`, one input `held`. Riding: heading turns towards `headDown` (held) / `headUp` (released); speed from gravity along the face, a small straight-line `push`, and the **pump drive** (see below); launch off the lip, spin in the air, landing graded against `refAngle()`, wipeout, swallowed when `x < xb − swallow·H`. Score = metres + trick points × multiplier.
- `src/game/things.ts` — things on the wave, placed per section from the seed (`Things.populate`): obstacles (rock low, log/buoy high, `rider` = another surfer in a low or high band moving at 0.85·vb, jelly low), helpers (dolphin swims at `dolphinSpeed`, pelican above the crest), shells in lines / arcs over the crest / low lines through barrels. Face things keep `h = y/H`. Extra dolphins appear ahead when the player's lead drops below `lowLead`. No obstacles in the first `clear` units, in closeouts or in tubes.
- `src/game/camera.ts` — adaptive framing: fits wall + flight apex, `lookAhead` real seconds ahead, the break behind; largest zoom that fits all three; springs on zoom and offsets only.
- `src/game/input.ts` — one button: any pointer down / space / ArrowDown = held; Esc = pause.
- `src/game/tuning.ts` — **M1 feel presets** picked in the menu ("Ustawienia testowe"): tempo, turn rate, heading angle, airs, perfect-landing window. Each option overrides a few `BAL` knobs; the defaults there must equal the values in `balance.ts` (the sim and ride-length balance use `balance.ts`). The choice is saved in `fala.meta.v1` (`test`) and logged with every ride in `fala.stats.v1`.
- `src/game/save.ts` — `fala.meta.v1`, `fala.stats.v1` (every ride), `fala.hints.v1`; all storage access in try/catch.
- `src/render/renderer.ts` — world pass → shapes (trail, rings, surfer) → soft sprites (spray, mist, drops) → bloom → composite. Fills the per-column wave texture every frame. Visual-only randomness uses the renderer's own RNG.
- `src/render/shaders.ts` — `WORLD_FS` (the whole world per pixel, see "Rendering"), sprites, flat shapes, bloom, composite.
- `src/render/daycycle.ts` — time-of-day palette from keyframes (`palette(phase)`: 0 dawn, 0.25 noon, 0.4 golden, 0.5 sunset, 0.66–0.88 night).
- `src/ui/ui.ts` + `src/style.css` — DOM HUD (metres, score, multiplier, closeout warning from wave data, edge darkening when the break is close, the button indicator at the bottom showing the pumping rhythm), pops, menu ("Zobacz, jak jeździ bot" = watch the bot, touch to take over; M1 feel preset chips; the menu scrolls and goes two-column in landscape), pause, end screen with "Jeszcze raz" (< 1 s after the swallow). Bot rides don't set records.
- `src/sim/bot.ts` + `scripts/sim.ts` — the player model and the simulator.

## M4: spots, levels, progress (`src/game/spots.ts`, `progress.ts`, `boards.ts`)

- **BAL is layered** on every ride start (`layers()` in `main.ts`): `resetBal()` (defaults captured at load) → M1 test presets → `#bal` → spot `bal` → level `bal` → board `bal`. Never tune BAL in place elsewhere; add a layer.
- **Spots** (`SPOTS`): Hawaje (gentle, lesson), Bali (tubes over a reef, sunsets), Islandia (dark cold water, ice floes `ice`, aurora, dusk start), Zatoka (always night, jellyfish), Nazaré (giant fast waves, stormy sky, cliff). Each has `day` (fixed phase or start range), `bal`, `look` (palette tints, cloud cover, land silhouette on the horizon, aurora, reef — uniforms `u_clouds`, `u_land`, `u_landPeak`, `u_aurora`, `u_reef`).
- **Levels**: 6 per spot, fixed seed, `meters` to the finish, `bal` with `wave.script` — the designed order of sections (o f c s t), then random. `Game(seed, finishMeters)`: crossing `finishX` → event `finish`, mode `done` (glides on, the wave can't catch up), end screen after 1.2 s. Goals (`GoalKind`: shells, score, perfect, tricks, airs, spin, tube, exits, nowipe, dolphin, pelican, mult, time) are checked on the finish line only; stars are a bit mask per level, kept per goal across attempts (`recordLevel`).
- **Unlocking** (`progress.ts`): levels in order; level 5 done → next spot; bonus (level 6) at `BONUS_STARS` (10) of levels 1–5.
- `npm run sim -- --levels [--runs 30] [--spot bali]` prints, per level and skill 0.3 / 0.6 / 0.9: finish %, time, and % of rides earning each star. Current rough targets: skill 0.6 finishes L1–5 ~50–100 %, bonus 10–40 %; skill 0.9 ≥ 70 % on L1–5; bots finish in ~45–90 s. `--spot X` also works for endless rides.
- **Endless** per spot with its own record (`meta.spots[id].best`; the pre-M4 record became Hawaje's). **Daily wave**: FNV hash of the date → seed, spot rotates over the unlocked ones, the first ride of the day counts (`meta.daily`), later ones are practice.
- **Boards** (shells): Deska (default, the owner-tuned feel), Longboard 200 (wide landing window, slow spin/turn), Fish 300 (flat sections), Shortboard 400 (fast spin, narrow window), Gun 600 (big waves, keeps more on wipeouts). Looks: wetsuit colour, trail colour. Drawn by `drawSurfer(..., deck, len, suit)`.
- **UI**: menu (stars/shells wallet, Płyń → spots → levels with goals and a Płyń button / Bez końca, Fala dnia, Deski i wygląd, bot; the M1 test chips folded under "Ustawienia testowe"), level intro card with the goals, pause shows goal progress, end screens per ride kind (stars pop, goals ✓, unlock badges, Dalej / Jeszcze raz / Poziomy). HUD: level progress bar, finish line in the preview and on the wave (floats + checkered flag).
- Saved in `fala.meta.v1`: `spots`, `board`, `owned`, `suit`, `trail`, `daily`, `lastSpot` (added with defaults; old saves load fine).
- Dev: `__fala.level('bali', 2)`, `__fala.meta`.

## M3 rules (full ride)

- **Tube** (`BAL.tube`): on tube sections the lip covers the wall from the break up to `reach` (3.8) H ahead; `barrel(x)` ramps up over `mouth` H from the barrel's front, and the lip's lower edge (`Game.ceiling`) comes down from 1.1 to `hi` (0.66) with it, so a surfer caught high has time to drop. Above ceiling + `hitMargin` → wipeout (cause `lip`); below `lo` → foam drag. Inside (`barrel > 0.5`): `ptsPerSec` × mult, and riding out after `minTime` → `exit` × mult and +1 multiplier (event `tubeOut`). Tube sections break a bit faster (vb 390) so the barrel catches the surfer; a good player with a big lead can still outrun it.
- **Collisions** (`Game.touch`): circle vs circle with `things.r` + `surferR`. Rock / log / buoy / rider → wipeout with that cause (riding or in the air). Jelly → speed ×`stingKeep`. Shell → `shells++`. Pelican (in the air only) → vertical speed ≥ `pelicanVy` + points. Dolphin within `dolphinRange` H → `dolphinPush` for up to `dolphinTime` s.
- Events: `wipe` has a `cause`; new `sting`, `shell`, `dolphin`, `pelican`, `tubeIn`, `tubeOut`. `Game.obstacleAhead(t)` for the bot, the camera (breathes out before obstacles) and hints.
- Shells are currency (saved as `meta.shells`, for M4 boards), not points.
- Bot: notices an obstacle with probability 0.55 + 0.43·skill, then passes above low things / below high ones, anticipating its climb by its reaction time; on and before tube sections it keeps under the lip.
- Sim prints a second line per skill: wipe causes, tube time/exits, shells, dolphins, pelicans, stings. Current: ~58 / 135 / 233 s, ~55 % of skill-0.9 rides reach night. Obstacle density ramps 0.14 → 1.2 per 1000 units over `rampLen` (owner: "could grow more with time").

## Sound (`src/audio/audio.ts`)

Web Audio, all synthesized; starts on the first pointer/key gesture, suspends when the page is hidden. Beds: brown-noise wave (by wall height), band-passed hiss (by speed and crouch), low rumble of the break (by lead). A low-pass on beds + effects muffles everything inside a barrel. One-offs: splash, scrape, whoosh on launch / tube exit, pluck (clean), chord + bell (perfect), shell pings climbing a pentatonic scale, dolphin whistle, gull FM chirps (day). Music: detuned-triangle pads, a chord every 7.5 s, major loop by day, minor at night. Toggle: speaker icon in the menu corner and a button in pause (`meta.sound`).

## Hints

`hints()` in `main.ts`: first-time tips from wave data (air, closeout, tube, rock, high log/buoy, rider, jellyfish, dolphin, pelican, shells), one at a time, stored in `fala.hints.v1`, never while the bot rides.

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

## Rendering (M2)

- **One fullscreen pass draws the world** (`WORLD_FS`): sky (gradient, sun, moon, stars, clouds), the flat sea in perspective (behind the wave above the whitewater, and in front of it below y = 0), the wave face, the lip/tube just behind the break, the whitewater pile, mist. Wave shape along x arrives as a 256×1 RGBA16F texture of columns (H, pocket, closeout-ness, flat-ness) spanning the view; `u_xb` is the break. No mesh — the plan's "mesh density" knob is the render scale + `u_detail`.
- Geometry of the backdrop: the eye is `HZ` (55) above the water and `D0` (2600) from the wave; `z = HZ·D0/(HZ − y)` gives depth of a water pixel. Reflections in the front sea test whether the mirrored ray hits the wave (`massTop`) and use `faceLite`, else the sky + sun/moon glint.
- Face: profile normal from flat (trough) to vertical to overhanging (pocket, `steep` from pocket/closeout), ripples as texture lines along the wave, Fresnel reflection (low on the face it reflects the wall above), **translucency** = `transmit(thickness) × backLight × backLobe`: the lip's edge is paper-thin (passes the light's own colour, gold at sunset), thicker water turns turquoise; `backLobe` is a hot spot under the sun/moon's screen x. Crest rim, mane (feathering near the break, thick and pulsing on closeouts), spume at the foot.
- Behind the break (`d = xb − x`): 0…0.6H the curtain falling from the crest and the tube under its edge (the face darkened — pocket is taken at `xb` there, otherwise a seam), then whitewater (`foamTop`, fbm billows) that bursts in from the bottom and the crest, a foam skirt spreading in front, mist above.
- Noise in the world shader comes from a 256² R8 random texture (`vnoise` = one base-level fetch with smoothstep between texels; no derivatives, they are called inside branches). Stars use `hash12`.
- Time of day: a ride starts at phase 0…0.12 (dawn → morning) and advances by real ride time (`DAY_S` = 360 s), so night (≥ 0.62) comes after ~200–240 s — the reward of a long ride. The menu demo starts at any phase. Night: bioluminescent foam, trail and spray.
- **Surfer** (`src/render/surfer.ts`): silhouette on a 2D skeleton with two-bone IK — crouch from `g.crouch`, surf stance (back knee towards the front foot), balance sway, rail grab in the air, body tumbling off the board on a wipeout. Rim light on the side facing the sun/moon. Drawn into its own target (`fg`) and laid over the bloomed scene in the composite, so a bright sun behind can't wash it out (owner's feedback after the first M2 build). Trail = foam line that sinks and fades.
- Lower face (owner: "looked flat"): lines of old foam drawn up the wall, darker trough, stronger ripples; the trough reflects the wall above.
- Performance: render scale capped at 1.5 device px per css px × `quality` (0.5–1, lowered by `adapt()`); `quality` also scales particles and turns off the finest ripple octave. Measured on the dev Mac (Apple M1): ~2.2 ms GPU per frame at 1218×563. Not measured on a real mid-range phone yet.
- Dev: `__fala.tod('sunset' | 0.5 | null)`, `__fala.hud(false)`, `__fala.peek(0.3)` (jump next to the break), `__fala.freeze(true)`, `__fala.start(56)` (fixed seed; 56 has an early tube), `__fala.spawn('rock', 200, 0.06)`; URL `#tod=night`, `#shot` (no overlay, the bot rides — also works in production).
- Barrel in the shader: `u_tube` + row 1 of the column texture (tube, steep). Things are drawn by `src/render/things.ts` (scene) and other surfers by `drawRiders` (surfer layer).
- Not done yet (M5): storm, lightning, spots.

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
