# Echo Chamber · The Drowned Choir

An original 2.5D acoustic horror prologue set in the flooded opera city of Saint Orison. Mara follows a recording made by her missing brother after the city drowned. Three lost voice cylinders turn a ferry bell; its final refrain attracts the Cantor. At the ferry, choose whether to carry one voice home or release the Choir.

## This edition
- Six connected, authored 3D theatre dioramas: Last Platform, Flooded Cloister, Processional Gallery, Wax Archive, Choir Pit and Ferryman’s Gate.
- Crimson travelling-coat Mara and the ivory/black Cantor, with weighted 3D rigs, action poses, animated cloth and a brass echo-lantern.
- Original painted title art and panoramic skyline, geometric parallax, elevated stages over animated floodwater, arches, rose window, organ, bells, rain and confessionals.
- Sound-based navigation, shared collision/navigation/occlusion, telegraphed pursuit and last-known-position search.
- Quiet listening ability, three memory silhouettes/chapters, journal and two endings.
- Safe autosaves, continue, final checkpoint/retry, Standard and Story difficulty, action-key remapping, fullscreen and accessibility/audio/graphics settings.
- Recorded foley, room acoustics, an original seven-note motif and adaptive sound, with audio failures isolated from controls and frame updates.

## Controls
WASD / arrows move across the stage and its depth. Ctrl / C crouches, or holds breath while hidden. Shift runs. Default action keys: Space / Q sounds the lantern; E interacts; F throws glass; R winds the Archive gramophone; hold V to listen; J opens the voice journal; Tab opens the connected city map; Escape pauses. Six action keys can be remapped. Touch and basic gamepad controls are included; gamepad right shoulder listens.

The Cloister cylinder needs a nearby echo to locate it. The gramophone releases the Archive cabinet and attracts the Cantor. Cross Choir Pit glass quietly. At Ferryman’s Gate, survive a 24-second bell refrain and return to its wheel to choose an ending.

## Run / build
```sh
npm ci
npm test
npm run build
python -m http.server 8000 --directory dist
```
Visit http://localhost:8000 with WebGL2 enabled. Audio starts after beginning the journey. The complete static runtime is in `dist/`, with `index.html` at its root. Serve that directory through an HTTP host; no API keys, application server or runtime CDN are required. Local progress and preferences stay in the player’s browser. Artwork and audio source notices are included in the build.

A portable web upload ZIP is provided under `releases/`. It contains the built static files with `index.html` at ZIP root.

## Architecture
`facility.js` defines room topology and shared prop footprints; `navigation.js` handles Yuka graph/A*, collisions, sight and authored acoustic losses. `logic.js` handles progression, hearing, pursuit, breathing and endings. `persistence.js` validates saves, `preferences.js` validates settings/remaps, and `story.js` holds the authored story. `world.js` and `actors.js` construct the environment and characters; `effects.js` reconstructs surface sonar from depth; `audio.js` mixes recordings and synthesis behind the failure boundary in `audio-guard.js`.

Resonance Audio is compiled from source with an Omnitone compatibility adapter and embedded HRIR data; native HRTF audio remains a fallback. Room dimensions and surface reflections are modeled, while door losses and cover filtering are authored approximations. The game does not simulate complete acoustic wave propagation. Narrative recordings use displayed text and original musical cues, rather than spoken voice acting.

## Verification / release status
25 automated tests cover navigation approaches, collision, hearing/cover, pursuit memory, all objective gates, breathing, pause, save validation, progression restore, difficulty, key remapping, both endings, audio-failure isolation and full active-creature journeys including actual Soundscape event/update calls with mocked browser DSP boundaries. Source build, assembled postprocessing shaders, finite room geometry and posed skinning are checked.

This is a playable prologue. Browser/GPU rendering, listening on real devices, subjective visibility, difficulty and a full user playthrough still require verification. A browser-control capability is unavailable in this environment; these checks have not been represented as completed. Broader device/performance testing, user feedback, additional bespoke animation and voice production are further release work.

See `ASSET_SOURCES.md`, `AUDIO_SOURCES.md`, `ART_PROMPTS.md` and in-game credits for provenance and licenses. Existing-game references informed the earlier prototype’s framing; this edition uses its own setting, lore and assets.
