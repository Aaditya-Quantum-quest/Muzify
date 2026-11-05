// PlaybackQueue – thin wrapper around AudioEngine that maintains a queue of
// song objects (from the SQLite DB) and exposes simple navigation methods.
// It is deliberately minimal – the React context owns the UI state and only
// forwards calls to this queue.

import { AudioEngine, configureAudioSessionOnce } from './AudioEngine';
import { updateSong } from '../../databases/queries/song.js';

/**
 * Expected shape of a song record (subset):
 * {
 *   id: number,
 *   file_uri: string, // absolute or content URI readable by expo-audio
 *   title: string,
 *   artist: string,
 *   duration: number, // seconds
 *   // other metadata fields are ignored by the engine
 * }
 */

export class PlaybackQueue {
  constructor() {
    // Queue of song objects
    this.queue = [];
    // Current index in the queue
    this.currentIdx = 0;
    // Shuffle / repeat flags – simple booleans for now
    this.shuffle = false;
    this.repeat = false; // true => repeat entire queue

    // Engine is created lazily after the audio session is configured.
    this.engine = null;
    this._engineReady = false;
    this._readyPromise = null;
  }

  /** Ensure the native audio session is configured and the engine exists. */
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

  /** Load a new queue and optionally start playback from startIdx. */
  async setQueue(songs = [], startIdx = 0) {
    this.queue = songs;
    this.currentIdx = Math.min(Math.max(0, startIdx), songs.length - 1);
    await this._ensureEngine();
    const track = this.queue[this.currentIdx];
    if (track) {
      this.engine.load({ uri: track.file_uri, name: track.title });
    } else {
      this.engine.load(null);
    }
  }

  /** Return the current track object or null. */
  getCurrentTrack() {
    return this.queue[this.currentIdx] ?? null;
  }

  /** Return the whole queue (read‑only). */
  getQueue() {
    return this.queue;
  }

  /** Internal: update UI via callbacks. To be set by the consumer (player context). */
  setCallbacks({ onPlayingChange, onPosChange, onTrackChange, onDurationChange }) {
    this._onPlayingChange = onPlayingChange;
    this._onPosChange = onPosChange;
    this._onTrackChange = onTrackChange;
    this._onDurationChange = onDurationChange;
  }

  /** Engine status handler – updates context callbacks. */
  _handleEngineStatus(status) {
    if (!status) return;
    if (this._onPosChange) this._onPosChange(status.currentTime ?? 0);
    if (this._onPlayingChange) this._onPlayingChange(!!status.playing);
    if (this._onDurationChange) this._onDurationChange(status.duration ?? 0);
  }

  /** Called when a track finishes – advance according to repeat/shuffle. */
  _handleTrackEnded() {
    this.goNext();
  }

  /** Toggle playback (play/pause). */
  async togglePlay() {
    await this._ensureEngine();
    if (this.engine.isPlaying()) {
      this.engine.pause();
    } else {
      this.engine.play();
    }
    // Engine status callbacks will sync playing state back.
  }

  /** Seek to seconds. */
  async seek(seconds) {
    await this._ensureEngine();
    this.engine.seek(seconds);
  }

  /** Stop playback – pause and reset position. */
  async stop() {
    await this._ensureEngine();
    this.engine.stop();
  }

  /** Helper to load a track by index (does not auto‑play). */
  async _loadTrackAt(idx) {
    if (!this.queue.length) return;
    const safeIdx = ((idx % this.queue.length) + this.queue.length) % this.queue.length;
    this.currentIdx = safeIdx;
    const track = this.queue[this.currentIdx];
    await this._ensureEngine();
    this.engine.load({ uri: track.file_uri, name: track.title });
    if (this._onTrackChange) this._onTrackChange(track, this.currentIdx);
  }

  /** Play the current track (used after loading). */
  async playCurrent() {
    await this._ensureEngine();
    this.engine.play();
  }

  /** Public: go to next track respecting shuffle / repeat. */
  async goNext() {
    if (!this.queue.length) return;
    let nextIdx;
    if (this.shuffle) {
      // pick a random different index
      do {
        nextIdx = Math.floor(Math.random() * this.queue.length);
      } while (nextIdx === this.currentIdx && this.queue.length > 1);
    } else {
      nextIdx = this.currentIdx + 1;
      if (nextIdx >= this.queue.length) {
        if (this.repeat) {
          nextIdx = 0;
        } else {
          // end of queue – stop playback
          await this.stop();
          return;
        }
      }
    }
    await this._loadTrackAt(nextIdx);
    await this.playCurrent();
  }

  /** Public: go to previous track. */
  async goPrev() {
    if (!this.queue.length) return;
    const prevIdx = this.currentIdx - 1;
    await this._loadTrackAt(prevIdx < 0 ? this.queue.length - 1 : prevIdx);
    await this.playCurrent();
  }

  /** Toggle shuffle flag. */
  toggleShuffle() {
    this.shuffle = !this.shuffle;
  }

  /** Toggle repeat flag (repeat entire queue). */
  toggleRepeat() {
    this.repeat = !this.repeat;
  }

  /** Directly set track index (used by UI queue selection). */
  async setTrackIdx(idx) {
    await this._loadTrackAt(idx);
    await this.playCurrent();
  }

  /** Cleanup – destroy engine. */
  destroy() {
    if (this.engine) {
      this.engine.destroy();
      this.engine = null;
    }
    this._engineReady = false;
    this._readyPromise = null;
  }
}

// Export a singleton used throughout the app.
export const playbackQueue = new PlaybackQueue();
