# Echo Chamber · The Drowned Choir — asset provenance

## Original authored work
Mara and the Cantor are procedural THREE.SkinnedMesh characters with weighted articulated rigs. Mara has 41 bones and a hanging brass echo-lantern; the Cantor has 39 bones. Costumes, scene architecture, props, silhouettes, story, sound events and the seven-note motif are original. There are no externally sourced character GLBs or sprite-plane bodies.

The playable setting is Saint Orison, a flooded opera city, with six connected stage dioramas, three voice recordings and two authored endings. All gameplay geometry is code-authored. Foreground rigging and distant architecture use perspective parallax.

## Original generated paintings
Built-in image generation created `public/assets/orison-keyart.webp` and `public/assets/orison-skyline.webp`. Exact prompts and source paths are in `ART_PROMPTS.md`. The former is menu/cover art; the latter is a far background plane behind real 3D architecture. These images are artwork, not captured gameplay screenshots.

## Surface maps — Poly Haven, CC0
- `public/assets/wall-*.jpg`: Plastered Wall 03 — https://polyhaven.com/a/plastered_wall_03
- `public/assets/floor-*.jpg`: Wood Floor Worn — https://polyhaven.com/a/wood_floor_worn

Additional score-paper, stone checker, cloth, skin and hair textures are authored procedurally in the game.

## Foley and breath
See `AUDIO_SOURCES.md` for exact creator URLs, licensing evidence, source filenames and transformations. Eight CC0 audio samples complement ZzFX effects, original musical notes and a Tone.js adaptive drone. Notices are shipped in `public/assets/audio/LICENSES.txt`. Text/musical narrative recordings are not marketed as spoken actor performances.

## Dependencies
Three.js 0.180.0 (MIT); Yuka 0.7.8 (MIT); postprocessing 6.37.8 (Zlib); Resonance Audio 1.0.0 and Omnitone 1.3.0 (Apache 2.0); Tone.js 15.1.22 (MIT); vendored ZzFX 1.4.0 by Frank Force (MIT). Full license texts are in `public/licenses/`.
