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

IMPORTANT:

A React state value such as `playing = true` does not prove that an actual audio file is playing.

The previously inspected player context included a JavaScript interval that advanced playback position and demo track state.

That implementation alone is not a real audio playback engine.

`expo-av` is installed (v16.0.8, Expo SDK 57) as the audio playback engine.

Do not assume `expo-av` is configured just because it is installed — inspect the
actual playback implementation before relying on it. The player context still
simulates playback with a JS interval; real audio is not yet wired in.

Inspect the actual playback implementation before changing it.

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