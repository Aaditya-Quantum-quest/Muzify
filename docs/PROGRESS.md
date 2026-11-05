# Muzify — Session Progress

## Starting Point

This workspace is **Muzify**, an Android-first local music player built with Expo SDK 57, React Native, Expo Router, NativeWind, Expo SQLite, and a Kotlin native metadata module.

The first step was reading every file in `docs/` to understand the project:

| Document | What it established |
|---|---|
| `PROJECT_OVERVIEW.md` | Local Android music player: scan, metadata, playback, library, artists, playlists, settings, stats |
| `ARCHITECTURE.md` | Layers: UI → player context → SQLite → native Android |
| `FILE_MAP.md` | Routes, screens, player, context, native module, config plugins |
| `NAVIGATION.md` | Expo Router tabs + public onboarding / artists / playlists |
| `AUDIO_SYSTEM.md` | File discovery, tag read/write via `AudioMetadata` + Jaudiotagger |
| `PLAYBACK_SYSTEM.md` | Shared player context; docs still described simulated JS-interval playback |
| `DATABASE.md` | `songs`, `artists`, `song_artists`, follows, relationships, cache |
| `ANDROID_NATIVE.md` | Kotlin Expo module + permission / Jaudiotagger plugins |
| `DEVELOPMENT_RULES.md` | Smallest safe change; preserve working UI and data |
| `KNOWN_ISSUES.md` | Playback, playlists, metadata write, permissions still needed verification |
| `CHANGELOG.md` | Artist DB was real; playback engine was only partially started |
| `BUILD_AND_RELEASE.md` | File currently duplicates navigation notes |

## Constraint Adopted

UI is owned by the project author.

- Existing screens, layouts, and components may be edited.
- No component or visual design may be fully replaced.
- Logic, data, and wiring may change; look and structure stay.

## Problem Found

Docs and an earlier changelog said `expo-av` was installed, but the live stack uses **`expo-audio`**. The engine files existed (`AudioEngine`, `PlaybackQueue`, `audioConfig`), yet real audio was not fully wired:

1. `playSongs` loaded a queue but did not start playback.
2. Library play used local `cur` / `playing` state and never called the engine.
3. MiniPlayer shuffle/play did not drive the real queue; the progress ring was hardcoded.
4. Shuffle/repeat in context were not synced from the queue.
5. `play_count` was not in the song update field list.
6. `app.json` did not include the `expo-audio` config plugin.
7. Player context started with `playing: true` and a fake position even with no audio.

Standalone screens under `src/players/` still simulate progress with `setInterval`. They are not on the live Expo Router tree (`(tabs)/Player.jsx` re-exports the artists screen). Those screens were left untouched to preserve UI.

## What Was Implemented

Real `expo-audio` playback was wired without replacing UI.

### Engine

- `src/services/audio/AudioEngine.js` — `createAudioPlayer`, load `{ uri }`, play/pause/seek, status listener, lock-screen metadata, one-shot track-end handling.
- `src/services/audio/PlaybackQueue.js` — queue load now starts audio; next/prev, shuffle, repeat, skip-unplayable-uri, play-count updates.
- `src/services/audio/audioConfig.js` — session for silent mode, background play, `doNotMix` interruption, Android notification permission request.

### Shared state

- `src/context/player-context.jsx` — starts paused at position 0; `playSongs` sets the queue and starts the engine; shuffle/repeat/seek/queue exposed to UI.

### Existing UI wiring (no redesign)

- `src/app/(tabs)/library.jsx` — song row play uses `playSongs` / `togglePlay` on SQLite records.
- `src/components/ui/MiniPlayer.jsx` — play, shuffle, and progress ring follow engine state.
- Artist screens already called `playSongs`; they now get real audio because the queue starts playback.

### Config / data

- `app.json` — `expo-audio` plugin with `enableBackgroundPlayback: true`.
- `src/databases/queries/song.js` — `play_count` allowed on update.

### Docs updated during that work

- `docs/PLAYBACK_SYSTEM.md`
- `docs/KNOWN_ISSUES.md`
- `docs/CHANGELOG.md`

## Current Status

| Area | Status |
|---|---|
| Library / artist play | Real audio via `file_uri` + `expo-audio` |
| MiniPlayer | Synced to engine (play, shuffle, progress) |
| Queue next/prev/shuffle/repeat | Implemented in `PlaybackQueue` |
| Demo `TRACKS` in context | Visual fallback only; no `file_uri`, no audio |
| `src/players/` screens | Still simulated; not on live routes; UI preserved |
| Playlist screens | Still local/demo play state |
| Background / lock screen | Plugin added; needs a **native rebuild** to take effect |
| Lint | Not run here (`node_modules` was not present) |

## Remaining (not done this session)

- Connect live routes to full-screen player screens without replacing their UI.
- Wire playlist play into `playSongs`.
- Verify metadata write, Android storage permissions, and EAS builds on device.
- Native rebuild after the `expo-audio` plugin change.

## How To Verify

1. Scan/import a local music folder so songs have `file_uri`.
2. Play a song from Library or an artist profile.
3. Confirm MiniPlayer title, play/pause, shuffle, and progress follow real audio.
4. Rebuild the Android binary if background or lock-screen controls are required.
