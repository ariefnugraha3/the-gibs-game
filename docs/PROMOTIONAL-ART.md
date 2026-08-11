# Promotional Artwork Standard

This is the source of truth for generated covers, banners, store capsules, and social artwork for **Decommission Day**. Read it before generating or editing promotional raster art. It complements the in-game `GIBS 2045` palette rules; it does not replace `src/world/palette.js`.

## Canonical References

Always load the relevant image before generation. Reference priority is:

1. `assets/images/low-poly/decommission-day-cover-logo-distressed-gameplay-lowpoly.png` — **current landscape visual and style master** (1671×941). It is the mandatory reference for geometry complexity, surface detail, materials, character treatment, palette, pickup wreck, varied robot poses, and readable boss-gunship scale.
2. `assets/images/low-poly/decommission-day-cover-logo-distressed-portrait-v3.png` — **current portrait master** (1024×1536). It applies the landscape master's gameplay-low-poly treatment to the approved native 2:3 composition.
3. `assets/images/low-poly/decommission-day-banner-1200x400-v2.png` — **current 3:1 banner master** (1200×400), natively composed and detail-matched to the landscape style master.
4. `assets/images/low-poly/decommission-day-banner-1250x350-v2.png` — **current 25:7 banner master** (1250×350), natively composed and detail-matched to the landscape style master.
5. `assets/images/low-poly/decommission-day-logo-distressed-transparent.png` — **current standalone/menu title logo** (1633×499 RGBA), with simplified low-detail faces, sparse distressing, and transparent background.
6. `assets/images/decommission-day-cover-logo-distressed-v2.png` — preserved previous landscape master (1671×941). Use it only as a secondary composition/title reference; its higher detail density is retired and must not return.
7. `assets/images/decommission-day-cover-logo-distressed.png` — preserved pre-revision landscape master (1672×941). Keep it for provenance; do not use it as the sole reference for new derivatives.
8. `assets/images/decommission-day-cover-logo-distressed-portrait-v3.png` — preserved higher-detail portrait layout source (1024×1536); not a style reference.
9. `assets/images/decommission-day-cover-logo-distressed-portrait-v2.png` — preserved earlier portrait layout reference (1024×1536); not a style reference.
10. `assets/images/decommission-day-cover-logo-distressed-portrait.png` — preserved pre-revision portrait composition (1024×1536).
11. `assets/images/decommission-day-banner-1200x400-v2.png` — preserved previous 3:1 layout source (1200×400); not a style reference.
12. `assets/images/decommission-day-banner-1200x400.png` — preserved pre-revision 3:1 banner.
13. `assets/images/decommission-day-banner-1250x350-v2.png` — preserved previous 25:7 layout source (1250×350); not a style reference.
14. `assets/images/decommission-day-banner-1250x350.png` — preserved pre-revision 25:7 banner.
15. `assets/images/decommission-day-logo-distressed-transparent.png` — preserved previous standalone title logo (1633×499 RGBA); the menu no longer consumes this root-level version.

Do not use a generated derivative as the sole reference when the gameplay-low-poly master is available. Any unlisted derivative is non-canonical unless this document explicitly promotes it. This prevents cumulative style drift and, especially, detail creep.

All active gameplay-low-poly promotional masters live under `assets/images/low-poly/`. Keep root-level sources and legacy variants in place for provenance/layout comparison, but never write a new approved low-poly master back into the root `assets/images/` directory.

The `adversarial-intelligence-*` files are preserved as pre-rename legacy assets. Do not delete or overwrite them, and do not use them for current store artwork. New derivatives must start from the matching `decommission-day-*` master above so the obsolete title cannot return.

## Non-Negotiable Visual Identity

