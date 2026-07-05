# Gibran vs Zombie 3D (DOOM FPS)

A Three.js browser FPS. Two modes: **Survival** (defend Monas from endless waves) and **Campaign** (escape the abandoned building, then clear 1 km of ruined Jakarta highway).

## Run

No build, no install — but a static HTTP server is required (ES modules):

```
python -m http.server 8000
```

then open <http://localhost:8000>. Internet connection needed (Three.js from CDN).

## Tweak the gameplay

Edit `config/gameplay.json` — max HP, ammo, movement speed, stamina, grenade physics, wave difficulty, etc. Reload the page to apply.

## Code layout

Everything is documented in [MODULES.md](MODULES.md) (module catalog + scene interface + config keys). Architecture notes for AI assistants: [CLAUDE.md](CLAUDE.md) / [AGENTS.md](AGENTS.md). Desktop/Steam port plan: [STEAM-DESKTOP-PLAN.md](STEAM-DESKTOP-PLAN.md).
