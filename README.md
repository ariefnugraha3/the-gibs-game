# Gibran vs Zombie 3D (DOOM FPS)

A Three.js browser FPS. Three modes: **Survival** (defend Monas from endless waves), **Campaign** (a 3-stage story: escape the abandoned building, clear 1 km of ruined Jakarta highway, then survive the night in Monas park), and **Co-op LAN** (survival with up to 4 players on the same network — one player hosts a named room, the others join it).

## Run

No build, no install — but a static HTTP server is required (ES modules):

```
python -m http.server 8000      # single-player
python server.py                # co-op LAN (static HTTP :8000 + WebSocket relay :8001)
```

then open <http://localhost:8000>. Internet connection needed (Three.js from CDN).

**Co-op:** the host runs `python server.py` and shares `http://<host-ip>:8000` with friends on the same Wi-Fi/LAN. Everyone picks the **Co-op LAN** card — the host creates a room by name, the others join it by typing the same name. No IP entry needed.

## Tweak the gameplay

Edit `config/gameplay.json` — max HP, ammo, movement speed, stamina, grenade physics, wave difficulty, etc. Reload the page to apply.

## Code layout

Everything is documented in [MODULES.md](MODULES.md) (module catalog + scene interface + config keys). Architecture notes for AI assistants: [CLAUDE.md](CLAUDE.md) / [AGENTS.md](AGENTS.md). Desktop/Steam port plan: [STEAM-DESKTOP-PLAN.md](STEAM-DESKTOP-PLAN.md). Gameplay feature roadmap: [IMPROVEMENT-PLAN.md](IMPROVEMENT-PLAN.md).