- Dark, cinematic, **gameplay-matched low-poly and low-detail** 3D illustration; gritty military science fiction, not photorealism, anime, comic art, glossy concept art, or a high-detail render with a superficial faceted filter.
- Models must look plausibly built from the same procedural primitives as gameplay: chunky boxes and wedges, simple ellipsoids, and visibly low-segment cylinders/cones. Character and environment forms typically use 6–12 sides; modest extra segments are allowed only where wheels, rings, or another silhouette-critical curve needs them. Use large visible planes, hard edges, and clean readable silhouettes—never smooth high-poly forms.
- Materials must resemble matte `MeshLambertMaterial`/simple Phong shading: broad solid-color regions, restrained specular response, and clear cast shadows. Do not use glossy PBR surfaces, ray-traced polish, realistic fabric/skin, or dense texture maps.
- Maintain a strict low-detail budget. Omit micro-greebles, tiny armor plates, cables, fine seams, scratches, fabric weave, dense weapon attachments, tiny debris, and particle clutter. Simplify internal detail without changing a subject's identity or silhouette.
- Nighttime war-torn Jakarta with smoke and a near-black sky/negative space. Rendered world surfaces use warm charcoal (`PAL.ink`-like), not pure black or cold blue-black.
- Warm dusty gunmetal, muted tan, concrete, steel, and warm charcoal dominate. Amber is allowed for restrained human, HUD-like, lamp, and civic-tech accents; saturated combat orange is limited to fire, sparks, tracers, and muzzle flashes. No cyan/magenta neon or cyberpunk glow.
- Lighting uses a dusty warm key/ambient base, restrained cool separation where needed, medium atmospheric fog, and readable hard-edged shadows. Avoid heavy bloom, glossy highlights, and cinematic depth-of-field blur that hides silhouettes.
- Major Gibran is the foreground hero: simplified olive fatigues, chunky charcoal tactical armor, helmet, amber scarf/goggles accents, lower-face cloth mask, compact backpack/radio antenna, and a block-built rifle. The clearly correct red-over-white Indonesian flag patch is an intentional promotional identity mark even when the runtime mesh uses simpler amber/livery accents; never remove or recolor it. Keep him heroic and readable without intricate armor construction.
- Monas must remain recognizable through simple gameplay-native geometry: stacked square plinth, tapered four-sided obelisk, low-sided cup, and a simple gold flame.
- The burning enemy **pickup truck** must use a compact angular silhouette: sloped cab/windshield, readable low open-bed walls, square roll cage, front ram, four chunky wheels, and restrained brick-red hostile accents. The open cargo bed is mandatory because this vehicle carries robots in-game; do not regress it to a sedan or generic SUV.
- The tank uses a simplified low slab hull, wide tracks/skirts, long angular railgun, and a restrained red sensor strip. Preserve the master composition and scale; do not replace it with a detailed real-world tank.
- Robots use a steel skeleton, charcoal joints, simple low-segment torso/limbs, blocky weapons, a power core/chest plate, and a universal small red slit visor. Preserve readable class cues where visible (green/yellow/red chest armor; rifle/antenna variations) without adding mechanical clutter. Vary actions through weighted walking/turning, aiming brace/recoil, hunched advance, claw wind-up/lunge, scanning, and rubble traversal—never through unrelated robot redesigns or copy-pasted synchronized poses.
- The helicopter gunship boss must remain clearly readable in the upper sky at the relative scale established by the gameplay-low-poly master. Preserve its game-native silhouette: wide faceted hull, angular tandem canopy, stub wings/missile pods, twin engine masses, prominent five-blade rotor/duct-ring form, twin-boom tail/fenestron, and a simple chin weapon/sensor. It must not become a detailed Apache-like real-world helicopter. Keep atmospheric depth, but do not reduce it to an indistinct speck or enlarge it enough to compete with Major Gibran.
- Backgrounds and effects use the same detail budget: blocky skyline masses with few lights, fewer/larger rubble pieces, sparse simple smoke/fire billboard or polygonal puffs, a few chunky debris pieces, restrained tracers, and no dense spark cloud or photoreal destruction texture.
- The tone is mature, grounded, ominous, and readable—never cluttered, cartoonish, overly saturated, or generically “AI-looking.”
- Increasing model complexity or micro-detail beyond the current master is a failed result even when the composition, text, and subject list are otherwise correct.

## Title Contract

The only promotional copy is exactly:

```text
DECOMMISSION
DAY
```

Use large uppercase condensed military block lettering, muted sand/tan fill, dark extrusion/shadow, and subtle chipped/distressed marks. Preserve spelling, line order, and legibility. Do not add `NUSANTARA 2045`, a subtitle, studio mark, badge, UI, border, or watermark unless explicitly requested. Reject any output with missing, duplicated, malformed, clipped, or misspelled letters.

## Composition by Format

- **Landscape cover:** title upper-left; battlefield spans the horizon; Monas near center; hero dominates the right foreground.
- **Portrait 2:3:** title fills the upper section; Monas anchors the central depth; hero fills the lower-right/center. Extend the scene vertically—never stretch a landscape crop.
- **Banner 3:1 or 25:7:** keep all essentials inside the shallow central band. Title occupies the left third, Monas and robots the center, and the hero the right. As the banner gets shallower, remove expendable sky and foreground rather than compressing the scene. Avoid edge-touching details.
- For other formats, recompose natively and maintain clear silhouette separation. Preserve safe margins around the title, face/helmet, flag patch, muzzle, and Monas.

