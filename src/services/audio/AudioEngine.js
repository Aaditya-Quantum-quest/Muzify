// AudioEngine — wraps expo-audio's AudioPlayer into the small surface the
// player context needs. Real audio only: no simulated timers, no fallback
// demo tracks. If a track has no loadable URI the engine reports an error
// rather than pretending to play.

import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { audioConfig, configureAudioSession, STATUS_UPDATE_INTERVAL } from './audioConfig';

// Event key emitted by expo-audio's AudioPlayer on every status change.
// Defined as a const here rather than imported from expo-audio's internal
// AudioEventKeys module, which is not part of the public API surface.
const PLAYBACK_STATUS_UPDATE = 'playbackStatusUpdate';

/**
 * @typedef {Object} AudioEngineOptions
 * @param {(status: Object) => void} [onStatus] Called on every playbackStatusUpdate.
 * @param {() => void} [onTrackEnded] Called when the current track reaches the end.
 */

export class AudioEngine {
  constructor({ onStatus, onTrackEnded } = {}) {
    this.onStatus = onStatus;
    this.onTrackEnded = onTrackEnded;

    // Single shared player. expo-audio's AudioPlayer is a SharedObject with
    // stable identity; we create it once and swap sources with .replace().
    this.player = createAudioPlayer(null, {
      updateInterval: STATUS_UPDATE_INTERVAL,
      keepAudioSessionActive: true,
    });

    this._subscription = null;
    this._configured = false;
    this._configurePromise = null;
  }

  /** Ensure the OS audio session is configured. Idempotent. */
  async ensureAudioSession() {
    if (this._configured) return;
    if (this._configurePromise) return this._configurePromise;
    this._configurePromise = (async () => {
      try {
        await setAudioModeAsync(audioConfig);
        this._configured = true;
      } catch (error) {
        console.warn('[AudioEngine] setAudioModeAsync failed:', error);
      }
    })();
    return this._configurePromise;
  }

  /**
   * Load a track by URI. Replaces the current source without restarting.
   * @param {{uri?: string, name?: string, assetId?: number, headers?: Object}} source
   */
  load(source) {
    if (!source) {
      this.player.replace(null);
      return;
    }
    this.player.replace(source);
  }

  play() {
    this.player.play();
  }

  pause() {
    this.player.pause();
  }

  stop() {
    this.player.pause();
    this.player.seekTo(0);
  }

  /** Seek to an absolute position in seconds. */
  seek(seconds) {
    const target = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    this.player.seekTo(target);
  }

  setVolume(volume) {
    this.player.volume = Math.min(1, Math.max(0, volume));
  }

  setRate(rate) {
    this.player.setPlaybackRate(rate, 'high');
  }

  /** @returns {boolean} whether a source is loaded and ready to play */
  isLoaded() {
    return this.player.isLoaded;
  }

  /** @returns {boolean} whether audio is currently playing */
  isPlaying() {
    return this.player.playing;
  }

  /** @returns {number} current position in seconds */
  getCurrentPosition() {
    return this.player.currentStatus?.currentTime ?? 0;
  }

  /** @returns {number} total duration in seconds, 0 if unknown */
  getDuration() {
    return this.player.currentStatus?.duration ?? 0;
  }

  /** @returns {Object|null} the latest raw expo-audio status */
  getStatus() {
    return this.player.currentStatus;
  }

  /** Subscribe to playback status updates. Replaces any prior subscription. */
  attachListener() {
    if (this._subscription) return;
    const { PLAYBACK_STATUS_UPDATE } = require('expo-audio').AudioEventKeys
      ? require('expo-audio').AudioEventKeys
      : { PLAYBACK_STATUS_UPDATE: 'playbackStatusUpdate' };
    this._subscription = this.player.addListener(
      PLAYBACK_STATUS_UPDATE,
      (status) => this._handleStatus(status)
    );
  }

  detachListener() {
    if (!this._subscription) return;
    this._subscription.remove();
    this._subscription = null;
  }

  _handleStatus(status) {
    if (!status) return;

    if (this.onStatus) this.onStatus(status);

    // didJustFinish is a one-shot flag: it is true on the status emitted when
    // the track completes. Advance to the next track automatically.
    if (status.didJustFinish && this.onTrackEnded) {
      this.onTrackEnded();
    }
  }

  /** Release the native player and audio session. Call when the app closes. */
  destroy() {
    this.detachListener();
    try {
      this.player.remove();
    } catch (error) {
      console.warn('[AudioEngine] player.remove failed:', error);
    }
    this._configured = false;
  }
}

export async function configureAudioSessionOnce() {
  return configureAudioSession();
}

// Re-export for consumers that want the config object directly.
export { configureAudioSession };