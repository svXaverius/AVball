# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Retro pixel-art remake of DOS Arcade Volleyball (1987). Pure vanilla JS, zero dependencies, no build step.

## Running

Open `index.html` in a browser, or serve with any static HTTP server:
```bash
python3 -m http.server 8080
```

There are no tests, no linter, no build system.

## Architecture

The entire game lives in a single IIFE in `avball.js` (~1200 lines). `index.html` is just a canvas shell.

### Internal resolution & rendering
320×200 off-screen canvas (`gCvs`) rendered with game logic, then scaled via nearest-neighbor to a display canvas (`dCvs`) that fills the viewport. All coordinates in game code use the 320×200 space.

### State machine
`Game.state` cycles through: **MENU → SERVE → PLAY → SCORED → OVER** (constants in `ST` object). Each state has its own update method (`uMenu`, `uPlay`, `uOver`) and draw branches in `draw()`.

### Key classes (all in `avball.js`)
- **Game** — main loop (requestAnimationFrame with delta-time stepping), state machine, rendering orchestration
- **Player** — stick-figure with physics (gravity, jump, ground clamp), constrained to own half of court
- **Ball** — physics, wall/net/player collisions, rotation, trail. `update()` returns scorer index or -1
- **AI** — 40-step trajectory prediction, reaction delay (acts every 2nd tick)
- **Input** — keyboard (P1: arrows, P2: WASD) + mobile touch (virtual joystick left half, jump button right half)
- **Sound** — Web Audio API oscillator beeps, no audio files
- **Particles** — simple 2px squares with gravity and fade

### Physics constants (top of file)
Gravity, player speed, jump velocity, bounce damping, and speed limits are all named constants. Ball and player use separate gravity values (`GRAVITY` vs `P_GRAVITY`). Ball speed is capped at 3.5.

### Collision model
Ball-player collision uses circle-circle (ball radius + head radius), reflects velocity off the normal, then adds player velocity influence. Net collision handles top (bounce up) and sides (bounce away) separately.
