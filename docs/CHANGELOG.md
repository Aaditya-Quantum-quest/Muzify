# Muzify — Development Changelog

This document tracks significant changes to Muzify's architecture and functionality.

Do not record every minor code edit.

Record changes that affect:

- Architecture.
- Native modules.
- Database schema.
- Audio functionality.
- Playback behavior.
- Navigation.
- Dependencies.
- Build configuration.
- Major features.

## Entry Template

### YYYY-MM-DD — Change Title

**Category:** Feature / Bug Fix / Architecture / Native / Database / Build

**Summary:**

Describe what changed.

**Files Modified:**

List important files.

**Technical Details:**

Explain the implementation.

**Compatibility:**

Mention relevant Android, database, or native compatibility considerations.

**Verification:**

Describe tests and builds performed.

**Documentation Updated:**

List affected documentation.

---

### 2026-11-05 — Real Audio Playback Wired

**Category:** Feature / Architecture / Audio

**Summary:**
Wired `expo-audio` through AudioEngine and PlaybackQueue so library and artist play actions load real `file_uri` sources and start playback instead of simulating progress.

**Files Modified:**
- `src/services/audio/AudioEngine.js`
- `src/services/audio/PlaybackQueue.js`
- `src/services/audio/audioConfig.js`
- `src/context/player-context.jsx`
- `src/app/(tabs)/library.jsx`
- `src/components/ui/MiniPlayer.jsx`
- `src/databases/queries/song.js`
- `app.json`

**Technical Details:**
`playSongs` now loads the queue and calls play. Library rows use the shared player instead of local fake state. MiniPlayer play/shuffle and progress ring follow engine status. `play_count` is writable. expo-audio plugin enables background playback.

**Compatibility:**
Expo SDK 57 / expo-audio. Native rebuild required for background playback and lock-screen controls.

**Documentation Updated:**
- `docs/PLAYBACK_SYSTEM.md`
- `docs/KNOWN_ISSUES.md`
- `docs/CHANGELOG.md`

---

### 2026-11-06 — Artist Database & Discovery System

**Category:** Feature / Database / Architecture

**Summary:**
Replaced all mock data in Artists screen and Artist profile screen with real SQLite DB persistence, integrated with the scanner, audio playback queue, background enrichment, and recommendations.

**Files Modified:**
- `src/databases/db.js` — migrations for `artists`, `song_artists`, `artist_relationships`, `artist_follows`, `artist_external_cache`, and `songs.play_count`.
- `src/services/artists/artistParser.js` — credit parsing, split on feat/ft/delimiters, protected names, NFKC normalization.
- `src/services/artists/artistRepository.js` — SQL queries for artist listings, profile stats, albums, songs, playable queue, follow toggling, orphan cleanup, LRU caching.
- `src/services/artists/artistSync.js` — transactional sync for adds/updates/deletes/backfill.
- `src/services/artists/enrichmentService.js` — offline-resilient background queue for MusicBrainz and Last.fm.
- `src/services/artists/recommendationService.js` — collaboration, genre match, and similar artist scoring.
- `src/services/artists/artistArtwork.js` — deterministic gradient and initials fallback generator.
- `src/hooks/artists/useArtists.js` & `useArtistProfile.js` — reactive hooks for presentation layer.
- `src/app/(public)/artists/artists.jsx` & `src/app/(public)/artists/index.jsx` & `src/app/(public)/artists/[artistsId].jsx` — real data screens.
- `docs/DATABASE.md` — schema documentation.

**Verification:**
- Node test suite on parsing edge cases and deterministic artwork fallbacks.
- ESLint verification with React 19 compiler rules.

## Initial Entry

### 2026-11-05 — Audio Playback Engine Added

**Category:** Build / Architecture

**Summary:**
Added `expo-av` (v16.0.8) as the audio playback engine. It was previously absent,
so all playback in `src/context/player-context.jsx` was simulated by a JS
`setInterval` over hardcoded demo tracks.

**Files Modified:**
- `package.json` — added `expo-av` dependency.
- `docs/PLAYBACK_SYSTEM.md` — corrected the stale "expo-av not installed" note.

**Technical Details:**
Installed via `npx expo install expo-av`, which resolved the SDK 57-compatible
version (16.0.8). No native code or config-plugin changes were required; `expo-av`
is a standard Expo module bundled into Expo Go, so no dev build is needed for the
install itself.

**Compatibility:**
Expo SDK 57. No Android manifest or permission changes required for the install.
Real audio playback (loading files, audio focus, background playback) is NOT yet
wired in — see Remaining Issues.

**Verification:**
- `node -e "require('expo-av/package.json').version"` → 16.0.8
- `grep expo-av package.json` → present.

**Documentation Updated:**
- `docs/PLAYBACK_SYSTEM.md`
- `docs/CHANGELOG.md`

---

### 2026-11-06 — Artist Database & Discovery System

**Category:** Feature / Database / Architecture

**Summary:**
Replaced all mock data in Artists screen and Artist profile screen with real SQLite DB persistence, integrated with the scanner, audio playback queue, background enrichment, and recommendations.

**Files Modified:**
- `src/databases/db.js` — migrations for `artists`, `song_artists`, `artist_relationships`, `artist_follows`, `artist_external_cache`, and `songs.play_count`.
- `src/services/artists/artistParser.js` — credit parsing, split on feat/ft/delimiters, protected names, NFKC normalization.
- `src/services/artists/artistRepository.js` — SQL queries for artist listings, profile stats, albums, songs, playable queue, follow toggling, orphan cleanup, LRU caching.
- `src/services/artists/artistSync.js` — transactional sync for adds/updates/deletes/backfill.
- `src/services/artists/enrichmentService.js` — offline-resilient background queue for MusicBrainz and Last.fm.
- `src/services/artists/recommendationService.js` — collaboration, genre match, and similar artist scoring.
- `src/services/artists/artistArtwork.js` — deterministic gradient and initials fallback generator.
- `src/hooks/artists/useArtists.js` & `useArtistProfile.js` — reactive hooks for presentation layer.
- `src/app/(public)/artists/artists.jsx` & `src/app/(public)/artists/index.jsx` & `src/app/(public)/artists/[artistsId].jsx` — real data screens.
- `docs/DATABASE.md` — schema documentation.

**Verification:**
- Node test suite on parsing edge cases and deterministic artwork fallbacks.
- ESLint verification with React 19 compiler rules.

### 2026-11-05 — Project Knowledge Base Initialized

**Category:** Documentation

**Summary:**

Established a documentation structure for project architecture, native integration, audio functionality, playback, database, navigation, and builds.

**Important:**

This entry records documentation initialization only. It does not imply that all architectural documentation has been verified against the source code.