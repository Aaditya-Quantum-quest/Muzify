import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { audioConfig, configureAudioSession, STATUS_UPDATE_INTERVAL } from './audioConfig';

const PLAYBACK_STATUS_UPDATE = 'playbackStatusUpdate';

export class AudioEngine {
  constructor({ onStatus, onTrackEnded } = {}) {
    this.onStatus = onStatus;
    this.onTrackEnded = onTrackEnded;

    this.player = createAudioPlayer(null, {
      updateInterval: STATUS_UPDATE_INTERVAL,
      keepAudioSessionActive: true,
    });

    this._subscription = null;
    this._configured = false;
    this._configurePromise = null;
    this._ended = false;
  }

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

  load(source, metadata) {
    this._ended = false;
    const uri = source?.uri;
    if (!uri) {
      try {
        this.player.replace(null);
      } catch (error) {
        console.warn('[AudioEngine] replace(null) failed:', error);
      }
      return false;
    }

    this.player.replace({ uri });
    this._applyLockScreen(metadata, source);
    return true;
  }

  _applyLockScreen(metadata, source) {
    try {
      if (typeof this.player.setActiveForLockScreen !== 'function') return;
      this.player.setActiveForLockScreen(true, {
        title: metadata?.title || source?.name || 'Unknown',
        artist: metadata?.artist || 'Unknown artist',
        albumTitle: metadata?.album || undefined,
        artworkUrl: metadata?.artwork_uri || undefined,
      });
    } catch (error) {
      console.warn('[AudioEngine] setActiveForLockScreen failed:', error);
    }
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

  seek(seconds) {
    const target = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    return this.player.seekTo(target);
  }

  setVolume(volume) {
    this.player.volume = Math.min(1, Math.max(0, volume));
  }

  setRate(rate) {
    this.player.setPlaybackRate(rate, 'high');
  }

  isLoaded() {
    return this.player.isLoaded;
  }

  isPlaying() {
    return this.player.playing;
  }

  getCurrentPosition() {
    return this.player.currentTime ?? this.player.currentStatus?.currentTime ?? 0;
  }

  getDuration() {
    return this.player.duration ?? this.player.currentStatus?.duration ?? 0;
  }

  getStatus() {
    return this.player.currentStatus;
  }

  attachListener() {
    if (this._subscription) return;
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

    if (status.didJustFinish && !this._ended && this.onTrackEnded) {
      this._ended = true;
      this.onTrackEnded();
    }
  }

  destroy() {
    this.detachListener();
    try {
      if (typeof this.player.clearLockScreenControls === 'function') {
        this.player.clearLockScreenControls();
      }
    } catch (error) {
      console.warn('[AudioEngine] clearLockScreenControls failed:', error);
    }
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

export { configureAudioSession };