The promotional composition governs camera angle. “Gameplay-matched” refers to geometry, materials, palette, detail density, silhouettes, and lighting—not a requirement to convert every cover into the runtime oblique top-down camera. Use the gameplay camera only when the requested asset is explicitly an in-engine/gameplay-view image.

Generate at the requested aspect ratio. For exact delivery sizes, downscale from the closest exact-ratio master; do not distort. Crop only expendable smoke/sky/ground, never required subjects or typography.

## Generation Workflow

1. Treat the gameplay-low-poly visual master as an **edit target/style reference**, not inspiration for a new unrelated scene.
2. Load the gameplay-low-poly master for style and, when needed, the matching format reference for layout. State each image's role explicitly so a higher-detail layout reference cannot override the style master.
3. State the exact aspect ratio, final use, title text, required layout, low-detail geometry/material rules, invariants, and avoid list in the prompt.
4. Explicitly request visibly low-segment primitive geometry, large planar facets, matte Lambert-like shading, sparse large clutter, and no micro-greebles/PBR detail. “Low-poly” by itself is not specific enough.
5. Preserve approved assets; save new gameplay-low-poly work under `assets/images/low-poly/` with a new descriptive suffix, for example `decommission-day-banner-1200x400-gameplay-lowpoly-v1.png` (the existing root-level and `adversarial-intelligence-*` files are preserved sources/legacy assets — leave their names alone).
6. Inspect the generated image at full size and beside the gameplay-low-poly master. Reject detail creep, even if it looks more polished. Correct one problem per iteration instead of broadly regenerating the art direction.
7. Verify the final PNG dimensions with `file <path>` and visually inspect the saved project copy.

## Reusable Prompt Core

```text
Faithfully preserve the supplied Decommission Day visual master. Create a
native <ASPECT> <ASSET TYPE> that looks plausibly rendered with the game's actual
procedural Three.js assets: chunky boxes/wedges, simple ellipsoids, visibly
low-segment cylinders/cones, large planar facets, broad solid colors, and matte
Lambert-like shading. Use extra curve segments only for silhouette-critical wheels
or rings. Keep geometry and surface detail deliberately sparse: no
micro-greebles, tiny armor panels, cables, scratches, fabric weave, dense debris,
glossy PBR, or photoreal texture. Use a dark nighttime Jakarta battlefield with a
muted tan/gunmetal/warm-charcoal palette, restrained amber accents, and saturated
orange only for combat effects. Keep Major Gibran with his mask, compact pack/radio,
block-built rifle, simplified armor, and correct red-over-white Indonesian flag mark;
Monas as a square plinth, tapered obelisk, low-sided cup, and gold flame; steel-and-
charcoal red-eyed robots with readable class accents and varied game-native actions;
a low-slab railgun tank; sparse large rubble; a burning angular open-bed pickup with
roll cage/front ram; and the faceted duct-rotor/twin-boom boss gunship in the
background at the gameplay-low-poly master scale.
Render the exact distressed title with "DECOMMISSION" on the first line and "DAY"
on the second line.
No extra text, watermark, border, neon, cyberpunk styling, photorealism, cartoons,
high-detail concept-art rendering, unrelated units, clipped subjects, or misspelled title.
```

## Final Acceptance Checklist

- Exact dimensions/aspect ratio and valid PNG.
- Title is perfect, readable, and safely inside the frame.
- Indonesian flag is red over white; no altered national symbols.
- Hero, Monas, robots, and battlefield hierarchy read at thumbnail size.
- Burning vehicle is unmistakably a pickup; robot silhouettes are not copy-pasted; boss gunship remains readable without stealing focus.
- The scene looks plausibly assembled from gameplay primitives: chunky silhouettes, visibly low-segment round forms, large facets, and matte broad-color materials; extra curve segments appear only where a wheel/ring silhouette needs them.
- Detail remains at or below the gameplay-low-poly master's density: no fine greebles, realistic surface texture, glossy PBR, dense rubble, or excessive particles.
- Monas, pickup, tank, robots, and gunship retain their game-native silhouette cues rather than drifting into detailed real-world designs.
- Low-poly faceting, dark palette, sparse effects, and original mood match the gameplay-low-poly master.
- No unwanted text, watermark, border, neon colors, style drift, detail creep, obvious stretching, or destructive overwrite.
