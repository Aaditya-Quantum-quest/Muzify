# Muzify — Playback System

## 1. Purpose

The playback system manages music selection, playback state, queue management, and player interfaces.

## 2. Shared Player Context

Known location:

`src/context/player-context.jsx`

The previously inspected implementation contains:

- `playerTheme`
- `trackIdx`
- `track`
- `playing`
- `pos`
- `shuffle`
- `repeat`
- `listOpen`
- `onboardingStep`
- `musicFolder`
- `queue`
- `queueIdx`

It also exposes playback-related functions, including:

- `togglePlay`
- `toggleShuffle`
- `toggleRepeat`
- `goNext`
- `goPrev`
- `playSongs`
- `completeOnboarding`
- `resetOnboarding`

Verify current names and behavior before using them.

## 3. Player Components

Known locations:

- `src/components/ui/MiniPlayer.jsx`
- `src/app/(tabs)/_layout.jsx`
- `src/players/PlayerScreen1/`
- `src/players/PlayerScreen2/`
- `src/players/PlayerScreen3/`

The tab layout previously imported the MiniPlayer component.

## 4. Queue Management

The existing context includes a queue and queue index.

It also contains fallback demo track data.

Important:

The fallback/demo track system must not be confused with the actual device music library.

When changing queue behavior, verify:

- Track selection.
- Queue indexing.
- Next-track behavior.
- Previous-track behavior.
- Shuffle behavior.
- Repeat behavior.
- Empty queue handling.
- Queue replacement.
- Playback position reset.

## 5. Actual Audio Playback

Playback is implemented with `expo-audio` (SDK 57), not `expo-av`.

Architecture:

- `src/services/audio/audioConfig.js` — audio session (`playsInSilentMode`, `shouldPlayInBackground`, `interruptionMode: doNotMix`).
- `src/services/audio/AudioEngine.js` — wraps `createAudioPlayer`, loads `{ uri }`, play/pause/seek, status listener, lock-screen metadata.
- `src/services/audio/PlaybackQueue.js` — queue, shuffle, repeat, next/prev, play-count updates.
- `src/context/player-context.jsx` — UI state synced from engine callbacks. `playSongs(songs, startIndex)` loads the queue and starts real audio.

Library song rows and artist play actions call `playSongs` with SQLite records that include `file_uri`.

Demo `TRACKS` remain only as a visual fallback when no library queue has been set. They have no `file_uri`, so they cannot produce audio.

`app.json` includes the `expo-audio` config plugin with `enableBackgroundPlayback: true`. A native rebuild is required for background playback and lock-screen controls.

## 6. Playback Architecture Rules

- Keep playback state consistent across player screens.
- Avoid duplicated playback logic.
- Avoid multiple competing playback timers.
- Clean up timers and subscriptions.
- Keep the MiniPlayer synchronized with the active track.
- Handle player screen transitions safely.
- Preserve queue consistency.
- Handle missing audio files.
- Do not claim background playback works without verifying it.

## 7. Future Changes

When introducing or replacing an audio playback engine, document:

- Selected library.
- Why it was selected.
- Initialization.
- Playback lifecycle.
- Audio focus.
- Background playback.
- Notification controls.
- Queue integration.
- Error handling.
- Android-specific configuration.

Update this document whenever playback architecture changes.