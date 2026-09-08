# Verdant — 3D Snake

A self-contained, installable, offline first-person snake game. All 3D art, sounds, fonts and dependencies are local. No accounts, API keys, backend, analytics or external asset requests.

## Run

Requires Node.js 22.12+ (or 20.19+) and npm.

```sh
npm ci
npm run dev
```

For the complete offline PWA:

```sh
npm run build
npm run preview
```

Open the displayed localhost URL. Once the header says **Offline ready**, the game can reload and start new runs without a network connection. Offline caching is enabled in the production build; development mode intentionally stays uncached.

Deploy the entire `dist/` directory to any static HTTPS host. Relative asset paths support subdirectories. Installation and service workers require HTTPS or localhost; opening `index.html` directly or using a phone over plain LAN HTTP does not enable the PWA. No server-side code is needed.

On Android/desktop, use the **Install app** button when offered, or your browser’s install menu. On iPhone/iPad, open in Safari and use **Share → Add to Home Screen**. Load once while connected before playing offline.

## Play

- **Arrow keys / WASD:** pitch and turn relative to your current view. Up/W climbs, down/S dives. Full loops are possible.
- **Mobile thumbstick:** drag in the direction you want to turn. Distance from center controls turn strength. Release to keep flying straight.
- **Escape / P / pause button:** pause or resume. Switching apps or losing focus also pauses.
- Collect glowing berries from any angle; multiple berries are always available. A diamond guides you toward the nearest berry, including berries behind you. The radar shows top-down positions; the guide labels higher/lower berries.
- Avoid your tail and the boundaries of the 120 × 120 × 120 meter arena. There is no gravity, wrapping, or grid-based movement.

| Difficulty | Starting speed | Growth per berry | Base points | Simultaneous berries |
| --- | ---: | ---: | ---: | ---: |
| Drift | 9 m/s | 3 m | 100 | 14 |
| Classic | 13 m/s | 5 m | 175 | 12 |
| Surge | 18 m/s | 7 m | 275 | 10 |
| Void | 23 m/s | 10 m | 400 | 8 |

Every five berries advances a stage. Each berry awards base points × current stage. Speed increases by 6% of starting speed per stage, capped at +54%. Easy/standard/fast pace applies a 0.8×/1×/1.2× speed multiplier. Each of the 12 difficulty/pace combinations has its own local record. Ending a run from pause also saves earned points.

Settings include four world themes, custom snake color, flight pace, steering sensitivity, field of view, sound, haptics and reduced ambient motion. Settings and best runs persist in local storage. Browser data clearing removes them; private browsing may not retain them. Haptics are used only where supported.

## Verification

```sh
npm test
npx playwright install chromium webkit
npm run build
npm run preview -- --port 4173
# In a second terminal:
npm run test:e2e
```

Linux WebKit may additionally require `npx playwright install-deps webkit`. Set `TEST_URL` to test a different server. Browser tests use the opt-in `?test` diagnostic interface; normal visits expose no simulation state.

The simulation tests cover steering direction, gravity-free movement, release behavior, full pitch rotation, diagonal input normalization, arbitrary-angle and swept berry collection, stage progression, tail and wall collisions, spawn clearance, and frame-rate independence. Playwright exercises Chromium desktop/mobile and WebKit, saved settings/records, touch release/cancellation, portrait/landscape controls, pause/retry, and a fully offline reload and new run. Screenshots are written to `test-results/`.

## Implementation

- Three.js renders the arena, berries and instanced tail; all meshes are generated in code.
- A fixed update rate with 120 Hz substeps keeps collision detection consistent. Swept segment distances prevent skipping berries or tail segments between frames. The first 5 meters of neck are excluded from self-collision.
- A generated service worker precaches the complete production app, including installation icons, and serves the app shell offline. Same-origin static cache matching ignores `Vary` so preview-server CORS headers cannot prevent offline module/CSS loading.
- Source modules: `src/game.js` (simulation), `src/scene.js` (3D rendering), `src/main.js` (UI/input/storage/audio), `src/style.css` (responsive design).
- PWA icons are checked in. To regenerate them, run `python3 scripts/icons.py` with Pillow installed.
