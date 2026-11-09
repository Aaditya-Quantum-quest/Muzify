import { AudioEngine, configureAudioSessionOnce } from './AudioEngine';
import { updateSong } from '../../databases/queries/song.js';
import { listenTracker } from './listenTracker';

export class PlaybackQueue {
  constructor() {
    this.queue = [];
    this.currentIdx = 0;
    this.shuffle = false;
    this.repeat = false;

    this.engine = null;
    this._engineReady = false;
    this._readyPromise = null;
    this._advancing = false;
  }

  _ensureEngine() {
    if (this.engine) return;
    this.engine = new AudioEngine({
      onStatus: (status) => this._handleEngineStatus(status),
      onTrackEnded: () => this._handleTrackEnded(),
    });
    this.engine.attachListener();
    this._engineReady = true;
    configureAudioSessionOnce();
  }

  _playLoaded(track, source) {
    this.engine.ensureAudioSession?.();
    const loaded = this.engine.load(source, track);
    if (!loaded) return false;
    this.engine.play();
    if (this._onPlayingChange) this._onPlayingChange(true);
    queueMicrotask(() => {
      this.engine?.applyLockScreen(track, source);
      this._recordPlay(track);
      listenTracker.start(track, track.duration);
      if (this._onTrackChange) this._onTrackChange(track, this.currentIdx);
    });
    return true;
  }

  async setQueue(songs = [], startIdx = 0) {
    this.queue = Array.isArray(songs) ? songs : [];
    this._ensureEngine();
    if (!this.queue.length) {
      this.engine.load(null);
      return;
    }
    this.currentIdx = Math.min(Math.max(0, startIdx), this.queue.length - 1);
    this._loadTrackAt(this.currentIdx);
  }

  getCurrentTrack() {
    return this.queue[this.currentIdx] ?? null;
  }

  getCurrentPosition() {
    return this.engine?.getCurrentPosition?.() ?? 0;
  }

  getQueue() {
    return this.queue;
  }

  setCallbacks({ onPlayingChange, onPosChange, onTrackChange, onDurationChange, onShuffleChange, onRepeatChange } = {}) {
    this._onPlayingChange = onPlayingChange;
    this._onPosChange = onPosChange;
    this._onTrackChange = onTrackChange;
    this._onDurationChange = onDurationChange;
    this._onShuffleChange = onShuffleChange;
    this._onRepeatChange = onRepeatChange;
  }

  _handleEngineStatus(status) {
    if (!status) return;
    if (this._onPosChange) this._onPosChange(status.currentTime ?? 0);
    if (this._onPlayingChange) this._onPlayingChange(!!status.playing);
    const duration = status.duration ?? 0;
    if (this._onDurationChange) this._onDurationChange(duration);
    this._persistDuration(duration);
    listenTracker.tick(!!status.playing, status.currentTime ?? 0, duration);
  }

  _persistDuration(duration) {
    const track = this.getCurrentTrack();
    if (!track || typeof track.id !== "number") return;
    if (!Number.isFinite(duration) || duration <= 0) return;
    if (track.duration && track.duration > 0) return;
    const seconds = duration > 10000 ? Math.round(duration / 1000) : Math.round(duration);
    if (seconds <= 0) return;
    try {
      updateSong(track.id, { duration: seconds });
      track.duration = seconds;
    } catch (error) {
      console.warn("[PlaybackQueue] duration persist failed:", error);
    }
  }

  _handleTrackEnded() {
    if (this._advancing) return;
    listenTracker.complete();
    this.goNext({ fromEnd: true });
  }

  async togglePlay() {
    this._ensureEngine();
    if (!this.queue.length) return;
    if (this.engine.isPlaying()) {
      this.engine.pause();
      return;
    }
    const track = this.getCurrentTrack();
    if (!this.engine.isLoaded() && track?.file_uri) {
      this.engine.load({ uri: track.file_uri, name: track.title }, track);
    }
    this.engine.play();
  }

  async seek(seconds) {
    this._ensureEngine();
    return this.engine.seek(seconds);
  }

  async stop() {
    listenTracker.end();
    this._ensureEngine();
    this.engine.stop();
  }

  _sourceFor(track) {
    if (!track?.file_uri) return null;
    return { uri: track.file_uri, name: track.title };
  }

  _loadTrackAt(idx) {
    if (!this.queue.length) return false;
    this._ensureEngine();
    const len = this.queue.length;
    let safeIdx = ((idx % len) + len) % len;
    let attempts = 0;

    while (attempts < len) {
      const track = this.queue[safeIdx];
      const source = this._sourceFor(track);
      this.currentIdx = safeIdx;
      if (this._playLoaded(track, source)) return true;
      attempts += 1;
      safeIdx = (safeIdx + 1) % len;
    }

    console.warn('[PlaybackQueue] no playable file_uri in queue');
    return false;
  }

  playCurrent() {
    this._ensureEngine();
    this.engine.play();
  }

  async goNext({ fromEnd = false } = {}) {
    if (!this.queue.length) return;
    if (!fromEnd) listenTracker.skip();
    this._advancing = true;
    try {
      let nextIdx;
      if (this.shuffle) {
        do {
          nextIdx = Math.floor(Math.random() * this.queue.length);
        } while (nextIdx === this.currentIdx && this.queue.length > 1);
      } else {
        nextIdx = this.currentIdx + 1;
        if (nextIdx >= this.queue.length) {
          if (this.repeat) {
            nextIdx = 0;
          } else {
            await this.stop();
            if (this._onPlayingChange) this._onPlayingChange(false);
            return;
          }
        }
      }
      this._loadTrackAt(nextIdx);
    } finally {
      this._advancing = false;
    }
  }

  async goPrev() {
    if (!this.queue.length) return;
    const pos = this.engine?.getCurrentPosition?.() ?? 0;
    if (pos > 3) {
      await this.seek(0);
      return;
    }
    listenTracker.end();
    const prevIdx = this.currentIdx - 1;
    this._loadTrackAt(prevIdx < 0 ? this.queue.length - 1 : prevIdx);
  }

  toggleShuffle() {
    this.shuffle = !this.shuffle;
    if (this._onShuffleChange) this._onShuffleChange(this.shuffle);
    return this.shuffle;
  }

  toggleRepeat() {
    this.repeat = !this.repeat;
    if (this._onRepeatChange) this._onRepeatChange(this.repeat);
    return this.repeat;
  }

  async setTrackIdx(idx) {
    if (idx !== this.currentIdx) listenTracker.skip();
    this._loadTrackAt(idx);
  }

  _recordPlay(track) {
    if (track == null || typeof track.id !== 'number') return;
    try {
      const played = (track.played_times || 0) + 1;
      const count = (track.play_count || 0) + 1;
      const now = Date.now();
      updateSong(track.id, {
        played_times: played,
        play_count: count,
        last_played: now,
      });
      track.played_times = played;
      track.play_count = count;
      track.last_played = now;
    } catch (error) {
      console.warn('[PlaybackQueue] play count update failed:', error);
    }
  }

  destroy() {
    listenTracker.end();
    if (this.engine) {
      this.engine.destroy();
      this.engine = null;
    }
    this._engineReady = false;
    this._readyPromise = null;
  }
}

export const playbackQueue = new PlaybackQueue();
