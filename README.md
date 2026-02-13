# Arcade Volleyball

A retro pixel-art remake of the classic DOS [Arcade Volleyball](https://en.wikipedia.org/wiki/Arcade_Volleyball) (1987) built with HTML5 Canvas and vanilla JavaScript. No dependencies, no build step — just open `index.html` and play.

![Retro pixel-art volleyball game](https://img.shields.io/badge/game-HTML5%20Canvas-blue) ![License](https://img.shields.io/badge/license-Apache%202.0-green)

## Features

- **1P vs AI** — single-player against a computer opponent
- **2P Local** — two players on one keyboard
- **Mobile support** — virtual joystick + jump button (touch controls)
- **Retro pixel-art** — 320×200 internal resolution scaled with nearest-neighbor
- **Sound effects** — Web Audio API generated beeps (no audio files needed)
- **Zero dependencies** — pure vanilla JS, single file, ~30 KB

## Controls

| Action | Player 1 | Player 2 |
|--------|----------|----------|
| Move left | `←` | `A` |
| Move right | `→` | `D` |
| Jump | `↑` | `W` |

**Mobile:** Left half of screen = virtual joystick for movement. Right half = jump.

## How to Play

The rules follow classic volleyball:

- Hit the ball over the net using your head
- If the ball touches the ground on your side, the opponent scores
- First to **15 points** wins

## Running Locally

Just serve the files with any static HTTP server:

```bash
# Python
python3 -m http.server 8080

# Node.js
npx serve .

# Or simply open index.html in a browser
```

## Deployment

The game is two static files (`index.html` + `avball.js`). Drop them into any web server, CDN, or hosting platform — no build process required.

## License

Licensed under the [Apache License 2.0](LICENSE).
