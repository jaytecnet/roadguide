# Wheatbelt Road Trip Audio Companion

A mobile-first PWA that plays location-triggered audio commentary during road trips through the Western Australian Wheatbelt. As you drive through towns or pass SLK markers, the app automatically queues and plays relevant audio (history, stories, points of interest). Works fully offline — Wheatbelt has unreliable mobile coverage.

## Status

**v0.1.0 — MVP** — Test Mode + trigger engine + audio playback verified end-to-end. GPS integration and MRWA Layer 17 road geometry are next (Phase 3).

## Stack

- **Framework**: Next.js 16 (App Router) + TypeScript 5
- **Styling**: Tailwind CSS 4 + shadcn/ui (New York)
- **State**: Zustand (client) + TanStack Query (server, unused yet)
- **Storage**: IndexedDB via `idb` (modular stores — trips, clips, audio blobs, roads, kv)
- **Audio**: HTML5 `<audio>` + Media Session API (lock-screen controls, background audio)
- **PWA**: Web manifest + service worker (offline app shell)
- **TTS**: [VoiceStudio](https://github.com/debpalash/VoiceStudio) local voice cloning for the clip editor (z-ai-web-dev-sdk still available as a fallback and for the seed-audio script)
- **Database**: Prisma + SQLite (available but unused in MVP — all runtime data is in IndexedDB)

## Domain concepts

This project uses Main Roads Western Australia (MRWA) road terminology:

- **SLK** (Straight Line Kilometre) — single increasing measure along a road from its defined start point
- **Carriageway direction** (Australian left-hand driving):
  - **True Left / Left Carriageway** = traffic moving in **INCREASING SLK** direction
  - **True Right / Right Carriageway** = traffic moving in **DECREASING SLK** direction
- **MRWA ArcGIS Layer 17** — State Road Network, the geometry source with SLK attributes (Phase 3)

Trigger logic is carriageway-aware — a clip keyed to "M031 SLK 60–65, increasing direction" only fires when the vehicle matches that carriageway, avoiding false triggers from oncoming traffic on dual-carriageway sections.

## MVP scope

- 1 placeholder road: **M031 Great Southern Hwy** (York → Katanning, ~200 km)
- 9 hand-curated clips: 7 town clips (SLK-range triggers) + 2 off-road POIs (geofence triggers)
- TTS-generated audio (z-ai `tongtong` voice)
- Test Mode UI for development without driving (SLK slider + live simulation)
- Multi-trip architecture (placeholder trip included)
- Full auto-play with queue management
- Media Session API integration (lock-screen controls)
- Offline-first: all audio + metadata in IndexedDB

## Getting started

```bash
# Install dependencies
bun install

# Run dev server
bun run dev

# Generate PWA icons (one-time)
bun run scripts/generate-icons.ts

# Regenerate seed audio (one-time, requires z-ai API access)
bun run scripts/generate-seed-audio.ts

# Lint
bun run lint
```

Open http://localhost:3000 in a mobile-emulated browser, or install as a PWA on your phone.

## Voice cloning with VoiceStudio

The clip editor's **Generate TTS** button calls `/api/tts`, which by default
sends the script to a local [VoiceStudio](https://github.com/debpalash/VoiceStudio)
backend and speaks it in a cloned voice.

1. Install and open VoiceStudio on the machine that runs `bun run dev`.
   Its backend listens on `http://localhost:3900`.
2. In VoiceStudio, go to **Voice → Clone** and save a voice from a 5–15 s clean
   recording. Note its name.
3. Copy `.env.example` to `.env.local` and set `VOICESTUDIO_VOICE` to that name.
4. Restart `bun run dev`, then use **Generate TTS** in the clip editor.

Generation takes roughly 30–60 s per clip on a GTX 1650-class GPU. The audio is
stored in IndexedDB like any other clip, so playback on the road still needs
no network and no VoiceStudio.

Set `TTS_PROVIDER=zai` to go back to the z-ai cloud voice.

**Licence note:** VoiceStudio's default OmniVoice model is CC-BY-NC (personal /
non-commercial use only, including the audio it generates). For a commercial
release, switch VoiceStudio to an Apache-2.0 engine such as CosyVoice 3 and set
`VOICESTUDIO_MODEL=cosyvoice`. Only clone voices you have permission to use.

## Architecture

```
src/
├── lib/
│   ├── types.ts                    # Trip, Clip, Trigger, VehiclePosition domain types
│   ├── wheatbelt-towns.ts          # M031 road + town metadata (placeholder)
│   ├── seed-data.ts                # Trips + clips seed definitions
│   ├── offline-db/                 # Modular IndexedDB (TCWL pattern)
│   │   ├── db.ts                   # Singleton connection + schema
│   │   ├── trips.ts                # Trip CRUD
│   │   ├── clips.ts                # Clip CRUD
│   │   ├── audio.ts                # Audio blob storage
│   │   ├── roads.ts                # Road geometry (Phase 3)
│   │   └── seed.ts                 # First-run seeding
│   ├── triggers/
│   │   └── engine.ts               # SLK-range + geofence matchers
│   └── audio/
│       ├── player.ts               # HTML5 audio singleton + queue
│       └── media-session.ts        # Media Session API integration
├── store/
│   ├── player-store.ts             # Zustand mirror of audioPlayer
│   ├── trip-store.ts               # Active trip + trigger evaluation loop
│   └── ui-store.ts                 # Tab state + UI prefs (persisted)
├── components/
│   ├── app-shell.tsx               # Layout + bottom nav + seeding
│   ├── now-playing.tsx             # Player UI + queue
│   ├── trip-switcher.tsx           # Multi-trip selection
│   ├── test-mode.tsx               # SLK slider + live simulation
│   ├── settings.tsx                # Cache management + about
│   └── pwa/
│       └── register-sw.tsx         # Service worker registration
├── app/
│   ├── layout.tsx                  # PWA metadata + dark theme
│   ├── page.tsx                    # AppShell mount
│   ├── globals.css                 # Driving-friendly dark theme
│   └── api/
│       └── tts/route.ts            # TTS endpoint (VoiceStudio or z-ai)
scripts/
├── generate-icons.ts               # PNG icons from SVG
└── generate-seed-audio.ts          # TTS seed audio generator
public/
├── manifest.json                   # PWA manifest
├── sw.js                           # Service worker
├── icon-*.png                      # PWA icons (96–512px)
└── audio/*.wav                     # 9 seed audio clips (~6.2 MB)
```

## Roadmap

- ✅ **Phase 1**: PWA shell + test mode + audio playback + Media Session
- ✅ **Phase 2**: Multi-trip playlists
- ✅ **Phase 4** (pulled forward): Trigger engine (SLK-range + geofence)
- 🚧 **Phase 3**: GPS + EKF (port from TCWL pattern, re-tune for highway speeds) + MRWA Layer 17 road geometry download
- 🚧 **Phase 5**: Background audio hardening (verify screen-off playback on Samsung S22 Ultra)
- 🔜 **Phase 6**: TTS script editor + content pipeline + community recordings

## License

Personal project. All rights reserved.
