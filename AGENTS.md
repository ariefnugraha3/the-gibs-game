# AGENTS

## Repository overview

This repository is a single-page browser game titled "Gibran vs Zombie 3D (DOOM FPS)".

- Main code is in `index.html`.
- The page includes inline CSS and JavaScript and loads `three.js` from a CDN.
- Game assets live under `assets/`: sound files in `assets/sounds/` (`gun-shoot.mp3`, `zombie-spawn.mp3`, `grenade-explode.mp3`, `reload.mp3`, `jokowi-kaget.mp3`) and visible assets (3D models/textures/images) in `assets/visuals/` (e.g. `zombie.glb`).

## What agents should know

- There is no package manager, build system, or test config in this workspace.
- The project is intended to run directly in a browser by opening `index.html` or by serving the folder with a local static server.
- The JavaScript is currently embedded in the HTML document and uses Three.js r128 API.
- The game uses browser APIs like `PointerLock`, `requestAnimationFrame`, DOM event handlers, and audio playback.

## Editing guidance

- Keep changes small and compatible with a simple static page unless the user asks to modernize the project structure.
- Avoid introducing unnecessary build tools, frameworks, or package dependencies.
- If refactoring, prefer separating inline script/CSS into dedicated files only if the user requests a more maintainable layout.
- Preserve the game controls and core mechanics unless the user asks for gameplay changes.

## Running the project

- Open `index.html` in a browser.
- For reliable local execution, serve the repository folder with a static HTTP server and access `index.html`.

## Useful files

- `index.html` — entire game implementation and UI.
- `assets/sounds/*.mp3` — sound effects used by the game.
- `assets/visuals/` — 3D models / textures / images (e.g. `zombie.glb`).
