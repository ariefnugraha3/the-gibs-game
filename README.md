# Gibran vs Robot 3D

A Three.js browser **top-down shooter** (Alien Shooter-style). Two modes: **Survival** (defend Monas from endless waves) and **Campaign** (a 4-stage story — rappel onto a rooftop, clear three floors of an abandoned office block, then fight a tank boss at the alun-alun).

## Run

No build, no install — but a static HTTP server is required (ES modules):

```
python -m http.server 8000
```

then open <http://localhost:8000>. Internet connection needed (Three.js from CDN).

## Tweak the gameplay

Edit `config/gameplay.json` — max HP, ammo, movement speed, stamina, grenade physics, wave difficulty, etc. Reload the page to apply.

## Code layout

Everything is documented in [MODULES.md](MODULES.md) (module catalog + scene interface + config keys). Architecture notes for AI assistants: [CLAUDE.md](CLAUDE.md) / [AGENTS.md](AGENTS.md), with per-system detail split into [docs/campaign.md](docs/campaign.md), [docs/survival.md](docs/survival.md), [docs/combat.md](docs/combat.md) and [docs/presentation.md](docs/presentation.md). Desktop/Steam port plan: [STEAM-DESKTOP-PLAN.md](STEAM-DESKTOP-PLAN.md). Gameplay roadmap: [SECOND-IMPROVEMENT-PLAN.md](SECOND-IMPROVEMENT-PLAN.md) (current) / [IMPROVEMENT-PLAN.md](IMPROVEMENT-PLAN.md) (older).
