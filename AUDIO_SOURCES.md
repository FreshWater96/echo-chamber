# Echo Chamber — recorded voice and foley sources

Retrieved 2026-10-17. All eight shipped samples are CC0. Attribution is not required by CC0, but the creators are credited here. These samples complement the game's original procedural sounds.

## Shipped files

| Local path | Original file / creator | Source | Transformation |
| --- | --- | --- | --- |
| `public/assets/audio/step-concrete.ogg` | `Audio/footstep_concrete_000.ogg` — Kenney, Impact Sounds 1.0 | [Official pack](https://kenney.nl/assets/impact-sounds) | Renamed; audio bytes unchanged. |
| `public/assets/audio/step-wood.ogg` | `Audio/footstep_wood_000.ogg` — Kenney, Impact Sounds 1.0 | [Official pack](https://kenney.nl/assets/impact-sounds) | Renamed; audio bytes unchanged. |
| `public/assets/audio/glass.ogg` | `Audio/impactGlass_medium_000.ogg` — Kenney, Impact Sounds 1.0 | [Official pack](https://kenney.nl/assets/impact-sounds) | Renamed; audio bytes unchanged. This is a glass impact, not a recording labeled as a full shatter. |
| `public/assets/audio/cloth.ogg` | `Audio/cloth1.ogg` — Kenney Vleugels, RPG Audio | [Official pack](https://kenney.nl/assets/rpg-audio) | Renamed; audio bytes unchanged. |
| `public/assets/audio/door.ogg` | `Audio/doorOpen_1.ogg` — Kenney Vleugels, RPG Audio | [Official pack](https://kenney.nl/assets/rpg-audio) | Renamed; audio bytes unchanged. Pack labels this as a door opening; no material is specified. |
| `public/assets/audio/metal-click.ogg` | `Audio/metalClick.ogg` — Kenney Vleugels, RPG Audio | [Official pack](https://kenney.nl/assets/rpg-audio) | Renamed; audio bytes unchanged. |
| `public/assets/audio/breath.ogg` | `breathing tired.wav` — mikeask | [Author's OpenGameArt page](https://opengameart.org/content/breathing-tired) | Entire 3.1695-second sample converted to mono, 44.1 kHz Ogg Vorbis, quality 4. No trimming, pitch change or normalization. |
| `public/assets/audio/listener-breath.ogg` | `ghostbreath.flac` — Iwan “qubodup” Gabovitch | [Author's OpenGameArt page](https://opengameart.org/content/ghost-breath) | Entire 3.4157-second sample converted to mono, 44.1 kHz Ogg Vorbis, quality 4. No further pitch change or normalization. Author describes the source as a slowed recording of their own breathing. |

Total shipped audio size: 131,793 bytes (about 129 KiB), excluding this documentation and the license notice.

## Exact downloads and licensing evidence

### Kenney Impact Sounds 1.0

- Official page: https://kenney.nl/assets/impact-sounds
- Exact archive: https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip
- Both the official page and the archive's `License.txt` identify the pack as Creative Commons Zero / CC0.
- The pack is categorized as foley. Its creator described recording/creating this pack in the original release announcement: https://www.reddit.com/r/gamedev/comments/dyoxkl/ . The official pack does not provide a separate production history for each file.

### Kenney RPG Audio

- Official page: https://kenney.nl/assets/rpg-audio
- Exact archive: https://kenney.nl/media/pages/assets/rpg-audio/8e99002d76-1677590336/kenney_rpg-audio.zip
- Both the official page and the archive's `License.txt` identify the pack as Creative Commons Zero / CC0.
- Creator's additional listing: https://opengameart.org/content/50-rpg-sound-effects
- The pack is categorized as foley; the creator does not document the recording process of each individual sample on those pages.

### Breathing Tired — mikeask

- Author / license page: https://opengameart.org/content/breathing-tired
- Exact WAV: https://opengameart.org/sites/default/files/breathing%20tired.wav
- Page lists CC0, describes a person breathing after running, and gives the notice “it's yours”.

### Ghost breath — qubodup

- Author / license page: https://opengameart.org/content/ghost-breath
- Exact FLAC: https://opengameart.org/sites/default/files/ghostbreath.flac
- Page lists CC0 and describes slowed breathing by the author. This is processed human breath, used as creature foley; it is not a recording of an animal or an original creature.

## License and runtime processing

- CC0 1.0 Universal: https://creativecommons.org/publicdomain/zero/1.0/
- Kenney archive license notices are preserved in `public/assets/audio/LICENSES.txt`.
- In-game gain, playback rate, filters, spatial positioning and reverberation may be applied at runtime. Those operations do not change the source files listed above.
- FFmpeg encoding command used for the two converted recordings: `ffmpeg -i INPUT -ac 1 -ar 44100 -c:a libvorbis -q:a 4 OUTPUT.ogg`.
- Validation: all eight files decoded to completion with FFmpeg without errors; duration and file size were checked with FFprobe. No browser listening/playback check has been performed in this environment.
