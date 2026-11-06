import {
  insertListenEvent,
  updateListenEvent,
} from "../../databases/queries/listen";
import { notifyListenChanged } from "../listenEvents";

const SKIP_MS = 15000;
const FLUSH_MS = 4000;

function toMs(value) {
  const n = Number(value) || 0;
  if (n <= 0) return 0;
  return n > 10000 ? Math.round(n) : Math.round(n * 1000);
}

class ListenTracker {
  constructor() {
    this._eventId = null;
    this._listenedMs = 0;
    this._lastTick = 0;
    this._lastFlush = 0;
    this._trackDurationMs = 0;
    this._open = false;
    this._wasPlaying = false;
  }

  start(track, duration) {
    this.end();
    if (track == null || typeof track.id !== "number") return;

    const now = Date.now();
    this._listenedMs = 0;
    this._lastTick = now;
    this._lastFlush = now;
    this._trackDurationMs = toMs(duration ?? track.duration);
    this._open = true;

    try {
      const result = insertListenEvent({
        songId: track.id,
        startedAt: now,
        durationMs: 0,
      });
      this._eventId = result?.lastInsertRowId ?? null;
      notifyListenChanged();
    } catch (error) {
      console.warn("[ListenTracker] start failed:", error);
      this._eventId = null;
      this._open = false;
    }
  }

  tick(playing, positionSec, durationSec) {
    if (!this._open) return;

    const now = Date.now();
    const durationMs = toMs(durationSec);
    if (durationMs > 0) this._trackDurationMs = durationMs;

    if (playing) {
      if (this._lastTick > 0) {
        const delta = Math.min(2500, Math.max(0, now - this._lastTick));
        this._listenedMs += delta;
      }
      this._lastTick = now;
      this._wasPlaying = true;
      if (now - this._lastFlush >= FLUSH_MS) this._flush();
      return;
    }

    this._lastTick = 0;
    if (this._wasPlaying) {
      this._wasPlaying = false;
      this._flush();
    }
  }

  skip() {
    this.end({ skipped: true, completed: false });
  }

  complete() {
    if (this._trackDurationMs > 0) {
      this._listenedMs = Math.max(this._listenedMs, this._trackDurationMs);
    }
    this.end({ skipped: false, completed: true });
  }

  end({ skipped, completed } = {}) {
    if (!this._open && !this._eventId) {
      this._reset();
      return;
    }

    const isComplete = completed ?? this._isComplete();
    const isSkip = skipped ?? (!isComplete && this._isSkip());

    if (this._eventId) {
      try {
        updateListenEvent(this._eventId, {
          durationMs: Math.max(0, Math.round(this._listenedMs)),
          skipped: isSkip,
          completed: isComplete,
        });
        notifyListenChanged();
      } catch (error) {
        console.warn("[ListenTracker] end failed:", error);
      }
    }

    this._reset();
  }

  _isSkip() {
    if (this._listenedMs < SKIP_MS) return true;
    if (this._trackDurationMs > 0 && this._listenedMs < this._trackDurationMs * 0.5) {
      return true;
    }
    return false;
  }

  _isComplete() {
    if (this._trackDurationMs <= 0) return false;
    return this._listenedMs >= this._trackDurationMs * 0.85;
  }

  _flush() {
    if (!this._eventId) return;
    this._lastFlush = Date.now();
    try {
      updateListenEvent(this._eventId, {
        durationMs: Math.max(0, Math.round(this._listenedMs)),
        skipped: 0,
        completed: 0,
      });
      notifyListenChanged();
    } catch (error) {
      console.warn("[ListenTracker] flush failed:", error);
    }
  }

  _reset() {
    this._eventId = null;
    this._listenedMs = 0;
    this._lastTick = 0;
    this._lastFlush = 0;
    this._trackDurationMs = 0;
    this._open = false;
    this._wasPlaying = false;
  }
}

export const listenTracker = new ListenTracker();
