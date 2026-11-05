// Audio session configuration for expo-audio.
//
// Configures the Android audio session so playback continues in the background
// and survives other apps interrupting us. Call `configureAudioSession()` once
// at app startup (see App.js / the player context init).

import { setAudioModeAsync, setIsAudioActiveAsync } from 'expo-audio';

// How often (ms) the native player emits playback status updates. 250ms keeps
// the progress bar smooth without burning the JS bridge on every frame.
export const STATUS_UPDATE_INTERVAL = 250;

export const audioConfig = {
  // Allow playback when the device is in silent/vibrate mode.
  playsInSilentMode: true,
  // Duck other audio (other apps lower their volume while we play) instead of
  // hard-interrupting them. Best fit for a music player.
  interruptionMode: 'duckOthers',
  // Keep the audio session alive after the app moves to the background so
  // playback does not stop immediately. Background playback also requires the
  // app to claim lock-screen controls (not yet implemented).
  shouldPlayInBackground: true,
  // Keep the session active even when nothing is currently loaded, so the
  // transition between tracks is gapless.
  keepAudioSessionActive: true,
};

/**
 * Configures the OS audio session. Safe to call multiple times.
 * Returns true on success, false if the native call rejected.
 */
export async function configureAudioSession() {
  try {
    await setAudioModeAsync(audioConfig);
    return true;
  } catch (error) {
    console.warn('[audioConfig] setAudioModeAsync failed:', error);
    return false;
  }
}

/** Deactivate our audio session (e.g. when the app is backgrounded with nothing playing). */
export async function deactivateAudioSession() {
  try {
    await setIsAudioActiveAsync(false);
  } catch (error) {
    console.warn('[audioConfig] setIsAudioActiveAsync failed:', error);
  }
}