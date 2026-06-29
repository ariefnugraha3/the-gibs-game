# AGENTS

## Repository overview

This repository is a single-page browser game titled "Gibran vs Zombie 3D (DOOM FPS)".

- Main code is in `index.html`.
- The page includes inline CSS and JavaScript and loads `three.js` from a CDN.
- Game assets include simple sound files: `gun-shoot.mp3`, `zombie-spawn.mp3`, `grenade-explode.mp3`, and `reload.mp3`.

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
- `*.mp3` — sound effects used by the game.
