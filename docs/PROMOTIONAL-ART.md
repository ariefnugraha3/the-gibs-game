# Promotional Artwork Standard

This is the source of truth for generated covers, banners, store capsules, and social artwork for **Decommission Day**. Read it before generating or editing promotional raster art. It complements the in-game `GIBS 2045` palette rules; it does not replace `src/world/palette.js`.

## Canonical References

Always load the relevant image before generation. Reference priority is:

1. `assets/images/decommission-day-cover-logo-distressed-v2.png` — **current visual master** (1671×941). It establishes the pickup wreck, varied robot poses, and readable boss-gunship scale; use it as the primary reference for characters, scene, palette, material treatment, and title.
2. `assets/images/decommission-day-cover-logo-distressed.png` — preserved pre-revision landscape master (1672×941). Keep it for provenance; do not use it as the sole reference for new derivatives.
3. `assets/images/decommission-day-cover-logo-distressed-portrait-v2.png` — **current portrait master** (1024×1536), updated with the v2 pickup, robot-pose, and gunship standards.
4. `assets/images/decommission-day-cover-logo-distressed-portrait.png` — preserved pre-revision portrait composition (1024×1536).
5. `assets/images/decommission-day-banner-1200x400-v2.png` — **current 3:1 banner master** (1200×400), updated to the v2 scene standard.
6. `assets/images/decommission-day-banner-1200x400.png` — preserved pre-revision 3:1 banner.
7. `assets/images/decommission-day-banner-1250x350-v2.png` — **current 25:7 banner master** (1250×350), natively cropped from its approved shallow composition after the v2 scene edit.
8. `assets/images/decommission-day-banner-1250x350.png` — preserved pre-revision 25:7 banner.
9. `assets/images/decommission-day-cover.png` — approved clean-title landscape alternative.
10. `assets/images/decommission-day-cover-logo-distressed-ss2-v2.png` — approved alternate-rifle landscape cover.
11. `assets/images/decommission-day-logo-distressed-transparent.png` — approved standalone distressed title logo with transparent background (1633×499 RGBA).

Do not use a generated derivative as the sole reference when the master is available. This prevents cumulative style and detail drift.

The `adversarial-intelligence-*` files are preserved as pre-rename legacy assets. Do not delete or overwrite them, and do not use them for current store artwork. New derivatives must start from the matching `decommission-day-*` master above so the obsolete title cannot return.

## Non-Negotiable Visual Identity

- Dark, cinematic, low-poly/faceted 3D illustration; gritty military science fiction, not photorealism, anime, comic art, or glossy concept art.
- Nighttime war-torn Jakarta with smoke and deep black/charcoal negative space.
- Warm dusty gunmetal, muted tan, concrete, and black dominate. Orange appears only in fire, sparks, tracers, and muzzle flashes. No cyan/magenta neon or cyberpunk glow.
- Major Gibran is the foreground hero: modern Indonesian tactical armor, rifle, helmet, and a clearly correct red-over-white Indonesian flag patch.
- Monas must remain recognizable. The robot army, tank, burning **pickup truck**, rubble, and restrained combat effects establish the conflict and depth. The pickup must have a readable open cargo bed because this vehicle carries robots in-game; do not regress it to a sedan.
- Robots are dark, angular, faceted machines with small red eyes. Their army must use visibly varied actions and silhouettes—running, aiming, advancing hunched, crossing rubble, turning, or signaling—rather than duplicated or synchronized poses. Do not introduce unrelated creature, mech, or drone designs.
- The helicopter gunship boss must remain clearly readable in the upper sky at the relative scale established by the v2 master. Keep atmospheric depth, but do not reduce it to an indistinct speck or enlarge it enough to compete with Major Gibran.
- The tone is mature, grounded, ominous, and readable—never cluttered, cartoonish, overly saturated, or generically “AI-looking.”

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

Generate at the requested aspect ratio. For exact delivery sizes, downscale from the closest exact-ratio master; do not distort. Crop only expendable smoke/sky/ground, never required subjects or typography.

## Generation Workflow

1. Treat the visual master as an **edit target/style reference**, not inspiration for a new unrelated scene.
2. State the exact aspect ratio, final use, title text, required layout, invariants, and avoid list in the prompt.
3. Preserve approved assets; save new work under `assets/images/` with a descriptive suffix, for example `decommission-day-banner-1200x400.png` (the existing `adversarial-intelligence-*` files are the pre-rename masters — leave their names alone).
4. Inspect the generated image at full size. Correct one problem per iteration instead of broadly regenerating the art direction.
5. Verify the final PNG dimensions with `file <path>` and visually inspect the saved project copy.

## Reusable Prompt Core

```text
Faithfully preserve the supplied Decommission Day visual master. Create a
native <ASPECT> <ASSET TYPE>: dark low-poly faceted 3D military sci-fi artwork,
nighttime war-torn Jakarta, muted tan/gunmetal/charcoal palette, restrained orange
combat light. Keep Major Gibran with the correct Indonesian flag patch, rifle and
tactical armor; recognizable Monas; angular red-eyed robots with varied poses;
tank, rubble, burning pickup truck, and distant boss gunship at the v2 master scale.
Render the exact distressed two-line title "DECOMMISSION DAY".
No extra text, watermark, border, neon, cyberpunk styling, photorealism, cartoons,
unrelated units, clipped subjects, or misspelled title.
```

## Final Acceptance Checklist

- Exact dimensions/aspect ratio and valid PNG.
- Title is perfect, readable, and safely inside the frame.
- Indonesian flag is red over white; no altered national symbols.
- Hero, Monas, robots, and battlefield hierarchy read at thumbnail size.
- Burning vehicle is unmistakably a pickup; robot silhouettes are not copy-pasted; boss gunship remains readable without stealing focus.
- Low-poly faceting, dark palette, restrained effects, and original mood match the master.
- No unwanted text, watermark, border, neon colors, style drift, obvious stretching, or destructive overwrite.
