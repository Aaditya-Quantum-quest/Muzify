import { AudioEngine, configureAudioSessionOnce } from './AudioEngine';
import { updateSong } from '../../databases/queries/song.js';

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

  async _ensureEngine() {
    if (this._engineReady) return;
    if (!this._readyPromise) {
      this._readyPromise = (async () => {
        await configureAudioSessionOnce();
        this.engine = new AudioEngine({
          onStatus: (status) => this._handleEngineStatus(status),
          onTrackEnded: () => this._handleTrackEnded(),
        });
        this.engine.attachListener();
        this._engineReady = true;
      })();
    }
    return this._readyPromise;
  }

  async setQueue(songs = [], startIdx = 0) {
    this.queue = Array.isArray(songs) ? songs : [];
    if (!this.queue.length) {
      await this._ensureEngine();
      this.engine.load(null);
      return;
    }
    this.currentIdx = Math.min(Math.max(0, startIdx), this.queue.length - 1);
    await this._loadTrackAt(this.currentIdx);
    await this.playCurrent();
  }

  getCurrentTrack() {
    return this.queue[this.currentIdx] ?? null;
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
    if (this._onDurationChange) this._onDurationChange(status.duration ?? 0);
  }

  _handleTrackEnded() {
    if (this._advancing) return;
    this.goNext();
  }

  async togglePlay() {
    await this._ensureEngine();
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
    await this._ensureEngine();
    return this.engine.seek(seconds);
  }

  async stop() {
    await this._ensureEngine();
    this.engine.stop();
  }

  _sourceFor(track) {
    if (!track?.file_uri) return null;
    return { uri: track.file_uri, name: track.title };
  }

  async _loadTrackAt(idx) {
    if (!this.queue.length) return false;
    const len = this.queue.length;
    let safeIdx = ((idx % len) + len) % len;
    let attempts = 0;

    while (attempts < len) {
      const track = this.queue[safeIdx];
      await this._ensureEngine();
      const loaded = this.engine.load(this._sourceFor(track), track);
      if (loaded) {
        this.currentIdx = safeIdx;
        this._recordPlay(track);
        if (this._onTrackChange) this._onTrackChange(track, this.currentIdx);
        return true;
      }
      attempts += 1;
      safeIdx = (safeIdx + 1) % len;
    }

    console.warn('[PlaybackQueue] no playable file_uri in queue');
    return false;
  }

  async playCurrent() {
    await this._ensureEngine();
    this.engine.play();
  }

  async goNext() {
    if (!this.queue.length) return;
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
      const loaded = await this._loadTrackAt(nextIdx);
      if (loaded) await this.playCurrent();
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
    const prevIdx = this.currentIdx - 1;
    const loaded = await this._loadTrackAt(prevIdx < 0 ? this.queue.length - 1 : prevIdx);
    if (loaded) await this.playCurrent();
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
    const loaded = await this._loadTrackAt(idx);
    if (loaded) await this.playCurrent();
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
    if (this.engine) {
      this.engine.destroy();
      this.engine = null;
    }
    this._engineReady = false;
    this._readyPromise = null;
  }
}

export const playbackQueue = new PlaybackQueue();
